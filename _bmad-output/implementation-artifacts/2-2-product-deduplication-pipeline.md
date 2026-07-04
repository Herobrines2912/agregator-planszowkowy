---
story_id: "2.2"
story_key: "2-2-product-deduplication-pipeline"
epic: 2
epic_title: "Automated Price Data Collection"
status: "review"
dev: "Dev B (Scraper)"
depends_on: "Story 2.1 (done ✅), Story 1.5 (BGG token PENDING — see notes), Story 1.6 (done ✅, GameUPC GO)"
baseline_commit: "9020a9900fc4fca085418a0323bc0e89ce8bc3be"
---

# Story 2.2: Product Deduplication Pipeline

**Status:** ready-for-dev
**Epic:** 2 — Automated Price Data Collection
**Dev:** Dev B (Scraper/Infra)
**Mock data OK:** Yes for unit tests (mocked HTTP + mocked DB); No for live run

---

## User Story

As a **developer**,
I want scraped products automatically linked to canonical Games via BGG ID,
So that the same board game across multiple stores is recognised as one entity and BGG metadata can be fetched once.

---

## BGG Token Status — Read Before Implementing

**BGG Bearer Token: PENDING** (`docs/spike-results/bgg-token.md` — token not yet received).

**Impact on this story:**
- **EAN → GameUPC path (primary):** ✅ Fully implementable NOW — GameUPC returns `bgg_info[0].id` directly, no BGG API call needed
- **Name fuzzy match path (fallback):** ⚠️ BGG Search API (`/xmlapi2/search`) is publicly accessible without auth (rate-limited), but architecture marks token as required. Implement the fallback with graceful degradation: if `BGG_API_TOKEN` env var is absent or BGG search returns HTTP error, log a warning and queue the item (`bgg_id = NULL`). The fallback will activate fully once the token arrives.

**Practical consequence:** At launch, all items with EANs (which is most Polish titles — spike: 100% hit rate) will be fully deduplicated. Items without EANs (or EAN misses) will queue until token is available and Story 2.4 runs.

---

## Acceptance Criteria

### AC-1 — EAN → GameUPC path (primary)

**Given** a scraped item where `item["ean"]` is a non-empty string
**When** `DeduplicationPipeline.process_item()` runs
**Then** it calls `GET https://api.gameupc.com/test/upc/{ean}` with header `x-api-key: {GAMEUPC_API_KEY}`
**And** on a successful response (`status == "ok"` and `bgg_info` non-empty), it sets `item["bgg_id"] = response["bgg_info"][0]["id"]`
**And** on no-match (HTTP 404 or empty `bgg_info`), it falls through to the name fuzzy match path

### AC-2 — Name fuzzy match fallback (BGG Search)

**Given** a scraped item where EAN path returned no match (or `ean` is None)
**When** the fuzzy match path runs
**Then** it normalises the product name (strip edition suffixes, publisher prefixes, Polish diacritics for matching) and queries `GET https://boardgamegeek.com/xmlapi2/search?query={normalized}&type=boardgame` with `Authorization: Bearer {BGG_API_TOKEN}` header
**And** it computes fuzzy similarity between each BGG result name and the normalised product name using `rapidfuzz.fuzz.WRatio`
**And** the top result with score ≥ 85 is auto-linked: `item["bgg_id"] = bgg_id_of_top_result`
**And** if no result scores ≥ 85, or if `BGG_API_TOKEN` env var is absent, the item is queued: `bgg_id` remains absent from item dict (NULL in DB)

### AC-3 — Game record created / found on BGG ID assignment

**Given** `item["bgg_id"]` is set (by either path)
**When** the pipeline writes to DB
**Then** it performs:
```sql
INSERT INTO games (slug, name, bgg_id, bgg_sync_status)
VALUES ('bgg-{bgg_id}', '{product_name}', {bgg_id}, 'pending')
ON CONFLICT (bgg_id) DO UPDATE SET updated_at = now()
RETURNING id
```
**And** sets `item["game_id"]` to the returned `id`
**And** `item["bgg_id"]` remains set so `DatabasePipeline._upsert_product()` writes it to `products.bgg_id` (the `COALESCE(EXCLUDED.bgg_id, products.bgg_id)` in the existing upsert handles this)

### AC-4 — Unmatched items queued transparently

