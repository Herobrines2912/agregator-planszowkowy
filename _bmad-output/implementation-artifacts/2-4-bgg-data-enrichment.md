---
story_id: "2.4"
story_key: "2-4-bgg-data-enrichment"
epic: 2
epic_title: "Automated Price Data Collection"
status: "review"
dev: "Dev B (Scraper/Infra)"
depends_on: "Story 2.2 (done ✅), Story 1.5 (bgg_client.py skeleton done ✅; BGG token required for live validation)"
baseline_commit: "83bc3fb1055b6fbd498a836ff24bd8429bccc7d9"
---

# Story 2.4: BGG Data Enrichment Background Job

**Status:** ready-for-dev
**Epic:** 2 — Automated Price Data Collection
**Dev:** Dev B (Scraper/Infra)

---

## User Story

As a **developer**,
I want a background BGG enrichment job that fetches and caches metadata for all matched games,
So that Game Passports have complete BGG data within 24 hours of a game being added.

---

## Acceptance Criteria

### AC-1 — Rate limit: ≤ 1 request/second

**Given** `BggClient` processing games in sequence
**When** sending requests to BGG API
**Then** requests are rate-limited to ≤ 1 request/second (FR-24)
**And** this is enforced by `BggClient._throttle()` — already implemented in Story 1.5, must remain intact

### AC-2 — Retry with exponential backoff on 429/202

**Given** a BGG API HTTP 429 or 202 response
**When** `BggClient.get_thing_with_retry(bgg_id, max_retries=3)` handles it
**Then** it retries after delays of 60s, 120s, 240s (exponential backoff per attempt)
**And** after 3 retries exhausted, raises the final `BggRateLimitError` to the caller (caller sets `bgg_sync_status = 'rate_limited'`)

### AC-3 — 404 handling: not_found status, name preserved

**Given** a BGG API HTTP 404 (or XML with no `<item>` element)
**When** `get_thing_with_retry()` returns `None`
**Then** the enrichment runner sets `bgg_sync_status = 'not_found'` on the game record
**And** `name` is NOT overwritten to `"Nieznana gra"` — the name already in DB from deduplication step is preserved
**And** no retry for 404 — it's a definitive not-found

### AC-4 — Successful enrichment writes all FR-7 fields

**Given** a successful BGG API response
**When** the enrichment runner processes it
**Then** the following fields are written to the `games` record:
  - `cover_image_url` — from `<image>` text (NULL if absent)
  - `name` — from `<name type='primary'>[@value]`
  - `designers` — `text[]` from all `<link type='boardgamedesigner'>[@value]`
  - `publishers` — `text[]` from all `<link type='boardgamepublisher'>[@value]`
  - `bgg_rank` — `int` from `<rank type='subtype' name='boardgame'>[@value]` (NULL if absent or "Not Ranked")
  - `bgg_avg_rating` — `Decimal` from `<statistics/ratings/average>[@value]` (NULL if absent)
  - `complexity` — `Decimal` from `<statistics/ratings/averageweight>[@value]` (NULL if absent)
  - `mechanics` — `text[]` from all `<link type='boardgamemechanic'>[@value]`
  - `min_players` — `int` from `<minplayers>[@value]` (NULL if absent)
  - `max_players` — `int` from `<maxplayers>[@value]` (NULL if absent)
  - `min_playtime` — `int` from `<minplaytime>[@value]` (NULL if absent)
  - `max_playtime` — `int` from `<maxplaytime>[@value]` (NULL if absent)
  - `min_age` — `int` from `<minage>[@value]` (NULL if absent)
  - `is_expansion` — `True` when `<item type='boardgameexpansion'>`, else `False`
  - `bgg_category_rank` — JSON `{"category": str, "rank": int}` from first `<rank type='family'>` (NULL if none)
  - `rules_pdf_url` — NULL (BGG XML API v2 does not expose this directly)
  - `year_published` — `int` from `<yearpublished>[@value]` (NULL if absent)
**And** `bgg_sync_status = 'synced'` and `updated_at = datetime.now(timezone.utc)`

### AC-5 — Per-game error: log + continue, don't abort batch

