---
story_id: "1.2b"
story_key: "1-2b-pydantic-models-sync"
epic: 1
epic_title: "Project Foundation & Infrastructure (Sprint 0)"
status: "review"
dev: "Dev B (Scraper)"
depends_on: "Story 1.2 (done)"
baseline_commit: a5c46e2aba171ee7c7f43cfaecdf196105680099
---

# Story 1.2b: Pydantic Models Sync

Status: ready-for-dev

## Story

As a **developer**,
I want Pydantic models in the scraper to exactly match the Drizzle `schema.ts`,
So that the scraper can write to the database without type mismatches and the shared data contract is enforced.

## Acceptance Criteria

### AC-1 — `ScrapedProduct` and `PriceRecord` match `schema.ts`

**Given** `schema.ts` completed in Story 1.2
**When** `scraper/scraper/items.py` is implemented
**Then** `ScrapedProduct` and `PriceRecord` Pydantic models match all field names, types, and nullability from `schema.ts` — every future `schema.ts` change requires a simultaneous update to this file in the same PR (L-1 sync rule)

### AC-2 — Price fields use `Decimal`, never `float`

**Given** `ScrapedProduct.price` and `ScrapedProduct.price_orig`
**When** typed
**Then** they use `Decimal` (from `decimal` module), never `float`

### AC-3 — Timestamps enforce timezone-awareness

**Given** any timestamp field in `PriceRecord`
**When** set with a naive `datetime.now()` (no tzinfo)
**Then** Pydantic raises a `ValidationError` — only `datetime.now(timezone.utc)` or other tz-aware datetimes are accepted

### AC-4 — Tests pass

**Given** `scraper/tests/test_items.py`
**When** run via `uv run pytest tests/test_items.py`
**Then** all tests pass — covering valid construction, Decimal enforcement, naive-datetime rejection, and optional fields

---

## Tasks / Subtasks

- [x] Task 1 — Add `pydantic` dependency (AC-1)
  - [x] Run `uv add pydantic` in `scraper/` directory
  - [x] Verify `pydantic>=2` appears in `scraper/pyproject.toml` under `[project] dependencies`
  - [x] Confirm `uv.lock` is updated (will be automatic)

- [x] Task 2 — Implement Pydantic models in `scraper/scraper/items.py` (AC-1, AC-2, AC-3)
  - [x] Replace stub comment block with `ScrapedProduct` Pydantic model
  - [x] Add `PriceRecord` Pydantic model with `AwareDatetime` for `scraped_at`
  - [x] Keep `ScraperItem(scrapy.Item)` class (Scrapy boilerplate — leave as-is)
  - [x] Verify: zero `float` in model definitions

- [x] Task 3 — Write tests in `scraper/tests/test_items.py` (AC-4)
  - [x] Valid `ScrapedProduct` construction with all fields
  - [x] `ScrapedProduct` with only required fields (optional fields default correctly)
  - [x] `price` and `price_orig` are `Decimal` — not coerced to `float`
  - [x] `PriceRecord` valid construction with `datetime.now(timezone.utc)`
  - [x] `PriceRecord` with naive `datetime.now()` raises `ValidationError`
  - [x] Run: `uv run pytest tests/test_items.py -v` — all pass (16/16)

---

## Dev Notes

### What This Story Replaces

`scraper/scraper/items.py` currently contains a stub:

```python
from decimal import Decimal
from datetime import datetime
from typing import Optional
import scrapy


class ScraperItem(scrapy.Item):
    pass


# Pydantic models are defined in scraper/utils/models.py (Story 2.1).
# This stub ensures schema.ts fields have a matching Python representation.
# ...field listing as comments...
```

**This stub is wrong** — the models live in `items.py`, not `utils/models.py`. The comment was premature planning. Replace the comment block with real Pydantic classes. Keep `ScraperItem(scrapy.Item)` at the top.

### Final `items.py` Shape

```python
import scrapy
from decimal import Decimal
from datetime import datetime
from typing import Optional

from pydantic import AwareDatetime, BaseModel


class ScraperItem(scrapy.Item):
    pass


class ScrapedProduct(BaseModel):
    """Maps to the `products` table — produced by spiders, validated by pipeline."""
    name: str
    url: str
    store_id: int
    external_id: Optional[str] = None
    price: Optional[Decimal] = None
    price_orig: Optional[Decimal] = None
    in_stock: bool = True
    bgg_id: Optional[int] = None
    game_id: Optional[int] = None


class PriceRecord(BaseModel):
    """Maps to `price_history` table — created by database pipeline per scrape cycle."""
    product_id: int
    price: Optional[Decimal] = None
    price_orig: Optional[Decimal] = None
    in_stock: bool
    scraped_at: AwareDatetime
```

