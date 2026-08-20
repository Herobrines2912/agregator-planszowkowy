"""Tests for scraper/alert_engine.py (Stories 6.5, 6.7).

DB access is mocked (MagicMock cursor/connection, same pattern as
test_db_health.py). send_price_drop_email is mocked — no real Brevo calls.
Prices use Decimal (not str) to match what psycopg2 actually returns for
NUMERIC columns — string comparison would silently pass/fail differently.
"""
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch

os.environ.setdefault("BREVO_API_KEY", "test-api-key")
os.environ.setdefault("BREVO_SENDER_EMAIL", "test@example.com")
os.environ.setdefault("BREVO_SENDER_NAME", "Test Sender")

import alert_engine  # noqa: E402


def _make_conn(query_results: list) -> MagicMock:
    """Build a mock connection whose cursor().execute()/fetchall() return
    query_results in order, one entry per distinct SELECT/UPDATE call."""
    cur = MagicMock()
    cur.fetchall.side_effect = query_results
    ctx = MagicMock()
    ctx.__enter__ = MagicMock(return_value=cur)
    ctx.__exit__ = MagicMock(return_value=False)
    conn = MagicMock()
    conn.cursor.return_value = ctx
    return conn, cur


class TestRunAlertEngineTrigger:
    @patch("alert_engine.send_price_drop_email")
    def test_price_at_or_below_target_triggers_email_and_status(self, mock_send):
        mock_send.return_value = True
        # order of fetchall() calls: alerts, products, games (updates don't fetchall)
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"))],  # active alerts
            [(10, Decimal("89.00"), None, "https://store.pl/brass", 1)],  # cheapest in-stock product per game_id
            [(1, "AlePlanszowki")],  # stores
            [(10, "Brass: Birmingham", "brass-birmingham")],  # games
        ])

        alert_engine.run_alert_engine(conn)

        mock_send.assert_called_once()
        executed_sql = [c.args[0] for c in cur.execute.call_args_list]
        assert any("UPDATE price_alerts SET status = 'triggered'" in sql for sql in executed_sql)

    @patch("alert_engine.send_price_drop_email")
    def test_status_set_to_triggered_before_send_call(self, mock_send):
        call_order = []
        mock_send.side_effect = lambda *a, **k: call_order.append("send") or True

        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"))],
            [(10, Decimal("89.00"), None, "https://store.pl/brass", 1)],
            [(1, "AlePlanszowki")],
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        def record_execute(sql, *args):
            if "UPDATE price_alerts SET status = 'triggered'" in sql:
                call_order.append("triggered_update")

        cur.execute.side_effect = record_execute

        alert_engine.run_alert_engine(conn)

        assert call_order == ["triggered_update", "send"]

    @patch("alert_engine.send_price_drop_email")
    def test_price_above_target_does_nothing(self, mock_send):
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("50.00"))],  # target lower than current price
            [(10, Decimal("89.00"), None, "https://store.pl/brass", 1)],
            [(1, "AlePlanszowki")],
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        alert_engine.run_alert_engine(conn)

        mock_send.assert_not_called()
        executed_sql = [c.args[0] for c in cur.execute.call_args_list]
        assert not any("UPDATE" in sql for sql in executed_sql)

    @patch("alert_engine.send_price_drop_email")
    def test_no_in_stock_products_skips_without_error(self, mock_send):
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"))],
            [],  # no in-stock products for game 10 -> no row from DISTINCT ON
            # store lookup is skipped entirely when store_ids is empty
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        alert_engine.run_alert_engine(conn)

        mock_send.assert_not_called()

    @patch("alert_engine.send_price_drop_email")
    def test_null_target_price_skipped_without_crashing_batch(self, mock_send):
        mock_send.return_value = True
        conn, cur = _make_conn([
            [
                (1, 10, "bad@example.com", None),  # NULL target_price — must not crash
                (2, 11, "user@example.com", Decimal("99.00")),
            ],
            [
                (10, Decimal("89.00"), None, "https://store.pl/a", 1),
                (11, Decimal("89.00"), None, "https://store.pl/b", 1),
            ],
            [(1, "AlePlanszowki")],
            [(10, "Game A", "game-a"), (11, "Game B", "game-b")],
        ])

        alert_engine.run_alert_engine(conn)

        # only the valid alert (id=2) triggers a send
        mock_send.assert_called_once()

    @patch("alert_engine.send_price_drop_email")
    def test_missing_game_record_skipped_without_sending(self, mock_send):
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"))],
            [(10, Decimal("89.00"), None, "https://store.pl/brass", 1)],
            [(1, "AlePlanszowki")],
            [],  # game_id 10 not found in games table
        ])

        alert_engine.run_alert_engine(conn)

        mock_send.assert_not_called()
        executed_sql = [c.args[0] for c in cur.execute.call_args_list]
        assert not any("UPDATE" in sql for sql in executed_sql)

    @patch("alert_engine.send_price_drop_email")
    def test_send_exception_resets_status_to_active(self, mock_send):
        mock_send.side_effect = RuntimeError("network boom")

        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"))],
            [(10, Decimal("89.00"), None, "https://store.pl/brass", 1)],
            [(1, "AlePlanszowki")],
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        # must not raise — exception is caught and treated as a failed send
        alert_engine.run_alert_engine(conn)

        executed_sql = [c.args[0] for c in cur.execute.call_args_list]
        assert any("status = 'triggered'" in sql for sql in executed_sql)
        assert any("status = 'active'" in sql for sql in executed_sql)

    @patch("alert_engine.send_price_drop_email")
    def test_failed_send_resets_status_to_active(self, mock_send):
        mock_send.return_value = False

        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"))],
            [(10, Decimal("89.00"), None, "https://store.pl/brass", 1)],
            [(1, "AlePlanszowki")],
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        alert_engine.run_alert_engine(conn)

        executed_sql = [c.args[0] for c in cur.execute.call_args_list]
        assert any("status = 'triggered'" in sql for sql in executed_sql)
        assert any("status = 'active'" in sql for sql in executed_sql)

    @patch("alert_engine.send_price_drop_email")
    def test_no_active_alerts_is_a_noop(self, mock_send):
        conn, cur = _make_conn([[]])

        alert_engine.run_alert_engine(conn)

        mock_send.assert_not_called()

    @patch("alert_engine.send_price_drop_email")
    def test_game_with_only_null_price_in_stock_product_is_skipped_without_crashing(self, mock_send):
        # The products query filters "AND price IS NOT NULL", mirroring the old
        # MIN(price)-based behavior where a NULL-only group was implicitly
        # skipped. A game whose sole in-stock product has a NULL price must
        # produce no row here (as if it had no in-stock offers at all) rather
        # than surfacing a {price: None, ...} dict that would crash the
        # `current_min_price > target_price` comparison for the whole batch.
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"))],
            [],  # DB-side filter excludes the NULL-price row entirely
            # store lookup is skipped entirely when store_ids is empty
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        alert_engine.run_alert_engine(conn)

        mock_send.assert_not_called()

    @patch("alert_engine.send_price_drop_email")
    def test_cheapest_offer_across_stores_wins(self, mock_send):
        mock_send.return_value = True
        # DISTINCT ON (game_id) ... ORDER BY game_id, price ASC already returns
        # only the cheapest row per game_id — this asserts alert_engine passes
        # THAT row's store/url through, not just any in-stock offer.
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"))],
            [(10, Decimal("79.00"), None, "https://cheapstore.pl/brass", 2)],  # cheapest, store 2
            [(1, "AlePlanszowki"), (2, "TanioGry")],
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        alert_engine.run_alert_engine(conn)

        _, call_kwargs = mock_send.call_args
        assert call_kwargs["store_name"] == "TanioGry"
        assert call_kwargs["buy_url"] == "https://cheapstore.pl/brass"

    @patch("alert_engine.send_price_drop_email")
    def test_store_id_tiebreaks_a_same_price_cross_store_tie(self, mock_send):
        mock_send.return_value = True
        # DISTINCT ON (game_id) ... ORDER BY game_id, price ASC, store_id ASC:
        # when two in-stock rows for the same game tie on price across
        # different stores, the query's third ORDER BY key picks the lower
        # store_id deterministically. This pins that behavior at the SQL
        # contract level (mocked here as the row DISTINCT ON would return),
        # since the tiebreak itself lives in the query, not in Python.
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"))],
            # DISTINCT ON has already resolved the tie in favor of store_id=1
            # (lower) over a same-priced store_id=2 offer for the same game.
            [(10, Decimal("79.00"), None, "https://store1.pl/brass", 1)],
            [(1, "PierwszySklep"), (2, "DrugiSklep")],
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        alert_engine.run_alert_engine(conn)

        _, call_kwargs = mock_send.call_args
        assert call_kwargs["store_name"] == "PierwszySklep"
        assert call_kwargs["buy_url"] == "https://store1.pl/brass"

    @patch("alert_engine.send_price_drop_email")
    def test_missing_store_record_falls_back_to_placeholder_name(self, mock_send):
        mock_send.return_value = True
        # store_id present on the cheapest product row but absent from the
        # stores lookup result (orphaned FK / data drift) must not surface as
        # store_name=None — that would hit html.escape(None, ...) -> TypeError
        # in _render() and crash the whole alert batch.
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"))],
            [(10, Decimal("89.00"), None, "https://store.pl/brass", 99)],
            [],  # store_id 99 not found in stores table
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        alert_engine.run_alert_engine(conn)

        _, call_kwargs = mock_send.call_args
        assert call_kwargs["store_name"] is not None
        assert isinstance(call_kwargs["store_name"], str)


