"""Tests for DeduplicationPipeline — all HTTP and DB calls mocked."""
from unittest.mock import MagicMock, patch

import pytest

from scraper.pipelines.deduplication import DeduplicationPipeline, _normalise_name


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_pool_mock(game_id: int = 1) -> MagicMock:
    mock_cursor = MagicMock()
    mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
    mock_cursor.__exit__ = MagicMock(return_value=False)
    mock_cursor.fetchone.return_value = (game_id,)

    mock_conn = MagicMock()
    mock_conn.cursor.return_value = mock_cursor

    mock_pool = MagicMock()
    mock_pool.getconn.return_value = mock_conn
    return mock_pool


def _gameupc_response(bgg_id: int, name: str = "Test Game") -> MagicMock:
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = {
        "status": "ok",
        "bgg_info": [{"id": bgg_id, "name": name}],
        "bgg_info_status": "choose_from_bgg_info_or_search",
    }
    return resp


def _gameupc_multi(bgg_info: list[dict]) -> MagicMock:
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = {
        "status": "ok",
        "bgg_info": bgg_info,
        "bgg_info_status": "choose_from_bgg_info_or_search",
    }
    return resp


def _gameupc_404() -> MagicMock:
    resp = MagicMock()
    resp.status_code = 404
    return resp


def _gameupc_500() -> MagicMock:
    import httpx
    resp = MagicMock()
    resp.status_code = 500
    exc = httpx.HTTPStatusError("500", request=MagicMock(), response=resp)
    return exc


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


# ---------------------------------------------------------------------------
# _normalise_name unit tests
# ---------------------------------------------------------------------------

def test_normalise_strips_edycja_polska():
    assert _normalise_name("Simsala Spin (edycja polska)") == "simsala spin"


def test_normalise_strips_publisher_dash():
    # em-dash publisher suffix stripped; (edycja polska) stripped; subtitle retained
    result = _normalise_name("Brass: Lancashire (edycja polska) — Maldito")
    assert result == "brass: lancashire"


def test_normalise_strips_deluxe():
    result = _normalise_name("Brass: Lancashire Deluxe")
    assert result == "brass: lancashire"


def test_normalise_transliterates_polish():
    result = _normalise_name("Wsiąść do pociągu")
    assert "a" in result
    assert "ą" not in result
    assert "ę" not in result


def test_normalise_strips_polish_edition_variant():
    assert _normalise_name("Agricola (Polish Edition)") == "agricola"


def test_normalise_lowercase():
    result = _normalise_name("CATAN")
    assert result == "catan"


def test_normalise_strips_base_game():
    result = _normalise_name("Wingspan Base Game")
    assert "base game" not in result


# ---------------------------------------------------------------------------
# EAN path — success
# ---------------------------------------------------------------------------

@patch("scraper.pipelines.deduplication.psycopg2.pool.ThreadedConnectionPool")
@patch("scraper.pipelines.deduplication.httpx.Client")
def test_ean_path_success_sets_bgg_id_and_game_id(mock_client_cls, mock_pool_cls):
    mock_http = MagicMock()
    mock_client_cls.return_value = mock_http
    mock_pool = _make_pool_mock(game_id=42)
    mock_pool_cls.return_value = mock_pool

    mock_http.get.return_value = _gameupc_response(bgg_id=437106, name="Simsala Spin")

    pipeline = DeduplicationPipeline()
    with patch.dict("os.environ", {"DATABASE_URL": "postgresql://test", "GAMEUPC_API_KEY": "testkey"}):
        pipeline.open_spider(MagicMock())

    item = {"name": "Simsala Spin", "url": "http://example.com", "ean": "5903707560875"}
    result = pipeline.process_item(item, MagicMock())

    assert result["bgg_id"] == 437106
    assert result["game_id"] == 42


@patch("scraper.pipelines.deduplication.psycopg2.pool.ThreadedConnectionPool")
@patch("scraper.pipelines.deduplication.httpx.Client")
def test_ean_path_returns_correct_bgg_id(mock_client_cls, mock_pool_cls):
    mock_http = MagicMock()
    mock_client_cls.return_value = mock_http
    mock_pool_cls.return_value = _make_pool_mock(game_id=7)
    mock_http.get.return_value = _gameupc_response(bgg_id=224517, name="Brass Birmingham")

    pipeline = DeduplicationPipeline()
    with patch.dict("os.environ", {"DATABASE_URL": "postgresql://test", "GAMEUPC_API_KEY": "testkey"}):
        pipeline.open_spider(MagicMock())

    item = {"name": "Brass Birmingham", "url": "http://example.com", "ean": "1234567890123"}
    result = pipeline.process_item(item, MagicMock())

    assert result["bgg_id"] == 224517


