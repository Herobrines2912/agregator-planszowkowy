---
story_id: "2.1"
story_key: "2-1-scrapy-spiders"
epic: 2
epic_title: "Automated Price Data Collection"
status: "review"
dev: "Dev B (Scraper)"
depends_on: "Story 1.2b (done ✅), Story 1.3 (done ✅), Story 1.5 (BGG token pending — does NOT block 2.1), Story 1.6 (done ✅, GameUPC GO)"
baseline_commit: "9ccf6d3"
---

# Story 2.1: Scrapy Spiders — ThreeTrolleSpider & AlePlanszowkiSpider

**Status:** ready-for-dev
**Epic:** 2 — Automated Price Data Collection
**Dev:** Dev B (Scraper/Infra)
**Mock data OK:** N/A — spiders hit live stores, tests use fixture HTML

---

## User Story

As a **developer**,
I want working Scrapy spiders for both v1 Stores that extract products and validate them with Pydantic,
So that the scraping pipeline has a reliable, tested data source before deduplication or enrichment is built.

---

## Acceptance Criteria

### AC-1 — Both spiders extract required fields from live stores

**Given** `ThreeTrolleSpider` and `AlePlanszowkiSpider`
**When** each spider runs against live Store pages
**Then** each scraped item contains: `store_sku`, `name`, `url`, `price` (Decimal or None), `price_orig` (Decimal or None), `in_stock` (bool), `ean` (str or None)
**And** items missing required fields (`name`, `url`, `store_id`) are dropped with an `errback` log entry — no partial records written to DB

### AC-2 — `parse_price()` handles all edge cases

**Given** `scraper/utils/price_parser.py`
**When** `parse_price()` is called with: `"99,90 zł"`, `"99.90 zł"`, `"od 99 zł"`, `"0 zł"`, `""`, `None`
**Then** it returns correct `Decimal` values for valid inputs and `None` for empty/null inputs
**And** `tests/test_price_parser.py` covers all these edge cases and passes

### AC-3 — Scrapy settings comply with ethics and CLAUDE.md

**Given** Scrapy settings in `scraper/scraper/settings.py`
**When** a spider runs
**Then** `ROBOTSTXT_OBEY = True` (already set), `DOWNLOAD_DELAY = 1` (already set), `USER_AGENT` contains `"agregator-cen-planszowek"` (project name per C-7 architecture rule)
**And** `CONCURRENT_REQUESTS_PER_DOMAIN = 1` is set (already set in current settings.py)

### AC-4 — Validation pipeline enforces Pydantic contract

**Given** the Pydantic validation pipeline (`scraper/scraper/pipelines/validation.py`)
**When** a scraped item passes through
**Then** `price = None` results in `in_stock = False` on the item
**And** `price = Decimal("0.00")` is a valid value and is NOT filtered out
**And** items that fail required-field validation are dropped (raise `DropItem`) with error logged

### AC-5 — ITEM_PIPELINES enabled in settings

**Given** `scraper/scraper/settings.py`
**When** reviewed
**Then** `ITEM_PIPELINES` is uncommented and includes `ValidationPipeline` at priority 200

### AC-6 — Fixture-based tests pass

**Given** `tests/test_three_trolle.py` and `tests/test_ale_planszowki.py` run against fixture HTML
**When** executed via `uv run pytest`
**Then** both pass, covering: price parsing, in_stock detection, EAN extraction, and missing-field handling

---

## Tasks / Subtasks

- [x] Task 0 — Inspect live HTML to determine selectors (BEFORE writing any spider code)
  - [x] Inspect 3trolle.pl product listing page in browser DevTools → identify CSS selectors for: product card container, name, price, original price, availability, product URL, EAN (check JSON-LD first)
  - [x] Inspect aleplanszowki.pl product listing page → same fields
  - [x] For each store, save robots.txt URL and crawl-delay if present
  - [x] Document selectors in dev notes at bottom of this file before proceeding