class TestBatchQuery:
    @patch("alert_engine.send_price_drop_email")
    def test_hundred_alerts_issue_one_products_query(self, mock_send):
        mock_send.return_value = True
        alerts = [(i, 10 + (i % 5), f"user{i}@example.com", Decimal("99.00")) for i in range(100)]
        conn, cur = _make_conn([
            alerts,
            [(gid, Decimal("50.00"), None, f"https://store.pl/{gid}", 1) for gid in range(10, 15)],
            [(1, "AlePlanszowki")],
            [(gid, f"Game {gid}", f"game-{gid}") for gid in range(10, 15)],
        ])

        alert_engine.run_alert_engine(conn)

        products_query_calls = [
            c for c in cur.execute.call_args_list if "FROM products" in c.args[0]
        ]
        assert len(products_query_calls) == 1


class TestRunTypeBAlerts:
    """Story 6.7 — 50%/70%/80% anomaly-discount alerts, status untouched,
    24h cooldown per alert row via last_type_b_notified_at."""

    @patch("alert_engine.send_price_drop_email")
    def test_drop_at_50_percent_sends_email_and_updates_cooldown_not_status(self, mock_send):
        mock_send.return_value = True
        # order: alerts, products, stores, games
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"), None)],  # never notified
            [(10, Decimal("50.00"), Decimal("100.00"), "https://store.pl/brass", 1)],
            [(1, "AlePlanszowki")],
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        alert_engine.run_type_b_alerts(conn)

        mock_send.assert_called_once()
        _, call_kwargs = mock_send.call_args
        assert call_kwargs["header_prefix"] == "WYJĄTKOWA OKAZJA! "
        executed_sql = [c.args[0] for c in cur.execute.call_args_list]
        assert any("last_type_b_notified_at = now()" in sql for sql in executed_sql)
        assert not any("SET status" in sql for sql in executed_sql)

    @patch("alert_engine.send_price_drop_email")
    def test_deepest_threshold_crossed_is_the_one_logged(self, mock_send, caplog):
        mock_send.return_value = True
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"), None)],
            [(10, Decimal("15.00"), Decimal("100.00"), "https://store.pl/brass", 1)],  # 85% off
            [(1, "AlePlanszowki")],
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        with caplog.at_level("INFO"):
            alert_engine.run_type_b_alerts(conn)

        assert "threshold=0.80" in caplog.text

    @patch("alert_engine.send_price_drop_email")
    def test_cooldown_active_skips_without_email_or_db_write(self, mock_send):
        recent = datetime.now(timezone.utc) - timedelta(hours=1)
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"), recent)],
            [(10, Decimal("50.00"), Decimal("100.00"), "https://store.pl/brass", 1)],
            [(1, "AlePlanszowki")],
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        alert_engine.run_type_b_alerts(conn)

        mock_send.assert_not_called()
        executed_sql = [c.args[0] for c in cur.execute.call_args_list]
        assert not any("last_type_b_notified_at" in sql and "UPDATE" in sql for sql in executed_sql)

    @patch("alert_engine.send_price_drop_email")
    def test_cooldown_expired_sends_email_again(self, mock_send):
        mock_send.return_value = True
        stale = datetime.now(timezone.utc) - timedelta(hours=25)
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"), stale)],
            [(10, Decimal("50.00"), Decimal("100.00"), "https://store.pl/brass", 1)],
            [(1, "AlePlanszowki")],
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        alert_engine.run_type_b_alerts(conn)

        mock_send.assert_called_once()

    @patch("alert_engine.send_price_drop_email")
    def test_null_price_orig_is_skipped(self, mock_send):
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"), None)],
            [(10, Decimal("50.00"), None, "https://store.pl/brass", 1)],  # no price_orig
            [(1, "AlePlanszowki")],
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        alert_engine.run_type_b_alerts(conn)

        mock_send.assert_not_called()

    @patch("alert_engine.send_price_drop_email")
    def test_zero_price_orig_is_skipped(self, mock_send):
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"), None)],
            [(10, Decimal("50.00"), Decimal("0.00"), "https://store.pl/brass", 1)],
            [(1, "AlePlanszowki")],
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        alert_engine.run_type_b_alerts(conn)

        mock_send.assert_not_called()

    @patch("alert_engine.send_price_drop_email")
    def test_null_target_price_on_alert_row_sends_em_dash(self, mock_send):
        mock_send.return_value = True
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", None, None)],  # pure Type B, no target_price set
            [(10, Decimal("50.00"), Decimal("100.00"), "https://store.pl/brass", 1)],
            [(1, "AlePlanszowki")],
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        alert_engine.run_type_b_alerts(conn)

        _, call_kwargs = mock_send.call_args
        assert call_kwargs["target_price"] == "—"

    @patch("alert_engine.send_price_drop_email")
    def test_send_exception_does_not_crash_or_update_cooldown(self, mock_send):
        mock_send.side_effect = RuntimeError("network boom")
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"), None)],
            [(10, Decimal("50.00"), Decimal("100.00"), "https://store.pl/brass", 1)],
            [(1, "AlePlanszowki")],
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        # must not raise
        alert_engine.run_type_b_alerts(conn)

        executed_sql = [c.args[0] for c in cur.execute.call_args_list]
        assert not any("last_type_b_notified_at" in sql and "UPDATE" in sql for sql in executed_sql)

    @patch("alert_engine.send_price_drop_email")
    def test_no_active_type_b_alerts_is_a_noop(self, mock_send):
        conn, cur = _make_conn([[]])

        alert_engine.run_type_b_alerts(conn)

        mock_send.assert_not_called()

    @patch("alert_engine.send_price_drop_email")
    def test_alert_triggered_by_type_a_still_evaluated_for_type_b(self, mock_send):
        # A shared alert row (target_price set AND type_b_enabled=true) whose Type A
        # target already fired has status='triggered', not 'active' — the query must
        # still pick it up (status IN ('active','triggered')), or a Type A trigger
        # would silently and permanently disable that row's independent Type B
        # subscription (code-review regression).
        mock_send.return_value = True
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("89.00"), None)],
            [(10, Decimal("50.00"), Decimal("100.00"), "https://store.pl/brass", 1)],
            [(1, "AlePlanszowki")],
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        alert_engine.run_type_b_alerts(conn)

        executed_sql = [c.args[0] for c in cur.execute.call_args_list]
        assert any(
            "status IN ('active', 'triggered')" in sql for sql in executed_sql
        )
        mock_send.assert_called_once()

    @patch("alert_engine.send_price_drop_email")
    def test_no_in_stock_offer_at_all_is_skipped(self, mock_send):
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"), None)],
            [],  # no in-stock products for game 10 at all
            # store lookup is skipped entirely when store_ids is empty
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        alert_engine.run_type_b_alerts(conn)

        mock_send.assert_not_called()
        executed_sql = [c.args[0] for c in cur.execute.call_args_list]
        assert not any("last_type_b_notified_at" in sql and "UPDATE" in sql for sql in executed_sql)

    @patch("alert_engine.send_price_drop_email")
    def test_missing_game_record_skipped_without_sending(self, mock_send):
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"), None)],
            [(10, Decimal("50.00"), Decimal("100.00"), "https://store.pl/brass", 1)],
            [(1, "AlePlanszowki")],
            [],  # game_id 10 not found in games table
        ])

        alert_engine.run_type_b_alerts(conn)

        mock_send.assert_not_called()
        executed_sql = [c.args[0] for c in cur.execute.call_args_list]
        assert not any("last_type_b_notified_at" in sql and "UPDATE" in sql for sql in executed_sql)

    @patch("alert_engine.send_price_drop_email")
    def test_cooldown_update_failure_does_not_crash_batch(self, mock_send):
        mock_send.return_value = True
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"), None)],
            [(10, Decimal("50.00"), Decimal("100.00"), "https://store.pl/brass", 1)],
            [(1, "AlePlanszowki")],
            [(10, "Brass: Birmingham", "brass-birmingham")],
        ])

        def failing_execute(sql, *args):
            if "last_type_b_notified_at = now()" in sql:
                raise RuntimeError("db write boom")

        cur.execute.side_effect = failing_execute

        # must not raise — the send already succeeded, only the cooldown write failed
        alert_engine.run_type_b_alerts(conn)

        mock_send.assert_called_once()

    @patch("alert_engine.send_price_drop_email")
    def test_hundred_type_b_alerts_issue_one_products_query(self, mock_send):
        mock_send.return_value = True
        alerts = [(i, 10 + (i % 5), f"user{i}@example.com", Decimal("99.00"), None) for i in range(100)]
        conn, cur = _make_conn([
            alerts,
            [(gid, Decimal("50.00"), Decimal("100.00"), f"https://store.pl/{gid}", 1) for gid in range(10, 15)],
            [(1, "AlePlanszowki")],
            [(gid, f"Game {gid}", f"game-{gid}") for gid in range(10, 15)],
        ])

        alert_engine.run_type_b_alerts(conn)

        products_query_calls = [
            c for c in cur.execute.call_args_list if "FROM products" in c.args[0]
        ]
        assert len(products_query_calls) == 1


