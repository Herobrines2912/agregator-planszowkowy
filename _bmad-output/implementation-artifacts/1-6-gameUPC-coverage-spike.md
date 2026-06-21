---
story_id: "1.6"
story_key: "1-6-gameUPC-coverage-spike"
epic: 1
epic_title: "Project Foundation & Infrastructure (Sprint 0)"
status: "review"
dev: "Dev B (Scraper/Infra)"
depends_on: "Story 1.5 (skeleton done, token pending)"
baseline_commit: "4b25539bcf162e66c54af9194d678d530cbf62a4"
---

# Story 1.6: GameUPC Coverage Spike

Status: ready-for-dev

## Story

As a **developer**,
I want GameUPC API tested against 20–30 Polish board game EANs,
so that the deduplication pipeline in Epic 2 uses the correct primary path without building on an untested assumption.

## Acceptance Criteria

### AC-1 — EANs collected and tested

**Given** 20–30 Polish board game EANs collected from 3Trolle or AlePlanszówki product pages
**When** queried against GameUPC API
**Then** `docs/spike-results/gameUPC-coverage.md` records: total tested, matched count, not-found count, and ≥ 3 example successful/failed lookups with EAN + title + result

### AC-2 — Gate decision: coverage ≥ 50%

**Given** coverage ≥ 50% of tested titles matched by GameUPC
**When** documented
**Then** decision recorded: `"EAN→GameUPC path implemented as primary in Epic 2 Story 2.2"`

### AC-3 — Gate decision: coverage < 50%

**Given** coverage < 50% of tested titles matched by GameUPC
**When** documented
**Then** decision recorded: `"EAN path removed — fuzzy name→BGG Search is sole primary path in Epic 2 Story 2.2"`

### AC-4 — Spike script committed

**Given** the test script used to run the lookups
**When** reviewed
**Then** `scraper/scripts/spike_gameupc.py` exists and is committed — uses `httpx`, uses `logging.getLogger(__name__)`, never `print()`
**And** script reads GameUPC API key (if required) from env var `GAMEUPC_API_KEY`, never hardcoded

---

## Tasks / Subtasks

