"""Tests for scraper/utils/bgg_enrichment.py (Story 2.4).

All DB and HTTP interactions are mocked — no real DB or BGG token required.
"""
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch, call

import pytest

from utils.bgg_enrichment import (
    run_enrichment,
    _safe_int,
    _safe_decimal,
    _build_update_params,
    _resolve_parent_game_id,
)
from utils.bgg_client import BggRateLimitError


# ---------------------------------------------------------------------------
# Unit tests for helper functions
# ---------------------------------------------------------------------------

class TestSafeInt:
    def test_valid_string_returns_int(self):
        assert _safe_int("4") == 4

    def test_none_returns_none(self):
        assert _safe_int(None) is None

    def test_not_ranked_returns_none(self):
        assert _safe_int("Not Ranked") is None

    def test_non_numeric_returns_none(self):
        assert _safe_int("N/A") is None

    def test_zero_string(self):
        assert _safe_int("0") == 0


class TestSafeDecimal:
    def test_valid_string_returns_decimal(self):
        result = _safe_decimal("3.87")
        assert result == Decimal("3.87")

    def test_none_returns_none(self):
        assert _safe_decimal(None) is None

    def test_invalid_string_returns_none(self):
        assert _safe_decimal("not-a-number") is None


class TestBuildUpdateParams:
    def test_maps_fields_correctly(self):
        data = {
            "name": "Gloomhaven",
            "min_players": "1",
            "max_players": "4",
            "min_playtime": "60",
            "max_playtime": "120",
            "min_age": "14",
            "year_published": "2017",
            "bgg_rank": "1",
            "bgg_avg_rating": "8.77",
            "complexity": "3.87",
            "mechanics": ["Hand Management", "Modular Board"],
            "designers": ["Isaac Childres"],
            "publishers": ["Cephalofair Games"],
            "is_expansion": False,
            "bgg_category_rank": {"category": "Strategy Game Rank", "rank": 1},
            "cover_image_url": "https://cf.geekdo-images.com/img.jpg",
        }
        params, _ = _build_update_params(data)

        assert params["name"] == "Gloomhaven"
        assert params["min_players"] == 1
        assert params["max_players"] == 4
        assert params["bgg_rank"] == 1
        assert params["bgg_avg_rating"] == Decimal("8.77")
        assert params["complexity"] == Decimal("3.87")
        assert params["mechanics"] == ["Hand Management", "Modular Board"]
        assert params["is_expansion"] is False
        assert params["bgg_sync_status"] == "synced"
        assert params["rules_pdf_url"] is None  # BGG XML API doesn't expose this

    def test_missing_optional_fields_become_none(self):
        data = {"name": "Simple Game", "is_expansion": False}
        params, _ = _build_update_params(data)

        assert params["min_players"] is None
        assert params["bgg_rank"] is None
        assert params["complexity"] is None
        assert params["mechanics"] == []

    def test_is_expansion_true(self):
        data = {"name": "Expansion Game", "is_expansion": True}
        params, _ = _build_update_params(data)
        assert params["is_expansion"] is True


# ---------------------------------------------------------------------------
# Integration tests for run_enrichment() — mocked DB + BggClient
# ---------------------------------------------------------------------------

def _make_pool_mock(pending_rows=None, stale_rows=None):
    """Build a mock psycopg2 pool returning given pending/stale game rows."""
    pending_rows = pending_rows or []
    stale_rows = stale_rows or []

    mock_pool = MagicMock()
    mock_conn = MagicMock()
    mock_pool.getconn.return_value = mock_conn
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

    # First fetchall() → pending games; second → stale games
    mock_cursor.fetchall.side_effect = [pending_rows, stale_rows]

    return mock_pool, mock_cursor


BGG_DATA = {
    "name": "Brass: Birmingham",
    "min_players": "2",
    "max_players": "4",
    "min_playtime": "60",
    "max_playtime": "120",
    "min_age": "14",
    "year_published": "2018",
    "bgg_rank": "2",
    "bgg_avg_rating": "8.62",
    "complexity": "3.99",
    "mechanics": ["Network and Route Building"],
    "designers": ["Gavan Brown"],
    "publishers": ["Roxley"],
    "is_expansion": False,
    "bgg_category_rank": {"category": "Strategy Game Rank", "rank": 1},
    "cover_image_url": "https://cf.geekdo-images.com/img.jpg",
}