# ---------------------------------------------------------------------------
# EAN path — no GAMEUPC_API_KEY → path disabled entirely, no HTTP call
# ---------------------------------------------------------------------------

@patch("scraper.pipelines.deduplication.psycopg2.pool.ThreadedConnectionPool")
@patch("scraper.pipelines.deduplication.httpx.Client")
def test_no_gameupc_key_ean_path_skipped_falls_through_to_name_path(mock_client_cls, mock_pool_cls):
    mock_http = MagicMock()
    mock_client_cls.return_value = mock_http
    mock_pool_cls.return_value = _make_pool_mock(game_id=11)

    # Only the BGG search call should ever happen — no GameUPC call to consume this
    mock_http.get.return_value = MagicMock(
        status_code=200,
        text=_bgg_search_xml(31260, "agricola"),
    )

    pipeline = DeduplicationPipeline()
    # open_spider calls load_dotenv(), which would repopulate the cleared environ from
    # a real local scraper/.env — silently defeating clear=True the day GAMEUPC_API_KEY
    # is added there (which the story's Manual prerequisite tells the operator to do).
    with patch("scraper.pipelines.deduplication.load_dotenv", lambda *a, **k: None), \
         patch.dict("os.environ", {
             "DATABASE_URL": "postgresql://test",
             "BGG_API_TOKEN": "bgg-token-abc",
         }, clear=True):
        pipeline.open_spider(MagicMock())

    item = {"name": "Agricola", "url": "http://example.com", "ean": "9999999999999"}
    result = pipeline.process_item(item, MagicMock())

    # Exactly one call (BGG search) — GameUPC was never hit since no real key exists
    assert mock_http.get.call_count == 1
    assert result.get("bgg_id") == 31260


# ---------------------------------------------------------------------------
# EAN path — GameUPC candidate name doesn't match scraped product name → rejected
# ---------------------------------------------------------------------------

@patch("scraper.pipelines.deduplication.psycopg2.pool.ThreadedConnectionPool")
@patch("scraper.pipelines.deduplication.httpx.Client")
def test_ean_path_candidate_name_mismatch_falls_through_to_name_path(mock_client_cls, mock_pool_cls):
    mock_http = MagicMock()
    mock_client_cls.return_value = mock_http
    mock_pool_cls.return_value = _make_pool_mock(game_id=12)

    mock_http.get.side_effect = [
        _gameupc_response(bgg_id=999999, name="Completely Unrelated Game"),  # GameUPC: wrong candidate
        MagicMock(status_code=200, text=_bgg_search_xml(31260, "agricola")),  # BGG search: correct match
    ]

    pipeline = DeduplicationPipeline()
    with patch.dict("os.environ", {
        "DATABASE_URL": "postgresql://test",
        "GAMEUPC_API_KEY": "testkey",
        "BGG_API_TOKEN": "bgg-token-abc",
    }):
        pipeline.open_spider(MagicMock())

    item = {"name": "Agricola", "url": "http://example.com", "ean": "9999999999999"}
    result = pipeline.process_item(item, MagicMock())

    # GameUPC's low-confidence/wrong candidate is rejected — name-path recovers with the correct id
    assert result.get("bgg_id") == 31260


# ---------------------------------------------------------------------------
# EAN path — expansion candidate must NOT be merged onto its base game
# ---------------------------------------------------------------------------

@patch("scraper.pipelines.deduplication.psycopg2.pool.ThreadedConnectionPool")
@patch("scraper.pipelines.deduplication.httpx.Client")
def test_ean_path_expansion_not_merged_into_base_game(mock_client_cls, mock_pool_cls):
    mock_http = MagicMock()
    mock_client_cls.return_value = mock_http
    mock_pool_cls.return_value = _make_pool_mock(game_id=13)

    # GameUPC returns the BASE game "Catan" for an EXPANSION product. Under the old
    # WRatio guard this scored ~90 and was wrongly accepted; token_sort_ratio must reject it.
    mock_http.get.side_effect = [
        _gameupc_response(bgg_id=13, name="Catan"),
        MagicMock(status_code=200, text=_bgg_search_xml(0, "no-match")),
    ]

    pipeline = DeduplicationPipeline()
    with patch.dict("os.environ", {
        "DATABASE_URL": "postgresql://test",
        "GAMEUPC_API_KEY": "testkey",
        "BGG_API_TOKEN": "bgg-token-abc",
    }):
        pipeline.open_spider(MagicMock())

    item = {"name": "Catan: Miasta i Rycerze", "url": "http://example.com", "ean": "9999999999999"}
    result = pipeline.process_item(item, MagicMock())

    # Rejected on the EAN path → not merged into bgg_id=13 ("Catan")
    assert result.get("bgg_id") != 13