- [x] Task 1 — Refactor `pipelines.py` → `pipelines/` directory
  - [x] Create `scraper/scraper/pipelines/` directory
  - [x] Create `scraper/scraper/pipelines/__init__.py` (empty)
  - [x] Delete `scraper/scraper/pipelines.py` (stub — no real logic to preserve)

- [x] Task 2 — Implement `scraper/utils/price_parser.py`
  - [x] Implement `parse_price(raw: str | None) -> Decimal | None`
  - [x] Handle all AC-2 inputs: comma decimals, dot decimals, "od X zł" prefix, "0 zł", empty string, None

- [x] Task 3 — Implement `scraper/scraper/pipelines/validation.py`
  - [x] Create `ValidationPipeline` with `process_item()` method
  - [x] Drop items missing required fields (name, url, store_id) with `DropItem`
  - [x] Set `in_stock = False` when `price is None`
  - [x] Accept `price = Decimal("0.00")` as valid

- [x] Task 4 — Update `scraper/scraper/settings.py`
  - [x] Add `USER_AGENT = "agregator-cen-planszowek (+https://github.com/[your-repo])"`
  - [x] Uncomment and configure `ITEM_PIPELINES = {"scraper.pipelines.validation.ValidationPipeline": 200}`

- [x] Task 5 — Implement `scraper/scraper/spiders/three_trolle.py`
  - [x] Class `ThreeTrolleSpider(scrapy.Spider)` with `name = "three_trolle"`
  - [x] Set start URL(s) to 3Trolle listing page(s)
  - [x] Extract all required fields using selectors from Task 0
  - [x] Extract EAN from JSON-LD (`gtin13` field — confirmed in spike 1.6)
  - [x] Handle pagination: follow "next page" links until no next page
  - [x] Yield `ScrapedProduct`-compatible dicts (not ScraperItem — see Dev Notes)
  - [x] Set `store_id = 1` (hardcoded — stores table seeded in DB)

- [x] Task 6 — Implement `scraper/scraper/spiders/ale_planszowki.py`
  - [x] Class `AlePlanszowkiSpider(scrapy.Spider)` with `name = "ale_planszowki"`
  - [x] Same pattern as ThreeTrolleSpider, selectors from Task 0
  - [x] Handle pagination
  - [x] Set `store_id = 2`

- [x] Task 7 — Write tests
  - [x] `tests/test_price_parser.py` — cover AC-2 edge cases
  - [x] `tests/test_three_trolle.py` — fixture HTML, cover AC-6
  - [x] `tests/test_ale_planszowki.py` — fixture HTML, cover AC-6
  - [x] Run full suite: 64/64 passed (29 existing + 35 new) — zero regressions

---

## Dev Notes

### Critical: Spider Output Format

Spiders should yield **plain dicts** (not `ScraperItem` or `ScrapedProduct` instances) — this is Scrapy convention. The `ValidationPipeline` receives the dict, validates it, and constructs a `ScrapedProduct`. Do NOT try to yield `ScrapedProduct` directly from spider — Scrapy's item pipeline expects either `scrapy.Item` or a dict.

```python
# ✅ Correct spider yield
yield {
    "name": name,
    "url": response.url,
    "store_id": 1,
    "external_id": sku,
    "price": parse_price(raw_price),
    "price_orig": parse_price(raw_price_orig),
    "in_stock": availability,
    "ean": ean,
}

# ❌ Do NOT do this
yield ScrapedProduct(name=name, ...)  # Scrapy can't serialize Pydantic models
```

### Store ID Mapping

The `stores` table must have records before spiders run. For development/testing, hardcode:
- 3Trolle → `store_id = 1`
- AlePlanszówki → `store_id = 2`

In production, the `stores` table is seeded with the correct IDs. Story 2.3 handles DB writes, so the actual DB constraint doesn't apply to 2.1 (spiders just produce dicts).

### EAN Source — 3Trolle

From spike 1.6: 3Trolle embeds EAN in JSON-LD on product pages. Extract with:

