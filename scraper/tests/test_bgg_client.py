"""Tests for scraper/utils/bgg_client.py (Story 1.5).

All HTTP calls are mocked — no real BGG token required.
"""
import time
from unittest.mock import MagicMock, patch

import pytest

from utils.bgg_client import BggClient, BggRateLimitError

# Minimal valid BGG XML response for Brass Birmingham (id=224517)
BRASS_BIRMINGHAM_XML = """<?xml version="1.0" encoding="utf-8"?>
<items termsofuse="https://boardgamegeek.com/xmlapi/termsofuse" version="4">
  <item type="boardgame" id="224517">
    <thumbnail>https://cf.geekdo-images.com/thumb.jpg</thumbnail>
    <image>https://cf.geekdo-images.com/full.jpg</image>
    <name type="primary" sortindex="1" value="Brass: Birmingham" />
    <name type="alternate" sortindex="1" value="Bronce: Birmingham" />
    <yearpublished value="2018" />
    <minplayers value="2" />
    <maxplayers value="4" />
    <minplaytime value="60" />
    <maxplaytime value="120" />
    <minage value="14" />
    <link type="boardgamemechanic" id="2041" value="Network and Route Building" />
    <link type="boardgamemechanic" id="2004" value="Set Collection" />
    <link type="boardgamedesigner" id="98" value="Gavan Brown" />
    <link type="boardgamedesigner" id="10858" value="Matt Tolman" />
    <link type="boardgamepublisher" id="3" value="Rio Grande Games" />
    <statistics page="1">
      <ratings>
        <average value="8.62" />
        <ranks>
          <rank type="subtype" id="1" name="boardgame" value="2" />
        </ranks>
      </ratings>
    </statistics>
  </item>
</items>"""

NOT_FOUND_XML = """<?xml version="1.0" encoding="utf-8"?>
<items termsofuse="https://boardgamegeek.com/xmlapi/termsofuse" version="4">
</items>"""

MALFORMED_XML = "this is not xml at all <<<"


def _make_response(status_code: int, text: str = "") -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.text = text
    resp.raise_for_status = MagicMock()
    if status_code >= 400:
        resp.raise_for_status.side_effect = Exception(f"HTTP {status_code}")
    return resp


