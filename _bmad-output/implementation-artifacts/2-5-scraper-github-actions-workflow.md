---
story_id: "2.5"
story_key: "2-5-scraper-github-actions-workflow"
epic: 2
epic_title: "Automated Price Data Collection"
status: "review"
dev: "Dev B (Scraper/Infra)"
depends_on: "Story 2.3 (done ✅), Story 2.4 (done ✅)"
baseline_commit: "069d8a0"
---

# Story 2.5: Scraper GitHub Actions Workflow

**Status:** ready-for-dev
**Epic:** 2 — Automated Price Data Collection
**Dev:** Dev B (Scraper/Infra)

---

## User Story

As a **developer**,
I want the complete scraper GitHub Actions workflow running on a daily cron,
So that the full pipeline (scrape → BGG enrichment → health check → ISR revalidate) runs automatically without operator intervention.

---

## Acceptance Criteria

### AC-1 — scraper.yml triggered daily, 5 ordered steps

**Given** `.github/workflows/scraper.yml` triggered on `cron: '0 6 * * *'`
**When** it runs
**Then** it executes steps in this exact order:
1. Run all spiders listed in `scraper/scraper/spiders/__manifest__.py`
2. BGG enrichment for pending/stale games (`uv run python -m utils.bgg_enrichment`)
3. Database health check (`uv run python -m utils.db_health`)
4. POST `/api/revalidate` with `--retry 3 --retry-delay 10 --retry-connrefused -f`
5. Placeholder step: "Alert engine not yet implemented — Epic 6"

**And** `timeout-minutes: 14` is set on the scraper job (enforced by `validate-workflows.yml`, NFR-2)
**And** `workflow_dispatch` is included as a secondary trigger (allows manual runs for testing)

### AC-2 — Spider manifest drives workflow iteration

**Given** `scraper/scraper/spiders/__manifest__.py` containing `SPIDERS = ['three_trolle', 'ale_planszowki']`
**When** the workflow runs step 1
**Then** it reads `SPIDERS` from the manifest at runtime and runs `scrapy crawl {spider}` for each entry
**And** a spider failure logs `::warning::` but does NOT fail the entire workflow step (individual spider errors are logged to `scrape_runs`, pipeline continues)
**And** adding a new spider requires only adding its name to `SPIDERS` — no `scraper.yml` changes

### AC-3 — ISR revalidation is non-blocking

**Given** POST to `/api/revalidate` when the ISR endpoint doesn't yet exist (Epic 4 not shipped)
**When** `curl` fails
**Then** `|| echo "::warning::ISR revalidation failed — stale data risk (fallback TTL 2h)"` prints a GH Actions warning
**And** the workflow step exits 0 — workflow continues to the next step

### AC-4 — db_health.py extended with check_database_size()

**Given** `scraper/utils/db_health.py` called in step 3
**When** `pg_database_size(current_database())` exceeds 400 MB
**Then** `check_database_size()` logs at CRITICAL level: "OPERATOR ALERT — Database size X.X MB exceeds 400 MB limit"
**And** the function returns `False`; the `__main__` block exits with code 1 (causes GH Actions failure email to operator)

**Given** both `check_database_size()` and `check_product_count_baseline()` run in the `__main__` block
**When** either returns False
**Then** the script exits with code 1 (any health violation fails the step and alerts operator)

### AC-5 — validate-workflows.yml catches missing/exceeded timeout

**Given** `scraper.yml` exists and `validate-workflows.yml` runs on push/PR
**When** the YAML linter checks all jobs in `scraper.yml`
**Then** it passes without error when `timeout-minutes: 14` is set
**And** if `timeout-minutes` is removed or set > 14, the linter fails with a descriptive error

### AC-6 — Full run completes under 14 minutes

**Given** a successful full workflow run against Neon with live data
**When** inspected in GitHub Actions
**Then** the entire scraper job completes under 14 minutes for both stores combined (NFR-2)
**And** a `scrape_runs` row exists in Neon for each store after run

