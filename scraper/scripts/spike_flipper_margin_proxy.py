"""
Spike: Flipper Mode margin proxy data-coverage check.
Story 7.1 — Dev A + Dev B.

Mirrors Story 7.4's getFlipperDeals()/calcMarginProxy() SQL exactly (see
story 7.1 Dev Notes) to measure whether we have enough price history to
show meaningful margin proxies in Flipper Mode before building it.

Run: cd scraper && python -m scripts.spike_flipper_margin_proxy
"""
import logging
import os
import sys

import psycopg2
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def main() -> None:
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        logger.error("DATABASE_URL env var is not set")
        sys.exit(1)

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            # Task 1.2 — real scrape history sanity check
            cur.execute("SELECT COUNT(*) FROM scrape_runs;")
            scrape_run_count = cur.fetchone()[0]
            cur.execute(
                "SELECT COUNT(DISTINCT started_at::date) FROM scrape_runs;"
            )
            distinct_scrape_days = cur.fetchone()[0]
            print(f"Task 1.2 — scrape_runs total: {scrape_run_count}, distinct days: {distinct_scrape_days}")

            # Task 2 — date coverage (>=5 distinct dates per game)
            cur.execute(
                """
                SELECT COUNT(*) AS games_with_5plus_dates
                FROM (
                  SELECT g.id
                  FROM games g
                  JOIN products p ON p.game_id = g.id
                  JOIN price_history ph ON ph.product_id = p.id
                  GROUP BY g.id
                  HAVING COUNT(DISTINCT ph.scraped_at::date) >= 5
                ) sub;
                """
            )
            games_5plus_dates = cur.fetchone()[0]

            cur.execute(
                "SELECT COUNT(DISTINCT game_id) FROM products WHERE game_id IS NOT NULL;"
            )
            total_games_with_product = cur.fetchone()[0]

            pct_5plus = (
                round(games_5plus_dates / total_games_with_product * 100, 1)
                if total_games_with_product
                else 0
            )
            print(
                f"Task 2 — games with >=5 distinct price_history dates: "
                f"{games_5plus_dates}/{total_games_with_product} ({pct_5plus}%)"
            )

            # Task 3 — margin proxy coverage, mirrors getFlipperDeals()/calcMarginProxy()
            cur.execute(
                """
                WITH current_prices AS (
                  SELECT DISTINCT ON (game_id) game_id, price AS current_min_price
                  FROM products
                  WHERE in_stock = true AND price IS NOT NULL
                  ORDER BY game_id, price ASC
                ),
                historical_max AS (
                  SELECT p.game_id, MAX(ph.price) AS historical_max_price
                  FROM price_history ph
                  JOIN products p ON p.id = ph.product_id
                  WHERE ph.price IS NOT NULL
                  GROUP BY p.game_id
                )
                SELECT
                  cp.game_id,
                  cp.current_min_price,
                  hm.historical_max_price,
                  ROUND((hm.historical_max_price - cp.current_min_price) / cp.current_min_price * 100, 1) AS margin_pct
                FROM current_prices cp
                JOIN historical_max hm ON hm.game_id = cp.game_id
                WHERE hm.historical_max_price > cp.current_min_price
                ORDER BY margin_pct DESC;
                """
            )
            rows = cur.fetchall()

            cur.execute(
                "SELECT COUNT(DISTINCT game_id) FROM products WHERE in_stock = true AND price IS NOT NULL;"
            )
            total_games_in_stock = cur.fetchone()[0]

            sensible_rows = [r for r in rows if r[3] is not None and 0 < r[3] <= 200]
            pct_sensible = (
                round(len(sensible_rows) / total_games_in_stock * 100, 1)
                if total_games_in_stock
                else 0
            )
            pct_visible = (
                round(len(rows) / total_games_in_stock * 100, 1)
                if total_games_in_stock
                else 0
            )

            print(
                f"Task 3.2 — margin_pct in (0, 200]: {len(sensible_rows)}/{total_games_in_stock} "
                f"({pct_sensible}%) — answers Question 2"
            )
            print(
                f"Task 3.3 — total rows from getFlipperDeals() shape: {len(rows)}/{total_games_in_stock} "
                f"({pct_visible}%) — answers Question 3"
            )

            print("\nTask 3.4 — sample rows for sanity check (top 5 by margin_pct):")
            for row in rows[:5]:
                print(f"  game_id={row[0]} current_min={row[1]} historical_max={row[2]} margin_pct={row[3]}")

            print("\nSample rows (bottom 5 by margin_pct, still passing exclusion):")
            for row in rows[-5:]:
                print(f"  game_id={row[0]} current_min={row[1]} historical_max={row[2]} margin_pct={row[3]}")

            decision = "PASSED" if pct_sensible >= 30 else "FAILED"
            print(f"\n=== SPIKE RESULT: {decision} (threshold: 30%, actual: {pct_sensible}%) ===")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
