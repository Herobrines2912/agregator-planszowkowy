"""
Spike: BGG alternate-names coverage test for Polish board games.
Story 2.7 — Dev B (Part 1 of the "BGG-corpus title matching" initiative).

Question: for our known-correct (Polish store title, BGG id) pairs, what fraction
have their Polish store title present as a BGG <name type="alternate"> entry?
Reuses the 22-item known-correct corpus from Story 1.6's gameUPC-coverage spike
(docs/spike-results/gameUPC-coverage.md).

Gate (see docs/spike-results/bgg-alternate-names-coverage.md once run):
  >= 80% coverage -> GO on Part 2 (BGG-corpus title matching, Story 2.9+)
  <  80% coverage -> NO-GO, needs a supplementary alias source

Run: cd scraper && uv run python -m scripts.spike_bgg_alternate_names
Requires: BGG_API_TOKEN env var (see scraper/.env.example)
"""
import logging
import os

from dotenv import load_dotenv
from rapidfuzz import fuzz

from scraper.pipelines.deduplication import FUZZY_THRESHOLD, _normalise_name
from utils.bgg_client import BggClient, BggRateLimitError

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# The 22 known-correct (Polish store title, BGG id) pairs from Story 1.6's spike
# (docs/spike-results/gameUPC-coverage.md) — EAN and bgg_info_status columns not
# needed here (Task 2.1). Store titles kept verbatim (publisher suffix included)
# since _normalise_name already strips that pattern, same as the live pipeline.
KNOWN_CORRECT_PAIRS = [
    ("Simsala Spin (Makoto edycja polska) — Egmont", 437106),
    ("Unmatched: Lee vs Ali — OgryGames", 428308),
    ("Pojedynek Miast", 281020),
    ("Marsz Mrówek — Bard", 416079),
    ("Wynalazcy znad Południowego Tygrysu — Portal", 350316),
    ("Kinfire Council — Elderwood Academy", 411894),
    ("Wiedźmin: Ścieżka Przeznaczenia - Ronin — Rebel", 401325),
    ("Coalitions (edycja polska) — Granna", 57660),
    ("Ptasie Rewiry — Nasza Księgarnia", 113656),
    ("Zeus — G3", 22864),
    ("Prapuszcza: Ostatnie starcie — Foxgames", 179719),
    ("Metal Gear Solid: Gra Planszowa — Portal", 266529),
    ("Drużyna do Zadań Specjalnych — Portal", 462993),
    ("Nemesis: Odwet — Awaken Realms", 381248),
    ("Brass: Lancashire Deluxe (edycja polska) — Maldito", 28720),
    ("Clans of Caledonia — Karma Games", 216132),
    ("Pola Arle — Lacerta", 159675),
    ("World Order: Edycja Rozszerzona — Portal", 403150),
    ("Mrówki — Portal", 212288),
    ("Odkrywcy Navorii — Bard", 371932),
    ("West Story: A Town Building Game (edycja polska) — Rebel", 401009),
    ("Kilia — Floodgate Games", 437099),
]


def best_alternate_match(store_title: str, alternate_names: list[str]) -> tuple[str | None, int]:
    """Return (best-matching alternate name, score) — PL-normalized on both sides,
    same normalization the live pipeline applies (Dev Notes: "measure what Part 2
    would actually see"). (None, 0) when there are no alternate names to compare."""
    normalised_title = _normalise_name(store_title)
    best_name: str | None = None
    best_score = 0
    for alt in alternate_names:
        score = int(fuzz.token_sort_ratio(normalised_title, _normalise_name(alt)))
        if score > best_score:
            best_score = score
            best_name = alt
    return best_name, best_score


def run_spike() -> list[dict]:
    """Fetch each known-correct pair's BGG thing record and score its alternate
    names against the store title. Returns one result dict per pair."""
    load_dotenv()
    token = os.environ.get("BGG_API_TOKEN")
    if not token:
        raise RuntimeError("BGG_API_TOKEN env var not set — cannot run spike")

    client = BggClient(token=token)
    results = []

    for store_title, bgg_id in KNOWN_CORRECT_PAIRS:
        logger.info("Fetching BGG id=%d for %r", bgg_id, store_title)
        try:
            data = client.get_thing_with_retry(bgg_id)
        except BggRateLimitError:
            logger.error("BGG id=%d: rate-limited after retries — skipping", bgg_id)
            results.append({
                "store_title": store_title,
                "bgg_id": bgg_id,
                "primary_name": None,
                "publishers": [],
                "matched_alternate": None,
                "score": 0,
                "matched": False,
                "error": "rate_limited",
            })
            continue

        if data is None:
            logger.warning("BGG id=%d not found (404) for %r", bgg_id, store_title)
            results.append({
                "store_title": store_title,
                "bgg_id": bgg_id,
                "primary_name": None,
                "publishers": [],
                "matched_alternate": None,
                "score": 0,
                "matched": False,
                "error": "not_found",
            })
            continue

        alternate_names = data.get("alternate_names") or []
        best_name, best_score = best_alternate_match(store_title, alternate_names)
        matched = best_score >= FUZZY_THRESHOLD

        logger.info(
            "  -> best alternate=%r score=%d matched=%s", best_name, best_score, matched
        )

        results.append({
            "store_title": store_title,
            "bgg_id": bgg_id,
            "primary_name": data.get("name"),
            "publishers": data.get("publishers") or [],
            "matched_alternate": best_name,
            "score": best_score,
            "matched": matched,
            "error": None,
        })

    return results


def summarize(results: list[dict]) -> None:
    total = len(results)
    matched = [r for r in results if r["matched"]]
    coverage = len(matched) / total * 100 if total else 0

    logger.info("=" * 60)
    logger.info("RESULTS: %d/%d matched (%.0f%%)", len(matched), total, coverage)
    logger.info("Gate: %s", "GO (>=80%%)" if coverage >= 80 else "NO-GO (<80%%)")

    misses = [r for r in results if not r["matched"]]
    if misses:
        logger.info("\nMisses:")
        for r in misses:
            logger.info(
                "  %r | bgg_id=%s | primary=%r | best_score=%d | publishers=%s",
                r["store_title"], r["bgg_id"], r["primary_name"], r["score"], r["publishers"],
            )


def main() -> None:
    results = run_spike()
    summarize(results)


if __name__ == "__main__":
    main()