**Given** an item that went through both EAN and name paths without a match
**When** pipeline finishes `process_item()`
**Then** `item` is returned WITHOUT `game_id` or `bgg_id` keys (or with `None` values)
**And** `DatabasePipeline` (downstream, priority 400) writes the product with `game_id = NULL` and `bgg_id = NULL` — queryable via `SELECT * FROM products WHERE bgg_id IS NULL`
**And** no exception is raised — the item continues through the pipeline

### AC-5 — Polish name normalisation

**Given** product names containing edition suffixes or publisher prefixes
**When** normalised before fuzzy matching
**Then** the following transformations are applied:
- Strip trailing edition markers: `" (edycja polska)"`, `" (Polish edition)"`, `" — {Publisher}"`, `" Deluxe"`, `" Edycja Rozszerzona"`, `" Base Game"`, `" Podstawowa"`
- Strip leading publisher labels: `"Lacerta:"`, `"Portal:"` etc.
- Lowercase for matching; original case preserved in item dict
- Polish → ASCII transliteration applied (ą→a, ę→e, ó→o, ś→s, ł→l, ź/ż→z, ć→c, ń→n) — this lets "Wsiąść do pociągu" match "Wsiasc do pociagu" and then fuzzy-match BGG's "Ticket to Ride" through WRatio

### AC-6 — GameUPC HTTP errors handled gracefully

**Given** GameUPC API returns HTTP 5xx or network timeout
**When** `DeduplicationPipeline` handles it
**Then** it logs at WARNING level with `exc_info=False` (non-critical failure), falls through to name fuzzy match, and does NOT raise

### AC-7 — ITEM_PIPELINES slot 300 activated

**Given** `scraper/scraper/settings.py`
**When** reviewed
**Then** `ITEM_PIPELINES` entry `"scraper.pipelines.deduplication.DeduplicationPipeline": 300` is uncommented/added
**And** pipeline order is: ValidationPipeline(200) → DeduplicationPipeline(300) → DatabasePipeline(400)

### AC-8 — Tests cover all paths; existing 85 tests remain green

**Given** `scraper/tests/test_deduplication.py`
**When** run via `cd scraper && python -m pytest`
**Then** covers:
- EAN match path (mocked httpx, GameUPC returns bgg_id)
- EAN no-match → falls through to name fuzzy path
- Name fuzzy match ≥ 85 → auto-link
- Name fuzzy match < 85 → item queued (no bgg_id)
- Polish name normalisation edge cases
- BGG_API_TOKEN absent → fuzzy match skipped, item queued, no exception
- GameUPC HTTP 5xx → fallthrough to fuzzy, no exception
- Duplicate bgg_id in games table → ON CONFLICT handles gracefully
**And** all 85 existing tests remain green (zero regressions)

---

## Tasks / Subtasks

- [x] Task 0 — Add `rapidfuzz` dependency
  - [x] `cd scraper && uv add rapidfuzz`
  - [x] Verify it appears in `uv.lock`

- [x] Task 1 — Create `scraper/scraper/pipelines/deduplication.py`
  - [x] `open_spider`: read `GAMEUPC_API_KEY` and `BGG_API_TOKEN` from env; log warning if `BGG_API_TOKEN` absent (name path will be disabled)
  - [x] `process_item`: call `_try_ean_path()` first; on no result call `_try_name_path()`; on bgg_id found call `_upsert_game()` → set `item["game_id"]`
  - [x] `_try_ean_path(ean)`: GameUPC API call; returns `bgg_id: int | None`
  - [x] `_try_name_path(name)`: BGG Search + rapidfuzz; returns `bgg_id: int | None`
  - [x] `_normalise_name(name)`: Polish normalisation per AC-5
  - [x] `_upsert_game(bgg_id, name)`: INSERT ON CONFLICT; returns `game_id: int`
  - [x] All HTTP via `httpx.Client` (reuse client across items — init in `open_spider`, close in `close_spider`)
  - [x] Logging: `logging.getLogger(__name__)` only — never `print()`

- [x] Task 2 — Update `scraper/scraper/settings.py`
  - [x] Uncomment/add `"scraper.pipelines.deduplication.DeduplicationPipeline": 300` to `ITEM_PIPELINES`
  - [x] Remove the comment `# slot 300 reserved for DeduplicationPipeline (Story 2.2)` — it's now active

