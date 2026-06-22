import logging
import os
from datetime import datetime, timezone

import psycopg2
import psycopg2.pool
from dotenv import load_dotenv

logger = logging.getLogger(__name__)


class DatabasePipeline:
    pool: psycopg2.pool.ThreadedConnectionPool | None = None
    scrape_run_id: int | None = None

    def open_spider(self, spider) -> None:
        load_dotenv()
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL env var is not set")

        self.pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=1,
            maxconn=5,
            dsn=database_url,
        )
        self.store_id: int = spider.store_id
        self.products_scraped: int = 0
        self.errors: int = 0
        self.seen_external_ids: set[str] = set()

        self._insert_scrape_run()
        self._load_known_products()

    def process_item(self, item, spider):
        try:
            product_id = self._upsert_product(item)
            self._insert_price_history(product_id, item)
            self.products_scraped += 1
            external_id = item.get("external_id")
            if external_id:
                self.seen_external_ids.add(external_id)
        except Exception as exc:
            logger.error(
                "DB write failed for item %s from %s: %s",
                item.get("url"),
                spider.name,
                exc,
                exc_info=True,
            )
            self.errors += 1
        return item

    def close_spider(self, spider) -> None:
        self._write_not_seen_rows()
        self._finalize_scrape_run()
        if self.pool:
            self.pool.closeall()

    # -------------------------------------------------------------------------
    # Private helpers
    # -------------------------------------------------------------------------

    def _insert_scrape_run(self) -> None:
        started_at = datetime.now(timezone.utc)
        conn = self.pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO scrape_runs (store_id, started_at, status)
                       VALUES (%s, %s, 'failed') RETURNING id""",
                    (self.store_id, started_at),
                )
                self.scrape_run_id = cur.fetchone()[0]
            conn.commit()
        finally:
            self.pool.putconn(conn)

    def _load_known_products(self) -> None:
        conn = self.pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, external_id FROM products WHERE store_id = %s AND external_id IS NOT NULL",
                    (self.store_id,),
                )
                rows = cur.fetchall()
        finally:
            self.pool.putconn(conn)
        self.known_products: dict[str, int] = {row[1]: row[0] for row in rows}

    def _upsert_product(self, item: dict) -> int:
        conn = self.pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO products
                           (store_id, external_id, name, url, price, price_orig,
                            in_stock, game_id, bgg_id, updated_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                       ON CONFLICT (store_id, external_id)
                       DO UPDATE SET
                           name        = EXCLUDED.name,
                           url         = EXCLUDED.url,
                           price       = EXCLUDED.price,
                           price_orig  = EXCLUDED.price_orig,
                           in_stock    = EXCLUDED.in_stock,
                           game_id     = COALESCE(EXCLUDED.game_id, products.game_id),
                           bgg_id      = COALESCE(EXCLUDED.bgg_id, products.bgg_id),
                           updated_at  = now()
                       RETURNING id""",
                    (
                        item.get("store_id"),
                        item.get("external_id"),
                        item.get("name"),
                        item.get("url"),
                        item.get("price"),
                        item.get("price_orig"),
                        item.get("in_stock", False),
                        item.get("game_id"),
                        item.get("bgg_id"),
                    ),
                )
                product_id: int = cur.fetchone()[0]
            conn.commit()
        finally:
            self.pool.putconn(conn)
        return product_id

    def _insert_price_history(self, product_id: int, item: dict) -> None:
        scraped_at = datetime.now(timezone.utc)
        conn = self.pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO price_history
                           (product_id, price, price_orig, in_stock, scraped_at)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (
                        product_id,
                        item.get("price"),
                        item.get("price_orig"),
                        item.get("in_stock", False),
                        scraped_at,
                    ),
                )
            conn.commit()
        finally:
            self.pool.putconn(conn)

    def _write_not_seen_rows(self) -> None:
        not_seen_ids = [
            product_id
            for ext_id, product_id in self.known_products.items()
            if ext_id not in self.seen_external_ids
        ]
        if not not_seen_ids:
            return

        scraped_at = datetime.now(timezone.utc)
        conn = self.pool.getconn()
        try:
            with conn.cursor() as cur:
                for product_id in not_seen_ids:
                    cur.execute(
                        """INSERT INTO price_history
                               (product_id, price, price_orig, in_stock, scraped_at)
                           VALUES (%s, NULL, NULL, FALSE, %s)""",
                        (product_id, scraped_at),
                    )
            conn.commit()
        except Exception as exc:
            logger.error("Failed writing not-seen rows: %s", exc, exc_info=True)
            conn.rollback()
        finally:
            self.pool.putconn(conn)

    def _finalize_scrape_run(self) -> None:
        if self.scrape_run_id is None:
            return
        status = "success" if self.errors == 0 else "partial"
        finished_at = datetime.now(timezone.utc)
        conn = self.pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE scrape_runs
                       SET finished_at = %s, products_scraped = %s,
                           errors = %s, status = %s
                       WHERE id = %s""",
                    (finished_at, self.products_scraped, self.errors, status, self.scrape_run_id),
                )
            conn.commit()
        except Exception as exc:
            logger.error("Failed finalizing scrape_run id=%s: %s", self.scrape_run_id, exc, exc_info=True)
        finally:
            self.pool.putconn(conn)
