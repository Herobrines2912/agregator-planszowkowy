"""Alert engine — detects price drops and dramatic-discount anomalies for
active alerts and triggers emails.

run_alert_engine() — Story 6.5 core logic (Type A: user-set target price).
run_type_b_alerts() — Story 6.7 (Type B: 50%/70%/80% anomaly discounts).

Usage (called from alert_engine.yml after a successful Daily Scraper run):
    python -m alert_engine
"""
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import psycopg2
from dotenv import load_dotenv

from utils.brevo_client import send_price_drop_email

logger = logging.getLogger(__name__)

SITE_URL = os.environ.get("NEXT_PUBLIC_SITE_URL", "https://agregatorplanszowek.pl")

TYPE_B_THRESHOLDS = (Decimal("0.80"), Decimal("0.70"), Decimal("0.50"))
TYPE_B_COOLDOWN = timedelta(hours=24)


def _cheapest_in_stock_offers(conn, game_ids: list[int]) -> dict[int, dict]:
    """Batch-resolve the single cheapest in-stock product per game_id, with its
    store name. Single query for products (DISTINCT ON, no N+1) plus one small
    batched stores lookup — exactly 2 queries regardless of game_ids count.

    Excludes NULL-price rows at the SQL level (AND price IS NOT NULL): a game
    whose sole in-stock product has no price must produce no row here, same as
    having no in-stock offers at all — surfacing a {price: None, ...} dict would
    crash callers comparing against it (regression fixed in Story 6.6 review).
    """
    with conn.cursor() as cur:
        cur.execute(
            """SELECT DISTINCT ON (game_id) game_id, price, price_orig, url, store_id
               FROM products
               WHERE game_id = ANY(%s) AND in_stock = true AND price IS NOT NULL
               ORDER BY game_id, price ASC, store_id ASC""",
            (game_ids,),
        )
        cheapest_rows = cur.fetchall()

    store_ids = list({row[4] for row in cheapest_rows})

    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, name FROM stores WHERE id = ANY(%s)",
            (store_ids,),
        )
        store_names_by_id = dict(cur.fetchall())

    return {
        game_id: {
            "price": price,
            "price_orig": price_orig,
            "url": url,
            "store_name": store_names_by_id.get(store_id),
        }
        for game_id, price, price_orig, url, store_id in cheapest_rows
    }


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
    current_offers = _cheapest_in_stock_offers(conn, game_ids)

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
                header_prefix="",
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


def run_type_b_alerts(conn) -> None:
    """Check all Type B-enabled alerts for a dramatic discount (50%/70%/80%
    below the original price) on their game's cheapest in-stock offer.

    Unlike run_alert_engine(), status is never touched here — Type B alerts
    are re-evaluated every run; a 24h cooldown per alert row
    (last_type_b_notified_at), not per threshold, is the sole gate against
    repeat emails. One email per alert per run, naming the deepest threshold
    crossed (never one email per threshold).

    Matches status IN ('active', 'triggered') rather than only 'active': a
    single alert row can have both a target_price (Type A) and
    type_b_enabled=true (Type B) at once. If Type A's one-shot target already
    fired, run_alert_engine() sets status='triggered' — that must not silently
    disable this same row's independent, indefinitely-recurring Type B
    subscription. Only 'cancelled'/'pending_doi' rows are excluded.
    """
    with conn.cursor() as cur:
        cur.execute(
            """SELECT id, game_id, email, target_price, last_type_b_notified_at
               FROM price_alerts
               WHERE status IN ('active', 'triggered') AND alert_type = 'price_drop'
                 AND type_b_enabled = true"""
        )
        alerts = cur.fetchall()

    if not alerts:
        logger.info("No active Type B alerts to process")
        return

    game_ids = list({row[1] for row in alerts})
    current_offers = _cheapest_in_stock_offers(conn, game_ids)

    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, name, slug FROM games WHERE id = ANY(%s)",
            (game_ids,),
        )
        games_by_id = {row[0]: {"name": row[1], "slug": row[2]} for row in cur.fetchall()}

    now = datetime.now(timezone.utc)

    for alert_id, game_id, email, target_price, last_type_b_notified_at in alerts:
        current_offer = current_offers.get(game_id)
        if current_offer is None:
            logger.info("Alert %s (game %s): no in-stock offers — skipping", alert_id, game_id)
            continue

        price_orig = current_offer["price_orig"]
        if price_orig is None or price_orig <= 0:
            continue

        drop_pct = (price_orig - current_offer["price"]) / price_orig
        threshold = next((t for t in TYPE_B_THRESHOLDS if drop_pct >= t), None)
        if threshold is None:
            continue

        if last_type_b_notified_at is not None and (now - last_type_b_notified_at) < TYPE_B_COOLDOWN:
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
        target_price_str = "—" if target_price is None else str(target_price)

        try:
            sent = send_price_drop_email(
                email,
                game_name=game_name,
                game_url=f"{SITE_URL}/gra/{game_slug}",
                current_price=str(current_offer["price"]),
                target_price=target_price_str,
                store_name=current_offer["store_name"],
                buy_url=current_offer["url"],
                header_prefix="WYJĄTKOWA OKAZJA! ",
            )
        except Exception:
            logger.exception(
                "Alert %s: Type B email raised an exception — will retry next run", alert_id
            )
            sent = False

        if sent:
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE price_alerts SET last_type_b_notified_at = now() WHERE id = %s",
                        (alert_id,),
                    )
                conn.commit()
                logger.info(
                    "Alert %s: Type B email sent (threshold=%s)", alert_id, threshold
                )
            except Exception:
                logger.exception(
                    "Alert %s: Type B email sent but cooldown UPDATE failed — "
                    "next run may resend before the intended 24h window", alert_id
                )
        else:
            logger.warning(
                "Alert %s: Type B email failed to send — will retry next run", alert_id
            )


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

    failed = False
    try:
        try:
            run_alert_engine(conn)
        except Exception:
            logger.exception("run_alert_engine() failed — Type B pass still runs this cycle")
            failed = True

        try:
            run_type_b_alerts(conn)
        except Exception:
            logger.exception("run_type_b_alerts() failed")
            failed = True
    finally:
        conn.close()

    if failed:
        sys.exit(3)


if __name__ == "__main__":
    main()
