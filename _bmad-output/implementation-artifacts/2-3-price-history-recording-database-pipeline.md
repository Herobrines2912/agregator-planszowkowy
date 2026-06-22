---
story_id: "2.3"
story_key: "2-3-price-history-recording-database-pipeline"
epic: 2
epic_title: "Automated Price Data Collection"
status: "review"
dev: "Dev B (Scraper)"
depends_on: "Story 2.1 (done ✅)"
baseline_commit: "657aa40"
---

# Story 2.3: Price History Recording & Database Pipeline

**Status:** review
**Epic:** 2 — Automated Price Data Collection
**Dev:** Dev B (Scraper/Infra)
**Mock data OK:** No — uses mocked psycopg2 in tests; real DB integration tested manually

---

## User Story

As a **developer**,
I want each Scrape Cycle to append price records and log the cycle result,
So that Price History grows with every run and operators can monitor scraper health via `scrape_runs`.

---

## Acceptance Criteria

### AC-1 — psycopg2 connection pool, NOT Neon serverless

**Given** `scraper/scraper/pipelines/database.py` using psycopg2
**When** configured
**Then** it uses `psycopg2.pool.ThreadedConnectionPool(minconn=1, maxconn=5)`, NOT `@neondatabase/serverless` — separate connection model from web's

### AC-2 — price_history row appended per product per cycle

**Given** a completed Scrape Cycle item passing through `DatabasePipeline`
**When** `process_item()` is called
**Then** one row is inserted into `price_history` per product per cycle:
`product_id`, `price` (Decimal or NULL), `price_orig` (Decimal or NULL), `in_stock` (bool), `scraped_at` (UTC TIMESTAMPTZ)
**And** `price_history` is append-only — pipeline never issues UPDATE or DELETE on this table

### AC-3 — "not seen" products written at cycle close