**Given** any exception during enrichment of a single game (HTTP error, parse error, DB error)
**When** the enrichment runner processes it
**Then** it logs the error at ERROR level with `exc_info=True` via `logging.getLogger(__name__)`
**And** continues to the next game — the batch is not aborted
**And** `bgg_sync_status` for the failed game remains unchanged (not set to 'not_found' or 'rate_limited' unless that specific error was raised)

**Exception:** `BggRateLimitError` raised after max retries → set `bgg_sync_status = 'rate_limited'`, then continue

### AC-6 — 30-day refresh of already-synced games

**Given** a game with `bgg_sync_status = 'synced'` and `updated_at < NOW() - INTERVAL '30 days'`
**When** the enrichment runner runs
**Then** it re-fetches and updates BGG data for that game (same logic as initial enrichment)
**And** uses `updated_at` as the proxy for "last synced" (schema has no separate `bgg_synced_at` column)

### AC-7 — Enrichment runner queries correct game set

**Given** the enrichment runner `bgg_enrichment.py` executing
**When** it starts
**Then** it queries the `games` table for TWO sets:
  1. `bgg_sync_status = 'pending' AND bgg_id IS NOT NULL` (newly matched games awaiting first enrichment)
  2. `bgg_sync_status = 'synced' AND updated_at < NOW() - INTERVAL '30 days'` (stale refresh)
**And** games with `bgg_sync_status = 'not_found'` or `bgg_sync_status = 'rate_limited'` are NOT included in the normal run (these need manual review or separate re-queue logic)

### AC-8 — Token sourced from env, never hardcoded

**Given** the enrichment runner initializing
**When** creating `BggClient`
**Then** it reads `BGG_API_TOKEN` from `os.environ` via `load_dotenv()`
**And** if `BGG_API_TOKEN` is not set, logs a WARNING and exits with error code 1 (prevents silent failure in CI)

### AC-9 — Tests pass with mocked HTTP; existing baseline preserved

**Given** `scraper/tests/test_bgg_enrichment.py` with mocked HTTP and DB
**When** run via `uv run pytest`
**Then** it covers:
  - Pending games are fetched and written (AC-4)
  - `bgg_sync_status = 'synced'` set on success
  - 404 → `bgg_sync_status = 'not_found'`, name not overwritten (AC-3)
  - Rate limit 429 → retry logic → after max retries: `bgg_sync_status = 'rate_limited'`, continue (AC-2, AC-5)
  - 30-day stale refresh query hits DB (AC-6)
  - Per-item DB write error → log + continue (AC-5)
  - `is_expansion = True` for `boardgameexpansion` items
  - `bgg_rank` = NULL when BGG value is "Not Ranked" (common for niche titles)
**And** all 112 existing tests remain green (zero regressions)

---

## Tasks / Subtasks

- [x] Task 1 — Add `get_thing_with_retry()` to `BggClient` in `bgg_client.py` (AC-2)
  - [x] Add `get_thing_with_retry(self, bgg_id: int, max_retries: int = 3) -> Optional[dict]`
  - [x] On `BggRateLimitError`: sleep 60s (attempt 1), 120s (attempt 2), 240s (attempt 3), then re-raise
  - [x] On successful return or None (404): pass through directly, no retry
  - [x] Log each retry attempt: `logger.warning("BGG retry %d/3 for ID %d after %ds", attempt, bgg_id, delay)`
  - [x] Do NOT change `get_thing()` — `get_thing_with_retry()` wraps it

