import logging
import os
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import httpx
import psycopg2
import psycopg2.pool
from dotenv import load_dotenv
from pydantic import ValidationError
from rapidfuzz import fuzz

from scraper.items import UpcomingGame

logger = logging.getLogger(__name__)

BGG_SEARCH_URL = "https://boardgamegeek.com/xmlapi2/search"
# Same threshold as DeduplicationPipeline — kept identical so name-match confidence
# is consistent between the two pipelines rather than an independently-tuned value.
FUZZY_THRESHOLD = 85
# Scrapy's AUTOTHROTTLE_ENABLED (see upcoming.yml) only paces the spider's own HTTP
# requests to the store pages — it has no effect on this synchronous side-channel
# call to BGG's API. A fixed delay keeps a full run's worth of BGG lookups (~475
# items at Story 8.1's spike-time page counts) well under the workflow's 60-minute
# timeout even under BGG-side slowness, and avoids hammering a third-party API.
BGG_REQUEST_DELAY_SECONDS = 0.5

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
    """Strip edition suffixes and transliterate Polish diacritics for fuzzy matching.

    Duplicated from DeduplicationPipeline rather than imported — see this story's Dev
    Notes "game_id resolution — reusing existing precedent, not new design": that
    pipeline is stateful and tied to its own open_spider/EAN/GameUPC lifecycle, which
    this pipeline doesn't need. The matching *behavior* (thresholds, normalisation)
    is kept identical, not the class.
    """
    result = name.lower()
    for pattern in _EDITION_PATTERNS:
        result = re.sub(pattern, "", result, flags=re.IGNORECASE)
    result = result.translate(_TRANSLITERATION)
    return result.strip()


def _name_match_score(scraped: str, candidate: str) -> int:
    a, b = _normalise_name(scraped), _normalise_name(candidate)
    if len(a) < 8 or len(b) < 8:
        return 0
    return int(fuzz.token_sort_ratio(a, b))


