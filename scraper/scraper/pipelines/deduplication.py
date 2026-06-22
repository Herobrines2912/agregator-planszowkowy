import logging
import os
import re
import xml.etree.ElementTree as ET

import httpx
import psycopg2
import psycopg2.pool
from dotenv import load_dotenv
from rapidfuzz import fuzz

logger = logging.getLogger(__name__)

GAMEUPC_BASE = "https://api.gameupc.com/test/upc"
BGG_SEARCH_URL = "https://boardgamegeek.com/xmlapi2/search"
FUZZY_THRESHOLD = 85

_GAMEUPC_DEMO_KEY = "test_test_test_test_test"

_EDITION_PATTERNS = [
    r"\s*\(edycja polska\)",
    r"\s*\(polish edition\)",
    r"\s*edycja rozszerzona",
    r"\s*\bdeluxe\b",
    r"\s*\bbase game\b",
    r"\s*\bpodstawowa\b",
    r"\s*—\s*.+$",
]

_TRANSLITERATION = str.maketrans("ąęóśłźżćń", "aeoslzzcn")


def _normalise_name(name: str) -> str:
    """Strip edition suffixes and transliterate Polish diacritics for fuzzy matching."""
    result = name.lower()
    for pattern in _EDITION_PATTERNS:
        result = re.sub(pattern, "", result, flags=re.IGNORECASE)
    result = result.translate(_TRANSLITERATION)
    return result.strip()


class DeduplicationPipeline:
    _http: httpx.Client | None = None
    _pool: psycopg2.pool.ThreadedConnectionPool | None = None

    def open_spider(self, spider) -> None:
        load_dotenv()
        self._gameupc_key = os.getenv("GAMEUPC_API_KEY", _GAMEUPC_DEMO_KEY)
        if self._gameupc_key == _GAMEUPC_DEMO_KEY:
            logger.warning("GAMEUPC_API_KEY not set — using rate-limited sandbox key")
        self._bgg_token = os.getenv("BGG_API_TOKEN")
        if not self._bgg_token:
            logger.warning(
                "BGG_API_TOKEN not set — name fuzzy match path disabled; "
                "items without EAN match will be queued (bgg_id=NULL)"
            )

        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL env var is not set")
        self._pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=1, maxconn=3, dsn=database_url
        )
        self._http = httpx.Client(timeout=10.0)

    def process_item(self, item, spider):
        ean = item.get("ean")
        bgg_id: int | None = None

        if ean:
            bgg_id = self._try_ean_path(ean)

        if bgg_id is None:
            bgg_id = self._try_name_path(item.get("name", ""))

        if bgg_id is not None:
            item["bgg_id"] = bgg_id
            try:
                item["game_id"] = self._upsert_game(bgg_id, item.get("name", ""))
            except Exception as exc:
                logger.error(
                    "Failed to upsert game for bgg_id=%d item=%s: %s",
                    bgg_id,
                    item.get("url"),
                    exc,
                    exc_info=True,
                )
        else:
            logger.debug(
                "No BGG match for item %s (ean=%r) — queued for operator review",
                item.get("url"),
                ean,
            )

        return item

    def close_spider(self, spider) -> None:
        try:
            if self._http:
                self._http.close()
        finally:
            if self._pool:
                self._pool.closeall()

    # -------------------------------------------------------------------------
    # Private helpers
    # -------------------------------------------------------------------------

    def _try_ean_path(self, ean: str) -> int | None:
        if not re.fullmatch(r"\d{8,14}", ean):
            logger.warning("Skipping invalid EAN format: %r", ean)
            return None
        url = f"{GAMEUPC_BASE}/{ean}"
        try:
            response = self._http.get(url, headers={"x-api-key": self._gameupc_key})
            if response.status_code == 404:
                return None
            response.raise_for_status()
            data = response.json()
            bgg_info = data.get("bgg_info") or []
            if bgg_info:
                raw_id = bgg_info[0].get("id")
                if not raw_id:
                    logger.warning("GameUPC bgg_info missing 'id' for EAN %s", ean)
                    return None
                bgg_id = int(raw_id)
                logger.debug("EAN %s → bgg_id=%d via GameUPC", ean, bgg_id)
                return bgg_id
        except httpx.HTTPStatusError as exc:
            logger.warning("GameUPC HTTP %d for EAN %s", exc.response.status_code, ean)
        except Exception as exc:
            logger.warning("GameUPC error for EAN %s: %s", ean, exc)
        return None

    def _try_name_path(self, name: str) -> int | None:
        if not self._bgg_token or not name:
            return None

        normalised = _normalise_name(name)
        params = {"query": normalised, "type": "boardgame"}
        headers = {"Authorization": f"Bearer {self._bgg_token}"}

        try:
            response = self._http.get(BGG_SEARCH_URL, params=params, headers=headers)
            response.raise_for_status()
        except Exception as exc:
            logger.warning("BGG Search failed for %r: %s", name, exc)
            return None

        if len(response.content) > 2_000_000:
            logger.warning("BGG Search response too large for %r (%d bytes)", name, len(response.content))
            return None

        try:
            root = ET.fromstring(response.text)
        except ET.ParseError:
            logger.warning("BGG Search returned invalid XML for %r", name)
            return None

        best_score = 0
        best_bgg_id: int | None = None
        for item_el in root.findall("item"):
            name_el = item_el.find("name[@type='primary']")
            if name_el is None:
                continue
            raw_id = item_el.get("id")
            if raw_id is None:
                continue
            candidate = _normalise_name(name_el.get("value", ""))
            score = fuzz.WRatio(normalised, candidate)
            if score > best_score:
                best_score = score
                best_bgg_id = int(raw_id)

        if best_score >= FUZZY_THRESHOLD and best_bgg_id is not None:
            logger.debug(
                "BGG fuzzy match: %r → bgg_id=%d (score=%d)", name, best_bgg_id, best_score
            )
            return best_bgg_id

        logger.debug(
            "BGG fuzzy match: no confident match for %r (best score=%d)", name, best_score
        )
        return None

    def _upsert_game(self, bgg_id: int, product_name: str) -> int:
        slug = f"bgg-{bgg_id}"
        conn = None
        conn = self._pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO games (slug, name, bgg_id, bgg_sync_status)
                       VALUES (%s, %s, %s, 'pending')
                       ON CONFLICT (bgg_id) DO UPDATE SET updated_at = now()
                       RETURNING id""",
                    (slug, product_name, bgg_id),
                )
                game_id: int = cur.fetchone()[0]
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            if conn:
                self._pool.putconn(conn)
        return game_id