- [x] Task 2 — Create `scraper/utils/bgg_enrichment.py` (AC-3 through AC-8)
  - [x] `load_dotenv()` + check `BGG_API_TOKEN` (exit 1 if missing)
  - [x] `BggClient(token=os.environ["BGG_API_TOKEN"])`
  - [x] Connect to DB via psycopg2 (reads `DATABASE_URL` from env)
  - [x] Query 1: `SELECT id, bgg_id, name FROM games WHERE bgg_sync_status = 'pending' AND bgg_id IS NOT NULL`
  - [x] Query 2: `SELECT id, bgg_id, name FROM games WHERE bgg_sync_status = 'synced' AND updated_at < NOW() - INTERVAL '30 days'`
  - [x] For each game: call `client.get_thing_with_retry(bgg_id)`
  - [x] On `None` return (404): `UPDATE games SET bgg_sync_status='not_found', updated_at=now() WHERE id=game_id` (do NOT change name)
  - [x] On `BggRateLimitError` (after retries exhausted): `UPDATE games SET bgg_sync_status='rate_limited', updated_at=now() WHERE id=game_id`
  - [x] On success: map result dict → DB row (see type-mapping table in Dev Notes), `UPDATE games SET ... WHERE id=game_id`
  - [x] Per-game try/except with `logger.error(exc_info=True)` + continue (AC-5)
  - [x] Log summary at end: `logger.info("BGG enrichment complete: %d synced, %d not_found, %d rate_limited, %d errors", ...)`
  - [x] Entry point: `if __name__ == "__main__": run_enrichment()`