class UpcomingPipeline:
    pool: psycopg2.pool.ThreadedConnectionPool | None = None
    _http: httpx.Client | None = None

    def open_spider(self, spider) -> None:
        load_dotenv()
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL env var is not set")
        self.pool = psycopg2.pool.ThreadedConnectionPool(minconn=1, maxconn=3, dsn=database_url)

        self._bgg_token = os.getenv("BGG_API_TOKEN")
        if not self._bgg_token:
            logger.warning(
                "BGG_API_TOKEN not set — game_id resolution disabled for upcoming "
                "games; rows will be inserted with game_id=NULL"
            )
        self._http = httpx.Client(timeout=10.0)

    def process_item(self, item, spider):
        name = item.get("name") or ""
        if not name:
            logger.warning(
                "Skipping upcoming-game item with missing/blank name (JSON-LD "
                "extraction likely failed) — url=%s",
                item.get("pre_order_url"),
            )
            return item

        pydantic_fields = {k: v for k, v in item.items() if k in UpcomingGame.model_fields}
        try:
            UpcomingGame(**pydantic_fields)
        except ValidationError as exc:
            logger.error(
                "Pydantic validation failed for upcoming-game item %s: %s",
                item.get("pre_order_url"),
                exc,
            )
            return item

        try:
            game_id = self._resolve_game_id(name)
            self._upsert_upcoming_game(item, game_id)
            self._maybe_mark_available(item.get("store_id"), name)
        except Exception as exc:
            logger.error(
                "UpcomingPipeline failed for item %s from %s: %s",
                item.get("pre_order_url"),
                spider.name,
                exc,
                exc_info=True,
            )
        return item

    def close_spider(self, spider) -> None:
        try:
            self._reconcile_available(getattr(spider, "store_id", None))
        finally:
            try:
                if self._http:
                    self._http.close()
            finally:
                if self.pool:
                    self.pool.closeall()

    # -------------------------------------------------------------------------
    # Private helpers
    # -------------------------------------------------------------------------

    def _resolve_game_id(self, name: str) -> int | None:
        """Match an existing `games` row by name, or create one on a confident BGG
        match — mirrors DeduplicationPipeline._try_name_path + _upsert_game exactly
        (same endpoint, same FUZZY_THRESHOLD), since pre-release games are unlikely
        to already exist locally (see Dev Notes)."""
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
        finally:
            time.sleep(BGG_REQUEST_DELAY_SECONDS)

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
            score = _name_match_score(name, name_el.get("value", ""))
            if score > best_score:
                best_score = score
                best_bgg_id = int(raw_id)

        if best_score < FUZZY_THRESHOLD or best_bgg_id is None:
            logger.debug("No confident BGG match for upcoming game %r (best score=%d)", name, best_score)
            return None

        return self._upsert_game(best_bgg_id, name)

    def _upsert_game(self, bgg_id: int, product_name: str) -> int:
        slug = f"bgg-{bgg_id}"
        conn = self.pool.getconn()
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
            self.pool.putconn(conn)
        return game_id

    def _upsert_upcoming_game(self, item: dict, game_id: int | None) -> None:
        conn = self.pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO upcoming_games
                           (store_id, game_id, name, expected_release_date,
                            expected_release_date_text, cover_image_url,
                            pre_order_url, pre_order_price, updated_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
                       ON CONFLICT (store_id, name)
                       DO UPDATE SET
                           game_id = COALESCE(EXCLUDED.game_id, upcoming_games.game_id),
                           expected_release_date = EXCLUDED.expected_release_date,
                           expected_release_date_text = EXCLUDED.expected_release_date_text,
                           cover_image_url = EXCLUDED.cover_image_url,
                           pre_order_url = EXCLUDED.pre_order_url,
                           pre_order_price = EXCLUDED.pre_order_price,
                           updated_at = now()""",
                    (
                        item.get("store_id"),
                        game_id,
                        item.get("name"),
                        item.get("expected_release_date"),
                        item.get("expected_release_date_text"),
                        item.get("cover_image_url"),
                        item.get("pre_order_url"),
                        item.get("pre_order_price"),
                    ),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            self.pool.putconn(conn)

    @staticmethod
    def _in_stock_product_names(cur, store_id: int) -> set[str]:
        cur.execute(
            "SELECT name FROM products WHERE store_id = %s AND in_stock = true",
            (store_id,),
        )
        return {_normalise_name(row[0]) for row in cur.fetchall()}

    def _maybe_mark_available(self, store_id: int | None, name: str) -> None:
        """AC-4: if the daily scraper.yml spiders have already found this game for
        sale (a matching in-stock `products` row for the same store, compared via
        the same `_normalise_name` used for BGG matching — edition suffixes/diacritics
        must not block this the way raw string equality would), flip
        `upcoming_games.status` to 'available'. Idempotent: only fires while status
        is still 'upcoming', so available_since is never overwritten on re-runs.

        Only catches games this run's spider still yielded (see `_reconcile_available`
        in `close_spider` for games that already dropped off the store's listing)."""
        if not store_id or not name:
            return
        conn = self.pool.getconn()
        try:
            with conn.cursor() as cur:
                if _normalise_name(name) not in self._in_stock_product_names(cur, store_id):
                    return
                available_since = datetime.now(timezone.utc)
                cur.execute(
                    """UPDATE upcoming_games
                       SET status = 'available', available_since = %s
                       WHERE store_id = %s AND name = %s AND status = 'upcoming'""",
                    (available_since, store_id, name),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            self.pool.putconn(conn)

    def _reconcile_available(self, store_id: int | None) -> None:
        """AC-4 follow-up: a game that ships is expected to drop off the store's
        `/przedsprzedaz` preorder listing entirely, so `_maybe_mark_available` never
        runs again for it once that happens — it would never see the item and the
        row would stay 'upcoming' forever. Runs once per spider close: re-checks
        every still-'upcoming' row for this store against `products`, independent
        of what this run's spider yielded."""
        if not store_id or not self.pool:
            return
        conn = self.pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT name FROM upcoming_games WHERE store_id = %s AND status = 'upcoming'",
                    (store_id,),
                )
                upcoming_names = [row[0] for row in cur.fetchall()]
                if not upcoming_names:
                    return
                in_stock = self._in_stock_product_names(cur, store_id)
                available_since = datetime.now(timezone.utc)
                for name in upcoming_names:
                    if _normalise_name(name) in in_stock:
                        cur.execute(
                            """UPDATE upcoming_games
                               SET status = 'available', available_since = %s
                               WHERE store_id = %s AND name = %s AND status = 'upcoming'""",
                            (available_since, store_id, name),
                        )
            conn.commit()
        except Exception:
            conn.rollback()
            logger.error("Reconciliation pass failed for store_id=%s", store_id, exc_info=True)
        finally:
            self.pool.putconn(conn)