### AC-7 — Tests: no regressions in existing suite

**Given** no Python source changes to existing test-covered files (only `db_health.py` updated)
**When** `cd scraper && uv run pytest -v` is run
**Then** all **145** existing tests pass (zero regressions)
**And** new `test_db_health.py` tests cover `check_database_size()`: above threshold, below threshold, connection handled

---

## Tasks / Subtasks

- [x] Task 1 — Create `scraper/scraper/spiders/__manifest__.py`
  - [x] Define `SPIDERS = ['three_trolle', 'ale_planszowki']` — one name per active spider (exact `name` attribute from each spider class)
  - [x] No imports needed — plain Python list only

- [x] Task 2 — Update `scraper/utils/db_health.py`: add `check_database_size()`
  - [x] Add `check_database_size(conn) -> bool` function (see Dev Notes for exact implementation)
  - [x] Update `__main__` block to call both checks: `check_database_size(conn)` AND `check_product_count_baseline(conn)`
  - [x] Exit with code 1 if either check fails (current baseline check already exits 1 on failure — ensure both are evaluated)

- [x] Task 3 — Write `scraper/tests/test_db_health.py` (or extend existing test file if one exists)
  - [x] Test: `check_database_size()` returns False when size > 400 MB, logs CRITICAL
  - [x] Test: `check_database_size()` returns True when size <= 400 MB, logs INFO
  - [x] Use `unittest.mock.MagicMock` for the cursor (same pattern as other pipeline tests)
  - [x] Run full suite — **150** passed (145 baseline + 5 new), zero regressions

- [x] Task 4 — Create `.github/workflows/scraper.yml`
  - [x] See Dev Notes for complete YAML content
  - [x] Ensure `timeout-minutes: 14` is on the job (not the individual steps)
  - [x] Spider step reads `SPIDERS` from `__manifest__.py` dynamically via bash + Python inline
  - [x] BGG enrichment step uses `uv run python -m utils.bgg_enrichment`
  - [x] db_health step uses `uv run python -m utils.db_health`
  - [x] ISR revalidate step has `|| echo "::warning::..."` fallback
  - [x] Alert engine placeholder step uses plain `echo`

- [x] Task 5 — Verify `validate-workflows.yml` passes with new `scraper.yml`
  - [x] Confirmed `timeout-minutes: 14` on `scrape` job via YAML file inspection (line 12)

---

## Dev Notes

### What Already Exists (Critical — Do Not Reinvent)

**`scraper/utils/db_health.py`** — EXISTS. Has `check_product_count_baseline(conn)` from Story 2.6.
- The comment at the top explicitly says: `Story 2.5: check_database_size() will be added here later.`
- Only add `check_database_size(conn)` and update `__main__`. Do NOT touch `check_product_count_baseline`.

**`scraper/utils/bgg_enrichment.py`** — EXISTS. Story 2.4. Called as `python -m utils.bgg_enrichment`. Works when `cd scraper && uv run python -m utils.bgg_enrichment`.

**`.github/workflows/validate-workflows.yml`** — EXISTS. Already checks `scraper.yml` for `timeout-minutes ≤ 14`. Currently exits 0 with a warning when `scraper.yml` doesn't exist — once you create it, it will actually validate it. This workflow triggers on push/PR when `.github/workflows/**` changes.

**`.github/workflows/selector-health.yml`** — EXISTS. Already complete from Story 2.6. Do NOT touch.

**`.github/workflows/maintenance.yml`** — EXISTS. Do NOT touch.

**`scraper/scraper/spiders/`** — Has `three_trolle.py` (class `ThreeTrolleSpider`, `name = "three_trolle"`) and `ale_planszowki.py` (class `AlePlanszowkiSpider`, `name = "ale_planszowki"`). The manifest names must match the spider `name` attributes exactly.

---

### `__manifest__.py` — Complete Content

