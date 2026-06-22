---
story_id: "2.6"
story_key: "2-6-operator-monitoring-selector-health"
epic: 2
epic_title: "Automated Price Data Collection"
status: "review"
dev: "Dev B (Scraper/Infra)"
depends_on: "Story 2.1 (done ✅), Story 2.3 (done ✅ — scrape_runs table needed for 80% check)"
baseline_commit: "03c07f0"
---

# Story 2.6: Operator Monitoring & Selector Health Tests

**Status:** review
**Epic:** 2 — Automated Price Data Collection
**Dev:** Dev B (Scraper/Infra)

---

## User Story

As a **developer**,
I want daily live selector smoke tests and automated alerts for product count drops,
So that scraper breakage is caught within 24 hours and the operator is notified before users see stale data.

---

## Acceptance Criteria

### AC-1 — test_live_selectors.py fetches live pages and validates selectors

**Given** `scraper/tests/test_live_selectors.py` run in `selector-health.yml`
**When** executed (only in CI, never per-push)
**Then** it fetches 1 listing page per Store via real HTTP, constructs a Scrapy `HtmlResponse`, runs the spider's listing CSS selectors, and asserts ≥ 1 product URL extracted
**And** for each extracted product URL, fetches the product page, runs `parse_product()` selector against live HTML, asserts `price` is not None
**And** test failure → CI marks run as failed → GitHub Actions sends failure notification to operator (NFR-6)

### AC-2 — selector-health.yml complete (replaces placeholder)

**Given** `.github/workflows/selector-health.yml`
**When** running at `cron: '0 8 * * *'`
**Then** it installs dependencies with `uv sync`, runs `pytest -m live scraper/tests/test_live_selectors.py` (NOT the full scraper)
**And** the entire workflow completes under 3 minutes (`timeout-minutes: 3` on the job)
**And** `workflow_dispatch:` trigger is preserved (manual run option)

### AC-3 — db_health.py: 80% rolling average check

**Given** `scraper/utils/db_health.py` called after each Scrape Cycle (by `scraper.yml` in Story 2.5)
**When** it runs
**Then** for each Store it queries `scrape_runs` for the last 7 days of `products_scraped` counts
**And** if the most recent cycle's `products_scraped` < 80% of that 7-day rolling average, it logs a CRITICAL alert with: store name, current count, rolling average, percentage
**And** it exits with code 1 on any breach (GitHub Actions sends failure notification)
**And** if fewer than 7 `scrape_runs` rows exist for a Store, the 80% check is **skipped** for that Store (insufficient baseline — AC explicitly)

### AC-4 — pytest `live` marker configured

**Given** `scraper/pytest.ini` (or `scraper/pyproject.toml` `[tool.pytest.ini_options]`)
**When** reviewed
**Then** `live` marker is registered: `live: marks tests that make real HTTP requests (deselect with -m "not live")`
**And** running `pytest` without `-m live` in a regular test run does NOT execute live tests (the marker deselects them unless explicitly requested)

### AC-5 — all 103 existing tests remain green, zero regressions