- [x] Task 3 — Write `scraper/tests/test_deduplication.py`
  - [x] Mock `httpx.Client.get` for GameUPC calls
  - [x] Mock `httpx.Client.get` for BGG Search calls
  - [x] Mock `psycopg2.pool.ThreadedConnectionPool` for DB calls
  - [x] Test: EAN path success → bgg_id and game_id set on item
  - [x] Test: EAN path 404 → fallthrough to name path
  - [x] Test: EAN path 500 → fallthrough to name path (no exception raised)
  - [x] Test: Name path WRatio ≥ 85 → auto-link
  - [x] Test: Name path WRatio < 85 → item has no bgg_id (queued)
  - [x] Test: No BGG_API_TOKEN env var → name path skipped, item queued
  - [x] Test: Polish normalisation: strip "(edycja polska)", publisher prefix
  - [x] Test: ON CONFLICT games insert (bgg_id already exists) → returns existing game_id
  - [x] Run full suite — all existing 85 tests + new tests must pass (103/103 ✅)

---

## Dev Notes

### Pipeline Position in Chain

```
Spider yields dict (with ean field)
    ↓ ValidationPipeline (priority 200) ← DONE (Story 2.1)
           preserves ean field in returned dict
    ↓ DeduplicationPipeline (priority 300) ← THIS STORY
           reads ean → sets bgg_id and game_id
    ↓ DatabasePipeline (priority 400) ← DONE (Story 2.3)
           reads game_id and bgg_id from item, writes to products
           COALESCE(EXCLUDED.game_id, products.game_id) handles null gracefully
```

**Critical:** ValidationPipeline already preserves `ean` on the item dict. From `validation.py`:
```python
# returns FULL dict to preserve 'ean' for DeduplicationPipeline (Story 2.2)
return data
```
So `item["ean"]` will be available in `process_item()`.

### GameUPC API Details (from Spike 1.6)

```
GET https://api.gameupc.com/test/upc/{ean}
Headers: x-api-key: {GAMEUPC_API_KEY}
```

**Success response structure:**
```json
{
  "status": "ok",
  "bgg_info": [{"id": 437106, "name": "Simsala Spin", ...}],
  "bgg_info_status": "choose_from_bgg_info_or_search"
}
```

**No-match response:** HTTP 404

**BGG ID extraction:** `response_json["bgg_info"][0]["id"]` — always index 0, always present when `bgg_info` is non-empty.

**API key env var:** `GAMEUPC_API_KEY`
- Dev fallback (public test key from gameupc.com/demo.html): `test_test_test_test_test`
- Load via `os.getenv("GAMEUPC_API_KEY", "test_test_test_test_test")`
- Production: set as GitHub Secret

### BGG Search API Details

```
GET https://boardgamegeek.com/xmlapi2/search?query={name}&type=boardgame
Headers: Authorization: Bearer {BGG_API_TOKEN}   (if token absent, skip this path)
```

**Response format (XML):**
```xml
<items total="12">
  <item type="boardgame" id="31260">
    <name type="primary" value="Agricola"/>
    <yearpublished value="2007"/>
  </item>
  ...
</items>
```

**Parsing pattern:**
```python
import xml.etree.ElementTree as ET

root = ET.fromstring(response.text)
candidates = []
for item in root.findall("item"):
    name_el = item.find("name[@type='primary']")
    if name_el is not None:
        candidates.append({
            "bgg_id": int(item.get("id")),
            "name": name_el.get("value", ""),
        })
```

**BGG Search quirk:** When ≤1 result, BGG returns exact details page (different XML structure). Always handle `items total="0"` and `total="1"` cases — if total="1" and item has direct name, still apply fuzzy match.

### rapidfuzz Fuzzy Matching

```python
from rapidfuzz import fuzz

score = fuzz.WRatio(normalised_product_name, bgg_candidate_name.lower())
# WRatio handles substring matches, token permutations — best for game titles
# Score range: 0–100. Threshold: 85
```

**Import:** `from rapidfuzz import fuzz` (not `from fuzzywuzzy import fuzz` — wrong library)

**Why WRatio:** Handles cases like "Ticket to Ride" vs "Wsiąść do pociągu" after transliteration better than ratio() because it tries multiple matching strategies and takes the best score.

### Polish Name Normalisation