class TestRunEnrichment:
    def _make_env(self):
        return {"BGG_API_TOKEN": "test-token", "DATABASE_URL": "postgresql://test"}

    @patch("utils.bgg_enrichment.psycopg2.pool.ThreadedConnectionPool")
    @patch("utils.bgg_enrichment.BggClient")
    def test_pending_game_synced_on_success(self, mock_client_cls, mock_pool_cls):
        """Pending game → BGG data received → status=synced, fields written."""
        mock_pool, mock_cursor = _make_pool_mock(
            pending_rows=[(1, 224517, "Brass: Birmingham")],
            stale_rows=[],
        )
        mock_pool_cls.return_value = mock_pool

        mock_client = MagicMock()
        mock_client.get_thing_with_retry.return_value = BGG_DATA
        mock_client_cls.return_value = mock_client

        with patch.dict("os.environ", self._make_env()):
            run_enrichment()

        mock_client.get_thing_with_retry.assert_called_once_with(224517)
        # Verify UPDATE was executed (via cursor)
        update_calls = [
            c for c in mock_cursor.execute.call_args_list
            if "UPDATE games" in str(c)
        ]
        assert len(update_calls) >= 1

    @patch("utils.bgg_enrichment.psycopg2.pool.ThreadedConnectionPool")
    @patch("utils.bgg_enrichment.BggClient")
    def test_404_sets_not_found_status_preserves_name(self, mock_client_cls, mock_pool_cls):
        """BGG returns 404 (None) → status=not_found, name NOT overwritten."""
        mock_pool, mock_cursor = _make_pool_mock(
            pending_rows=[(5, 999999, "Original Name From Scraper")],
            stale_rows=[],
        )
        mock_pool_cls.return_value = mock_pool

        mock_client = MagicMock()
        mock_client.get_thing_with_retry.return_value = None
        mock_client_cls.return_value = mock_client

        with patch.dict("os.environ", self._make_env()):
            run_enrichment()

        # status update call for not_found
        status_calls = [
            c for c in mock_cursor.execute.call_args_list
            if "not_found" in str(c)
        ]
        assert len(status_calls) >= 1

        # No UPDATE games SET name=... should include "Original Name From Scraper"
        # (because we don't call _write_game on 404, only _update_status)
        name_write_calls = [
            c for c in mock_cursor.execute.call_args_list
            if "Original Name From Scraper" in str(c)
        ]
        assert len(name_write_calls) == 0

    @patch("utils.bgg_enrichment.psycopg2.pool.ThreadedConnectionPool")
    @patch("utils.bgg_enrichment.BggClient")
    def test_rate_limit_exhausted_sets_rate_limited_continues(self, mock_client_cls, mock_pool_cls):
        """BggRateLimitError after retries → status=rate_limited, next game processed."""
        mock_pool, mock_cursor = _make_pool_mock(
            pending_rows=[
                (1, 111, "Rate Limited Game"),
                (2, 222, "Second Game"),
            ],
            stale_rows=[],
        )
        mock_pool_cls.return_value = mock_pool

        mock_client = MagicMock()
        # First game raises after retries; second succeeds
        mock_client.get_thing_with_retry.side_effect = [
            BggRateLimitError("exhausted"),
            BGG_DATA,
        ]
        mock_client_cls.return_value = mock_client

        with patch.dict("os.environ", self._make_env()):
            run_enrichment()

        # Both games were attempted
        assert mock_client.get_thing_with_retry.call_count == 2
        # rate_limited status was written for first game
        rate_limited_calls = [
            c for c in mock_cursor.execute.call_args_list
            if "rate_limited" in str(c)
        ]
        assert len(rate_limited_calls) >= 1

    @patch("utils.bgg_enrichment.psycopg2.pool.ThreadedConnectionPool")
    @patch("utils.bgg_enrichment.BggClient")
    def test_stale_games_queried(self, mock_client_cls, mock_pool_cls):
        """30-day stale games (status=synced + old updated_at) are included."""
        mock_pool, mock_cursor = _make_pool_mock(
            pending_rows=[],
            stale_rows=[(10, 174430, "Gloomhaven")],
        )
        mock_pool_cls.return_value = mock_pool

        mock_client = MagicMock()
        mock_client.get_thing_with_retry.return_value = BGG_DATA
        mock_client_cls.return_value = mock_client

        with patch.dict("os.environ", self._make_env()):
            run_enrichment()

        mock_client.get_thing_with_retry.assert_called_once_with(174430)

    @patch("utils.bgg_enrichment.psycopg2.pool.ThreadedConnectionPool")
    @patch("utils.bgg_enrichment.BggClient")
    def test_db_write_error_logs_and_continues(self, mock_client_cls, mock_pool_cls):
        """DB write error for one game → logs error, continues to next game."""
        mock_pool, mock_cursor = _make_pool_mock(
            pending_rows=[
                (1, 111, "Game One"),
                (2, 222, "Game Two"),
            ],
            stale_rows=[],
        )
        mock_pool_cls.return_value = mock_pool

        mock_client = MagicMock()
        mock_client.get_thing_with_retry.return_value = BGG_DATA
        mock_client_cls.return_value = mock_client

        # Simulate DB commit error on first game only
        mock_pool.getconn.return_value.commit.side_effect = [
            Exception("DB connection lost"),  # first game write fails
            None,  # second game write succeeds
            None,  # any further commits succeed
        ]

        # Should NOT raise — errors are per-game
        with patch.dict("os.environ", self._make_env()):
            run_enrichment()

        # Both games were attempted despite first game DB error
        assert mock_client.get_thing_with_retry.call_count == 2

    @patch("utils.bgg_enrichment.psycopg2.pool.ThreadedConnectionPool")
    @patch("utils.bgg_enrichment.BggClient")
    def test_is_expansion_written_correctly(self, mock_client_cls, mock_pool_cls):
        """is_expansion=True reaches the UPDATE statement."""
        mock_pool, mock_cursor = _make_pool_mock(
            pending_rows=[(7, 161936, "Some Expansion")],
            stale_rows=[],
        )
        mock_pool_cls.return_value = mock_pool

        expansion_data = {**BGG_DATA, "is_expansion": True}
        mock_client = MagicMock()
        mock_client.get_thing_with_retry.return_value = expansion_data
        mock_client_cls.return_value = mock_client

        with patch.dict("os.environ", self._make_env()):
            run_enrichment()

        update_calls = [
            c for c in mock_cursor.execute.call_args_list
            if "UPDATE games" in str(c)
        ]
        assert len(update_calls) >= 1
        # Verify is_expansion=True was in the params dict
        for c in update_calls:
            args = c[0]
            if len(args) > 1 and isinstance(args[1], dict):
                if "is_expansion" in args[1]:
                    assert args[1]["is_expansion"] is True
                    break

    def test_missing_bgg_token_raises_runtime_error(self):
        """Missing BGG_API_TOKEN → RuntimeError (not SystemExit — library function)."""
        with patch.dict("os.environ", {"DATABASE_URL": "postgresql://test"}, clear=True):
            with pytest.raises(RuntimeError, match="BGG_API_TOKEN"):
                run_enrichment()

    def test_missing_database_url_raises_runtime_error(self):
        """Missing DATABASE_URL → RuntimeError (not SystemExit — library function)."""
        with patch.dict("os.environ", {"BGG_API_TOKEN": "token"}, clear=True):
            with pytest.raises(RuntimeError, match="DATABASE_URL"):
                run_enrichment()