```python
# scraper/scraper/spiders/__manifest__.py
SPIDERS = ['three_trolle', 'ale_planszowki']
```

That is the entire file. No imports, no docstrings needed.

To add a new spider in the future: append its `name` string to `SPIDERS`. The workflow reads it at runtime.

---

### `check_database_size()` — Complete Implementation

Add this function to `scraper/utils/db_health.py` (after `check_product_count_baseline`, before `if __name__ == "__main__"`):

```python
def check_database_size(conn) -> bool:
    """Check pg_database_size() and alert operator if > 400 MB.

    Returns True if within limit, False if over limit.
    """
    with conn.cursor() as cur:
        cur.execute("SELECT pg_database_size(current_database())")
        size_bytes = cur.fetchone()[0]

    size_mb = size_bytes / (1024 * 1024)

    if size_mb > 400:
        logger.critical(
            "OPERATOR ALERT — Database size %.1f MB exceeds 400 MB limit",
            size_mb,
        )
        return False

    logger.info("Database size OK: %.1f MB", size_mb)
    return True
```

Update the `__main__` block to call both checks. Replace the current `__main__` with:

```python
if __name__ == "__main__":
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
        size_ok = check_database_size(conn)
        baseline_ok = check_product_count_baseline(conn)
    finally:
        conn.close()

    if not size_ok or not baseline_ok:
        sys.exit(1)
```

**Why both checks run even if size fails:** We want all health information in one CI run, not just the first failure. Both are cheap DB queries.

---

### `scraper.yml` — Complete Content

```yaml
name: Daily Scraper

on:
  schedule:
    - cron: '0 6 * * *'  # Daily 6:00 AM UTC
  workflow_dispatch:       # Allow manual trigger for testing/debugging

jobs:
  scrape:
    name: Scrape + enrich + health check + revalidate
    runs-on: ubuntu-latest
    timeout-minutes: 14

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install uv
        run: pip install uv

      - name: Install scraper dependencies
        run: cd scraper && uv sync

      - name: Step 1 — Run all spiders
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: |
          cd scraper
          SPIDERS=$(uv run python3 -c "from scraper.spiders.__manifest__ import SPIDERS; print(' '.join(SPIDERS))")
          echo "Spiders: $SPIDERS"
          for spider in $SPIDERS; do
            echo "--- Running spider: $spider ---"
            uv run scrapy crawl "$spider" || echo "::warning::Spider $spider exited with non-zero code"
          done

      - name: Step 2 — BGG enrichment for pending games
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          BGG_API_TOKEN: ${{ secrets.BGG_API_TOKEN }}
        run: |
          cd scraper
          uv run python -m utils.bgg_enrichment

      - name: Step 3 — Database health check
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: |
          cd scraper
          uv run python -m utils.db_health

      - name: Step 4 — Revalidate Vercel ISR
        env:
          VERCEL_URL: ${{ secrets.VERCEL_URL }}
          REVALIDATION_SECRET: ${{ secrets.REVALIDATION_SECRET }}
        run: |
          curl --retry 3 --retry-delay 10 --retry-connrefused -f \
            -X POST "$VERCEL_URL/api/revalidate" \
            -H "x-revalidate-secret: $REVALIDATION_SECRET" \
          || echo "::warning::ISR revalidation failed — stale data risk (fallback TTL 2h)"

      - name: Step 5 — Alert engine placeholder (Epic 6)
        run: echo "Alert engine not yet implemented — Epic 6"
```

**Key design choices explained:**

1. **Spider iteration via bash**: `uv run python3 -c "...print(' '.join(SPIDERS))"` outputs space-separated names; bash `for spider in $SPIDERS` iterates. Pure bash + inline Python, no separate runner script.

2. **Spider failures are `::warning::` not `exit 1`**: Per epics, a spider failure records `scrape_runs.status='failed'` but the cycle continues. The `|| echo "::warning::..."` pattern matches this — operator sees the warning in GH Actions UI without aborting the enrichment/health steps.