```python
import re
import unicodedata

_EDITION_PATTERNS = [
    r'\s*\(edycja polska\)',
    r'\s*\(polish edition\)',
    r'\s*edycja rozszerzona',
    r'\s*deluxe',
    r'\s*base game',
    r'\s*podstawowa',
    r'\s*—\s*.+$',          # strip " — Publisher Name"
    r'\s*:\s*[A-Z].+$',     # strip ": Subtitle With Capital"
]

_TRANSLITERATION = str.maketrans('ąęóśłźżćń', 'aeoslzzcn')

def _normalise_name(name: str) -> str:
    result = name.lower()
    for pattern in _EDITION_PATTERNS:
        result = re.sub(pattern, '', result, flags=re.IGNORECASE)
    result = result.translate(_TRANSLITERATION)
    return result.strip()
```

**Test cases to verify:**
- `"Simsala Spin (Makoto edycja polska) — Egmont"` → `"simsala spin (makoto"`  
  Wait — `(Makoto edycja polska)` is different from `(edycja polska)`. Pattern should only strip `(edycja polska)` not anything in parens. Refine: strip trailing `— Publisher` and `(edycja polska)` as exact phrase.
- `"Brass: Lancashire Deluxe (edycja polska) — Maldito"` → `"brass: lancashire"` after stripping ` deluxe`, `(edycja polska)`, `— maldito`
- `"Wsiąść do pociągu"` → `"wsiasc do pociagu"` after transliteration

### Game Record Upsert

```python
def _upsert_game(self, bgg_id: int, product_name: str) -> int:
    slug = f"bgg-{bgg_id}"
    conn = self._pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO games (slug, name, bgg_id, bgg_sync_status)
                   VALUES (%s, %s, %s, 'pending')
                   ON CONFLICT (bgg_id) DO UPDATE SET updated_at = now()
                   RETURNING id""",
                (slug, product_name, bgg_id),
            )
            game_id: int = cur.fetchone()[0]
        conn.commit()
    finally:
        self._pool.putconn(conn)
    return game_id
```

**Slug strategy:** `bgg-{bgg_id}` is a stable temporary slug. Story 2.4 (BGG enrichment) will update `slug` from BGG canonical name once metadata is fetched and `bgg_sync_status` becomes `'synced'`. The `games.slug` field is `UNIQUE` — `bgg-{bgg_id}` is deterministic and collision-safe across stores.

**Note:** `games.name` will hold the product name as a temporary value. Story 2.4 replaces it with BGG's official `<name type="primary">`. Using product name here is intentional — avoids NULL in the NOT NULL column without inventing a placeholder.

### httpx Client Lifecycle

Initialize `httpx.Client` once per spider run (not per item):

```python
import httpx
import os
from dotenv import load_dotenv

class DeduplicationPipeline:
    def open_spider(self, spider):
        load_dotenv()
        self._gameupc_key = os.getenv("GAMEUPC_API_KEY", "test_test_test_test_test")
        self._bgg_token = os.getenv("BGG_API_TOKEN")
        if not self._bgg_token:
            logger.warning(
                "BGG_API_TOKEN not set — name fuzzy match path disabled; "
                "items without EAN match will be queued (bgg_id=NULL)"
            )
        self._http = httpx.Client(timeout=10.0)

        # DB pool for game upsert (shared with DatabasePipeline? No — each pipeline
        # opens its own pool; Scrapy instantiates pipelines independently)
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL env var is not set")
        self._pool = psycopg2.pool.ThreadedConnectionPool(minconn=1, maxconn=3, dsn=database_url)

    def close_spider(self, spider):
        self._http.close()
        if self._pool:
            self._pool.closeall()
```

**Two DB pools:** `DeduplicationPipeline` and `DatabasePipeline` each open their own pool. This is correct — Scrapy creates one instance of each pipeline. Both read `DATABASE_URL` from env independently. Total max connections = 3 + 5 = 8, well within Neon free tier limits.

### process_item Full Flow

```python
def process_item(self, item, spider):
    ean = item.get("ean")
    bgg_id = None

    # Path 1: EAN → GameUPC
    if ean:
        bgg_id = self._try_ean_path(ean)

    # Path 2: Name fuzzy match (fallback)
    if bgg_id is None:
        bgg_id = self._try_name_path(item.get("name", ""))

    # Set game_id if we have a bgg_id
    if bgg_id is not None:
        item["bgg_id"] = bgg_id
        try:
            item["game_id"] = self._upsert_game(bgg_id, item.get("name", ""))
        except Exception as exc:
            logger.error(
                "Failed to upsert game for bgg_id=%d item=%s: %s",
                bgg_id, item.get("url"), exc, exc_info=True,
            )
            # Don't propagate — DatabasePipeline handles NULL game_id gracefully
    else:
        logger.debug(
            "No BGG match for item %s (ean=%r) — queued for operator review",
            item.get("url"), ean,
        )

    return item  # Always return item — Scrapy convention
```