# ---------------------------------------------------------------------------
# EAN path — best candidate across the whole bgg_info list is chosen, not [0]
# ---------------------------------------------------------------------------

@patch("scraper.pipelines.deduplication.psycopg2.pool.ThreadedConnectionPool")
@patch("scraper.pipelines.deduplication.httpx.Client")
def test_ean_path_scores_all_candidates_not_just_first(mock_client_cls, mock_pool_cls):
    mock_http = MagicMock()
    mock_client_cls.return_value = mock_http
    mock_pool_cls.return_value = _make_pool_mock(game_id=42)

    # The correct match ("Simsala Spin") is at index 1; index 0 is a poor match.
    mock_http.get.return_value = _gameupc_multi([
        {"id": 111111, "name": "Something Different"},
        {"id": 437106, "name": "Simsala Spin"},
    ])

    pipeline = DeduplicationPipeline()
    with patch.dict("os.environ", {"DATABASE_URL": "postgresql://test", "GAMEUPC_API_KEY": "testkey"}):
        pipeline.open_spider(MagicMock())

    item = {"name": "Simsala Spin", "url": "http://example.com", "ean": "5903707560875"}
    result = pipeline.process_item(item, MagicMock())

    assert result["bgg_id"] == 437106


# ---------------------------------------------------------------------------
# Base URL is chosen from key presence — a real key never targets /test
# ---------------------------------------------------------------------------

@patch("scraper.pipelines.deduplication.psycopg2.pool.ThreadedConnectionPool")
@patch("scraper.pipelines.deduplication.httpx.Client")
def test_gameupc_base_selected_from_key_presence(mock_client_cls, mock_pool_cls):
    from scraper.pipelines.deduplication import GAMEUPC_BASE_PROD, GAMEUPC_BASE_TEST

    mock_client_cls.return_value = MagicMock()
    mock_pool_cls.return_value = _make_pool_mock(game_id=1)

    with patch("scraper.pipelines.deduplication.load_dotenv", lambda *a, **k: None):
        with_key = DeduplicationPipeline()
        with patch.dict("os.environ", {"DATABASE_URL": "x", "GAMEUPC_API_KEY": "real"}, clear=True):
            with_key.open_spider(MagicMock())
        assert with_key._gameupc_base == GAMEUPC_BASE_PROD

        without_key = DeduplicationPipeline()
        with patch.dict("os.environ", {"DATABASE_URL": "x"}, clear=True):
            without_key.open_spider(MagicMock())
        assert without_key._gameupc_base == GAMEUPC_BASE_TEST


# ---------------------------------------------------------------------------
# EAN path — 404 fallthrough to name path
# ---------------------------------------------------------------------------

@patch("scraper.pipelines.deduplication.psycopg2.pool.ThreadedConnectionPool")
@patch("scraper.pipelines.deduplication.httpx.Client")
def test_ean_404_falls_through_to_name_path(mock_client_cls, mock_pool_cls):
    mock_http = MagicMock()
    mock_client_cls.return_value = mock_http
    mock_pool_cls.return_value = _make_pool_mock(game_id=10)

    # EAN → 404; name search → match
    mock_http.get.side_effect = [
        _gameupc_404(),  # GameUPC returns 404
        MagicMock(  # BGG search returns XML match
            status_code=200,
            text=_bgg_search_xml(31260, "agricola"),
        ),
    ]

    pipeline = DeduplicationPipeline()
    with patch.dict("os.environ", {
        "DATABASE_URL": "postgresql://test",
        "GAMEUPC_API_KEY": "testkey",
        "BGG_API_TOKEN": "bgg-token-abc",
    }):
        pipeline.open_spider(MagicMock())

    item = {"name": "Agricola", "url": "http://example.com", "ean": "9999999999999"}
    result = pipeline.process_item(item, MagicMock())

    assert result.get("bgg_id") == 31260


# ---------------------------------------------------------------------------
# EAN path — HTTP 500 → fallthrough, no exception
# ---------------------------------------------------------------------------