3. **Step 3 exits 1 on health breach**: `python -m utils.db_health` exits with code 1 when either check fails. This fails the GH Actions step → GH sends failure email to repo watchers → operator is alerted (NFR-8).

4. **ISR step is non-blocking**: `/api/revalidate` doesn't exist until Epic 4. The `|| echo "::warning::..."` ensures the workflow continues — Epic 3 static shell will work fine with fallback TTL (ADR-003).

5. **`uv sync` installs from `uv.lock`**: Deterministic, fast (~4s vs pip ~45s). Same pattern as `selector-health.yml`.

---

### Required GitHub Secrets

These must exist in the repo's Settings → Secrets → Actions before the workflow can succeed end-to-end:

| Secret | Already set? | Notes |
|--------|-------------|-------|
| `DATABASE_URL` | ✅ (from Story 1.2) | psycopg2-compatible connection string |
| `BGG_API_TOKEN` | ✅ (from Story 1.5) | Bearer token |
| `VERCEL_URL` | ❓ Check | `https://your-project.vercel.app` — no trailing slash |
| `REVALIDATION_SECRET` | ❓ Check | Used by `/api/revalidate` (Epic 4 will consume this) |

`VERCEL_URL` and `REVALIDATION_SECRET` can be set as placeholder values for now — the ISR step will `::warning::` until Epic 4 is deployed.

---

### Module Path Convention

The workflow runs `cd scraper` first, then `uv run python -m utils.bgg_enrichment` and `uv run python -m utils.db_health`. This works because:

- `pyproject.toml` has `pythonpath = ["."]` under `[tool.pytest.ini_options]`
- BUT for `python -m`, it uses the current directory as the root
- When `cd scraper` is in effect: `scraper/utils/bgg_enrichment.py` → module `utils.bgg_enrichment` ✅

For the manifest import: `from scraper.spiders.__manifest__ import SPIDERS` — when running from `scraper/` dir, `scraper.spiders.__manifest__` resolves to `scraper/scraper/spiders/__manifest__.py` ✅

This convention is already established in Story 2.4 Dev Notes and tested.

---

### Test Pattern for `check_database_size()`

Follow the same mock pattern already used in the project (psycopg2 cursor mock):

```python
# scraper/tests/test_db_health.py
import logging
from unittest.mock import MagicMock, patch

import pytest

from utils.db_health import check_database_size


def make_conn(size_bytes: int) -> MagicMock:
    cursor = MagicMock()
    cursor.__enter__ = lambda s: cursor
    cursor.__exit__ = MagicMock(return_value=False)
    cursor.fetchone.return_value = (size_bytes,)
    conn = MagicMock()
    conn.cursor.return_value = cursor
    return conn


def test_check_database_size_within_limit():
    conn = make_conn(300 * 1024 * 1024)  # 300 MB
    assert check_database_size(conn) is True


def test_check_database_size_exactly_at_limit():
    conn = make_conn(400 * 1024 * 1024)  # exactly 400 MB — NOT over
    assert check_database_size(conn) is True


def test_check_database_size_over_limit(caplog):
    conn = make_conn(401 * 1024 * 1024)  # 401 MB — over limit
    with caplog.at_level(logging.CRITICAL):
        result = check_database_size(conn)
    assert result is False
    assert "OPERATOR ALERT" in caplog.text
    assert "401" in caplog.text or "400" in caplog.text  # size mentioned


def test_check_database_size_far_over_limit(caplog):
    conn = make_conn(600 * 1024 * 1024)  # 600 MB
    with caplog.at_level(logging.CRITICAL):
        result = check_database_size(conn)
    assert result is False
```

**Existing test files to check for existing db_health tests** — run `ls scraper/tests/` to confirm if `test_db_health.py` already exists (unlikely since Story 2.6 focused on `check_product_count_baseline`). If it does exist, extend it; otherwise create new.

---