### EAN Path Implementation

```python
def _try_ean_path(self, ean: str) -> int | None:
    url = f"https://api.gameupc.com/test/upc/{ean}"
    try:
        response = self._http.get(url, headers={"x-api-key": self._gameupc_key})
        if response.status_code == 404:
            return None
        response.raise_for_status()
        data = response.json()
        bgg_info = data.get("bgg_info") or []
        if bgg_info:
            return int(bgg_info[0]["id"])
    except httpx.HTTPStatusError as exc:
        logger.warning("GameUPC HTTP %d for EAN %s", exc.response.status_code, ean)
    except Exception as exc:
        logger.warning("GameUPC error for EAN %s: %s", ean, exc)
    return None
```

### Name Fuzzy Path Implementation

```python
def _try_name_path(self, name: str) -> int | None:
    if not self._bgg_token or not name:
        return None

    normalised = _normalise_name(name)
    url = "https://boardgamegeek.com/xmlapi2/search"
    params = {"query": normalised, "type": "boardgame"}
    headers = {"Authorization": f"Bearer {self._bgg_token}"}

    try:
        response = self._http.get(url, params=params, headers=headers)
        response.raise_for_status()
    except Exception as exc:
        logger.warning("BGG Search failed for %r: %s", name, exc)
        return None

    try:
        root = ET.fromstring(response.text)
    except ET.ParseError:
        logger.warning("BGG Search returned invalid XML for %r", name)
        return None

    best_score = 0
    best_bgg_id = None
    for item_el in root.findall("item"):
        name_el = item_el.find("name[@type='primary']")
        if name_el is None:
            continue
        candidate = name_el.get("value", "").lower()
        score = fuzz.WRatio(normalised, candidate)
        if score > best_score:
            best_score = score
            best_bgg_id = int(item_el.get("id"))

    if best_score >= 85:
        logger.debug("BGG fuzzy match: %r → bgg_id=%d (score=%d)", name, best_bgg_id, best_score)
        return best_bgg_id

    logger.debug("BGG fuzzy match: no confident match for %r (best score=%d)", name, best_score)
    return None
```

### Testing Strategy — Mock httpx and psycopg2

```python
from unittest.mock import MagicMock, patch
from scraper.pipelines.deduplication import DeduplicationPipeline

@patch("scraper.pipelines.deduplication.psycopg2.pool.ThreadedConnectionPool")
@patch("scraper.pipelines.deduplication.httpx.Client")
def test_ean_path_success(mock_client_cls, mock_pool_cls):
    mock_http = MagicMock()
    mock_client_cls.return_value = mock_http

    gameupc_response = MagicMock()
    gameupc_response.status_code = 200
    gameupc_response.json.return_value = {
        "status": "ok",
        "bgg_info": [{"id": 437106, "name": "Simsala Spin"}],
        "bgg_info_status": "choose_from_bgg_info_or_search",
    }
    mock_http.get.return_value = gameupc_response

    mock_pool = MagicMock()
    mock_pool_cls.return_value = mock_pool
    mock_conn = MagicMock()
    mock_pool.getconn.return_value = mock_conn
    mock_cursor = MagicMock()
    mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
    mock_cursor.__exit__ = MagicMock(return_value=False)
    mock_cursor.fetchone.return_value = (1,)  # game_id
    mock_conn.cursor.return_value = mock_cursor

    pipeline = DeduplicationPipeline()
    spider = MagicMock()
    with patch.dict("os.environ", {"DATABASE_URL": "postgresql://test", "GAMEUPC_API_KEY": "testkey"}):
        pipeline.open_spider(spider)
        item = {"name": "Simsala Spin", "url": "http://example.com", "ean": "5903707560875"}
        result = pipeline.process_item(item, spider)

    assert result["bgg_id"] == 437106
    assert result["game_id"] == 1
```

### Imports Required in deduplication.py

