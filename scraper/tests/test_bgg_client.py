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


# ---------------------------------------------------------------------------
# Tests for get_thing_with_retry() — Task 1 (Story 2.4)
# ---------------------------------------------------------------------------

class TestGetThingWithRetry:
    def setup_method(self):
        self.client = BggClient(token="test-token")

    @patch("utils.bgg_client.httpx.get")
    @patch("utils.bgg_client.time.sleep")
    def test_retry_on_429_then_success(self, mock_sleep, mock_get):
        """First call raises BggRateLimitError (429), second succeeds."""
        rate_limit_resp = _make_response(429)
        success_resp = _make_response(200, BRASS_BIRMINGHAM_XML)
        mock_get.side_effect = [rate_limit_resp, success_resp]

        result = self.client.get_thing_with_retry(224517)

        assert result is not None
        assert result["name"] == "Brass: Birmingham"
        assert mock_get.call_count == 2
        # 60s retry delay must be among the sleep calls (throttle may also sleep)
        sleep_args = [c[0][0] for c in mock_sleep.call_args_list]
        assert 60 in sleep_args

    @patch("utils.bgg_client.httpx.get")
    @patch("utils.bgg_client.time.sleep")
    def test_retry_exhausted_raises_bgg_rate_limit_error(self, mock_sleep, mock_get):
        """Three 429s exhaust retries — raises BggRateLimitError."""
        mock_get.return_value = _make_response(429)

        with pytest.raises(BggRateLimitError):
            self.client.get_thing_with_retry(224517, max_retries=3)

        # Retry delays must appear in order: 60, 120, 240
        sleep_args = [c[0][0] for c in mock_sleep.call_args_list]
        retry_delays = [x for x in sleep_args if x in (60, 120, 240)]
        assert retry_delays == [60, 120, 240]

    @patch("utils.bgg_client.httpx.get")
    @patch("utils.bgg_client.time.sleep")
    def test_retry_delay_sequence(self, mock_sleep, mock_get):
        """Delays appear in ascending order: 60 → 120 → 240."""
        mock_get.return_value = _make_response(429)

        with pytest.raises(BggRateLimitError):
            self.client.get_thing_with_retry(1, max_retries=3)

        sleep_args = [c[0][0] for c in mock_sleep.call_args_list]
        retry_delays = [x for x in sleep_args if x in (60, 120, 240)]
        assert retry_delays == [60, 120, 240]

    @patch("utils.bgg_client.httpx.get")
    @patch("utils.bgg_client.time.sleep")
    def test_no_retry_on_404(self, mock_sleep, mock_get):
        """404 returns None immediately — no retries."""
        mock_get.return_value = _make_response(404)

        result = self.client.get_thing_with_retry(999999)

        assert result is None
        assert mock_get.call_count == 1
        # No retry delays (60/120/240) — throttle may have slept < 1s
        sleep_args = [c[0][0] for c in mock_sleep.call_args_list]
        assert 60 not in sleep_args
        assert 120 not in sleep_args

    @patch("utils.bgg_client.httpx.get")
    @patch("utils.bgg_client.time.sleep")
    def test_no_retry_on_success(self, mock_sleep, mock_get):
        """Successful first call — no retries."""
        mock_get.return_value = _make_response(200, BRASS_BIRMINGHAM_XML)

        result = self.client.get_thing_with_retry(224517)

        assert result is not None
        assert mock_get.call_count == 1
        sleep_args = [c[0][0] for c in mock_sleep.call_args_list]
        assert 60 not in sleep_args

    @patch("utils.bgg_client.httpx.get")
    @patch("utils.bgg_client.time.sleep")
    def test_202_treated_as_rate_limit(self, mock_sleep, mock_get):
        """HTTP 202 (BGG queue) is retried like 429."""
        queue_resp = _make_response(202)
        success_resp = _make_response(200, BRASS_BIRMINGHAM_XML)
        mock_get.side_effect = [queue_resp, success_resp]

        result = self.client.get_thing_with_retry(224517)

        assert result is not None
        assert mock_get.call_count == 2
        sleep_args = [c[0][0] for c in mock_sleep.call_args_list]
        assert 60 in sleep_args


# ---------------------------------------------------------------------------
# Tests for extended _parse_thing() — is_expansion, complexity, bgg_category_rank
# ---------------------------------------------------------------------------

EXPANSION_XML = """<?xml version="1.0" encoding="utf-8"?>
<items>
  <item type="boardgameexpansion" id="161936">
    <name type="primary" value="Arkham Horror: The Card Game" />
    <minplayers value="1" />
    <maxplayers value="2" />
    <statistics page="1">
      <ratings>
        <average value="8.21" />
        <averageweight value="3.12" />
        <ranks>
          <rank type="subtype" id="1" name="boardgame" value="Not Ranked" />
          <rank type="family" id="5496" name="thematic" friendlyname="Thematic Rank" value="15" />
        </ranks>
      </ratings>
    </statistics>
  </item>
</items>"""

BASE_GAME_WITH_CATEGORY_RANK_XML = """<?xml version="1.0" encoding="utf-8"?>
<items>
  <item type="boardgame" id="174430">
    <name type="primary" value="Gloomhaven" />
    <statistics page="1">
      <ratings>
        <averageweight value="3.87" />
        <ranks>
          <rank type="subtype" id="1" name="boardgame" value="1" />
          <rank type="family" id="5496" name="thematic" friendlyname="Thematic Rank" value="1" />
        </ranks>
      </ratings>
    </statistics>
  </item>
</items>"""