### CLAUDE.md Compliance Checklist

- [ ] `logger = logging.getLogger(__name__)` already at module level in `db_health.py` — confirm it stays
- [ ] Zero `print()` calls in `db_health.py` — only `logger.*` calls
- [ ] `datetime.now(timezone.utc)` — not used in this story's new code (no timestamps written)
- [ ] No DB schema changes in this story — no `schema.ts` / `items.py` sync required

---

## File Locations Summary

| File | Action | Notes |
|------|--------|-------|
| `.github/workflows/scraper.yml` | NEW | Complete content in Dev Notes |
| `scraper/scraper/spiders/__manifest__.py` | NEW | 2-line file: `SPIDERS = [...]` |
| `scraper/utils/db_health.py` | UPDATE | Add `check_database_size()`, update `__main__` |
| `scraper/tests/test_db_health.py` | NEW (or UPDATE) | 4+ tests for `check_database_size()` |

**DO NOT touch:**
- `web/` — Dev A territory
- `scraper/utils/bgg_enrichment.py` — Story 2.4, complete
- `scraper/utils/bgg_client.py` — Story 2.4, complete
- `scraper/pipelines/` — Stories 2.1–2.3, complete
- `.github/workflows/selector-health.yml` — Story 2.6, complete
- `.github/workflows/maintenance.yml` — Story 1.3, complete
- `.github/workflows/validate-workflows.yml` — Story 1.3, complete (runs automatically on your PR)

---

## File Locations (Actual Changes)

| File | Action |
|------|--------|
| `.github/workflows/scraper.yml` | NEW — daily cron workflow, 5 steps, timeout-minutes: 14 |
| `scraper/scraper/spiders/__manifest__.py` | NEW — `SPIDERS = ['three_trolle', 'ale_planszowki']` |
| `scraper/utils/db_health.py` | UPDATE — added `check_database_size()`, updated `__main__` to call both checks |
| `scraper/tests/test_db_health.py` | UPDATE — added `TestCheckDatabaseSize` (5 tests) |

## Change Log

- 2026-06-24: Story 2.5 implemented — scraper.yml (daily cron), __manifest__.py (spider registry), check_database_size() in db_health.py, 5 new tests. 150 passing total.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

- **Task 1:** Created `scraper/scraper/spiders/__manifest__.py` — single-line `SPIDERS` list. Spider names match `name` attribute on `ThreeTrolleSpider` and `AlePlanszowkiSpider`.
- **Task 2:** Added `check_database_size(conn) -> bool` to `db_health.py`. Queries `pg_database_size(current_database())`, returns False + logs CRITICAL when > 400 MB. Updated `__main__` to call both health checks; exits 1 if either fails.
- **Task 3:** Extended existing `test_db_health.py` — added `_make_conn_size()` helper (uses `fetchone` not `fetchall`) and `TestCheckDatabaseSize` with 5 tests. Confirmed RED (ImportError) before implementation, then GREEN.
- **Task 4:** Created `.github/workflows/scraper.yml` — 5 steps in order, `timeout-minutes: 14` on job. Spider step reads `SPIDERS` list at runtime via `python3 -c "...print(' '.join(SPIDERS))"` + bash `for` loop. ISR step has non-blocking `|| echo "::warning::..."` fallback. Alert engine placeholder step is plain `echo`.
- **Task 5:** Verified `scraper.yml` has `timeout-minutes: 14` on line 12 of the YAML (job level, not step level) — consistent with what `validate-workflows.yml` checks.
- **Test result:** 150 passed, 4 deselected (live marker), 0 regressions.

### Debug Notes

- uv trampoline fails in PowerShell/cmd when path contains spaces. Workaround: call `.venv\Scripts\python.exe -m pytest` directly. No impact on actual CI (Linux runner has no path-space issue).
- Task 3 confirmed existing `test_db_health.py` with 9 tests for `check_product_count_baseline`. Extended in-place rather than creating new file.