class TestBggClientGetThing:
    def setup_method(self):
        self.client = BggClient(token="test-token")

    @patch("utils.bgg_client.httpx.get")
    def test_successful_fetch_returns_parsed_dict(self, mock_get):
        mock_get.return_value = _make_response(200, BRASS_BIRMINGHAM_XML)

        result = self.client.get_thing(224517)

        assert result is not None
        assert result["name"] == "Brass: Birmingham"
        assert result["min_players"] == "2"
        assert result["max_players"] == "4"
        assert result["min_playtime"] == "60"
        assert result["max_playtime"] == "120"
        assert result["min_age"] == "14"
        assert result["year_published"] == "2018"
        assert result["bgg_rank"] == "2"
        assert result["bgg_avg_rating"] == "8.62"
        assert result["cover_image_url"] == "https://cf.geekdo-images.com/full.jpg"
        assert "Network and Route Building" in result["mechanics"]
        assert "Set Collection" in result["mechanics"]
        assert "Gavan Brown" in result["designers"]
        assert "Rio Grande Games" in result["publishers"]

    @patch("utils.bgg_client.httpx.get")
    def test_404_returns_none(self, mock_get):
        mock_get.return_value = _make_response(404)

        result = self.client.get_thing(999999)

        assert result is None

    @patch("utils.bgg_client.httpx.get")
    def test_429_raises_bgg_rate_limit_error(self, mock_get):
        mock_get.return_value = _make_response(429)

        with pytest.raises(BggRateLimitError):
            self.client.get_thing(224517)

    @patch("utils.bgg_client.httpx.get")
    def test_202_raises_bgg_rate_limit_error(self, mock_get):
        mock_get.return_value = _make_response(202)

        with pytest.raises(BggRateLimitError):
            self.client.get_thing(224517)

    @patch("utils.bgg_client.httpx.get")
    def test_uses_bearer_auth_header(self, mock_get):
        mock_get.return_value = _make_response(200, BRASS_BIRMINGHAM_XML)

        self.client.get_thing(224517)

        call_kwargs = mock_get.call_args
        assert call_kwargs.kwargs["headers"]["Authorization"] == "Bearer test-token"

    @patch("utils.bgg_client.httpx.get")
    def test_includes_stats_param(self, mock_get):
        mock_get.return_value = _make_response(200, BRASS_BIRMINGHAM_XML)

        self.client.get_thing(224517)

        call_kwargs = mock_get.call_args
        assert call_kwargs.kwargs["params"]["stats"] == 1

    @patch("utils.bgg_client.httpx.get")
    def test_malformed_xml_returns_unknown_game(self, mock_get):
        mock_get.return_value = _make_response(200, MALFORMED_XML)

        result = self.client.get_thing(224517)

        assert result is not None
        assert result["name"] == "Nieznana gra"

    @patch("utils.bgg_client.httpx.get")
    def test_empty_item_list_returns_unknown_game(self, mock_get):
        mock_get.return_value = _make_response(200, NOT_FOUND_XML)

        result = self.client.get_thing(224517)

        assert result is not None
        assert result["name"] == "Nieznana gra"

    @patch("utils.bgg_client.httpx.get")
    def test_missing_optional_fields_return_none(self, mock_get):
        # XML with only required name, no stats/image/playtime
        minimal_xml = """<?xml version="1.0"?>
<items>
  <item type="boardgame" id="1">
    <name type="primary" value="Test Game" />
  </item>
</items>"""
        mock_get.return_value = _make_response(200, minimal_xml)

        result = self.client.get_thing(1)

        assert result["name"] == "Test Game"
        assert result["min_players"] is None
        assert result["bgg_rank"] is None
        assert result["cover_image_url"] is None
        assert result["mechanics"] == []
        assert result["designers"] == []

    @patch("utils.bgg_client.httpx.get")
    def test_no_print_calls_used(self, mock_get):
        """Verify no print() in module — logging only (CLAUDE.md rule)."""
        import utils.bgg_client as module
        import builtins

        mock_get.return_value = _make_response(200, BRASS_BIRMINGHAM_XML)
        original_print = builtins.print
        print_called = []

        def spy_print(*args, **kwargs):
            print_called.append(args)
            return original_print(*args, **kwargs)

        builtins.print = spy_print
        try:
            self.client.get_thing(224517)
        finally:
            builtins.print = original_print

        assert print_called == [], "print() was called — use logger instead (CLAUDE.md)"


class TestBggClientThrottle:
    def test_throttle_enforces_one_request_per_second(self):
        client = BggClient(token="test-token")

        with patch("utils.bgg_client.httpx.get") as mock_get:
            mock_get.return_value = _make_response(200, BRASS_BIRMINGHAM_XML)

            t0 = time.monotonic()
            client.get_thing(1)
            client.get_thing(2)
            elapsed = time.monotonic() - t0

        assert elapsed >= 1.0, (
            f"Two consecutive requests took {elapsed:.2f}s — expected ≥ 1.0s (rate limit)"
        )

    def test_first_request_not_throttled(self):
        client = BggClient(token="test-token")

        with patch("utils.bgg_client.httpx.get") as mock_get:
            mock_get.return_value = _make_response(200, BRASS_BIRMINGHAM_XML)

            t0 = time.monotonic()
            client.get_thing(1)
            elapsed = time.monotonic() - t0

        assert elapsed < 1.0, "First request should not sleep"


class TestBggRateLimitError:
    def test_is_exception(self):
        err = BggRateLimitError("HTTP 429")
        assert isinstance(err, Exception)
        assert "429" in str(err)