```python
import json

def extract_ean_from_jsonld(response) -> str | None:
    for script in response.css('script[type="application/ld+json"]::text').getall():
        try:
            data = json.loads(script)
            if isinstance(data, list):
                for item in data:
                    if ean := item.get("gtin13") or item.get("gtin"):
                        return ean
            else:
                return data.get("gtin13") or data.get("gtin")
        except (json.JSONDecodeError, AttributeError):
            continue
    return None
```

This pattern yielded 22/22 EAN matches in the spike. Prioritize JSON-LD over CSS selectors for EAN.

### EAN Source — AlePlanszówki

Unknown — inspect manually in Task 0. Common locations:
- JSON-LD (`gtin13`, `gtin`)
- `<meta>` tags (e.g. `<meta property="product:ean">`)
- Data attributes on product elements

### `parse_price()` Implementation Contract

Architecture provides this exact implementation (do not deviate):

```python
import re
from decimal import Decimal

def parse_price(raw: str | None) -> Decimal | None:
    if not raw:
        return None
    raw = raw.strip()
    if not raw:
        return None
    # Remove "od " prefix, "zł" suffix, spaces, and non-numeric chars except , and .
    cleaned = re.sub(r'[^\d,.]', '', raw.replace('od ', '').replace('OD ', ''))
    cleaned = cleaned.replace(',', '.')
    # Handle trailing dot (e.g. "99.")
    cleaned = cleaned.rstrip('.')
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except Exception:
        return None
```

Edge cases that MUST pass:
- `"99,90 zł"` → `Decimal("99.90")`
- `"99.90 zł"` → `Decimal("99.90")`
- `"od 99 zł"` → `Decimal("99")`
- `"0 zł"` → `Decimal("0")`
- `""` → `None`
- `None` → `None`
- `"1 299,00 zł"` → `Decimal("1299.00")` (space as thousands separator)

### EAN Field — Critical Design Note

`ScrapedProduct` (items.py) does **NOT** have an `ean` field — it's not in the `products` table schema. But Story 2.2 (DeduplicationPipeline) needs EAN to call GameUPC API.

**Solution:** Spiders yield `ean` in the dict. `ValidationPipeline` validates required ScrapedProduct fields but **preserves the full dict including `ean`** — it does NOT convert to `ScrapedProduct.model_dump()` (which would lose `ean`). DeduplicationPipeline (Story 2.2) consumes `ean` from the dict, then it's discarded before DB write.

```
Spider yields dict with ean
    ↓ ValidationPipeline (validates, preserves full dict)
    ↓ DeduplicationPipeline (reads ean, assigns bgg_id/game_id — Story 2.2)
    ↓ DatabasePipeline (writes to DB, ean not in schema — ignored — Story 2.3)
```

### ValidationPipeline Structure

```python
import logging
from itemadapter import ItemAdapter
from scrapy.exceptions import DropItem

from scraper.items import ScrapedProduct

logger = logging.getLogger(__name__)

class ValidationPipeline:
    def process_item(self, item, spider):
        adapter = ItemAdapter(item)
        data = dict(adapter)

        # Required fields check
        required = ["name", "url", "store_id"]
        for field in required:
            if not data.get(field):
                raise DropItem(f"Missing required field '{field}' in item from {spider.name}")

        # AC-4: price=None forces in_stock=False
        if data.get("price") is None:
            data["in_stock"] = False

        # Validate core fields via Pydantic (strips unknown fields from model)
        # but return FULL dict to preserve 'ean' for DeduplicationPipeline (Story 2.2)
        pydantic_fields = {k: v for k, v in data.items()
                          if k in ScrapedProduct.model_fields}
        try:
            ScrapedProduct(**pydantic_fields)  # validate only — don't use return value
        except Exception as exc:
            logger.error("Pydantic validation failed for item %s: %s", data.get("url"), exc)
            raise DropItem(f"Pydantic validation failed: {exc}")

        # Return full dict (including ean) so downstream pipelines can access it
        return data
```