- [x] Task 1 — Collect 20–30 EANs from live store pages (AC-1)
  - [x] Visit 3Trolle (https://www.3trolle.pl) product listing pages — inspect HTML for EAN/barcode field
  - [x] Visit AlePlanszówki (https://www.alepplanszowki.pl) product listing pages — same
  - [x] Collect EANs from at least 2 different product categories (base games + expansions) if possible
  - [x] Record each EAN with its product name (for result matching)
  - [x] Aim for variety: popular titles (Catan, Agricola) + Polish-exclusive titles (Neuroshima Hex, Pętle Czasu)

- [x] Task 2 — Discover GameUPC API endpoint and auth (AC-4)
  - [x] Visit https://www.gameupc.com — check for API documentation / developer section
  - [x] Determine if API key is required or if it's open (some plans are free-tier)
  - [x] If key required: register for free tier, store in `scraper/.env` as `GAMEUPC_API_KEY`
  - [x] Identify the lookup endpoint format (typically `GET /api/v1/game/barcode/{ean}` or similar)

- [x] Task 3 — Write and run spike script (AC-1, AC-4)
  - [x] Create `scraper/scripts/spike_gameupc.py` per the template in Dev Notes below
  - [x] Run script against collected EANs
  - [x] Save raw output for documentation

- [x] Task 4 — Document results and write gate decision (AC-1, AC-2 or AC-3)
  - [x] Create `docs/spike-results/gameUPC-coverage.md` with full results table
  - [x] Compute coverage % = matched / total_tested
  - [x] Write explicit gate line: `Epic 2 Story 2.2 EAN path: GO` or `SKIP`
  - [x] If GO: note which API endpoint and response field contains `bgg_id` (critical for Story 2.2)

---

## Dev Notes

### GameUPC API — What to Look For

GameUPC (https://www.gameupc.com) is a board game barcode lookup service. The likely endpoint pattern is:

```
GET https://www.gameupc.com/api/v1/game/barcode/{ean}
Authorization: Bearer {GAMEUPC_API_KEY}   # if auth required
```

Or possibly a query-param style:
```
GET https://www.gameupc.com/api/v1/search?barcode={ean}
```

**Key things to check in the response:**
- Does it return a `bgg_id` field? → This is the critical link to our deduplication pipeline
- Does it return a game name? → Useful for fuzzy-match validation
- What does a "not found" response look like? (404 vs 200 with empty body vs error field)

If GameUPC does NOT return `bgg_id` directly, check if it returns a BGGID, BoardGameGeek ID, or any cross-reference. Without this, even a 100% match rate doesn't help our pipeline — document and SKIP.

### Spike Script Template

Create `scraper/scripts/spike_gameupc.py`:

```python
"""
Spike: GameUPC EAN coverage test for Polish board games.
Story 1.6 — Dev B.

Run: cd scraper && python -m scripts.spike_gameupc
Requires: GAMEUPC_API_KEY in environment (if API requires auth)
"""
import logging
import os
import time
from decimal import Decimal

import httpx

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ── EANs collected from 3Trolle and AlePlanszówki ─────────────────────────────
# Format: (ean, product_name_as_shown_in_store)
TEST_EANS = [
    # Populate from Task 1 — add 20-30 entries here
    # ("5901234567890", "Catan (Osadnicy z Catanu)"),
    # ("5901234567891", "Neuroshima Hex 3.0"),
    # ...
]

GAMEUPC_BASE = "https://www.gameupc.com/api/v1"  # verify against actual API docs


def lookup_ean(client: httpx.Client, ean: str) -> dict | None:
    """Return API response dict or None if not found."""
    url = f"{GAMEUPC_BASE}/game/barcode/{ean}"
    headers = {}
    api_key = os.environ.get("GAMEUPC_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        response = client.get(url, headers=headers, timeout=10)
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as exc:
        logger.warning("HTTP %d for EAN %s: %s", exc.response.status_code, ean, exc)
        return None
    except Exception as exc:
        logger.error("Error for EAN %s: %s", ean, exc)
        return None


def main() -> None:
    matched = []
    not_found = []
    errors = []

    with httpx.Client() as client:
        for ean, name in TEST_EANS:
            logger.info("Testing EAN %s — %s", ean, name)
            result = lookup_ean(client, ean)
            time.sleep(0.5)  # be polite to the API

            if result is None:
                not_found.append((ean, name))
                logger.info("  → NOT FOUND")
            else:
                bgg_id = result.get("bgg_id") or result.get("bggId") or result.get("boardgamegeek_id")
                matched.append((ean, name, bgg_id, result))
                logger.info("  → MATCHED — bgg_id=%s", bgg_id)

    total = len(TEST_EANS)
    coverage = len(matched) / total * 100 if total else 0

    logger.info("=" * 60)
    logger.info("RESULTS: %d/%d matched (%.0f%%)", len(matched), total, coverage)
    logger.info("Gate: %s", "GO (≥50%%)" if coverage >= 50 else "SKIP (<50%%)")

    # Print summary for documentation
    logger.info("\nMatched examples:")
    for ean, name, bgg_id, _ in matched[:5]:
        logger.info("  EAN %s | %s | bgg_id=%s", ean, name, bgg_id)

    logger.info("\nNot-found examples:")
    for ean, name in not_found[:5]:
        logger.info("  EAN %s | %s", ean, name)


if __name__ == "__main__":
    main()
```

### `docs/spike-results/gameUPC-coverage.md` Template

```markdown
# Spike: GameUPC EAN Coverage Test

**Story:** 1.6
**Dev:** Dev B
**Date:** YYYY-MM-DD

## API Details

- Endpoint: `GET {actual endpoint used}`
- Auth required: yes/no
- BGG ID in response: yes (field: `{field_name}`) / no

## Test Corpus

EANs collected from: 3Trolle + AlePlanszówki
Total tested: N

## Results

| EAN | Store product name | GameUPC result | BGG ID returned |
|-----|-------------------|----------------|-----------------|
| 5901234567890 | Catan | ✅ matched | 13 |
| 5901234567891 | Neuroshima Hex | ❌ not found | — |
| ... | ... | ... | ... |

## Summary

- Matched: X / N (XX%)
- Not found: Y / N
- Errors: Z

## Gate Decision

Epic 2 Story 2.2 EAN path: **GO** / **SKIP**

Reason: [coverage XX% — above/below 50% threshold]

[If GO:] BGG ID field in response: `{field_name}` — deduplication pipeline must read this field.
[If SKIP:] Fuzzy name→BGG Search is sole primary dedup path in Story 2.2.
```

### File Locations (no conflict with Dev A)

```
scraper/
  scripts/
    spike_gameupc.py     ← NEW (spike only, not production pipeline)
docs/
  spike-results/
    gameUPC-coverage.md  ← NEW
```

`scraper/scripts/` is not `scraper/scraper/` — the scripts directory is for one-off utilities, not the Scrapy package.

**DO NOT touch:**
- `web/` — Dev A's territory
- `scraper/scraper/items.py` — done in Story 1.2b
- `scraper/utils/bgg_client.py` — done in Story 1.5
- `.github/workflows/` — done in Story 1.3
- `scraper/scraper/pipelines.py` — Epic 2 scope

### Python Dependencies

`httpx` already installed (Story 1.1 + used in `bgg_client.py`).
No new `uv add` commands needed.

### Logging Standard (CLAUDE.md)

```python
# ✅ always
logger = logging.getLogger(__name__)
logger.info("Testing EAN %s", ean)

# ❌ never
print(f"EAN: {ean}")
```

### EAN Sources — Where to Find Them on Store Pages

**3Trolle**: Product detail page → look for barcode/EAN in product specs table or structured data (`<script type="application/ld+json">` often contains `gtin13` or `ean`).

**AlePlanszówki**: Similar — product specs section, or `<meta property="product:retailer_item_id">` tag.

Alternatively use the scraper you've built earlier if available, or manually inspect DevTools → Elements panel.

### What This Story Produces

1. `docs/spike-results/gameUPC-coverage.md` — the gate document
2. `scraper/scripts/spike_gameupc.py` — committed spike script (future maintainability)
3. Gate decision that directly shapes Story 2.2 deduplication pipeline design

### What This Story Does NOT Include

- Production deduplication pipeline → Story 2.2
- GameUPC integration as permanent code → only if gate is GO and then only in Story 2.2
- Any DB writes → spike only reads from GameUPC API
- Spider or Scrapy integration → Epic 2

### Dependency Note: Story 1.5

Story 1.5 BGG token is still pending manual action (BGG application submission). Story 1.6 has **no hard dependency on a received BGG token** — it only depends on the `scraper/utils/` package existing (which it does from Story 1.5 skeleton). You can do this story while waiting for the BGG token.

### Previous Story Learnings (from 1.5 Dev Agent Record)

- Import path: `utils.bgg_client` not `scraper.utils.bgg_client` — `utils/` is at scraper root, not inside the inner `scraper/` package. Same applies to `scripts/`.
- `pyproject.toml` already has `pythonpath = ["."]` in `[tool.pytest.ini_options]` from Story 1.5 fix — run scripts from `scraper/` directory.
- `httpx` is available — no additional install needed.
- `scraper/.venv` exists and is functional.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- **Task 1 COMPLETE:** 22 EANs collected from 3Trolle product pages using Playwright browser + JSON-LD `gtin13` field extraction. AlePlanszówki was unreachable (ECONNREFUSED) — 3Trolle alone satisfies the AC ("3Trolle OR AlePlanszówki"). EAN variety: Polish publishers (590x prefix: Portal, Rebel, Bard, Foxgames, Granna, Awaken Realms), US (850x), European (632x), German (426x).
- **Task 2 COMPLETE:** GameUPC endpoint is `GET https://api.gameupc.com/test/upc/{ean}`. Auth required: `x-api-key` header. Public test key `test_test_test_test_test` found in gameupc.com/demo.html source — no registration needed for development. BGG ID returned in `bgg_info[0].id` field.
- **Task 3 COMPLETE:** `scraper/scripts/spike_gameupc.py` created and run. Result: 22/22 matched (100%). Script uses `logging.getLogger(__name__)`, never `print()`, uses `httpx`. Initial runs returned 403 (missing API key) — fixed by adding `x-api-key` header.
- **Task 4 COMPLETE:** `docs/spike-results/gameUPC-coverage.md` created with full 22-row results table, coverage 100%, and gate decision GO. `bgg_info[0].id` identified as the BGG ID field for Story 2.2.

### File List

- `scraper/scripts/__init__.py` — NEW (empty, makes scripts a Python package)
- `scraper/scripts/spike_gameupc.py` — NEW (spike script, 22 EANs, httpx, logging)
- `docs/spike-results/gameUPC-coverage.md` — NEW (results table + gate decision GO)
