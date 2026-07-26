"""
Cleanup: reset products cross-contaminated by the GameUPC demo-key incident.
Story 2.2b — Dev B.

Full evidence: _bmad-output/implementation-artifacts/investigations/
gameupc-sandbox-key-cross-contamination-investigation.md

Confirmed-poisoned bgg_ids — both are canned demo answers from GameUPC's public
test key, not real games these products belong to:
  232420 — "Gier" (23 unrelated products merged in)
  178255 — "Pizza Wars PL" (8 unrelated products merged in)

This script only fixes these two confirmed clusters. It does not attempt to
discover other contaminated bgg_ids (see story Dev Notes — "Why not a broader
auto-detection sweep").

Scope: products are matched either by the poisoned bgg_id directly OR by a game_id
still pointing at one of the poisoned games rows (bgg_id/game_id can diverge via the
upsert's COALESCE, and the web app joins on game_id) — both are reset.

Safety (all only relevant to --execute):
  * Dry run by default: logs affected rows, zero DB writes.
  * Baseline guard: the bgg_id-keyed counts must match the confirmed 23/8 baseline,
    else abort (override with --force).
  * In-flight-scrape guard: refuses to run while a scrape_runs row is unfinished,
    so a concurrent old-code scrape can't re-poison the rows (override with --force).
  * Pre-state is written to a timestamped CSV backup before the UPDATE, and the run
    is recorded in data_retention_log — the reset is otherwise irreversible.
  * The UPDATE is rolled back if its rowcount diverges from the audited SELECT.

Run: cd scraper && python -m scripts.cleanup_gameupc_contamination [--execute] [--force]
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

POISONED_BGG_IDS = [232420, 178255]

# Confirmed baseline from the investigation (23 on "Gier", 8 on "Pizza Wars PL").
# The bgg_id-keyed affected counts must match this before --execute writes anything.
EXPECTED_COUNTS = {232420: 23, 178255: 8}

# Rows are matched by the poisoned bgg_id OR by a game_id pointing at a poisoned game.
_WHERE = (
    "p.bgg_id = ANY(%s) "
    "OR p.game_id IN (SELECT id FROM games WHERE bgg_id = ANY(%s))"
)

# One tuple element per %s in _WHERE (used for both SELECT and UPDATE).
_WHERE_PARAMS = (POISONED_BGG_IDS, POISONED_BGG_IDS)


def find_affected_rows(conn) -> list[tuple[int, str, str, int | None, int | None, str]]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT p.id, p.name, p.url, p.bgg_id, p.game_id, s.slug "
            "FROM products p JOIN stores s ON s.id = p.store_id "
            f"WHERE {_WHERE} "
            "ORDER BY p.bgg_id NULLS LAST, p.game_id, p.id",
            _WHERE_PARAMS,
        )
        return cur.fetchall()


def log_affected_rows(rows: list[tuple[int, str, str, int | None, int | None, str]]) -> None:
    if not rows:
        logger.info("No affected products found for bgg_ids=%s", POISONED_BGG_IDS)
        return

    bgg_counts: dict[int, int] = {}
    orphan_count = 0
    for product_id, name, url, bgg_id, game_id, store_slug in rows:
        if bgg_id in POISONED_BGG_IDS:
            bgg_counts[bgg_id] = bgg_counts.get(bgg_id, 0) + 1
        else:
            # bgg_id already overwritten but game_id still points at a poisoned game.
            orphan_count += 1
        logger.info(
            "  product id=%d store=%s bgg_id=%s game_id=%s name=%r url=%s",
            product_id, store_slug, bgg_id, game_id, name, url,
        )

    for bgg_id, count in bgg_counts.items():
        logger.info("bgg_id=%d: %d affected product(s)", bgg_id, count)
    if orphan_count:
        logger.info("game_id-only (bgg_id already overwritten): %d product(s)", orphan_count)
    logger.info("Total affected: %d product(s)", len(rows))


def baseline_mismatches(rows: list[tuple[int, str, str, int | None, int | None, str]]) -> list[str]:
    """Return human-readable mismatch messages vs EXPECTED_COUNTS, empty if all match."""
    actual: dict[int, int] = {}
    for _id, _name, _url, bgg_id, _game_id, _slug in rows:
        if bgg_id in POISONED_BGG_IDS:
            actual[bgg_id] = actual.get(bgg_id, 0) + 1

    messages: list[str] = []
    for bgg_id, expected in EXPECTED_COUNTS.items():
        got = actual.get(bgg_id, 0)
        if got != expected:
            messages.append(f"bgg_id={bgg_id}: expected {expected}, found {got}")
    return messages


def unfinished_scrape_count(conn) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM scrape_runs WHERE finished_at IS NULL")
        return cur.fetchone()[0]


def write_backup(rows: list[tuple[int, str, str, int | None, int | None, str]]) -> str:
    """Persist pre-state to a timestamped CSV so the reset can be undone if needed."""
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = f"cleanup_gameupc_backup_{stamp}.csv"
    with open(path, "w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["id", "name", "url", "bgg_id", "game_id", "store_slug"])
        writer.writerows(rows)
    return path


def reset_affected_rows(conn, expected_rows: int) -> int:
    """Reset the affected rows in one transaction; roll back if the count diverges."""
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE products AS p SET bgg_id = NULL, game_id = NULL WHERE {_WHERE}",
            _WHERE_PARAMS,
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
            ("reset_gameupc_contamination", rows_affected),
        )
    conn.commit()
    return rows_affected


def _log_target(conn) -> None:
    params = conn.get_dsn_parameters()
    logger.info("Connected to host=%s dbname=%s", params.get("host"), params.get("dbname"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually write the reset (default is dry-run: log only, no writes)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Override the baseline-count and in-flight-scrape safety guards",
    )
    args = parser.parse_args()

    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL env var is not set")

    conn = psycopg2.connect(database_url)
    try:
        _log_target(conn)
        rows = find_affected_rows(conn)
        log_affected_rows(rows)

        if not args.execute:
            logger.info("Dry run — no changes written. Re-run with --execute to apply.")
            return

        if not rows:
            logger.info("Nothing to reset.")
            return

        mismatches = baseline_mismatches(rows)
        if mismatches:
            for msg in mismatches:
                logger.warning("Baseline mismatch: %s", msg)
            if not args.force:
                raise RuntimeError(
                    "Affected counts differ from the confirmed 23/8 baseline — "
                    "aborting. Re-verify against the investigation, then pass --force "
                    "if the drift is expected."
                )
            logger.warning("--force set: proceeding despite baseline mismatch.")

        in_flight = unfinished_scrape_count(conn)
        if in_flight and not args.force:
            raise RuntimeError(
                f"{in_flight} scrape_runs row(s) still unfinished — a concurrent scrape "
                "could re-poison the reset rows. Wait for it to finish (and ensure the "
                "pipeline hardening is deployed) or pass --force."
            )

        backup_path = write_backup(rows)
        logger.info("Pre-state backup written to %s (%d rows).", backup_path, len(rows))

        rows_affected = reset_affected_rows(conn, expected_rows=len(rows))
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
