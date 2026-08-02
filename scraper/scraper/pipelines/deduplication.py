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

# The /test tier is the public demo (canned data, periodically wiped); /v1 is the
# real production dataset and needs its own key. A demo key 403s on /v1. The base
# is chosen at runtime from key presence (see open_spider) so a real key never gets
# sent to /test. See docs/research/gameupc-api-registration.md.
GAMEUPC_BASE_TEST = "https://api.gameupc.com/test/upc"
GAMEUPC_BASE_PROD = "https://api.gameupc.com/v1/upc"
BGG_SEARCH_URL = "https://boardgamegeek.com/xmlapi2/search"
FUZZY_THRESHOLD = 85

# Stable, non-secret identifier for this app (not per-request) — GameUPC's spec
# describes it as "should be persistent on the device/consumer using it."
GAMEUPC_VOTER_ID = "agregator-planszowek-pl"

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


def _name_match_score(scraped: str, candidate: str) -> int:
    """Score a GameUPC candidate title against the scraped product name.

    Uses ``token_sort_ratio`` rather than ``WRatio``: WRatio awards partial-ratio
    credit when the two strings differ in length, so an expansion ("Catan: Miasta i
    Rycerze") scores ~90 against its base game ("Catan") and would be wrongly accepted
    — exactly the cross-contamination this guard exists to prevent. token_sort_ratio
    gives no substring credit. Candidates shorter than 8 normalised chars are treated
    as no-match: a 4-char canned name like "Gier" is too easily reached by unrelated
    titles, and any genuinely short-named game is still recoverable via _try_name_path.
    """
    a, b = _normalise_name(scraped), _normalise_name(candidate)
    if len(a) < 8 or len(b) < 8:
        return 0
    return int(fuzz.token_sort_ratio(a, b))


class DeduplicationPipeline:
    _http: httpx.Client | None = None
    _pool: psycopg2.pool.ThreadedConnectionPool | None = None

    def open_spider(self, spider) -> None:
        load_dotenv()
        self._gameupc_key = os.getenv("GAMEUPC_API_KEY")
        # A real key targets the /v1 production dataset; the EAN path is disabled
        # entirely without one, so the /test base is never actually reached in that case.
        self._gameupc_base = GAMEUPC_BASE_PROD if self._gameupc_key else GAMEUPC_BASE_TEST
        if not self._gameupc_key:
            logger.warning(
                "GAMEUPC_API_KEY not set — EAN match path disabled (the public demo "
                "key returns canned example data for any input EAN and will silently "
                "cross-contaminate unrelated products, not just rate-limit); falling "
                "back to BGG name-fuzzy-match only"
            )
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
            bgg_id = self._try_ean_path(ean, item.get("name", ""))

        if bgg_id is None:
            bgg_id = self._try_name_path(item.get("name", ""))
            if bgg_id is not None and ean:
                self._vote_back(ean, bgg_id)

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

    def _try_ean_path(self, ean: str, name: str) -> int | None:
        if not self._gameupc_key:
            return None
        if not re.fullmatch(r"\d{8,14}", ean):
            logger.warning("Skipping invalid EAN format: %r", ean)
            return None
        url = f"{self._gameupc_base}/{ean}"
        try:
            response = self._http.get(url, headers={"x-api-key": self._gameupc_key})
            if response.status_code == 404:
                return None
            response.raise_for_status()
            data = response.json()
            bgg_info = data.get("bgg_info") or []
            if not bgg_info:
                return None

            # GameUPC returns bgg_info as a candidate list (status
            # "choose_from_bgg_info_or_search" on all real matches in the 1.6 spike),
            # so evaluate every candidate and keep the best name match — mirroring
            # _try_name_path — rather than trusting bgg_info[0] blindly.
            best_score = 0
            best_bgg_id: int | None = None
            best_name = ""
            for candidate in bgg_info:
                raw_id = candidate.get("id")
                if not raw_id:
                    continue
                candidate_name = candidate.get("name", "")
                score = _name_match_score(name, candidate_name)
                if score > best_score:
                    best_score = score
                    best_bgg_id = int(raw_id)
                    best_name = candidate_name

            if best_bgg_id is None:
                logger.warning("GameUPC bgg_info had no usable 'id' for EAN %s", ean)
                return None
            # TODO(korpus BGG): a Polish store title vs an English BGG name is a weak
            # comparison — token_sort_ratio here only blocks obvious wrong-merges
            # (e.g. an expansion onto its base game). Real PL<->EN matching belongs in
            # the planned BGG-corpus story (match on BGG alternate names + expansion
            # type/links), not string similarity. See docs/spike-results/.
            if best_score < FUZZY_THRESHOLD:
                logger.debug(
                    "GameUPC candidate rejected for EAN %s: scraped=%r best_candidate=%r "
                    "bgg_id=%s score=%d (< %d)",
                    ean, name, best_name, best_bgg_id, best_score, FUZZY_THRESHOLD,
                )
                return None
            logger.debug(
                "EAN %s → bgg_id=%d via GameUPC (score=%d)", ean, best_bgg_id, best_score
            )
            if data.get("bgg_info_status") != "verified":
                self._vote_back(ean, best_bgg_id)
            return best_bgg_id
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
            score = _name_match_score(name, name_el.get("value", ""))
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

    def _vote_back(self, ean: str, bgg_id: int) -> None:
        """Report a resolved bgg_id back to GameUPC's crowdsourced dataset.

        Best-effort and non-blocking by design: this spends the same shared,
        undocumented rate-limit budget as the lookup calls, so failures (400,
        429, timeouts) are logged and swallowed, never retried, never allowed
        to affect the item's own bgg_id/game_id resolution.
        """
        if not self._gameupc_key:
            return
        if not re.fullmatch(r"\d{8,14}", ean):
            logger.warning("Skipping vote-back for invalid EAN format: %r", ean)
            return
        url = f"{self._gameupc_base}/{ean}/bgg_id/{bgg_id}"
        try:
            response = self._http.post(
                url,
                json={"user_id": GAMEUPC_VOTER_ID},
                headers={"x-api-key": self._gameupc_key},
            )
            response.raise_for_status()
        except Exception as exc:
            logger.warning(
                "GameUPC vote-back failed for EAN %s -> bgg_id=%d: %s", ean, bgg_id, exc
            )

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
