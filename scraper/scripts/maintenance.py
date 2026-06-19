import logging
import os

import psycopg2

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)


def run_step(cur, step_name: str, sql: str) -> int:
    """Execute one maintenance step and log result to data_retention_log."""
    cur.execute(sql)
    rows_affected = cur.rowcount
    cur.execute(
        "INSERT INTO data_retention_log (step, rows_affected) VALUES (%s, %s)",
        (step_name, rows_affected),
    )
    logger.info("Step %-40s  rows affected: %d", step_name, rows_affected)
    return rows_affected


def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(database_url)

    try:
        # Enable pgcrypto for SHA-256 email anonymization in Step 2 (idempotent)
        with conn:
            with conn.cursor() as cur:
                cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")

        # Step 1 — Nullify ip_hash older than 12 months (RODO data minimization)
        with conn:
            with conn.cursor() as cur:
                run_step(
                    cur,
                    "nullify_ip_hash",
                    """
                    UPDATE consent_log
                    SET ip_hash = NULL
                    WHERE ip_hash IS NOT NULL
                      AND created_at < NOW() - INTERVAL '12 months'
                    """,
                )

        # Step 2 — Anonymize raw email in email_suppressions older than 3 years
        with conn:
            with conn.cursor() as cur:
                run_step(
                    cur,
                    "anonymize_email_suppressions",
                    """
                    UPDATE email_suppressions
                    SET email = encode(digest(email::bytea, 'sha256'), 'hex'),
                        is_anonymized = true
                    WHERE is_anonymized = false
                      AND created_at < NOW() - INTERVAL '3 years'
                    """,
                )

        # Step 3 — Delete scrape_runs older than 90 days (operational log cleanup)
        with conn:
            with conn.cursor() as cur:
                run_step(
                    cur,
                    "delete_old_scrape_runs",
                    """
                    DELETE FROM scrape_runs
                    WHERE started_at < NOW() - INTERVAL '90 days'
                    """,
                )

        # Step 4 — Delete consent_log rows older than 5 years with no active subscription.
        # This is the ONLY permitted DELETE from consent_log (append-only rule exception for RODO).
        # The subquery guard ensures proof-of-consent is never deleted for active subscribers.
        with conn:
            with conn.cursor() as cur:
                run_step(
                    cur,
                    "delete_old_consent_log",
                    """
                    DELETE FROM consent_log
                    WHERE created_at < NOW() - INTERVAL '5 years'
                      AND email_hash NOT IN (
                          SELECT email_hash FROM price_alerts WHERE status = 'active'
                      )
                    """,
                )

        logger.info("Maintenance run complete — all 4 steps executed successfully")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