```python
import logging
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import httpx
import psycopg2
import psycopg2.pool
from dotenv import load_dotenv
from rapidfuzz import fuzz
```

### File Locations

```
scraper/
  scraper/
    settings.py               ← UPDATE: enable DeduplicationPipeline at 300
    pipelines/
      __init__.py             ← DO NOT TOUCH
      validation.py           ← DO NOT TOUCH (Story 2.1)
      database.py             ← DO NOT TOUCH (Story 2.3) — reads game_id from item
      deduplication.py        ← NEW
  tests/
    test_deduplication.py     ← NEW
```

**DO NOT touch:**
- `scraper/scraper/items.py` — Story 1.2b, no changes needed
- `scraper/scraper/spiders/` — Story 2.1
- `scraper/utils/bgg_client.py` — Story 2.4 (enrichment, NOT search)
- `web/` — Dev A territory

### What This Story Does NOT Include

- **BGG metadata enrichment** (Story 2.4 — `bgg_client.py` full implementation with all FR-7 fields)
- **Operator review UI** for queued items — queryable via `SELECT * FROM products WHERE bgg_id IS NULL`
- **`bgg_slug` from canonical BGG name** — Story 2.4 updates `games.slug` and `games.name` from BGG API
- **scraper.yml GitHub Actions** — Story 2.5

### Existing Test Baseline

**85 tests currently passing** (run `cd scraper && python -m pytest -v` to verify):
- `tests/test_items.py` — 16 tests
- `tests/test_bgg_client.py` — 13 tests
- `tests/test_price_parser.py` — 12 tests
- `tests/test_three_trolle.py` — 12 tests (previously 11, one added in Story 2.3)
- `tests/test_ale_planszowki.py` — 11 tests
- `tests/test_database_pipeline.py` — 21 tests

All must remain green after this story.

### Dependency: rapidfuzz

Add before implementing:
```bash
cd scraper && uv add rapidfuzz
```

**Do NOT use `fuzzywuzzy`** — it requires `python-Levenshtein` for speed and is deprecated in favor of `rapidfuzz`. The import is `from rapidfuzz import fuzz`, and the API is identical for the functions used here.

---

## File Locations Summary

| File | Action |
|------|--------|
| `scraper/scraper/pipelines/deduplication.py` | NEW |
| `scraper/scraper/settings.py` | UPDATE (enable DeduplicationPipeline at 300) |
| `scraper/tests/test_deduplication.py` | NEW |
| `scraper/pyproject.toml` / `uv.lock` | UPDATE (add rapidfuzz dependency) |

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

- **Task 0:** `rapidfuzz==3.14.5` installed via `uv add rapidfuzz`; added to `pyproject.toml` and `uv.lock`.
- **Task 1:** `DeduplicationPipeline` created with EAN→GameUPC primary path (`bgg_info[0]["id"]`) and BGG Search fuzzy fallback (`fuzz.WRatio ≥ 85`). `httpx.Client` reused across items per spider lifecycle. `_normalise_name()` strips edition suffixes and transliterates Polish diacritics. `_upsert_game()` uses `ON CONFLICT (bgg_id) DO UPDATE SET updated_at = now() RETURNING id`. BGG token absent → name path gracefully disabled with WARNING log.
- **Bug fix during implementation:** `_EDITION_PATTERNS` originally included `r"\s*:\s*[A-Z].+$"` (intended to strip publisher prefixes). With `re.IGNORECASE`, this incorrectly matched `: lancashire` in game subtitles like "Brass: Lancashire". Pattern removed — em-dash pattern (`\s*—\s*.+$`) handles publisher suffixes adequately.
- **Task 2:** `settings.py` updated — DeduplicationPipeline at priority 300, placeholder comment removed.
- **Task 3:** 18 tests covering all ACs: 7 normalisation unit tests + 11 pipeline integration tests (all mocked). Full suite: **103/103 passed** (85 existing + 18 new), zero regressions.

### File List

- `scraper/scraper/pipelines/deduplication.py` — NEW
- `scraper/scraper/settings.py` — MODIFIED (enabled DeduplicationPipeline at 300)
- `scraper/tests/test_deduplication.py` — NEW (18 tests)
- `scraper/pyproject.toml` — MODIFIED (added rapidfuzz>=3.14.5)
- `scraper/uv.lock` — MODIFIED (rapidfuzz lock entry)
