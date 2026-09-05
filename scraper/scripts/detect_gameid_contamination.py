"""
Detection: find game_id clusters where attached products have low mutual name
similarity, indicating unrelated products were merged under one wrongly-shared
bgg_id/game_id. Story 2.2c — Dev B.

Full investigation: this story's Dev Agent Record
(_bmad-output/implementation-artifacts/2-2c-dedup-game-id-contamination-cleanup.md).

Heuristic: COUNT(DISTINCT products.name) >= MIN_DISTINCT_NAMES for the same
game_id — the same heuristic Story 7.1's spike used (reproduces its 208/4159
finding exactly against production data, verified during this story's
investigation).

AC-1's own caution (mirrored from Story 2.2b's Dev Notes) warned that
legitimately large multi-SKU game families would also trip a naive count
threshold. Verified empirically during this investigation: Warhammer: The Old
World (game_id=12, 35 real miniature-line SKUs) and Star Wars: Legion — Clone
Wars Core Set (game_id=714, 4 real expansion SKUs) both get flagged despite
being entirely legitimate. No *automated* name-similarity metric tried during
this investigation reliably separated genuine multi-SKU families from
contaminated clusters — both classes show equally low pairwise name-string
similarity (a Warhammer battalion name has nothing in common textually with
another Warhammer battalion name, same as two unrelated contaminated
products). This is the same caution that made 2.2b reject a blind
auto-detection sweep; it holds here too, just at a larger scale.

Consequence: this script is detection-only. It prints every candidate for
human review, with KNOWN_LEGITIMATE_CLUSTERS pre-excluded (verified during
this investigation — see Dev Agent Record for the verification method). The
cleanup script (cleanup_gameid_contamination.py) requires an explicit,
operator-confirmed --game-ids list — it does NOT consume this script's full
candidate list automatically, mirroring cleanup_gameupc_contamination.py's
curated-list precedent.

Run: cd scraper && python -m scripts.detect_gameid_contamination [--detail GAME_ID]
"""
import argparse
import logging
import os

import psycopg2
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Same threshold Story 7.1's spike used — reproduces its 208/4159 finding.
MIN_DISTINCT_NAMES = 4

# Manually verified during this story's investigation (2026-09-05): large,
# entirely legitimate multi-SKU product families that the count heuristic
# would otherwise flag. Add to this list only after manually inspecting every
# product name in the cluster (use --detail) — see this story's Dev Agent
# Record for the verification method used for these two.
KNOWN_LEGITIMATE_CLUSTERS = {
    12: "Warhammer: The Old World — 35 real miniature-line SKUs (Empire, High "
        "Elf, Dwarf, Bretonnia, Grand Cathay battalions/units)",
    714: "Star Wars: Legion — Clone Wars Core Set — 4 real Legion expansion SKUs",
}


def find_candidates(conn) -> list[tuple[int, int, int]]:
    """Returns (game_id, distinct_name_count, total_product_count) for every
    game_id whose attached products meet the contamination heuristic."""
    with conn.cursor() as cur:
        cur.execute(
            """SELECT p.game_id, COUNT(DISTINCT p.name), COUNT(*)
               FROM products p
               WHERE p.game_id IS NOT NULL
               GROUP BY p.game_id
               HAVING COUNT(DISTINCT p.name) >= %s
               ORDER BY COUNT(DISTINCT p.name) DESC""",
            (MIN_DISTINCT_NAMES,),
        )
        return cur.fetchall()


def log_candidates(conn, candidates: list[tuple[int, int, int]]) -> None:
    if not candidates:
        logger.info(
            "No game_id clusters meet the contamination heuristic (>= %d distinct names).",
            MIN_DISTINCT_NAMES,
        )
        return

    excluded = [c for c in candidates if c[0] in KNOWN_LEGITIMATE_CLUSTERS]
    remaining = [c for c in candidates if c[0] not in KNOWN_LEGITIMATE_CLUSTERS]

    logger.info(
        "%d game_id cluster(s) meet the >= %d distinct-name heuristic "
        "(%d pre-excluded as known-legitimate, %d require operator review):",
        len(candidates), MIN_DISTINCT_NAMES, len(excluded), len(remaining),
    )

    with conn.cursor() as cur:
        for game_id, distinct_names, total in remaining:
            cur.execute("SELECT name FROM games WHERE id = %s", (game_id,))
            row = cur.fetchone()
            game_name = row[0] if row else "<unknown>"
            logger.info(
                "  game_id=%d name=%r distinct_names=%d total_products=%d",
                game_id, game_name, distinct_names, total,
            )

    for game_id, distinct_names, total in excluded:
        logger.info(
            "  [excluded, known-legitimate] game_id=%d distinct_names=%d total_products=%d — %s",
            game_id, distinct_names, total, KNOWN_LEGITIMATE_CLUSTERS[game_id],
        )

    logger.info(
        "Detection only — no rows changed. Use --detail GAME_ID to inspect a "
        "candidate's product names, then pass the confirmed game_id list to "
        "cleanup_gameid_contamination.py --game-ids ..."
    )


def log_candidate_products(conn, game_id: int) -> None:
    """Print every product name in a candidate cluster for manual review."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT p.id, p.name, s.slug FROM products p "
            "JOIN stores s ON s.id = p.store_id "
            "WHERE p.game_id = %s ORDER BY p.name",
            (game_id,),
        )
        rows = cur.fetchall()
        if not rows:
            logger.info("No products found for game_id=%d", game_id)
            return
        for product_id, name, slug in rows:
            logger.info("    product id=%d store=%s name=%r", product_id, slug, name)


def _log_target(conn) -> None:
    params = conn.get_dsn_parameters()
    logger.info("Connected to host=%s dbname=%s", params.get("host"), params.get("dbname"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--detail", type=int, metavar="GAME_ID",
        help="Print every product name for one candidate game_id (for manual review)",
    )
    args = parser.parse_args()

    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL env var is not set")

    conn = psycopg2.connect(database_url)
    try:
        _log_target(conn)

        if args.detail is not None:
            log_candidate_products(conn, args.detail)
            return

        candidates = find_candidates(conn)
        log_candidates(conn, candidates)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