**Given** full test suite run via `cd scraper && python -m pytest` (without `-m live`)
**When** executed
**Then** all 103 tests pass — 64 (2.1) + 21 (2.3) + 18 (2.2 unit tests that don't require live DB) pass with no regressions

---

## Tasks / Subtasks

- [x] Task 1 — Register `live` pytest marker
  - [x] Check if `scraper/pytest.ini` exists; if not, add `[tool.pytest.ini_options]` to `scraper/pyproject.toml`
  - [x] Add marker: `markers = ["live: marks tests that make real HTTP requests"]`
  - [x] Verify `pytest -m "not live"` runs without warnings

- [x] Task 2 — Create `scraper/tests/test_live_selectors.py`
  - [x] Use `httpx` (already a dep from bgg_client.py) to fetch live listing pages
  - [x] Construct `scrapy.http.HtmlResponse` from response bytes (same pattern as fixture tests)
  - [x] Test 3Trolle: fetch `https://3trolle.pl/12-gry-planszowe`, assert ≥ 1 product href extracted via `article.product-miniature .product-title a::attr(href)`
  - [x] Test AlePlanszowki: fetch `https://aleplanszowki.pl/368-gry-planszowe-i-towarzyskie`, assert ≥ 1 product href extracted via same selector
  - [x] For each store, follow first product href and assert `price` is not None after `parse_product()`
  - [x] Mark all test functions with `@pytest.mark.live`
  - [x] Use `logging.getLogger(__name__)` for any debug output — never `print()`

- [x] Task 3 — Complete `selector-health.yml` (replace placeholder step)
  - [x] Replace the placeholder step with real install + run steps
  - [x] `pip install uv` → `cd scraper && uv sync`
  - [x] Run: `cd scraper && uv run pytest -m live tests/test_live_selectors.py -v`
  - [x] Set `timeout-minutes: 3` on the job
  - [x] Verify `cron: '0 8 * * *'` and `workflow_dispatch:` are present

- [x] Task 4 — Create `scraper/utils/db_health.py`
  - [x] `check_product_count_baseline(conn)`: query last 7 days of `scrape_runs` per store, compute rolling avg, flag breach
  - [x] Breach: `sys.exit(1)` so GitHub Actions marks run failed
  - [x] Skip check for stores with < 7 data points (not enough baseline)
  - [x] Load `DATABASE_URL` via `python-dotenv` (same as `database.py` pattern)
  - [x] `if __name__ == "__main__"`: open psycopg2 connection, call check, close
  - [x] Note: Story 2.5 will add `check_database_size()` to this same file later

- [x] Task 5 — Run full suite to confirm no regressions
  - [x] `cd scraper && python -m pytest` (without `-m live`) → 103/103 passed, 4 deselected

---

## Dev Notes

### Fetching Live Pages in Tests

Use `httpx` (already installed — used in `bgg_client.py`) plus `scrapy.http.HtmlResponse` to wrap the response. This is the same pattern used in fixture tests but with real HTTP:

```python
import httpx
import pytest
from scrapy.http import HtmlResponse

from scraper.spiders.three_trolle import ThreeTrolleSpider
from scraper.spiders.ale_planszowki import AlePlanszowkiSpider

USER_AGENT = "agregator-planszowkowy-health-check/1.0"

def _fetch(url: str) -> HtmlResponse:
    resp = httpx.get(url, headers={"User-Agent": USER_AGENT}, follow_redirects=True, timeout=30)
    resp.raise_for_status()
    return HtmlResponse(url=str(resp.url), body=resp.content)


@pytest.mark.live
class TestThreeTrolleLiveSelectors:
    def test_listing_yields_product_urls(self):
        spider = ThreeTrolleSpider()
        response = _fetch(spider.start_urls[0])
        hrefs = response.css("article.product-miniature .product-title a::attr(href)").getall()
        assert len(hrefs) >= 1, "No product hrefs found on 3Trolle listing page"

    def test_product_page_has_price(self):
        spider = ThreeTrolleSpider()
        listing = _fetch(spider.start_urls[0])
        first_href = listing.css(
            "article.product-miniature .product-title a::attr(href)"
        ).get()
        assert first_href, "No product href available to test"
        product_response = _fetch(first_href)
        items = list(spider.parse_product(product_response))
        assert items, "parse_product yielded nothing"
        assert items[0].get("price") is not None, "price is None on live product page"
```

Same pattern for AlePlanszowkiSpider.

### pytest.ini marker registration

If `scraper/pytest.ini` doesn't exist, add to `scraper/pyproject.toml`:

```toml
[tool.pytest.ini_options]
markers = [
    "live: marks tests that make real HTTP requests (deselect with -m 'not live')",
]
```

Check which config file currently exists before deciding — don't create both.

### selector-health.yml complete step

```yaml
steps:
  - uses: actions/checkout@v4

  - name: Set up Python
    uses: actions/setup-python@v5
    with:
      python-version: '3.11'

  - name: Install uv
    run: pip install uv

  - name: Install dependencies
    run: cd scraper && uv sync

  - name: Run live selector tests
    run: cd scraper && uv run pytest -m live tests/test_live_selectors.py -v
```

Do NOT add `DATABASE_URL` secret here — live selector tests fetch public store pages only, no DB needed.

### db_health.py 80% rolling average

```python
import logging
import os
import sys
from datetime import datetime, timedelta, timezone

import psycopg2
from dotenv import load_dotenv

logger = logging.getLogger(__name__)


def check_product_count_baseline(conn) -> bool:
    """Returns True if all stores are healthy, False if any breach detected."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    breach_detected = False

    with conn.cursor() as cur:
        # Get distinct store_ids with recent scrape_runs
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
                "Store %s: only %d scrape_runs in 7 days — skipping baseline check",
                store_id, len(counts),
            )
            continue

        # Most recent count vs average of the rest
        current = counts[0]
        avg = sum(counts[1:]) / len(counts[1:])
        threshold = avg * 0.8

        if current < threshold:
            logger.critical(
                "OPERATOR ALERT — Store %s product count dropped below 80%% baseline: "
                "current=%d, 7-day avg=%.1f, threshold=%.1f (%.0f%%)",
                store_id, current, avg, threshold, (current / avg * 100) if avg else 0,
            )
            breach_detected = True

    return not breach_detected


if __name__ == "__main__":
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        logger.error("DATABASE_URL not set")
        sys.exit(1)

    conn = psycopg2.connect(database_url)
    try:
        healthy = check_product_count_baseline(conn)
    finally:
        conn.close()

    if not healthy:
        sys.exit(1)
```

### Store name lookup

`db_health.py` uses `store_id` (int) in logs. If you want the store name in the alert message, join with `stores` table:

```sql
SELECT s.name, sr.products_scraped
FROM scrape_runs sr JOIN stores s ON s.id = sr.store_id
WHERE sr.started_at >= %s ORDER BY sr.store_id, sr.started_at DESC
```

This is optional — store_id in the log is sufficient for MVP.

### What Story 2.5 will add to db_health.py

Story 2.5 extends `db_health.py` with:
```python
def check_database_size(conn) -> bool:
    """Alert if pg_database_size() > 400MB."""
```

Write your file to make this extension natural — e.g., `if __name__ == "__main__"` calls both checks in sequence.

### Files modified vs created

| File | Action | Notes |
|------|--------|-------|
| `scraper/tests/test_live_selectors.py` | CREATE | New file, uses `@pytest.mark.live` |
| `.github/workflows/selector-health.yml` | UPDATE | Replace placeholder step (lines 18–23) |
| `scraper/utils/db_health.py` | CREATE | New file, 80% check only; 2.5 adds size check |
| `scraper/pytest.ini` or `scraper/pyproject.toml` | UPDATE | Add `live` marker registration |

### Existing code to preserve

The existing `selector-health.yml` (lines 1–17) is correct — keep name, triggers, job name, runs-on, timeout-minutes. Only replace the `steps:` section.

The existing spider CSS selectors (from Story 2.1) are the source of truth for what to test:
- **3Trolle listing:** `article.product-miniature .product-title a::attr(href)`
- **3Trolle price:** `span.current-price::text`
- **AlePlanszowki listing:** same selector (both PrestaShop-based)
- **AlePlanszowki price:** `span.current-price::text, span.price::text`

### CLAUDE.md compliance checklist

- [ ] `logging.getLogger(__name__)` in all new files — never `print()`
- [ ] `datetime.now(timezone.utc)` in db_health.py — never `datetime.now()`
- [ ] No `float` anywhere — db_health.py doesn't use prices, N/A
- [ ] No inline DB queries in web components — N/A (Python-only story)