> Key: `ScrapedProduct(...)` is called for validation only. We return the original `data` dict (not `model_dump()`) to preserve `ean` for Story 2.2.

### Refactoring `pipelines.py` → `pipelines/`

Current: `scraper/scraper/pipelines.py` (stub, safe to delete)
Target: `scraper/scraper/pipelines/` directory

Steps:
1. Delete `scraper/scraper/pipelines.py`
2. Create `scraper/scraper/pipelines/__init__.py` (empty)
3. Create `scraper/scraper/pipelines/validation.py` (Task 3)

Update `settings.py` import path:
```python
ITEM_PIPELINES = {
    "scraper.pipelines.validation.ValidationPipeline": 200,
}
```

### Settings to Update

```python
# scraper/scraper/settings.py — changes needed:

# ADD (currently commented out with placeholder):
USER_AGENT = "agregator-cen-planszowek/0.1 (+https://github.com/[your-repo-url])"

# UNCOMMENT and set:
ITEM_PIPELINES = {
    "scraper.pipelines.validation.ValidationPipeline": 200,
}
```

Already correctly set (leave as-is):
```python
ROBOTSTXT_OBEY = True
CONCURRENT_REQUESTS_PER_DOMAIN = 1
DOWNLOAD_DELAY = 1
```

### Writing Fixture-Based Tests

Tests MUST use fixture HTML, NOT hit live URLs. This keeps tests fast, deterministic, and CI-safe.

Pattern for spider tests:

```python
# tests/test_three_trolle.py
from scrapy.http import HtmlResponse
from scraper.spiders.three_trolle import ThreeTrolleSpider

FIXTURE_HTML = """
<html>
  ... paste minimal HTML snippet from 3trolle.pl product listing ...
</html>
"""

def make_response(html: str, url: str = "https://3trolle.pl/kategoria/gry-planszowe") -> HtmlResponse:
    return HtmlResponse(url=url, body=html.encode("utf-8"))

class TestThreeTrolleSpider:
    def setup_method(self):
        self.spider = ThreeTrolleSpider()

    def test_extracts_product_name(self):
        response = make_response(FIXTURE_HTML)
        items = list(self.spider.parse(response))
        assert len(items) >= 1
        assert items[0]["name"] != ""

    def test_extracts_price_as_decimal(self):
        ...

    def test_out_of_stock_when_no_price(self):
        ...

    def test_extracts_ean_from_jsonld(self):
        ...
```

Save fixture HTML snippets as actual HTML in `tests/fixtures/` if they're large.

### What This Story Does NOT Include

- `pipelines/database.py` — Story 2.3
- `pipelines/deduplication.py` — Story 2.2
- `utils/bgg_client.py` completion — Story 2.4
- `selector-health.yml` / `test_live_selectors.py` — Story 2.6
- DB writes — spiders only yield dicts; pipeline chain (dedup + db) is built in 2.2/2.3

### BGG Token Status — Does NOT Block This Story

The BGG Bearer Token (Story 1.5) is still **PENDING**. This is fine — Story 2.1 does NOT need it. Spiders only extract product data from store pages. BGG integration starts in Story 2.2 (deduplication) and 2.4 (enrichment).

Story 2.2 depends on: `2.1 done ✅` + `1.5 done (BGG token)` + `1.6 done ✅ (GameUPC GO)`

### GameUPC Gate: GO

From spike 1.6: 22/22 EANs matched (100% coverage). Story 2.2 will implement EAN→GameUPC→BGG ID as the **primary deduplication path** (confirmed gate decision).

### Current Test Suite Baseline

29 tests already passing:
- `tests/test_items.py` — 16 tests (ScrapedProduct + PriceRecord)
- `tests/test_bgg_client.py` — 13 tests (BGG client)

All new tests must pass AND these 29 must remain green. Run full suite with:

```bash
cd scraper
uv run pytest -v
```

### `store_sku` vs `external_id` Naming Note

