import logging
import time
import xml.etree.ElementTree as ET
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

BGG_API_BASE = "https://boardgamegeek.com/xmlapi2"

_RETRY_DELAYS = [60, 120, 240]


class BggRateLimitError(Exception):
    """Raised on HTTP 429 or 202 — caller should retry with backoff."""


class BggClient:
    def __init__(self, token: str) -> None:
        self._token = token
        self._last_request_at: float = 0.0

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < 1.0:
            time.sleep(1.0 - elapsed)
        self._last_request_at = time.monotonic()

    def get_thing(self, bgg_id: int) -> Optional[dict]:
        """
        Fetch BGG metadata for one game.
        Returns a dict of FR-7 fields, None on 404.
        Raises BggRateLimitError on 429 or 202.
        """
        self._throttle()
        url = f"{BGG_API_BASE}/thing"
        headers = {"Authorization": f"Bearer {self._token}"}
        params = {"id": bgg_id, "stats": 1}

        logger.info("BGG API request: thing?id=%d", bgg_id)
        response = httpx.get(url, headers=headers, params=params, timeout=15)

        if response.status_code == 404:
            logger.warning("BGG ID %d not found (404)", bgg_id)
            return None

        if response.status_code in (429, 202):
            logger.warning(
                "BGG rate limit / queue response %d for ID %d",
                response.status_code,
                bgg_id,
            )
            raise BggRateLimitError(f"HTTP {response.status_code}")

        response.raise_for_status()

        result = self._parse_thing(response.text, bgg_id)
        logger.info("BGG ID %d parsed: name=%r", bgg_id, result.get("name"))
        return result

    def get_thing_with_retry(self, bgg_id: int, max_retries: int = 3) -> Optional[dict]:
        """Fetch BGG metadata with exponential backoff (60/120/240s); raises BggRateLimitError after max_retries."""
        for attempt in range(max_retries + 1):
            try:
                return self.get_thing(bgg_id)
            except BggRateLimitError:
                if attempt >= max_retries:
                    logger.error(
                        "BGG ID %d: exhausted %d retries, giving up",
                        bgg_id,
                        max_retries,
                    )
                    raise
                delay = _RETRY_DELAYS[min(attempt, len(_RETRY_DELAYS) - 1)]
                logger.warning(
                    "BGG retry %d/%d for ID %d after %ds",
                    attempt + 1,
                    max_retries,
                    bgg_id,
                    delay,
                )
                time.sleep(delay)
        return None  # unreachable; satisfies type checker

    def _parse_thing(self, xml_text: str, bgg_id: int) -> dict:
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError as exc:
            logger.error("XML parse error for BGG ID %d: %s", bgg_id, exc, exc_info=True)
            return {"name": "Nieznana gra"}

        item = root.find("item")
        if item is None:
            logger.error("BGG response for ID %d has no <item>", bgg_id)
            return {"name": "Nieznana gra"}

        def get_attr(xpath: str, attr: str = "value") -> Optional[str]:
            el = item.find(xpath)
            return el.get(attr) if el is not None else None

        def get_list(xpath: str, attr: str = "value") -> list:
            return [el.get(attr) for el in item.findall(xpath) if el.get(attr)]

        name_el = item.find("name[@type='primary']")
        name = name_el.get("value") if name_el is not None else "Nieznana gra"

        raw_rank = get_attr("statistics/ratings/ranks/rank[@type='subtype']")
        bgg_rank = None if (raw_rank is None or raw_rank == "Not Ranked") else raw_rank

        family_rank_el = item.find("statistics/ratings/ranks/rank[@type='family']")
        if family_rank_el is not None:
            rank_val = family_rank_el.get("value")
            try:
                rank_int = int(rank_val) if (rank_val and rank_val != "Not Ranked") else None
            except (ValueError, TypeError):
                rank_int = None
            bgg_category_rank: Optional[dict] = {
                "category": family_rank_el.get("friendlyname") or family_rank_el.get("name"),
                "rank": rank_int,
            }
        else:
            bgg_category_rank = None

        return {
            "name": name,
            "min_players": get_attr("minplayers"),
            "max_players": get_attr("maxplayers"),
            "min_playtime": get_attr("minplaytime"),
            "max_playtime": get_attr("maxplaytime"),
            "min_age": get_attr("minage"),
            "year_published": get_attr("yearpublished"),
            "cover_image_url": (item.findtext("image") or "").strip() or None,
            "bgg_rank": bgg_rank,
            "bgg_avg_rating": get_attr("statistics/ratings/average"),
            "complexity": get_attr("statistics/ratings/averageweight"),
            "is_expansion": item.get("type") == "boardgameexpansion",
            "bgg_category_rank": bgg_category_rank,
            "mechanics": get_list("link[@type='boardgamemechanic']"),
            "designers": get_list("link[@type='boardgamedesigner']"),
            "publishers": get_list("link[@type='boardgamepublisher']"),
        }