class TestMainEntrypoint:
    def test_missing_database_url_exits_1(self, monkeypatch):
        monkeypatch.delenv("DATABASE_URL", raising=False)

        with patch("alert_engine.sys.exit") as mock_exit:
            mock_exit.side_effect = SystemExit
            try:
                alert_engine.main()
            except SystemExit:
                pass

        mock_exit.assert_called_once_with(1)

    def test_main_calls_both_type_a_and_type_b_in_sequence(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgres://fake")

        with patch("alert_engine.psycopg2.connect") as mock_connect, \
             patch("alert_engine.run_alert_engine") as mock_type_a, \
             patch("alert_engine.run_type_b_alerts") as mock_type_b:
            mock_conn = MagicMock()
            mock_connect.return_value = mock_conn

            alert_engine.main()

            mock_type_a.assert_called_once_with(mock_conn)
            mock_type_b.assert_called_once_with(mock_conn)

    def test_type_a_failure_does_not_prevent_type_b_from_running(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgres://fake")

        with patch("alert_engine.psycopg2.connect") as mock_connect, \
             patch("alert_engine.run_alert_engine") as mock_type_a, \
             patch("alert_engine.run_type_b_alerts") as mock_type_b, \
             patch("alert_engine.sys.exit") as mock_exit:
            mock_conn = MagicMock()
            mock_connect.return_value = mock_conn
            mock_type_a.side_effect = RuntimeError("type A boom")

            alert_engine.main()

            mock_type_a.assert_called_once_with(mock_conn)
            mock_type_b.assert_called_once_with(mock_conn)
            mock_conn.close.assert_called_once()
            mock_exit.assert_called_once_with(3)