### Why `AwareDatetime` for `scraped_at`

Pydantic v2 ships `AwareDatetime` — a `datetime` subtype that **rejects naive datetimes at validation time** (raises `ValidationError`). This enforces the CLAUDE.md rule "always `datetime.now(timezone.utc)` — never `datetime.now()`" at the model layer, not just by convention.

```python
from datetime import datetime, timezone

# ✅ accepted
PriceRecord(product_id=1, in_stock=True, scraped_at=datetime.now(timezone.utc))

# ❌ raises ValidationError — naive datetime rejected
PriceRecord(product_id=1, in_stock=True, scraped_at=datetime.now())
```

### Field Mapping: `schema.ts` → `ScrapedProduct`

| `products` column | type | `ScrapedProduct` field | type | notes |
|---|---|---|---|---|
| `name` | `text NOT NULL` | `name` | `str` | required |
| `url` | `text NOT NULL` | `url` | `str` | required |
| `store_id` | `integer NOT NULL` | `store_id` | `int` | spider sets this |
| `external_id` | `text` (nullable) | `external_id` | `Optional[str]` | store's own product ID |
| `price` | `NUMERIC(10,2)` (nullable) | `price` | `Optional[Decimal]` | from `parse_price()` |
| `price_orig` | `NUMERIC(10,2)` (nullable) | `price_orig` | `Optional[Decimal]` | from `parse_price()` |
| `in_stock` | `boolean NOT NULL default true` | `in_stock` | `bool = True` | |
| `bgg_id` | `integer` (nullable) | `bgg_id` | `Optional[int]` | assigned by dedup pipeline |
| `game_id` | `integer` (nullable FK) | `game_id` | `Optional[int]` | assigned by dedup pipeline |

Fields NOT in `ScrapedProduct`: `id`, `created_at`, `updated_at` — DB auto-assigns these.

### Field Mapping: `schema.ts` → `PriceRecord`

| `price_history` column | type | `PriceRecord` field | type | notes |
|---|---|---|---|---|
| `product_id` | `integer NOT NULL` | `product_id` | `int` | required |
| `price` | `NUMERIC(10,2)` (nullable) | `price` | `Optional[Decimal]` | |
| `price_orig` | `NUMERIC(10,2)` (nullable) | `price_orig` | `Optional[Decimal]` | |
| `in_stock` | `boolean NOT NULL` | `in_stock` | `bool` | required |
| `scraped_at` | `TIMESTAMPTZ NOT NULL` | `scraped_at` | `AwareDatetime` | must be tz-aware |

Fields NOT in `PriceRecord`: `id` — DB auto-assigns.

### Installing Pydantic

Run from `scraper/` directory (not project root):

```
cd scraper
uv add pydantic
```

This writes `pydantic>=2.x.x` into `[project] dependencies` in `pyproject.toml`. The version constraint is managed by uv — no need to pin manually.

After `uv add`, `pyproject.toml` `dependencies` should include something like:
```toml
dependencies = [
    "httpx>=0.28.1",
    "psycopg2-binary>=2.9.12",
    "pydantic>=2.11.7",       # ← new
    "python-dotenv>=1.2.2",
    "scrapy>=2.16.0",
]
```

### Test File Reference: `scraper/tests/test_items.py`