@patch("scraper.pipelines.deduplication.psycopg2.pool.ThreadedConnectionPool")
@patch("scraper.pipelines.deduplication.httpx.Client")
def test_ean_http_500_falls_through_no_exception(mock_client_cls, mock_pool_cls):
    import httpx as _httpx

    mock_http = MagicMock()
    mock_client_cls.return_value = mock_http
    mock_pool_cls.return_value = _make_pool_mock(game_id=5)

    error_resp = MagicMock()
    error_resp.status_code = 500
    http_err = _httpx.HTTPStatusError("500", request=MagicMock(), response=error_resp)
    mock_http.get.side_effect = [
        http_err,                              # GameUPC 500
        MagicMock(                             # BGG search empty
            status_code=200,
            text=_bgg_search_empty(),
        ),
    ]

    pipeline = DeduplicationPipeline()
    with patch.dict("os.environ", {
        "DATABASE_URL": "postgresql://test",
        "GAMEUPC_API_KEY": "testkey",
        "BGG_API_TOKEN": "bgg-token-abc",
    }):
        pipeline.open_spider(MagicMock())

    item = {"name": "Some Game", "url": "http://example.com", "ean": "0000000000000"}
    result = pipeline.process_item(item, MagicMock())

    assert result.get("bgg_id") is None
    assert result.get("game_id") is None


# ---------------------------------------------------------------------------
# Name path — fuzzy ≥ 85 → auto-link
# ---------------------------------------------------------------------------

@patch("scraper.pipelines.deduplication.psycopg2.pool.ThreadedConnectionPool")
@patch("scraper.pipelines.deduplication.httpx.Client")
def test_name_fuzzy_high_confidence_auto_links(mock_client_cls, mock_pool_cls):
    mock_http = MagicMock()
    mock_client_cls.return_value = mock_http
    mock_pool_cls.return_value = _make_pool_mock(game_id=3)

    # No EAN on item; BGG search returns exact match
    mock_http.get.return_value = MagicMock(
        status_code=200,
        text=_bgg_search_xml(31260, "agricola"),
    )

    pipeline = DeduplicationPipeline()
    with patch.dict("os.environ", {
        "DATABASE_URL": "postgresql://test",
        "BGG_API_TOKEN": "bgg-token-abc",
    }):
        pipeline.open_spider(MagicMock())

    item = {"name": "Agricola", "url": "http://example.com"}
    result = pipeline.process_item(item, MagicMock())

    assert result.get("bgg_id") == 31260
    assert result.get("game_id") == 3


# ---------------------------------------------------------------------------
# Name path — fuzzy < 85 → queued (no bgg_id)
# ---------------------------------------------------------------------------

@patch("scraper.pipelines.deduplication.psycopg2.pool.ThreadedConnectionPool")
@patch("scraper.pipelines.deduplication.httpx.Client")
def test_name_fuzzy_low_confidence_queues_item(mock_client_cls, mock_pool_cls):
    mock_http = MagicMock()
    mock_client_cls.return_value = mock_http
    mock_pool_cls.return_value = _make_pool_mock()

    mock_http.get.return_value = MagicMock(
        status_code=200,
        text=_bgg_search_xml(99999, "completely different game zzz"),
    )

    pipeline = DeduplicationPipeline()
    with patch.dict("os.environ", {
        "DATABASE_URL": "postgresql://test",
        "BGG_API_TOKEN": "bgg-token-abc",
    }):
        pipeline.open_spider(MagicMock())

    item = {"name": "Specific Polish Game XYZ", "url": "http://example.com"}
    result = pipeline.process_item(item, MagicMock())

    assert result.get("bgg_id") is None
    assert result.get("game_id") is None


# ---------------------------------------------------------------------------
# No BGG_API_TOKEN → name path skipped, no exception
# ---------------------------------------------------------------------------

@patch("scraper.pipelines.deduplication.psycopg2.pool.ThreadedConnectionPool")
@patch("scraper.pipelines.deduplication.httpx.Client")
def test_no_bgg_token_name_path_skipped(mock_client_cls, mock_pool_cls):
    mock_http = MagicMock()
    mock_client_cls.return_value = mock_http
    mock_pool_cls.return_value = _make_pool_mock()

    mock_http.get.return_value = _gameupc_404()

    pipeline = DeduplicationPipeline()
    with patch.dict("os.environ", {"DATABASE_URL": "postgresql://test", "GAMEUPC_API_KEY": "testkey"}, clear=True):
        pipeline.open_spider(MagicMock())

    item = {"name": "Some Game", "url": "http://example.com", "ean": "1234567890000"}
    result = pipeline.process_item(item, MagicMock())

    # BGG search should NOT have been called (only GameUPC → 404)
    assert mock_http.get.call_count == 1
    assert result.get("bgg_id") is None


