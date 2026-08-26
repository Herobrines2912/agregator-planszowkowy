"""Tests for UpcomingPipeline — all HTTP and DB calls mocked."""
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from scraper.pipelines.upcoming import UpcomingPipeline, _normalise_name, _name_match_score


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_pool_mock(game_id: int = 7) -> MagicMock:
    mock_cursor = MagicMock()
    mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
    mock_cursor.__exit__ = MagicMock(return_value=False)
    mock_cursor.fetchone.return_value = (game_id,)

    mock_conn = MagicMock()
    mock_conn.cursor.return_value = mock_cursor

    mock_pool = MagicMock()
    mock_pool.getconn.return_value = mock_conn
    return mock_pool, mock_conn, mock_cursor


def _make_spider(name="ale_planszowki_upcoming"):
    spider = MagicMock()
    spider.name = name
    return spider


def _bgg_search_xml(bgg_id: int, name: str) -> str:
    return (
        f'<?xml version="1.0" encoding="utf-8"?>'
        f'<items total="1">'
        f'<item type="boardgame" id="{bgg_id}">'
        f'<name type="primary" value="{name}"/>'
        f'</item>'
        f'</items>'
    )


def _bgg_search_empty() -> str:
    return '<?xml version="1.0" encoding="utf-8"?><items total="0"></items>'


def _open_pipeline(mock_pool, bgg_token="test-token"):
    pipeline = UpcomingPipeline()
    env = {"DATABASE_URL": "postgresql://test"}
    if bgg_token:
        env["BGG_API_TOKEN"] = bgg_token
    with patch("scraper.pipelines.upcoming.psycopg2.pool.ThreadedConnectionPool", return_value=mock_pool), \
         patch("scraper.pipelines.upcoming.httpx.Client"), \
         patch.dict("os.environ", env, clear=True):
        pipeline.open_spider(_make_spider())
    return pipeline


def _item(name="Dixit Signature: Złoczyńcy", store_id=2,
          pre_order_url="https://aleplanszowki.pl/x.html",
          cover_image_url="https://aleplanszowki.pl/x.jpg",
          pre_order_price=None, expected_release_date=None,
          expected_release_date_text="ok. 9 października 2026r."):
    return dict(
        store_id=store_id, name=name, pre_order_url=pre_order_url,
        cover_image_url=cover_image_url, pre_order_price=pre_order_price,
        expected_release_date=expected_release_date,
        expected_release_date_text=expected_release_date_text,
    )


# ---------------------------------------------------------------------------
# Name normalisation (shared behavior with DeduplicationPipeline)
# ---------------------------------------------------------------------------

class TestNormalisation:
    def test_strips_edition_suffix(self):
        assert "(edycja polska)" not in _normalise_name("Brass: Birmingham (edycja polska)")

    def test_short_names_score_zero(self):
        assert _name_match_score("Gra", "Gra") == 0


# ---------------------------------------------------------------------------
# game_id resolution
# ---------------------------------------------------------------------------

class TestGameIdResolution:
    def test_no_bgg_token_leaves_game_id_none(self):
        mock_pool, mock_conn, mock_cursor = _make_pool_mock()
        pipeline = _open_pipeline(mock_pool, bgg_token=None)
        item = _item()
        pipeline.process_item(item, _make_spider())
        # Only the upcoming_games INSERT should have run — no _upsert_game call,
        # so fetchone's (7,) is never consumed for a game_id INSERT.
        insert_calls = [str(c) for c in mock_cursor.execute.call_args_list]
        assert not any("INTO games" in s for s in insert_calls)

    def test_confident_bgg_match_creates_game(self):
        mock_pool, mock_conn, mock_cursor = _make_pool_mock(game_id=99)
        pipeline = _open_pipeline(mock_pool)
        mock_response = MagicMock()
        mock_response.content = _bgg_search_xml(224517, "Dixit Signature Zloczyncy").encode()
        mock_response.text = _bgg_search_xml(224517, "Dixit Signature Zloczyncy")
        pipeline._http = MagicMock()
        pipeline._http.get.return_value = mock_response

        item = _item()
        pipeline.process_item(item, _make_spider())

        insert_calls = [str(c) for c in mock_cursor.execute.call_args_list]
        assert any("INTO games" in s for s in insert_calls)
        assert any("INTO upcoming_games" in s for s in insert_calls)

    def test_no_confident_match_leaves_game_id_none(self):
        mock_pool, mock_conn, mock_cursor = _make_pool_mock()
        pipeline = _open_pipeline(mock_pool)
        mock_response = MagicMock()
        mock_response.content = _bgg_search_empty().encode()
        mock_response.text = _bgg_search_empty()
        pipeline._http = MagicMock()
        pipeline._http.get.return_value = mock_response

        item = _item()
        pipeline.process_item(item, _make_spider())

        insert_calls = [str(c) for c in mock_cursor.execute.call_args_list]
        assert not any("INTO games" in s for s in insert_calls)
        # upcoming_games upsert still happens with game_id=None
        assert any("INTO upcoming_games" in s for s in insert_calls)


