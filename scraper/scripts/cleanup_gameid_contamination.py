"""
Cleanup: reset products cross-contaminated under a wrongly-shared game_id.
Story 2.2c — Dev B.

Full investigation: this story's Dev Agent Record
(_bmad-output/implementation-artifacts/2-2c-dedup-game-id-contamination-cleanup.md).

Root cause (confirmed during this story's investigation): the same GameUPC
demo-key + no-name-validation issue Story 2.2b fixed, showing up at a larger
scale — 208 of 4159 game_id clusters (per detect_gameid_contamination.py) have
attached products with wildly different names sharing one wrongly-assigned
bgg_id/game_id. Every manually-sampled cluster traces to products created
BEFORE 2.2b shipped (2026-07-21/23) — 206 of 208 candidate clusters have every
member product's created_at before that date, and the 2 exceptions were
manually verified to be legitimate same-family products added later, not new
contamination. The current pipeline (post-2.2b) is not producing new
contamination — no further pipeline fix (Task 4) is needed; this is fully
explained as residual pre-2.2b data.

Unlike 2.2b's 2 confirmed clusters, this story's 208 candidates are too many
to hardcode after full one-by-one manual verification within this story's
scope. This script does NOT auto-consume the full detection list — it
requires an explicit, operator-confirmed --game-ids list (see
detect_gameid_contamination.py to generate candidates, which already
pre-excludes two verified known-legitimate clusters).

Scope: resets ALL products under a confirmed game_id — including any product
that happens to already be correctly matched in that cluster — since AC-3
explicitly designs for "eligible for correct re-matching on the next scrape,"
not surgical per-row correction. A correctly-matched product simply
re-resolves to the same game_id (or a new one) on its next scrape; no data is
lost.

Safety (all only relevant to --execute):
  * Dry run by default: logs affected rows, zero DB writes.
  * In-flight-scrape guard: refuses to run while a scrape_runs row is
    unfinished, so a concurrent scrape can't re-poison the reset rows
    (override with --force).
  * Pre-state is written to a timestamped CSV backup before the UPDATE, and
    the run is recorded in data_retention_log — the reset is otherwise
    irreversible.
  * The UPDATE is rolled back if its rowcount diverges from the audited
    SELECT.

Run: cd scraper && python -m scripts.cleanup_gameid_contamination --game-ids 736,958,1322 [--execute] [--force]
"""
import argparse
import csv
import logging
import os
from datetime import datetime, timezone

import psycopg2
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def find_affected_rows(conn, game_ids: list[int]) -> list[tuple[int, str, str, int | None, int, str]]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT p.id, p.name, p.url, p.bgg_id, p.game_id, s.slug "
            "FROM products p JOIN stores s ON s.id = p.store_id "
            "WHERE p.game_id = ANY(%s) "
            "ORDER BY p.game_id, p.id",
            (game_ids,),
        )
        return cur.fetchall()


def log_affected_rows(rows: list[tuple[int, str, str, int | None, int, str]], game_ids: list[int]) -> None:
    if not rows:
        logger.info("No affected products found for game_ids=%s", game_ids)
        return

    counts: dict[int, int] = {}
    for product_id, name, url, bgg_id, game_id, store_slug in rows:
        counts[game_id] = counts.get(game_id, 0) + 1
        logger.info(
            "  product id=%d store=%s bgg_id=%s game_id=%s name=%r url=%s",
            product_id, store_slug, bgg_id, game_id, name, url,
        )

    for game_id, count in counts.items():
        logger.info("game_id=%d: %d affected product(s)", game_id, count)
    logger.info("Total affected: %d product(s)", len(rows))


def unfinished_scrape_count(conn) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM scrape_runs WHERE finished_at IS NULL")
        return cur.fetchone()[0]


