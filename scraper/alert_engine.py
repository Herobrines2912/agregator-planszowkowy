"""Alert engine — detects price drops for active alerts and triggers emails.

run_alert_engine() — Story 6.5 core logic.

Usage (called from alert_engine.yml after a successful Daily Scraper run):
    python -m alert_engine
"""
import logging
import os
import sys

import psycopg2
from dotenv import load_dotenv

from utils.brevo_client import send_price_drop_email

logger = logging.getLogger(__name__)

SITE_URL = os.environ.get("NEXT_PUBLIC_SITE_URL", "https://agregatorplanszowek.pl")


def run_alert_engine(conn) -> None:
    """Check all active price-drop alerts against current in-stock prices.

    For each alert where the current minimum in-stock price is at or below the
    target, sets status to 'triggered' (before sending, per AC-2) and sends the
    price-drop email. On send failure, resets status back to 'active' so the
    alert retries on the next scrape cycle (AC-6).
    """
    with conn.cursor() as cur:
        cur.execute(
            """SELECT id, game_id, email, target_price FROM price_alerts
               WHERE status = 'active' AND alert_type = 'price_drop'"""
        )
        alerts = cur.fetchall()

    if not alerts:
        logger.info("No active price-drop alerts to process")
        return

    game_ids = list({row[1] for row in alerts})

    with conn.cursor() as cur:
        cur.execute(
            """SELECT DISTINCT ON (game_id) game_id, price, url, store_id
               FROM products
               WHERE game_id = ANY(%s) AND in_stock = true AND price IS NOT NULL
               ORDER BY game_id, price ASC, store_id ASC""",
            (game_ids,),
        )
        cheapest_rows = cur.fetchall()

    store_ids = list({row[3] for row in cheapest_rows})

    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, name FROM stores WHERE id = ANY(%s)",
            (store_ids,),
        )
        store_names_by_id = dict(cur.fetchall())

    current_offers = {
        game_id: {
            "price": price,
            "url": url,
            "store_name": store_names_by_id.get(store_id),
        }
        for game_id, price, url, store_id in cheapest_rows
    }

    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, name, slug FROM games WHERE id = ANY(%s)",
            (game_ids,),
        )
        games_by_id = {row[0]: {"name": row[1], "slug": row[2]} for row in cur.fetchall()}

    for alert_id, game_id, email, target_price in alerts:
        if target_price is None:
            logger.warning("Alert %s: target_price is NULL — skipping", alert_id)
            continue

        current_offer = current_offers.get(game_id)

        if current_offer is None:
            logger.info("Alert %s (game %s): no in-stock offers — skipping", alert_id, game_id)
            continue

        current_min_price = current_offer["price"]

        if current_min_price > target_price:
            continue

        game = games_by_id.get(game_id)
        if not game or not game.get("slug"):
            logger.warning(
                "Alert %s (game %s): game record missing or has no slug — skipping "
                "to avoid sending a broken email", alert_id, game_id
            )
            continue

        game_name = game["name"]
        game_slug = game["slug"]

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE price_alerts SET status = 'triggered' WHERE id = %s",
                (alert_id,),
            )
        conn.commit()

        try:
            sent = send_price_drop_email(
                email,
                game_name=game_name,
                game_url=f"{SITE_URL}/gra/{game_slug}",
                current_price=str(current_min_price),
                target_price=str(target_price),
                store_name=current_offer["store_name"],
                buy_url=current_offer["url"],
            )
        except Exception:
            logger.exception(
                "Alert %s: price-drop email raised an exception — resetting status to active",
                alert_id,
            )
            sent = False

        if not sent:
            logger.warning(
                "Alert %s: price-drop email failed to send — resetting status to active", alert_id
            )
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE price_alerts SET status = 'active' WHERE id = %s",
                    (alert_id,),
                )
            conn.commit()
        else:
            logger.info("Alert %s: price-drop email sent, status=triggered", alert_id)


def main() -> None:
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
        run_alert_engine(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
