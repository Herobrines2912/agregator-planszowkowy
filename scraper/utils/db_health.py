"""Database health checks for operator monitoring.

Story 2.6: check_product_count_baseline() — 80% rolling average guard.
Story 2.5: check_database_size() will be added here later.

Usage (called from scraper.yml after each Scrape Cycle):
    python -m utils.db_health
"""
import logging
import os
import sys
from datetime import datetime, timedelta, timezone

import psycopg2
from dotenv import load_dotenv

logger = logging.getLogger(__name__)


def check_product_count_baseline(conn) -> bool:
    """Check each store's latest scrape count against its 7-day rolling average.

    Returns True if all stores are within threshold, False if any breach detected.
    Skips stores with fewer than 7 data points (insufficient baseline).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    breach_detected = False

    with conn.cursor() as cur:
        cur.execute(
            "SELECT DISTINCT store_id FROM scrape_runs WHERE started_at >= %s",
            (cutoff,),
        )
        store_ids = [row[0] for row in cur.fetchall()]

    for store_id in store_ids:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT products_scraped FROM scrape_runs
                   WHERE store_id = %s AND started_at >= %s
                   ORDER BY started_at DESC""",
                (store_id, cutoff),
            )
            rows = cur.fetchall()

        counts = [r[0] for r in rows if r[0] is not None]

        if len(counts) < 7:
            logger.info(
                "Store %s: only %d scrape_runs in last 7 days — skipping baseline check",
                store_id,
                len(counts),
            )
            continue

        current = counts[0]
        baseline_counts = counts[1:]
        avg = sum(baseline_counts) / len(baseline_counts)

        if avg == 0:
            logger.critical(
                "OPERATOR ALERT — Store %s: 7-day baseline average is 0 — cannot evaluate threshold",
                store_id,
            )
            breach_detected = True
            continue

        threshold = avg * 0.8

        if current < threshold:
            pct = (current / avg * 100) if avg else 0
            logger.critical(
                "OPERATOR ALERT — Store %s product count dropped below 80%% baseline: "
                "current=%d, 7-day avg=%.1f, threshold=%.1f (%.0f%% of baseline)",
                store_id,
                current,
                avg,
                threshold,
                pct,
            )
            breach_detected = True
        else:
            logger.info(
                "Store %s baseline OK: current=%d, 7-day avg=%.1f",
                store_id,
                current,
                avg,
            )

    return not breach_detected


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    load_dotenv()

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        logger.error("DATABASE_URL env var is not set")
        sys.exit(1)

    try:
        conn = psycopg2.connect(database_url)
    except psycopg2.OperationalError as exc:
        logger.error("Cannot connect to database: %s", exc)
        sys.exit(2)

    try:
        healthy = check_product_count_baseline(conn)
    finally:
        conn.close()

    if not healthy:
        sys.exit(1)
