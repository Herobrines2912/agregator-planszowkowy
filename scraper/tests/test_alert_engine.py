"""Tests for scraper/alert_engine.py (Story 6.5).

DB access is mocked (MagicMock cursor/connection, same pattern as
test_db_health.py). send_price_drop_email is mocked — no real Brevo calls.
Prices use Decimal (not str) to match what psycopg2 actually returns for
NUMERIC columns — string comparison would silently pass/fail differently.
"""
import os
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
            [(10, Decimal("89.00"))],  # products MIN(price) per game_id
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
            [(10, Decimal("89.00"))],
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
            [(10, Decimal("89.00"))],
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
            [],  # no in-stock products for game 10 -> no row from GROUP BY
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
            [(10, Decimal("89.00")), (11, Decimal("89.00"))],
            [(10, "Game A", "game-a"), (11, "Game B", "game-b")],
        ])

        alert_engine.run_alert_engine(conn)

        # only the valid alert (id=2) triggers a send
        mock_send.assert_called_once()

    @patch("alert_engine.send_price_drop_email")
    def test_missing_game_record_skipped_without_sending(self, mock_send):
        conn, cur = _make_conn([
            [(1, 10, "user@example.com", Decimal("99.00"))],
            [(10, Decimal("89.00"))],
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
            [(10, Decimal("89.00"))],
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
            [(10, Decimal("89.00"))],
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


class TestBatchQuery:
    @patch("alert_engine.send_price_drop_email")
    def test_hundred_alerts_issue_one_products_query(self, mock_send):
        mock_send.return_value = True
        alerts = [(i, 10 + (i % 5), f"user{i}@example.com", Decimal("99.00")) for i in range(100)]
        conn, cur = _make_conn([
            alerts,
            [(gid, Decimal("50.00")) for gid in range(10, 15)],
            [(gid, f"Game {gid}", f"game-{gid}") for gid in range(10, 15)],
        ])

        alert_engine.run_alert_engine(conn)

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