# ---------------------------------------------------------------------------
# Unit tests for _resolve_parent_game_id() — Task 3 (Story 4.5b)
# ---------------------------------------------------------------------------

class TestResolveParentGameId:
    def test_none_base_game_bgg_id_returns_none_no_query(self):
        cur = MagicMock()
        result = _resolve_parent_game_id(cur, None, 1)
        assert result is None
        cur.execute.assert_not_called()

    def test_base_game_found_returns_local_id(self):
        cur = MagicMock()
        cur.fetchone.return_value = (42,)
        result = _resolve_parent_game_id(cur, 205637, 1)
        assert result == 42
        cur.execute.assert_called_once_with(
            "SELECT id FROM games WHERE bgg_id = %s", (205637,)
        )

    def test_base_game_not_found_returns_none(self):
        cur = MagicMock()
        cur.fetchone.return_value = None
        result = _resolve_parent_game_id(cur, 205637, 1)
        assert result is None

    def test_base_game_resolves_to_own_row_returns_none(self):
        cur = MagicMock()
        cur.fetchone.return_value = (1,)
        result = _resolve_parent_game_id(cur, 205637, 1)
        assert result is None


# ---------------------------------------------------------------------------
# Integration tests for parent_game_id resolution in run_enrichment() — Task 3 (Story 4.5b)
# ---------------------------------------------------------------------------

