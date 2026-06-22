"""Unit tests for scraper/utils/db_health.py"""
from unittest.mock import MagicMock

from utils.db_health import check_product_count_baseline


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