**Given** a product that exists in `products` for this store (has rows from previous cycles)
**When** that product is absent from the current Scrape Cycle (spider didn't yield it)
**Then** at `close_spider()`, a `price_history` row is inserted with `in_stock = False` and `price = NULL`
**And** this row uses `scraped_at = datetime.now(timezone.utc)` at the time of `close_spider`

### AC-4 — no minimum price change threshold

**Given** a product whose price changed by exactly 0.01 PLN since last cycle
**When** pipeline processes it
**Then** a new `price_history` row is written — no deduplication or threshold logic

### AC-5 — scrape_runs row created and finalized per spider

**Given** a `DatabasePipeline` instance for a spider run
**When** `open_spider()` is called
**Then** a `scrape_runs` row is INSERT'd with: `store_id` (from spider attribute), `started_at = datetime.now(timezone.utc)`, `status = 'failed'` (default — overwritten on success)

**Given** `close_spider()` is called after successful cycle
**When** no critical error occurred
**Then** the `scrape_runs` row is UPDATEd: `finished_at`, `products_scraped`, `errors`, `status` set to `'success'` (or `'partial'` if `errors > 0`)

### AC-6 — per-item DB error: log + continue, don't abort

**Given** a DB insert error for a single item (e.g. FK violation, connection timeout)
**When** `process_item()` handles it
**Then** it logs at ERROR level with `exc_info=True` via `logging.getLogger(__name__)`
**And** continues processing remaining items
**And** increments `self.errors` counter (reflected in `scrape_runs.errors` at close)
**And** does NOT raise — the batch continues

### AC-7 — products upsert by (store_id, external_id)

**Given** an item dict with `store_id`, `external_id`, `name`, `url`, `price`, `price_orig`, `in_stock`
**When** `process_item()` runs
**Then** it performs: `INSERT INTO products ... ON CONFLICT (store_id, external_id) DO UPDATE SET price=..., price_orig=..., in_stock=..., name=..., url=..., updated_at=now()`
**And** returns the `product_id` (from `RETURNING id`)
**And** uses this `product_id` for the subsequent `price_history` INSERT

### AC-8 — ITEM_PIPELINES updated in settings.py

**Given** `scraper/scraper/settings.py`
**When** reviewed
**Then** `ITEM_PIPELINES` includes `DatabasePipeline` at priority **400** (after ValidationPipeline at 200; leaves room for DeduplicationPipeline at 300 in Story 2.2)

### AC-9 — tests pass with mocked psycopg2

**Given** `scraper/tests/test_database_pipeline.py` with mocked psycopg2 connection
**When** run via `uv run pytest`
**Then** covers: price_history INSERT, "not seen" logic, scrape_runs open/close, per-item error handling, correct Decimal → string conversion for NUMERIC columns
**And** all 64 existing tests remain green (zero regressions)

---

## Tasks / Subtasks

- [x] Task 1 — Create `scraper/scraper/pipelines/database.py`
  - [x] Add `ThreadedConnectionPool` init in `open_spider`, release in `close_spider`
  - [x] `open_spider`: INSERT scrape_run row (status='failed'), load existing `(product_id, external_id)` set for this store
  - [x] `process_item`: upsert product (AC-7), write price_history row (AC-2), track seen external_ids
  - [x] `close_spider`: write "not seen" rows (AC-3), UPDATE scrape_run (AC-5), release pool
  - [x] Per-item error handling (AC-6)

- [x] Task 2 — Update `scraper/scraper/settings.py`
  - [x] Add `"scraper.pipelines.database.DatabasePipeline": 400` to `ITEM_PIPELINES`

- [x] Task 3 — Write `scraper/tests/test_database_pipeline.py`
  - [x] Mock psycopg2 pool and cursor — never hit real DB in tests
  - [x] Test: price_history INSERT with correct Decimal→str conversion
  - [x] Test: products upsert ON CONFLICT path
  - [x] Test: "not seen" rows written at close_spider
  - [x] Test: scrape_runs INSERT at open_spider, UPDATE at close_spider
  - [x] Test: per-item DB error → log + continue + errors counter incremented
  - [x] Test: in_stock=True item with price=None writes price=NULL to price_history
  - [x] Run full suite — 85/85 passed (64 existing + 21 new), zero regressions

- [x] Task 4 — Verify `(store_id, external_id)` unique constraint in schema
  - [x] Constraint absent in schema.ts — added `unique('products_store_external_unique').on(t.store_id, t.external_id)` and migration `0002_products_store_external_unique.sql`

---

## Dev Notes

### Pipeline Chain Context

The full pipeline order (from Story 2.1 architecture decision):

```
Spider yields dict with ean
    ↓ ValidationPipeline (priority 200) ← DONE (Story 2.1)
    ↓ DeduplicationPipeline (priority 300) ← NOT YET (Story 2.2, blocked by BGG token)
    ↓ DatabasePipeline (priority 400) ← THIS STORY
```

`DatabasePipeline` will receive items **both before and after Story 2.2 ships**. When `game_id` is present (set by DeduplicationPipeline in Story 2.2), update `products.game_id` as well. When absent, leave `products.game_id = NULL` — the deduplication pipeline will populate it later.

### products Table: No Unique Constraint in Current Schema

**Critical:** `schema.ts` defines `products` without a unique constraint on `(store_id, external_id)`. Before implementing the upsert in Task 1, **check the current migration state**:

```sql
-- Check if constraint exists:
SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name = 'products' AND constraint_type = 'UNIQUE';
```

If absent, you have two options:
1. **Preferred:** Add a Drizzle migration to add `UNIQUE (store_id, external_id)` — update `schema.ts` to add `unique().on(t.store_id, t.external_id)` and run `npx drizzle-kit generate && npx drizzle-kit migrate`
2. **Fallback:** SELECT → INSERT-or-UPDATE pattern in Python (two queries per item, slightly slower but no schema change needed)

Go with option 1 if you have DB access; option 2 if not. Document the decision in the dev notes below.

### psycopg2 Connection Pool

```python
import os
import psycopg2
import psycopg2.pool

class DatabasePipeline:
    pool: psycopg2.pool.ThreadedConnectionPool | None = None

    def open_spider(self, spider):
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL env var is not set")
        self.pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=1,
            maxconn=5,
            dsn=database_url,
        )
        # ... open scrape_run, load existing products
```

Load `DATABASE_URL` from env. In CI/production it's set as a GitHub Secret. In development use `scraper/.env` with `python-dotenv`:

```python
from dotenv import load_dotenv
load_dotenv()  # call before os.getenv
```

### scrape_runs Lifecycle

```python
def open_spider(self, spider):
    # Must be called at spider open, not process_item
    self.started_at = datetime.now(timezone.utc)
    self.products_scraped = 0
    self.errors = 0
    self.store_id = spider.store_id  # spiders must expose store_id as class attribute

    conn = self.pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO scrape_runs (store_id, started_at, status)
                   VALUES (%s, %s, 'failed') RETURNING id""",
                (self.store_id, self.started_at),
            )
            self.scrape_run_id = cur.fetchone()[0]
        conn.commit()
    finally:
        self.pool.putconn(conn)

def close_spider(self, spider):
    # Write "not seen" rows
    self._write_not_seen_rows()

    # Finalize scrape_run
    status = 'success' if self.errors == 0 else 'partial'
    finished_at = datetime.now(timezone.utc)
    conn = self.pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE scrape_runs SET finished_at=%s, products_scraped=%s,
                   errors=%s, status=%s WHERE id=%s""",
                (finished_at, self.products_scraped, self.errors, status, self.scrape_run_id),
            )
        conn.commit()
    finally:
        self.pool.putconn(conn)
        self.pool.closeall()
```

### "Not Seen" Products Logic

Track which `product_id`s (from DB) were scraped in this cycle:

```python
def open_spider(self, spider):
    # Load all known product_ids for this store
    conn = self.pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, external_id FROM products WHERE store_id = %s",
                (self.store_id,),
            )
            rows = cur.fetchall()
    finally:
        self.pool.putconn(conn)

    # Maps external_id → product_id for "not seen" detection
    self.known_products: dict[str, int] = {row[1]: row[0] for row in rows}
    self.seen_external_ids: set[str] = set()

def process_item(self, item, spider):
    external_id = item.get("external_id")
    if external_id:
        self.seen_external_ids.add(external_id)
    ...

def _write_not_seen_rows(self):
    scraped_at = datetime.now(timezone.utc)
    not_seen_ids = [
        product_id
        for ext_id, product_id in self.known_products.items()
        if ext_id not in self.seen_external_ids
    ]
    if not not_seen_ids:
        return

    conn = self.pool.getconn()
    try:
        with conn.cursor() as cur:
            for product_id in not_seen_ids:
                cur.execute(
                    """INSERT INTO price_history (product_id, price, price_orig, in_stock, scraped_at)
                       VALUES (%s, NULL, NULL, FALSE, %s)""",
                    (product_id, scraped_at),
                )
        conn.commit()
    except Exception as exc:
        logger.error("Failed writing not-seen rows: %s", exc, exc_info=True)
        conn.rollback()
    finally:
        self.pool.putconn(conn)
```

### Decimal → psycopg2 Conversion

`psycopg2` handles `Decimal` natively — no manual conversion needed. Do NOT convert to `float`. Pass `Decimal` objects directly to `%s` params; psycopg2 maps them to PostgreSQL `NUMERIC`.

```python
# ✅ Correct
cur.execute("INSERT INTO price_history (price, ...) VALUES (%s, ...)", (item["price"], ...))

# ❌ Wrong — loses precision
cur.execute("INSERT INTO price_history (price, ...) VALUES (%s, ...)", (float(item["price"]), ...))
```

### scraped_at Timestamps

Always `datetime.now(timezone.utc)` — NEVER `datetime.now()`:

```python
from datetime import datetime, timezone

scraped_at = datetime.now(timezone.utc)  # ✅
# datetime.now()  # ❌ ZABRONIONE — naive datetime rejected by TIMESTAMPTZ
```

### Spider Must Expose `store_id`

Both `ThreeTrolleSpider` and `AlePlanszowkiSpider` (Story 2.1) already have `store_id` hardcoded. Verify:

```python
class ThreeTrolleSpider(scrapy.Spider):
    store_id = 1  # DatabasePipeline reads spider.store_id
```

```python
class AlePlanszowkiSpider(scrapy.Spider):
    store_id = 2
```

If missing as a class attribute, add it (don't change existing logic).

### Per-Item Error Handling Pattern

```python
def process_item(self, item, spider):
    try:
        product_id = self._upsert_product(item)
        self._insert_price_history(product_id, item)
        self.products_scraped += 1
    except Exception as exc:
        logger.error(
            "DB write failed for item %s from %s: %s",
            item.get("url"),
            spider.name,
            exc,
            exc_info=True,
        )
        self.errors += 1
        # DO NOT raise — continue with next item
    return item  # Scrapy convention: always return item
```

### Testing Strategy — Mock psycopg2

Never hit the real DB in tests. Use `unittest.mock.patch` to mock the pool and cursor:

```python
from unittest.mock import MagicMock, patch, call
from scraper.pipelines.database import DatabasePipeline

@patch("scraper.pipelines.database.psycopg2.pool.ThreadedConnectionPool")
def test_open_spider_inserts_scrape_run(mock_pool_cls):
    mock_pool = MagicMock()
    mock_pool_cls.return_value = mock_pool

    mock_conn = MagicMock()
    mock_pool.getconn.return_value = mock_conn
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    mock_cursor.fetchone.return_value = [42]  # scrape_run_id

    pipeline = DatabasePipeline()
    spider = MagicMock()
    spider.store_id = 1

    with patch.dict("os.environ", {"DATABASE_URL": "postgresql://test"}):
        pipeline.open_spider(spider)

    assert pipeline.scrape_run_id == 42
    assert pipeline.store_id == 1
```

### File Locations

```
scraper/
  scraper/
    settings.py               ← UPDATE: add DatabasePipeline at priority 400
    pipelines/
      __init__.py             ← DO NOT TOUCH
      validation.py           ← DO NOT TOUCH (Story 2.1)
      database.py             ← NEW
  tests/
    test_database_pipeline.py ← NEW
```

**DO NOT touch:**
- `scraper/scraper/items.py` — Story 1.2b
- `scraper/scraper/pipelines/validation.py` — Story 2.1
- `scraper/scraper/spiders/` — Story 2.1
- `scraper/utils/` — other stories
- `web/` — Dev A territory

### What This Story Does NOT Include

- `DeduplicationPipeline` (Story 2.2) — builds on this pipeline's foundation
- `bgg_client.py` completion (Story 2.4)
- `scraper.yml` GitHub Actions workflow (Story 2.5)
- `db_health.py` (Story 2.5)
- Selector health tests (Story 2.6)
- Alert engine (Epic 6)

### Existing Test Baseline

64 tests currently passing (run `cd scraper && uv run pytest -v` to verify):
- `tests/test_items.py` — 16 tests
- `tests/test_bgg_client.py` — 13 tests
- `tests/test_price_parser.py` — 12 tests
- `tests/test_three_trolle.py` — 11 tests
- `tests/test_ale_planszowki.py` — 12 tests

All must remain green after this story.

---

## File Locations Summary

| File | Action |
|------|--------|
| `scraper/scraper/pipelines/database.py` | NEW |
| `scraper/scraper/settings.py` | UPDATE (add DatabasePipeline at 400) |
| `scraper/tests/test_database_pipeline.py` | NEW |
| `web/src/db/schema.ts` | POSSIBLY UPDATE (add UNIQUE constraint on products) |

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

- **Task 4 (prerequisite):** `schema.ts` lacked UNIQUE on `(store_id, external_id)`. Added constraint `products_store_external_unique`, migration `0002_products_store_external_unique.sql`, updated `_journal.json`. Pipeline uses `ON CONFLICT DO UPDATE`.
- **Spider class attributes:** Added `store_id = STORE_ID` to `ThreeTrolleSpider` and `AlePlanszowkiSpider` so `DatabasePipeline` can read `spider.store_id`.
- **`database.py`:** `ThreadedConnectionPool(minconn=1, maxconn=5)`, `open_spider` inserts scrape_run (status='failed') + loads known products, `process_item` upserts product + inserts price_history + tracks seen external_ids, `close_spider` writes not-seen rows (in_stock=False, price=NULL) + finalizes scrape_run (success/partial by error count) + closes pool. Per-item errors log+continue, never abort.
- **game_id/bgg_id:** `_upsert_product` uses `COALESCE(EXCLUDED.game_id, products.game_id)` — preserves existing value when Story 2.2 hasn't set it yet.
- **Tests:** 21 tests, all mocked (no real DB). Full suite: 85/85 passed.

### File List

- `scraper/scraper/pipelines/database.py` — NEW
- `scraper/scraper/settings.py` — MODIFIED (added DatabasePipeline at priority 400)
- `scraper/tests/test_database_pipeline.py` — NEW (21 tests)
- `web/src/db/schema.ts` — MODIFIED (unique constraint on products)
- `db/migrations/0002_products_store_external_unique.sql` — NEW
- `db/migrations/meta/_journal.json` — MODIFIED (added entry for 0002)
- `scraper/scraper/spiders/three_trolle.py` — MODIFIED (added store_id class attribute)
- `scraper/scraper/spiders/ale_planszowki.py` — MODIFIED (added store_id class attribute)