class TestRunEnrichmentParentGameId:
    def _make_env(self):
        return {"BGG_API_TOKEN": "test-token", "DATABASE_URL": "postgresql://test"}

    @patch("utils.bgg_enrichment.psycopg2.pool.ThreadedConnectionPool")
    @patch("utils.bgg_enrichment.BggClient")
    def test_base_game_already_local_sets_parent_game_id(self, mock_client_cls, mock_pool_cls):
        """Expansion whose base game already exists locally → parent_game_id set."""
        mock_pool, mock_cursor = _make_pool_mock(
            pending_rows=[(1, 161936, "Some Expansion")],
            stale_rows=[],
        )
        mock_pool_cls.return_value = mock_pool
        mock_cursor.fetchone.return_value = (42,)  # local id of the base game

        expansion_data = {**BGG_DATA, "is_expansion": True, "base_game_bgg_id": 205637}
        mock_client = MagicMock()
        mock_client.get_thing_with_retry.return_value = expansion_data
        mock_client_cls.return_value = mock_client

        with patch.dict("os.environ", self._make_env()):
            run_enrichment()

        update_calls = [
            c for c in mock_cursor.execute.call_args_list
            if "UPDATE games" in str(c)
        ]
        assert len(update_calls) >= 1
        found = False
        for c in update_calls:
            args = c[0]
            if len(args) > 1 and isinstance(args[1], dict) and "parent_game_id" in args[1]:
                assert args[1]["parent_game_id"] == 42
                found = True
        assert found, "parent_game_id not found in UPDATE games params"

    @patch("utils.bgg_enrichment.psycopg2.pool.ThreadedConnectionPool")
    @patch("utils.bgg_enrichment.BggClient")
    def test_base_game_not_yet_scraped_leaves_parent_game_id_null(self, mock_client_cls, mock_pool_cls):
        """Expansion whose base game hasn't been scraped/deduplicated yet → parent_game_id stays NULL."""
        mock_pool, mock_cursor = _make_pool_mock(
            pending_rows=[(1, 161936, "Some Expansion")],
            stale_rows=[],
        )
        mock_pool_cls.return_value = mock_pool
        mock_cursor.fetchone.return_value = None  # no local row for base game yet

        expansion_data = {**BGG_DATA, "is_expansion": True, "base_game_bgg_id": 205637}
        mock_client = MagicMock()
        mock_client.get_thing_with_retry.return_value = expansion_data
        mock_client_cls.return_value = mock_client

        with patch.dict("os.environ", self._make_env()):
            run_enrichment()

        update_calls = [
            c for c in mock_cursor.execute.call_args_list
            if "UPDATE games" in str(c)
        ]
        found = False
        for c in update_calls:
            args = c[0]
            if len(args) > 1 and isinstance(args[1], dict) and "parent_game_id" in args[1]:
                assert args[1]["parent_game_id"] is None
                found = True
        assert found, "parent_game_id not found in UPDATE games params"

    @patch("utils.bgg_enrichment.psycopg2.pool.ThreadedConnectionPool")
    @patch("utils.bgg_enrichment.BggClient")
    def test_non_expansion_game_no_parent_lookup_query(self, mock_client_cls, mock_pool_cls):
        """Non-expansion game (base_game_bgg_id is None) → parent_game_id stays NULL, no lookup query."""
        mock_pool, mock_cursor = _make_pool_mock(
            pending_rows=[(1, 224517, "Brass: Birmingham")],
            stale_rows=[],
        )
        mock_pool_cls.return_value = mock_pool

        mock_client = MagicMock()
        mock_client.get_thing_with_retry.return_value = BGG_DATA  # no base_game_bgg_id key
        mock_client_cls.return_value = mock_client

        with patch.dict("os.environ", self._make_env()):
            run_enrichment()

        lookup_calls = [
            c for c in mock_cursor.execute.call_args_list
            if "SELECT id FROM games WHERE bgg_id" in str(c)
        ]
        assert len(lookup_calls) == 0

    @patch("utils.bgg_enrichment.psycopg2.pool.ThreadedConnectionPool")
    @patch("utils.bgg_enrichment.BggClient")
    def test_parent_lookup_db_error_counts_as_error_and_continues(self, mock_client_cls, mock_pool_cls):
        """DB error inside _resolve_parent_game_id's SELECT → caught by the outer per-game
        except block (errors += 1), does not crash run_enrichment, next game still processed."""
        mock_pool, mock_cursor = _make_pool_mock(
            pending_rows=[
                (1, 161936, "Expansion One"),
                (2, 161937, "Expansion Two"),
            ],
            stale_rows=[],
        )
        mock_pool_cls.return_value = mock_pool

        def execute_side_effect(query, params=None):
            if "SELECT id FROM games WHERE bgg_id" in query and not execute_side_effect.raised:
                execute_side_effect.raised = True
                raise Exception("DB connection lost during parent lookup")
            return None

        execute_side_effect.raised = False
        mock_cursor.execute.side_effect = execute_side_effect

        expansion_data = {**BGG_DATA, "is_expansion": True, "base_game_bgg_id": 205637}
        mock_client = MagicMock()
        mock_client.get_thing_with_retry.return_value = expansion_data
        mock_client_cls.return_value = mock_client

        # Should not raise — the per-game try/except in run_enrichment() must catch it
        with patch.dict("os.environ", self._make_env()):
            run_enrichment()

        # Both games were attempted despite the first game's lookup failure
        assert mock_client.get_thing_with_retry.call_count == 2

        # Second game still reached the UPDATE games statement
        update_calls = [
            c for c in mock_cursor.execute.call_args_list
            if "UPDATE games" in str(c)
        ]
        assert len(update_calls) >= 1