def write_backup(rows: list[tuple[int, str, str, int | None, int, str]]) -> str:
    """Persist pre-state to a timestamped CSV so the reset can be undone if needed."""
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = f"cleanup_gameid_backup_{stamp}.csv"
    with open(path, "w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["id", "name", "url", "bgg_id", "game_id", "store_slug"])
        writer.writerows(rows)
    return path


def reset_affected_rows(conn, game_ids: list[int], expected_rows: int) -> int:
    """Reset the affected rows in one transaction; roll back if the count diverges."""
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE products SET game_id = NULL, bgg_id = NULL WHERE game_id = ANY(%s)",
            (game_ids,),
        )
        rows_affected = cur.rowcount
        if rows_affected != expected_rows:
            conn.rollback()
            raise RuntimeError(
                f"UPDATE touched {rows_affected} rows but the audited SELECT had "
                f"{expected_rows} — a concurrent write likely occurred; rolled back, "
                "nothing changed. Re-run to re-audit."
            )
        cur.execute(
            "INSERT INTO data_retention_log (step, rows_affected) VALUES (%s, %s)",
            ("reset_gameid_contamination", rows_affected),
        )
    conn.commit()
    return rows_affected


def _log_target(conn) -> None:
    params = conn.get_dsn_parameters()
    logger.info("Connected to host=%s dbname=%s", params.get("host"), params.get("dbname"))


def _parse_game_ids(raw: str) -> list[int]:
    try:
        return [int(x.strip()) for x in raw.split(",") if x.strip()]
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"Invalid --game-ids value: {raw!r}") from exc


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--game-ids",
        type=_parse_game_ids,
        required=True,
        help="Comma-separated list of operator-confirmed contaminated game_ids "
             "(see detect_gameid_contamination.py to generate candidates)",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually write the reset (default is dry-run: log only, no writes)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Override the in-flight-scrape safety guard",
    )
    args = parser.parse_args()

    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL env var is not set")

    conn = psycopg2.connect(database_url)
    try:
        _log_target(conn)
        rows = find_affected_rows(conn, args.game_ids)
        log_affected_rows(rows, args.game_ids)

        if not args.execute:
            logger.info("Dry run — no changes written. Re-run with --execute to apply.")
            return

        if not rows:
            logger.info("Nothing to reset.")
            return

        in_flight = unfinished_scrape_count(conn)
        if in_flight and not args.force:
            raise RuntimeError(
                f"{in_flight} scrape_runs row(s) still unfinished — a concurrent scrape "
                "could re-poison the reset rows. Wait for it to finish or pass --force."
            )

        backup_path = write_backup(rows)
        logger.info("Pre-state backup written to %s (%d rows).", backup_path, len(rows))

        rows_affected = reset_affected_rows(conn, args.game_ids, expected_rows=len(rows))
        logger.info("Reset bgg_id/game_id to NULL for %d product(s).", rows_affected)
        _revalidate_isr()
    finally:
        conn.close()


def _revalidate_isr() -> None:
    """Best-effort: clear the Vercel ISR cache so wrong pages stop rendering immediately.

    Without this the contaminated passport/home pages stay cached until the next daily
    scrape (fallback TTL 2h). Failure is non-fatal — the DB reset already succeeded.
    """
    vercel_url = os.getenv("VERCEL_URL")
    secret = os.getenv("REVALIDATION_SECRET")
    if not vercel_url or not secret:
        logger.warning(
            "VERCEL_URL/REVALIDATION_SECRET not set — skipping ISR revalidation; "
            "stale pages will clear on the next scrape (fallback TTL 2h)."
        )
        return
    try:
        import httpx

        resp = httpx.post(
            f"{vercel_url}/api/revalidate",
            headers={"x-revalidate-secret": secret},
            timeout=30,
        )
        resp.raise_for_status()
        logger.info("Triggered ISR revalidation (%d).", resp.status_code)
    except Exception as exc:
        logger.warning(
            "ISR revalidation failed (%s) — stale pages will clear on the next scrape.",
            exc,
        )


if __name__ == "__main__":
    main()
