"""Unit tests for scraper/utils/db_health.py"""
import logging
from unittest.mock import MagicMock, patch

import psycopg2
import pytest

from utils.db_health import check_database_size, check_product_count_baseline, main


def _make_conn_size(size_bytes: int) -> MagicMock:
    """Build a mock connection whose cursor returns size_bytes from fetchone()."""
    cur = MagicMock()
    cur.fetchone.return_value = (size_bytes,)
    ctx = MagicMock()
    ctx.__enter__ = MagicMock(return_value=cur)
    ctx.__exit__ = MagicMock(return_value=False)
    conn = MagicMock()
    conn.cursor.return_value = ctx
    return conn


class TestCheckDatabaseSize:
    def test_within_limit_returns_true(self):
        conn = _make_conn_size(300 * 1024 * 1024)  # 300 MB
        assert check_database_size(conn) is True

    def test_exactly_at_limit_is_not_over(self):
        # 400 MB exactly — threshold is >, not >=
        conn = _make_conn_size(400 * 1024 * 1024)
        assert check_database_size(conn) is True

    def test_over_limit_returns_false(self, caplog):
        conn = _make_conn_size(401 * 1024 * 1024)  # 401 MB
        with caplog.at_level(logging.CRITICAL, logger="utils.db_health"):
            result = check_database_size(conn)
        assert result is False

    def test_over_limit_logs_operator_alert(self, caplog):
        conn = _make_conn_size(600 * 1024 * 1024)  # 600 MB
        with caplog.at_level(logging.CRITICAL, logger="utils.db_health"):
            check_database_size(conn)
        assert "OPERATOR ALERT" in caplog.text

    def test_over_limit_logs_size_value(self, caplog):
        conn = _make_conn_size(500 * 1024 * 1024)  # exactly 500 MB
        with caplog.at_level(logging.CRITICAL, logger="utils.db_health"):
            check_database_size(conn)
        assert "500.0 MB" in caplog.text


def _make_conn(*fetchall_results):
    """Build a mock psycopg2 connection with sequential fetchall() return values."""
    cur = MagicMock()
    cur.fetchall.side_effect = list(fetchall_results)
    ctx = MagicMock()
    ctx.__enter__ = MagicMock(return_value=cur)
    ctx.__exit__ = MagicMock(return_value=False)
    conn = MagicMock()
    conn.cursor.return_value = ctx
    return conn


class TestCheckProductCountBaseline:
    def test_healthy_store_above_threshold(self):
        # avg of [95,90,88,92,97,93] = 92.5, threshold = 74, current = 100 → OK
        conn = _make_conn(
            [(1,)],
            [(100,), (95,), (90,), (88,), (92,), (97,), (93,)],
        )
        assert check_product_count_baseline(conn) is True

    def test_breach_detected_returns_false(self):
        # avg of [100]*6 = 100, threshold = 80, current = 50 → breach
        conn = _make_conn(
            [(1,)],
            [(50,), (100,), (100,), (100,), (100,), (100,), (100,)],
        )
        assert check_product_count_baseline(conn) is False

    def test_exactly_at_threshold_is_not_a_breach(self):
        # current = exactly 80% → condition is `<`, not `<=`, so no breach
        conn = _make_conn(
            [(1,)],
            [(80,), (100,), (100,), (100,), (100,), (100,), (100,)],
        )
        assert check_product_count_baseline(conn) is True

    def test_skip_store_with_fewer_than_7_runs(self):
        # 6 non-NULL rows → skipped per AC-3, returns True (no breach)
        conn = _make_conn(
            [(1,)],
            [(100,), (90,), (80,), (70,), (60,), (50,)],
        )
        assert check_product_count_baseline(conn) is True

    def test_all_null_counts_skipped_returns_true(self):
        # products_scraped all NULL → counts=[] → len < 7 → skip
        conn = _make_conn(
            [(1,)],
            [(None,), (None,), (None,), (None,), (None,), (None,), (None,)],
        )
        assert check_product_count_baseline(conn) is True

    def test_zero_stores_in_last_7_days_returns_true(self):
        conn = _make_conn([])
        assert check_product_count_baseline(conn) is True

    def test_avg_zero_fires_breach(self):
        # All baseline counts = 0 → avg=0 → should alert, not silently pass
        conn = _make_conn(
            [(1,)],
            [(0,), (0,), (0,), (0,), (0,), (0,), (0,)],
        )
        assert check_product_count_baseline(conn) is False

    def test_multiple_stores_one_breach_returns_false(self):
        # Store 1 healthy, Store 2 breach → False
        conn = _make_conn(
            [(1,), (2,)],
            [(100,), (100,), (100,), (100,), (100,), (100,), (100,)],  # store 1 OK
            [(50,), (100,), (100,), (100,), (100,), (100,), (100,)],   # store 2 breach
        )
        assert check_product_count_baseline(conn) is False

    def test_multiple_stores_all_healthy_returns_true(self):
        conn = _make_conn(
            [(1,), (2,)],
            [(100,), (100,), (100,), (100,), (100,), (100,), (100,)],
            [(95,), (90,), (92,), (88,), (91,), (93,), (89,)],
        )
        assert check_product_count_baseline(conn) is True


class TestMain:
    def test_missing_database_url_exits_1(self, monkeypatch):
        monkeypatch.delenv("DATABASE_URL", raising=False)
        with patch("utils.db_health.load_dotenv"):
            with pytest.raises(SystemExit) as exc:
                main()
        assert exc.value.code == 1

    def test_connection_error_exits_2(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgresql://fake")
        with patch("utils.db_health.load_dotenv"), \
             patch("utils.db_health.psycopg2.connect",
                   side_effect=psycopg2.OperationalError("refused")):
            with pytest.raises(SystemExit) as exc:
                main()
        assert exc.value.code == 2

    def test_health_check_failure_exits_1(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgresql://fake")
        with patch("utils.db_health.load_dotenv"), \
             patch("utils.db_health.psycopg2.connect", return_value=MagicMock()), \
             patch("utils.db_health.check_database_size", return_value=False), \
             patch("utils.db_health.check_product_count_baseline", return_value=True):
            with pytest.raises(SystemExit) as exc:
                main()
        assert exc.value.code == 1

    def test_all_checks_pass_no_exit(self, monkeypatch):
        monkeypatch.setenv("DATABASE_URL", "postgresql://fake")
        with patch("utils.db_health.load_dotenv"), \
             patch("utils.db_health.psycopg2.connect", return_value=MagicMock()), \
             patch("utils.db_health.check_database_size", return_value=True), \
             patch("utils.db_health.check_product_count_baseline", return_value=True):
            main()  # must not raise SystemExit