Story AC-1 mentions `store_sku` — this maps to `external_id` in `ScrapedProduct` (see items.py field mapping from Story 1.2b). The spider should yield it as `external_id`. The AC just uses `store_sku` as the semantic description.

---

## File Locations

```
scraper/
  scraper/
    items.py              ← DO NOT TOUCH (done in Story 1.2b)
    settings.py           ← UPDATE: add USER_AGENT, uncomment ITEM_PIPELINES
    pipelines.py          ← DELETE (replace with directory below)
    pipelines/
      __init__.py         ← NEW (empty)
      validation.py       ← NEW (ValidationPipeline)
    spiders/
      __init__.py         ← DO NOT TOUCH
      three_trolle.py     ← NEW (ThreeTrolleSpider)
      ale_planszowki.py   ← NEW (AlePlanszowkiSpider)
  utils/
    bgg_client.py         ← DO NOT TOUCH (Story 1.5 skeleton)
    price_parser.py       ← NEW (parse_price())
  tests/
    __init__.py           ← DO NOT TOUCH
    test_items.py         ← DO NOT TOUCH (Story 1.2b)
    test_bgg_client.py    ← DO NOT TOUCH (Story 1.5)
    test_price_parser.py  ← NEW
    test_three_trolle.py  ← NEW
    test_ale_planszowki.py ← NEW
    fixtures/             ← NEW directory (optional, for large HTML snippets)
```

**DO NOT touch:**
- `web/` — Dev A's territory
- `scraper/scraper/items.py` — Story 1.2b (done)
- `scraper/utils/bgg_client.py` — Story 1.5 (skeleton in place)
- `.github/workflows/` — Story 1.3 (done)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Selector Discovery Notes (Task 0 — fill before coding)

**Spider architecture: 2-pass** — listing page yields product URLs, product detail page yields all data.
Both stores run PrestaShop with nearly identical HTML structure.

**3Trolle (3trolle.pl):**
- Start URL(s): `https://3trolle.pl/12-gry-planszowe`
- Pagination: `a[rel="next"]::attr(href)` → `https://3trolle.pl/12-gry-planszowe?page=2`
- Product container (listing): `article.product-miniature[data-id-product]`
- Product URL (listing): `article.product-miniature h3.product-title a::attr(href)` (also `.product-title a`)
- Name (product page): `h1.page-title::text`
- Price current (product page): `span.current-price::text` → `"97,18 zł"` → `parse_price()`
- Price original (product page): `span.regular-price.text-muted::text` → `"109,99 zł"` → `parse_price()`
- EAN: JSON-LD `gtin13` on product page ✅ (confirmed spike 1.6 + Playwright)
- External_id: JSON-LD `sku` field (e.g. `"3T36569"`)
- Availability: JSON-LD `offers.availability` → `"https://schema.org/InStock"` | `"…/OutOfStock"` | `"…/PreOrder"`
- in_stock logic: `availability == "https://schema.org/InStock"` (PreOrder → False)
- robots.txt crawl-delay: none found; DOWNLOAD_DELAY=1 already set

**AlePlanszówki (aleplanszowki.pl):**
- Start URL(s): `https://aleplanszowki.pl/368-gry-planszowe-i-towarzyskie`
- Pagination: `a[rel="next"]::attr(href)` → `?page=2`
- Product container (listing): `article.product-miniature[data-id-product]`
- Product URL (listing): `article.product-miniature h2.product-title a::attr(href)`
- Name (product page): `h1.page-title::text` (same PrestaShop template)
- Price current (product page): `span.current-price::text` or `span.price::text`
- Price original (product page): `span.regular-price::text`
- EAN: JSON-LD `gtin13` on product page ✅ (confirmed Playwright — `"841333135904"`)
- External_id: JSON-LD `sku` field (e.g. `"30826"` = same as `data-id-product`)
- Availability: JSON-LD `offers.availability` (same schema.org values as 3Trolle)
- in_stock logic: `availability == "https://schema.org/InStock"`
- robots.txt crawl-delay: none found; DOWNLOAD_DELAY=1 already set