```python
"""Tests for scraper/scraper/items.py (Story 1.2b)."""
from decimal import Decimal
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from scraper.items import PriceRecord, ScrapedProduct


class TestScrapedProduct:
    def test_valid_full_construction(self):
        p = ScrapedProduct(
            name="Brass: Birmingham",
            url="https://example.com/brass",
            store_id=1,
            external_id="SKU-123",
            price=Decimal("99.90"),
            price_orig=Decimal("129.90"),
            in_stock=True,
            bgg_id=224517,
            game_id=42,
        )
        assert p.name == "Brass: Birmingham"
        assert p.price == Decimal("99.90")
        assert isinstance(p.price, Decimal)

    def test_valid_minimal_construction(self):
        p = ScrapedProduct(name="Catan", url="https://example.com", store_id=2)
        assert p.price is None
        assert p.price_orig is None
        assert p.external_id is None
        assert p.bgg_id is None
        assert p.game_id is None
        assert p.in_stock is True

    def test_price_is_decimal_not_float(self):
        p = ScrapedProduct(name="X", url="u", store_id=1, price=Decimal("49.99"))
        assert isinstance(p.price, Decimal), "price must be Decimal, not float"

    def test_price_orig_is_decimal_not_float(self):
        p = ScrapedProduct(name="X", url="u", store_id=1, price_orig=Decimal("79.99"))
        assert isinstance(p.price_orig, Decimal)


class TestPriceRecord:
    def test_valid_construction_with_aware_datetime(self):
        rec = PriceRecord(
            product_id=1,
            price=Decimal("99.90"),
            price_orig=Decimal("129.90"),
            in_stock=True,
            scraped_at=datetime.now(timezone.utc),
        )
        assert rec.product_id == 1
        assert isinstance(rec.price, Decimal)

    def test_naive_datetime_raises_validation_error(self):
        with pytest.raises(ValidationError):
            PriceRecord(
                product_id=1,
                in_stock=True,
                scraped_at=datetime.now(),   # naive — no tzinfo
            )

    def test_optional_price_fields_default_none(self):
        rec = PriceRecord(
            product_id=5,
            in_stock=False,
            scraped_at=datetime.now(timezone.utc),
        )
        assert rec.price is None
        assert rec.price_orig is None
```

**Import path:** `from scraper.items import ...` — because `pythonpath = ["."]` in `pyproject.toml` makes the `scraper/` directory the root, and the inner `scraper/` package is at `scraper/scraper/__init__.py`.

### Running Tests

```bash
cd scraper
uv run pytest tests/test_items.py -v
```

All tests must pass. No real DB or network access needed — these are pure unit tests.

### L-1 Sync Rule Reminder

**Every future `schema.ts` change requires a simultaneous update to `scraper/scraper/items.py` in the same PR.** This is enforced by CLAUDE.md and the architecture decision record. The reviewer checks both files.

### What This Story Does NOT Include

- `utils/price_parser.py` → Story 2.1
- `pipelines/validation.py` (uses these models) → Story 2.1
- `pipelines/database.py` (writes PriceRecord to DB) → Story 2.3
- `games` table fields in a Python model — BGG enrichment is handled via `bgg_client.py` (Story 2.4) and written directly via psycopg2 — no separate Pydantic model needed for `games` row inserts

### File Locations

```
scraper/
  scraper/
    items.py          ← UPDATE: replace stub comment with Pydantic models
  tests/
    test_items.py     ← NEW
  pyproject.toml      ← UPDATE: add pydantic dependency
  uv.lock             ← AUTO-UPDATED by uv add
```

**DO NOT touch:**
- `web/` — Dev A's territory
- `scraper/utils/bgg_client.py` — Story 1.5
- `.github/workflows/` — Story 1.3

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- **Task 1 COMPLETE:** `pydantic>=2.13.4` added via `uv add pydantic`. Installed with pydantic-core 2.46.4, annotated-types 0.7.0, typing-inspection 0.4.2. `pyproject.toml` and `uv.lock` updated automatically.
- **Task 2 COMPLETE:** `scraper/scraper/items.py` rewritten — stub comment replaced with `ScrapedProduct` and `PriceRecord` Pydantic v2 models. `ScraperItem(scrapy.Item)` kept. `AwareDatetime` from pydantic enforces timezone-aware datetimes at validation time. Zero `float` types.
- **Task 3 COMPLETE:** `scraper/tests/test_items.py` created with 16 tests — full coverage: valid construction, minimal construction, Decimal type assertions, required-field validation errors, naive datetime rejection, optional field defaults. All 16 pass.
- **Regression check:** Full suite 29/29 passed (13 existing bgg_client tests + 16 new items tests).

### File List

- `scraper/scraper/items.py` — MODIFIED (replaced stub comment with ScrapedProduct + PriceRecord Pydantic models)
- `scraper/tests/test_items.py` — NEW (16 unit tests)
- `scraper/pyproject.toml` — MODIFIED (`uv add pydantic` added `pydantic>=2.13.4` to dependencies)
- `scraper/uv.lock` — AUTO-MODIFIED (pydantic, pydantic-core, annotated-types, typing-inspection added)