- [x] Task 3 — Update `_parse_thing()` in `bgg_client.py` to handle `is_expansion` and missing fields for AC-4
  - [x] Add `is_expansion` to returned dict: `item.get('type') == 'boardgameexpansion'`
  - [x] Add `complexity`: `statistics/ratings/averageweight/@value` (None if absent)
  - [x] Add `year_published` (already there — verify it's in the dict)
  - [x] Handle `bgg_rank` "Not Ranked" string → return `None` (not `"Not Ranked"`)
  - [x] Add `bgg_category_rank`: first `rank[@type='family']` element → `{"category": name_attr, "rank": int(value_attr)}` or `None`

- [x] Task 4 — Write `scraper/tests/test_bgg_enrichment.py` (AC-9)
  - [x] Mock psycopg2 pool/cursor + `BggClient.get_thing_with_retry`
  - [x] Test: pending game → 200 → fields written, status='synced'
  - [x] Test: pending game → 404 → status='not_found', name NOT changed
  - [x] Test: pending game → 3× 429 → status='rate_limited', processing continues to next game
  - [x] Test: 30-day stale query includes games with updated_at > 30 days old
  - [x] Test: DB write error for one game → next game still processed (AC-5)
  - [x] Test: `is_expansion=True` when BGG type is 'boardgameexpansion'
  - [x] Run full suite — 145 passed (112 baseline + 33 new), zero regressions

- [ ] Task 5 — Manual validation (requires BGG token) ⚠️ HUMAN ACTION
  - [ ] Set `BGG_API_TOKEN` in `scraper/.env`
  - [ ] Run: `cd scraper && uv run python -m utils.bgg_enrichment` against DB with pending games
  - [ ] Confirm at least one game gets `bgg_sync_status = 'synced'` in Neon
  - [ ] Close out Story 1.5 AC-2/AC-5: document gate decision in `docs/spike-results/bgg-token.md`

---

## Dev Notes

### What Already Exists (Story 1.5)

`scraper/utils/bgg_client.py` is fully written and tested (13 tests):
- `BggClient.__init__(token: str)`
- `BggClient._throttle()` — enforces ≤ 1 req/s ✅
- `BggClient.get_thing(bgg_id)` — fetches, raises `BggRateLimitError` on 429/202, returns None on 404 ✅
- `BggClient._parse_thing(xml_text, bgg_id)` — parses XML, handles errors ✅
- `BggRateLimitError` exception class ✅

**DO NOT** rewrite or break any of this. Extend only:
1. Add `get_thing_with_retry()` as a new method wrapping `get_thing()`
2. Extend `_parse_thing()` to return `is_expansion`, `complexity`, `bgg_category_rank`

### Type-Mapping Table: BGG XML → `games` DB Column

| BGG XML | Python type | DB column | DB type | Notes |
|---|---|---|---|---|
| `<name type='primary'>[@value]` | `str` | `name` | `text` | Fallback: "Nieznana gra" |
| `<image>` text | `str \| None` | `cover_image_url` | `text` | Strip whitespace |
| `<minplayers>[@value]` | `int \| None` | `min_players` | `integer` | `int(val)` if not None |
| `<maxplayers>[@value]` | `int \| None` | `max_players` | `integer` | `int(val)` if not None |
| `<minplaytime>[@value]` | `int \| None` | `min_playtime` | `integer` | `int(val)` if not None |
| `<maxplaytime>[@value]` | `int \| None` | `max_playtime` | `integer` | `int(val)` if not None |
| `<minage>[@value]` | `int \| None` | `min_age` | `integer` | `int(val)` if not None |
| `<yearpublished>[@value]` | `int \| None` | `year_published` | `integer` | `int(val)` if not None |
| `<link type='boardgamemechanic'>[@value]` | `list[str]` | `mechanics` | `text[]` | All matching links |
| `<link type='boardgamedesigner'>[@value]` | `list[str]` | `designers` | `text[]` | All matching links |
| `<link type='boardgamepublisher'>[@value]` | `list[str]` | `publishers` | `text[]` | All matching links |
| `<statistics/ratings/ranks/rank[@type='subtype' @name='boardgame']>[@value]` | `int \| None` | `bgg_rank` | `integer` | `None` if value == "Not Ranked" |
| `<statistics/ratings/average>[@value]` | `Decimal \| None` | `bgg_avg_rating` | `NUMERIC(5,2)` | `Decimal(val)` if not None |
| `<statistics/ratings/averageweight>[@value]` | `Decimal \| None` | `complexity` | `NUMERIC(3,2)` | `Decimal(val)` if not None |
| `<item @type>` | `bool` | `is_expansion` | `boolean` | `type == 'boardgameexpansion'` |
| `<rank[@type='family']>` (first) | `dict \| None` | `bgg_category_rank` | `jsonb` | `{"category": name_val, "rank": int(value_val)}` or None |
| n/a | `None` | `rules_pdf_url` | `text` | BGG XML API doesn't expose this |

### `get_thing_with_retry()` Implementation Pattern

```python
import time

RETRY_DELAYS = [60, 120, 240]  # seconds per attempt

def get_thing_with_retry(self, bgg_id: int, max_retries: int = 3) -> Optional[dict]:
    for attempt in range(max_retries + 1):
        try:
            return self.get_thing(bgg_id)
        except BggRateLimitError:
            if attempt >= max_retries:
                logger.error(
                    "BGG ID %d: exhausted %d retries, giving up",
                    bgg_id, max_retries,
                )
                raise
            delay = RETRY_DELAYS[attempt]
            logger.warning(
                "BGG retry %d/%d for ID %d after %ds",
                attempt + 1, max_retries, bgg_id, delay,
            )
            time.sleep(delay)
    # unreachable, but satisfies type checker
    return None
```

### `bgg_enrichment.py` Structure

```python
import logging
import os
import time
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional

import psycopg2
import psycopg2.pool
from dotenv import load_dotenv

from utils.bgg_client import BggClient, BggRateLimitError

logger = logging.getLogger(__name__)


def _safe_int(val: Optional[str]) -> Optional[int]:
    """Convert string to int, return None for None or non-numeric strings."""
    if val is None or val == "Not Ranked":
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _safe_decimal(val: Optional[str]) -> Optional[Decimal]:
    if val is None:
        return None
    try:
        return Decimal(val)
    except (InvalidOperation, TypeError):
        return None


def _build_update_params(data: dict) -> tuple[dict, datetime]:
    """Map BggClient result dict to games table columns."""
    now = datetime.now(timezone.utc)
    return {
        "name": data.get("name", "Nieznana gra"),
        "cover_image_url": data.get("cover_image_url"),
        "min_players": _safe_int(data.get("min_players")),
        "max_players": _safe_int(data.get("max_players")),
        "min_playtime": _safe_int(data.get("min_playtime")),
        "max_playtime": _safe_int(data.get("max_playtime")),
        "min_age": _safe_int(data.get("min_age")),
        "year_published": _safe_int(data.get("year_published")),
        "bgg_rank": _safe_int(data.get("bgg_rank")),
        "bgg_avg_rating": _safe_decimal(data.get("bgg_avg_rating")),
        "complexity": _safe_decimal(data.get("complexity")),
        "mechanics": data.get("mechanics") or [],
        "designers": data.get("designers") or [],
        "publishers": data.get("publishers") or [],
        "is_expansion": data.get("is_expansion", False),
        "bgg_category_rank": data.get("bgg_category_rank"),  # dict or None → jsonb
        "rules_pdf_url": None,  # BGG XML API doesn't expose this
        "bgg_sync_status": "synced",
        "updated_at": now,
    }, now


def run_enrichment() -> None:
    load_dotenv()

    token = os.environ.get("BGG_API_TOKEN")
    if not token:
        logger.error("BGG_API_TOKEN env var not set — cannot run enrichment")
        raise SystemExit(1)

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        logger.error("DATABASE_URL env var not set")
        raise SystemExit(1)

    client = BggClient(token=token)
    pool = psycopg2.pool.ThreadedConnectionPool(minconn=1, maxconn=3, dsn=database_url)

    synced = not_found = rate_limited = errors = 0

    try:
        conn = pool.getconn()
        try:
            with conn.cursor() as cur:
                # Set 1: pending games
                cur.execute(
                    "SELECT id, bgg_id, name FROM games "
                    "WHERE bgg_sync_status = 'pending' AND bgg_id IS NOT NULL"
                )
                pending = cur.fetchall()

                # Set 2: stale synced games (30-day refresh)
                cur.execute(
                    "SELECT id, bgg_id, name FROM games "
                    "WHERE bgg_sync_status = 'synced' "
                    "AND updated_at < NOW() - INTERVAL '30 days'"
                )
                stale = cur.fetchall()
        finally:
            pool.putconn(conn)

        games = pending + stale
        logger.info(
            "BGG enrichment: %d pending, %d stale to refresh (%d total)",
            len(pending), len(stale), len(games),
        )

        for game_id, bgg_id, current_name in games:
            try:
                data = client.get_thing_with_retry(bgg_id)
            except BggRateLimitError:
                logger.error("BGG ID %d: rate_limited after retries", bgg_id)
                _update_status(pool, game_id, "rate_limited")
                rate_limited += 1
                continue
            except Exception as exc:
                logger.error(
                    "BGG ID %d: fetch error: %s", bgg_id, exc, exc_info=True
                )
                errors += 1
                continue

            if data is None:
                # 404 — game not found, preserve existing name
                logger.warning("BGG ID %d not found (404), marking not_found", bgg_id)
                _update_status(pool, game_id, "not_found")
                not_found += 1
                continue

            try:
                params, _ = _build_update_params(data)
                _write_game(pool, game_id, params)
                logger.info("BGG ID %d synced: %r", bgg_id, data.get("name"))
                synced += 1
            except Exception as exc:
                logger.error(
                    "DB write failed for game_id=%d bgg_id=%d: %s",
                    game_id, bgg_id, exc, exc_info=True,
                )
                errors += 1

    finally:
        pool.closeall()

    logger.info(
        "BGG enrichment complete: %d synced, %d not_found, %d rate_limited, %d errors",
        synced, not_found, rate_limited, errors,
    )


def _update_status(pool, game_id: int, status: str) -> None:
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE games SET bgg_sync_status = %s, updated_at = %s WHERE id = %s",
                (status, datetime.now(timezone.utc), game_id),
            )
        conn.commit()
    finally:
        pool.putconn(conn)


def _write_game(pool, game_id: int, params: dict) -> None:
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE games SET
                    name = %(name)s,
                    cover_image_url = %(cover_image_url)s,
                    min_players = %(min_players)s,
                    max_players = %(max_players)s,
                    min_playtime = %(min_playtime)s,
                    max_playtime = %(max_playtime)s,
                    min_age = %(min_age)s,
                    year_published = %(year_published)s,
                    bgg_rank = %(bgg_rank)s,
                    bgg_avg_rating = %(bgg_avg_rating)s,
                    complexity = %(complexity)s,
                    mechanics = %(mechanics)s,
                    designers = %(designers)s,
                    publishers = %(publishers)s,
                    is_expansion = %(is_expansion)s,
                    bgg_category_rank = %(bgg_category_rank)s,
                    rules_pdf_url = %(rules_pdf_url)s,
                    bgg_sync_status = %(bgg_sync_status)s,
                    updated_at = %(updated_at)s
                WHERE id = %(game_id)s""",
                {**params, "game_id": game_id},
            )
        conn.commit()
    finally:
        pool.putconn(conn)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_enrichment()
```

### Critical Schema Notes

**No `bgg_synced_at` column** — `schema.ts` uses `updated_at` as the 30-day refresh proxy. This is intentional for MVP. Do NOT add `bgg_synced_at` to schema (would require migration + schema.ts + items.py sync per CLAUDE.md L-1 rule).

**`bgg_category_rank` is `jsonb`** — psycopg2 does not auto-serialize dicts to jsonb. Use `json.dumps()`:
```python
import json
import psycopg2.extras

# Register jsonb adapter at module level:
psycopg2.extras.register_default_jsonb(globally=True)
# OR manually serialize:
bgg_category_rank_val = json.dumps(data.get("bgg_category_rank"))  # serializes dict to JSON string
```

Actually, the safest approach: use `psycopg2.extras.Json()` wrapper:
```python
from psycopg2.extras import Json

params["bgg_category_rank"] = Json(data.get("bgg_category_rank"))  # handles None → SQL NULL
```

**Text arrays** — psycopg2 handles `list[str]` natively as PostgreSQL arrays. No manual conversion needed.

**NUMERIC columns** — use `Decimal`, never `float`. psycopg2 maps `Decimal` → `NUMERIC` natively.

**`is_expansion`** — boolean column, maps to Python `bool`. psycopg2 handles directly.

### BGG XML: `is_expansion` Detection

```xml
<!-- Base game: -->
<item type="boardgame" id="224517">

<!-- Expansion: -->
<item type="boardgameexpansion" id="161936">
```

```python
# In _parse_thing():
item = root.find("item")
is_expansion = item.get("type") == "boardgameexpansion" if item is not None else False
```

### BGG XML: `bgg_rank` "Not Ranked" Edge Case

BGG returns `"Not Ranked"` (string) instead of an integer for games with insufficient ratings:
```xml
<rank type="subtype" name="boardgame" value="Not Ranked" />
```

```python
# In get_attr or _safe_int:
val = item.find("statistics/ratings/ranks/rank[@type='subtype']")
rank_val = val.get("value") if val is not None else None
bgg_rank = None if (rank_val is None or rank_val == "Not Ranked") else int(rank_val)
```

### BGG XML: `complexity` (averageweight)

```xml
<statistics>
  <ratings>
    <averageweight value="3.6897" />
  </ratings>
</statistics>
```

```python
complexity_str = get_attr("statistics/ratings/averageweight")
# Returns None if absent — _safe_decimal handles it
```

### `bgg_category_rank` (first family rank only)

```xml
<ranks>
  <rank type="subtype" name="boardgame" value="2" />
  <rank type="family" id="5497" name="strategygames" friendlyname="Strategy Game Rank" value="1" />
</ranks>
```

```python
family_rank = item.find("statistics/ratings/ranks/rank[@type='family']")
if family_rank is not None:
    bgg_category_rank = {
        "category": family_rank.get("friendlyname") or family_rank.get("name"),
        "rank": int(family_rank.get("value"))
        if family_rank.get("value") not in (None, "Not Ranked")
        else None,
    }
else:
    bgg_category_rank = None
```

### psycopg2 jsonb Adapter

At the top of `bgg_enrichment.py`:
```python
import psycopg2.extras

# Register JSON adapter once (module-level side-effect)
psycopg2.extras.register_default_jsonb(globally=True)
```

This makes psycopg2 serialize Python `dict` → PostgreSQL `jsonb` automatically. Without it, you'll get a `ProgrammingError: can't adapt type 'dict'`.

### Test Baseline

Current passing tests: **112** (from Story 2.6 commit `83bc3fb`):
- `tests/test_items.py` — 16
- `tests/test_bgg_client.py` — 13
- `tests/test_price_parser.py` — 12
- `tests/test_three_trolle.py` — 11
- `tests/test_ale_planszowki.py` — 12
- `tests/test_deduplication.py` — 27 (from Story 2.2)
- `tests/test_database_pipeline.py` — 21 (from Story 2.3)

All must remain green. Run `cd scraper && uv run pytest -v` to verify.

### File Locations

```
scraper/
  utils/
    bgg_client.py        ← UPDATE: add get_thing_with_retry(), extend _parse_thing()
    bgg_enrichment.py    ← NEW: enrichment runner
  tests/
    test_bgg_enrichment.py  ← NEW
```

**DO NOT touch:**
- `web/` — Dev A territory
- `scraper/scraper/` — spiders/pipelines not changed in this story
- `scraper/utils/price_parser.py` — unrelated
- `.github/workflows/` — Story 2.5 will wire `bgg_enrichment.py` into scraper.yml step 2

### How Story 2.5 Will Call This

Story 2.5 (`scraper.yml`) will invoke the enrichment runner as step 2:
```yaml
- name: BGG enrichment for pending games
  run: |
    cd scraper
    uv run python -m utils.bgg_enrichment
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    BGG_API_TOKEN: ${{ secrets.BGG_API_TOKEN }}
```

The module path `utils.bgg_enrichment` assumes `pythonpath = ["."]` is set in `pyproject.toml` (already set in Story 1.5 fix).

### Python Dependencies

No new `uv add` commands needed:
- `httpx` — already in deps (Story 1.1)
- `psycopg2-binary` — already in deps (Story 1.1)
- `python-dotenv` — already in deps (Story 1.1)
- `xml.etree.ElementTree` — stdlib
- `decimal.Decimal` — stdlib

### CLAUDE.md Compliance Checklist

- [ ] `logger = logging.getLogger(__name__)` at module level in both modified files
- [ ] Zero `print()` calls anywhere
- [ ] All timestamps: `datetime.now(timezone.utc)` — never `datetime.now()`
- [ ] All price/numeric values: `Decimal` — never `float`
- [ ] No inline DB queries in non-pipeline files — enrichment.py uses psycopg2 directly (acceptable for background script, not web component)

---

## File Locations Summary

| File | Action |
|------|--------|
| `scraper/utils/bgg_client.py` | UPDATE — add `get_thing_with_retry()`, extend `_parse_thing()` |
| `scraper/utils/bgg_enrichment.py` | NEW — enrichment runner |
| `scraper/tests/test_bgg_enrichment.py` | NEW — 19 tests for enrichment runner |
| `scraper/tests/test_bgg_client.py` | UPDATE — 14 new tests (retry + extended parse) |

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

- **Task 1+3 (merged):** Added `get_thing_with_retry()` to `BggClient` with `_RETRY_DELAYS = [60, 120, 240]` exponential backoff. Extended `_parse_thing()` to return `is_expansion` (from `item[@type]`), `complexity` (from `averageweight`), `bgg_category_rank` (first `rank[@type='family']`). `bgg_rank` now returns `None` for "Not Ranked" instead of the string.
- **Task 2:** Created `scraper/utils/bgg_enrichment.py` with `run_enrichment()`. Queries pending and 30-day-stale games, calls `get_thing_with_retry()`, writes all FR-7 fields via named `%(param)s` UPDATE. Uses `psycopg2.extras.register_default_jsonb(globally=True)` for jsonb adapter. Per-game errors log + continue.
- **Task 4:** 19 tests covering: helper functions (`_safe_int`, `_safe_decimal`, `_build_update_params`), full enrichment flow (success, 404, rate-limit, stale refresh, DB error, is_expansion, missing env vars).
- **Debug note:** `time.sleep()` mock in retry tests was counting throttle sleeps too. Fixed by asserting specific delay values (60/120/240) in `call_args_list` instead of `call_count`.
- **Test count:** 112 (baseline) + 14 (bgg_client new) + 19 (bgg_enrichment) = 145 passing, 4 deselected (live marker).
- **Task 5 BLOCKED:** Requires real `BGG_API_TOKEN` — human must set it in `scraper/.env` and run `python -m utils.bgg_enrichment` to validate live. Closes Story 1.5 gate.