# ---------------------------------------------------------------------------
# ON CONFLICT — duplicate bgg_id returns existing game_id
# ---------------------------------------------------------------------------

@patch("scraper.pipelines.deduplication.psycopg2.pool.ThreadedConnectionPool")
@patch("scraper.pipelines.deduplication.httpx.Client")
def test_upsert_game_on_conflict_returns_existing_id(mock_client_cls, mock_pool_cls):
    mock_http = MagicMock()
    mock_client_cls.return_value = mock_http
    mock_pool_cls.return_value = _make_pool_mock(game_id=99)  # existing game_id

    mock_http.get.return_value = _gameupc_response(bgg_id=437106, name="Simsala Spin")

    pipeline = DeduplicationPipeline()
    with patch.dict("os.environ", {"DATABASE_URL": "postgresql://test", "GAMEUPC_API_KEY": "testkey"}):
        pipeline.open_spider(MagicMock())

    item = {"name": "Simsala Spin", "url": "http://example.com", "ean": "5903707560875"}
    result = pipeline.process_item(item, MagicMock())

    # ON CONFLICT path returns the id from RETURNING clause (existing game)
    assert result["game_id"] == 99
    assert result["bgg_id"] == 437106


# ---------------------------------------------------------------------------
# process_item always returns item (Scrapy convention)
# ---------------------------------------------------------------------------

@patch("scraper.pipelines.deduplication.psycopg2.pool.ThreadedConnectionPool")
@patch("scraper.pipelines.deduplication.httpx.Client")
def test_process_item_always_returns_item(mock_client_cls, mock_pool_cls):
    mock_http = MagicMock()
    mock_client_cls.return_value = mock_http
    mock_pool_cls.return_value = _make_pool_mock()

    mock_http.get.return_value = _gameupc_404()

    pipeline = DeduplicationPipeline()
    with patch.dict("os.environ", {"DATABASE_URL": "postgresql://test"}, clear=True):
        pipeline.open_spider(MagicMock())

    item = {"name": "Test", "url": "http://example.com"}
    result = pipeline.process_item(item, MagicMock())

    assert result is item


# ---------------------------------------------------------------------------
# BGG Search network failure → no exception, item queued
# ---------------------------------------------------------------------------

@patch("scraper.pipelines.deduplication.psycopg2.pool.ThreadedConnectionPool")
@patch("scraper.pipelines.deduplication.httpx.Client")
def test_bgg_search_network_failure_item_queued(mock_client_cls, mock_pool_cls):
    import httpx as _httpx

    mock_http = MagicMock()
    mock_client_cls.return_value = mock_http
    mock_pool_cls.return_value = _make_pool_mock()

    mock_http.get.side_effect = [
        _gameupc_404(),
        _httpx.ConnectError("timeout"),
    ]

    pipeline = DeduplicationPipeline()
    with patch.dict("os.environ", {
        "DATABASE_URL": "postgresql://test",
        "GAMEUPC_API_KEY": "testkey",
        "BGG_API_TOKEN": "bgg-token-abc",
    }):
        pipeline.open_spider(MagicMock())

    item = {"name": "Some Game", "url": "http://example.com", "ean": "0000000000000"}
    result = pipeline.process_item(item, MagicMock())

    assert result.get("bgg_id") is None


# ---------------------------------------------------------------------------
# close_spider — closes http and pool
# ---------------------------------------------------------------------------

@patch("scraper.pipelines.deduplication.psycopg2.pool.ThreadedConnectionPool")
@patch("scraper.pipelines.deduplication.httpx.Client")
def test_close_spider_closes_http_and_pool(mock_client_cls, mock_pool_cls):
    mock_http = MagicMock()
    mock_client_cls.return_value = mock_http
    mock_pool = _make_pool_mock()
    mock_pool_cls.return_value = mock_pool

    pipeline = DeduplicationPipeline()
    with patch.dict("os.environ", {"DATABASE_URL": "postgresql://test"}):
        pipeline.open_spider(MagicMock())

    pipeline.close_spider(MagicMock())

    mock_http.close.assert_called_once()
    mock_pool.closeall.assert_called_once()