NO_CATEGORY_RANK_XML = """<?xml version="1.0" encoding="utf-8"?>
<items>
  <item type="boardgame" id="1">
    <name type="primary" value="Simple Game" />
    <statistics page="1">
      <ratings>
        <ranks>
          <rank type="subtype" id="1" name="boardgame" value="5000" />
        </ranks>
      </ratings>
    </statistics>
  </item>
</items>"""

# Expansion item pointing to its base game via an inbound="true" boardgameexpansion link
EXPANSION_WITH_BASE_GAME_LINK_XML = """<?xml version="1.0" encoding="utf-8"?>
<items>
  <item type="boardgameexpansion" id="161936">
    <name type="primary" value="Arkham Horror: The Card Game - Dunwich Legacy" />
    <link type="boardgameexpansion" id="205637" value="Arkham Horror: The Card Game" inbound="true" />
  </item>
</items>"""

# Base game item listing its expansions — no links are inbound="true"
BASE_GAME_WITH_NON_INBOUND_EXPANSION_LINKS_XML = """<?xml version="1.0" encoding="utf-8"?>
<items>
  <item type="boardgame" id="205637">
    <name type="primary" value="Arkham Horror: The Card Game" />
    <link type="boardgameexpansion" id="161936" value="Dunwich Legacy" />
    <link type="boardgameexpansion" id="161937" value="Carcosa" />
  </item>
</items>"""

# Expansion item with two inbound="true" boardgameexpansion links — first one (document order) must win
EXPANSION_WITH_MULTIPLE_BASE_GAME_LINKS_XML = """<?xml version="1.0" encoding="utf-8"?>
<items>
  <item type="boardgameexpansion" id="999001">
    <name type="primary" value="Weird Crossover Expansion" />
    <link type="boardgameexpansion" id="205637" value="Arkham Horror: The Card Game" inbound="true" />
    <link type="boardgameexpansion" id="174430" value="Gloomhaven" inbound="true" />
  </item>
</items>"""

# Expansion item whose first inbound="true" link has a non-numeric id — must be skipped, next valid one used
EXPANSION_WITH_MALFORMED_BASE_GAME_LINK_ID_XML = """<?xml version="1.0" encoding="utf-8"?>
<items>
  <item type="boardgameexpansion" id="999002">
    <name type="primary" value="Malformed Link Expansion" />
    <link type="boardgameexpansion" id="not-a-number" value="Bad Link" inbound="true" />
    <link type="boardgameexpansion" id="205637" value="Arkham Horror: The Card Game" inbound="true" />
  </item>
</items>"""


class TestParseThing_Extended:
    def setup_method(self):
        self.client = BggClient(token="test-token")

    def test_is_expansion_true_for_boardgameexpansion(self):
        result = self.client._parse_thing(EXPANSION_XML, 161936)
        assert result["is_expansion"] is True

    def test_is_expansion_false_for_boardgame(self):
        result = self.client._parse_thing(BRASS_BIRMINGHAM_XML, 224517)
        assert result["is_expansion"] is False

    def test_bgg_rank_not_ranked_returns_none(self):
        result = self.client._parse_thing(EXPANSION_XML, 161936)
        assert result["bgg_rank"] is None

    def test_bgg_rank_integer_when_ranked(self):
        result = self.client._parse_thing(BASE_GAME_WITH_CATEGORY_RANK_XML, 174430)
        assert result["bgg_rank"] == "1"  # returned as string from XML; _safe_int in enrichment converts

    def test_complexity_parsed(self):
        result = self.client._parse_thing(EXPANSION_XML, 161936)
        assert result["complexity"] == "3.12"

    def test_complexity_absent_returns_none(self):
        result = self.client._parse_thing(BRASS_BIRMINGHAM_XML, 224517)
        # BRASS_BIRMINGHAM_XML has no averageweight — should return None
        assert result["complexity"] is None

    def test_bgg_category_rank_parsed(self):
        result = self.client._parse_thing(EXPANSION_XML, 161936)
        assert result["bgg_category_rank"] is not None
        assert result["bgg_category_rank"]["category"] == "Thematic Rank"
        assert result["bgg_category_rank"]["rank"] == 15

    def test_bgg_category_rank_absent_returns_none(self):
        result = self.client._parse_thing(NO_CATEGORY_RANK_XML, 1)
        assert result["bgg_category_rank"] is None


# ---------------------------------------------------------------------------
# Tests for base_game_bgg_id — Task 2 (Story 4.5b)
# ---------------------------------------------------------------------------

class TestParseThing_BaseGameBggId:
    def setup_method(self):
        self.client = BggClient(token="test-token")

    def test_expansion_with_inbound_link_sets_base_game_bgg_id(self):
        result = self.client._parse_thing(EXPANSION_WITH_BASE_GAME_LINK_XML, 161936)
        assert result["base_game_bgg_id"] == 205637

    def test_base_game_with_only_non_inbound_links_returns_none(self):
        result = self.client._parse_thing(BASE_GAME_WITH_NON_INBOUND_EXPANSION_LINKS_XML, 205637)
        assert result["base_game_bgg_id"] is None

    def test_multiple_inbound_links_first_one_wins(self):
        result = self.client._parse_thing(EXPANSION_WITH_MULTIPLE_BASE_GAME_LINKS_XML, 999001)
        assert result["base_game_bgg_id"] == 205637

    def test_malformed_link_id_skipped_next_valid_link_used(self):
        result = self.client._parse_thing(EXPANSION_WITH_MALFORMED_BASE_GAME_LINK_ID_XML, 999002)
        assert result["base_game_bgg_id"] == 205637

    def test_item_with_no_boardgameexpansion_links_returns_none(self):
        result = self.client._parse_thing(BRASS_BIRMINGHAM_XML, 224517)
        assert result["base_game_bgg_id"] is None