# ---------------------------------------------------------------------------
# Upsert behavior (AC-2)
# ---------------------------------------------------------------------------

class TestUpsert:
    def test_upsert_uses_on_conflict_store_name(self):
        mock_pool, mock_conn, mock_cursor = _make_pool_mock()
        pipeline = _open_pipeline(mock_pool, bgg_token=None)
        pipeline.process_item(_item(), _make_spider())
        upsert_call = next(
            c for c in mock_cursor.execute.call_args_list if "INTO upcoming_games" in str(c)
        )
        assert "ON CONFLICT (store_id, name)" in str(upsert_call)

    def test_price_decimal_passed_directly(self):
        mock_pool, mock_conn, mock_cursor = _make_pool_mock()
        pipeline = _open_pipeline(mock_pool, bgg_token=None)
        item = _item(pre_order_price=Decimal("44.95"))
        pipeline.process_item(item, _make_spider())
        upsert_call = next(
            c for c in mock_cursor.execute.call_args_list if "INTO upcoming_games" in str(c)
        )
        assert Decimal("44.95") in upsert_call.args[1]

    def test_returns_item_unchanged(self):
        mock_pool, *_ = _make_pool_mock()
        pipeline = _open_pipeline(mock_pool, bgg_token=None)
        item = _item()
        result = pipeline.process_item(item, _make_spider())
        assert result is item

    def test_db_error_does_not_raise(self):
        mock_pool, mock_conn, mock_cursor = _make_pool_mock()
        pipeline = _open_pipeline(mock_pool, bgg_token=None)
        mock_conn.cursor.side_effect = Exception("DB down")
        # Should not raise
        pipeline.process_item(_item(), _make_spider())


# ---------------------------------------------------------------------------
# Availability transition (AC-4)
# ---------------------------------------------------------------------------

class TestAvailabilityTransition:
    def test_marks_available_when_matching_product_exists(self):
        mock_pool, mock_conn, mock_cursor = _make_pool_mock()
        pipeline = _open_pipeline(mock_pool, bgg_token=None)
        pipeline.process_item(_item(), _make_spider())
        update_calls = [str(c) for c in mock_cursor.execute.call_args_list if "UPDATE upcoming_games" in str(c)]
        assert len(update_calls) == 1
        assert "status = 'available'" in update_calls[0]
        assert "AND status = 'upcoming'" in update_calls[0]

    def test_idempotent_guard_only_updates_upcoming_status(self):
        """The UPDATE's own WHERE clause guards status='upcoming' — verifies the
        idempotency guard is present in the SQL, not just that UPDATE ran once."""
        mock_pool, mock_conn, mock_cursor = _make_pool_mock()
        pipeline = _open_pipeline(mock_pool, bgg_token=None)
        pipeline._maybe_mark_available(2, "Some Game")
        call_sql = str(mock_cursor.execute.call_args_list[0])
        assert "AND status = 'upcoming'" in call_sql

    def test_noop_when_store_id_or_name_missing(self):
        mock_pool, mock_conn, mock_cursor = _make_pool_mock()
        pipeline = _open_pipeline(mock_pool, bgg_token=None)
        pipeline._maybe_mark_available(None, "Some Game")
        mock_pool.getconn.assert_not_called()


# ---------------------------------------------------------------------------
# open_spider / close_spider
# ---------------------------------------------------------------------------

class TestOpenClose:
    def test_raises_when_database_url_missing(self):
        pipeline = UpcomingPipeline()
        with patch("scraper.pipelines.upcoming.psycopg2.pool.ThreadedConnectionPool"), \
             patch.dict("os.environ", {}, clear=True), \
             patch("scraper.pipelines.upcoming.os.getenv", return_value=None):
            with pytest.raises(RuntimeError, match="DATABASE_URL"):
                pipeline.open_spider(_make_spider())

    def test_close_spider_closes_pool_and_http(self):
        mock_pool, *_ = _make_pool_mock()
        pipeline = _open_pipeline(mock_pool, bgg_token=None)
        pipeline.close_spider(_make_spider())
        mock_pool.closeall.assert_called_once()