### Completion Notes List

- **Task 0 COMPLETE:** Selectors confirmed via Playwright browser inspection on live stores. Both 3Trolle and AlePlanszówki run PrestaShop with identical HTML. 2-pass spider design: listing page yields product URLs, product detail page yields all data including EAN from JSON-LD `gtin13`. 3Trolle `offers.availability` values: `InStock`/`OutOfStock`/`PreOrder`. `external_id` extracted from JSON-LD `sku` field.
- **Task 1 COMPLETE:** `scraper/scraper/pipelines.py` deleted (stub only). `scraper/scraper/pipelines/` directory created with `__init__.py`.
- **Task 2 COMPLETE:** `scraper/utils/price_parser.py` implemented — exact canonical implementation from architecture.md. Handles: comma/dot decimals, "od " prefix, "0 zł", empty string, None, space-as-thousands-separator (`"1 299,00 zł"` → `Decimal("1299.00")`). Returns `Decimal`, never `float`.
- **Task 3 COMPLETE:** `scraper/scraper/pipelines/validation.py` — `ValidationPipeline` implemented. Required fields check (drop on missing name/url/store_id), price=None→in_stock=False, Pydantic validation via `ScrapedProduct(**pydantic_fields)`. Returns full dict (preserves `ean` for Story 2.2 DeduplicationPipeline).
- **Task 4 COMPLETE:** `settings.py` updated — `USER_AGENT = "agregator-cen-planszowek/0.1 (+…)"`, `ITEM_PIPELINES = {"scraper.pipelines.validation.ValidationPipeline": 200}`.
- **Task 5 COMPLETE:** `ThreeTrolleSpider` — 2-pass: listing→product pages. JSON-LD extraction for EAN, SKU (external_id), availability. CSS for name (`h1.page-title`) and price (`span.current-price`, `span.regular-price.text-muted`). PreOrder→in_stock=False.
- **Task 6 COMPLETE:** `AlePlanszowkiSpider` — same 2-pass pattern as ThreeTrolleSpider. Same PrestaShop HTML structure, same JSON-LD `gtin13`/`sku`/`offers.availability` extraction. `store_id=2`.
- **Task 7 COMPLETE:** 35 new tests written (12 price_parser + 11 three_trolle + 12 ale_planszowki). Full suite: **64/64 passed** (29 existing + 35 new). Zero regressions. Fixture HTML in `tests/fixtures/` — no live network calls in tests.

### File List

- `scraper/scraper/pipelines.py` — DELETED (replaced by directory)
- `scraper/scraper/pipelines/__init__.py` — NEW (empty)
- `scraper/scraper/pipelines/validation.py` — NEW (ValidationPipeline)
- `scraper/scraper/settings.py` — MODIFIED (USER_AGENT, ITEM_PIPELINES)
- `scraper/scraper/spiders/three_trolle.py` — NEW (ThreeTrolleSpider)
- `scraper/scraper/spiders/ale_planszowki.py` — NEW (AlePlanszowkiSpider)
- `scraper/utils/price_parser.py` — NEW (parse_price())
- `scraper/tests/test_price_parser.py` — NEW (12 tests)
- `scraper/tests/test_three_trolle.py` — NEW (11 tests)
- `scraper/tests/test_ale_planszowki.py` — NEW (12 tests)
- `scraper/tests/fixtures/three_trolle_listing.html` — NEW
- `scraper/tests/fixtures/three_trolle_product.html` — NEW
- `scraper/tests/fixtures/three_trolle_product_instock.html` — NEW
- `scraper/tests/fixtures/ale_planszowki_listing.html` — NEW
- `scraper/tests/fixtures/ale_planszowki_product.html` — NEW
- `_bmad-output/implementation-artifacts/2-1-scrapy-spiders.md` — MODIFIED (status, tasks, notes)
