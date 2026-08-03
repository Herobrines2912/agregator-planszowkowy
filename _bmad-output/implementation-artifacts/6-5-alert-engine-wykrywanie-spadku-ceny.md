---
baseline_commit: 57ba7d2fc44b91db116ee07b253c201e072af088
---

# Story 6.5: Alert Engine — Wykrywanie Spadku Ceny

Status: ready-for-dev

**Epic:** 6 — Email Price Alerts
**Dev:** Dev B (Scraper/Infra)
**Depends on:** Story 6.4 (`brevo_client.py`, done) for the Brevo-send pattern to follow — see Prerequisite below regarding Story 6.6
**Followed by:** Story 6.7 (Type B Anomaly Detection) extends `alert_engine.py` built here; Story 6.8 (Brevo webhook suppression) reads `email_suppressions` this engine should also respect

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Prerequisite — Read Before Starting

AC-1 below requires calling `send_price_drop_email()`, which is **Story 6.6's** deliverable (`scraper/templates/price_drop_email.html` + `send_price_drop_email()` in `brevo_client.py`) and is currently `backlog` — it does not exist yet. Check `_bmad-output/implementation-artifacts/sprint-status.yaml` for `6-6-email-o-spadku-ceny` status before starting:

- **If 6.6 is `done`:** import and call the real `send_price_drop_email()`.
- **If 6.6 is still `backlog`:** you have two options — (a) coordinate with the team to do 6.6 first (recommended if capacity allows, since it's a small, isolated addition to `brevo_client.py` following the exact `send_doi_email()` pattern), or (b) write `alert_engine.py` against the function signature `send_price_drop_email(to_email: str, game_name: str, current_price: str, target_price: str, game_url: str) -> bool` and unit-test with `unittest.mock.patch`, leaving the real import in place — it will simply fail at runtime until 6.6 lands, which is fine since this engine only runs via GitHub Actions after a `scraper.yml` success, not in this story's test suite. **Do not implement `send_price_drop_email()` yourself** — that's out of scope and duplicates 6.6's work (template content, styling).

## Story

As a **user**,
I want to be notified automatically when a price drops to or below my target,
so that I don't have to check the site manually every day.

## Acceptance Criteria

1. **Given** `run_alert_engine()` in `alert_engine.py`, **when** called, **then** it queries all `price_alerts WHERE status = 'active' AND alert_type = 'price_drop'`, for each alert fetches the current minimum in-stock price for that `game_id` from `products` (`MIN(price) WHERE game_id = X AND in_stock = true`), and if `current_min_price <= target_price` calls `send_price_drop_email()` (Story 6.6) and sets `price_alerts.status = 'triggered'`.
2. **Given** an alert where price dropped below threshold, **when** notification is sent, **then** `status` is set to `'triggered'` **before** the Brevo call, not after — so a failed send doesn't re-trigger on the next cycle.
3. **Given** `alert_engine.yml` GitHub Actions workflow, **when** reviewing, **then** it runs on `workflow_run` trigger after `scraper.yml` completes successfully (not on an independent schedule) — alerts are checked after each new scrape, not on a separate cron.
4. **Given** `alert_engine.py`, **when** `DATABASE_URL` or `BREVO_API_KEY` is missing, **then** the script exits with code 1 and a clear error message — GitHub Actions marks the run as failed.
5. **Given** the engine processing 100 active alerts, **when** run, **then** it batches the `products` query — one query for all distinct `game_id`s across active alerts, not one query per alert (N+1 prevention).
6. **Given** a network error calling Brevo during alert processing, **when** `send_price_drop_email()` returns `False`, **then** that alert's `status` is reset to `'active'` (not left as `'triggered'`), the error is logged, and it retries on the next scrape cycle.

## Tasks / Subtasks

- [ ] Task 1 — Implement `run_alert_engine()` core logic (AC: 1, 2, 5, 6)
  - [ ] Create `scraper/alert_engine.py`
  - [ ] Query active price-drop alerts: `SELECT id, game_id, email, target_price FROM price_alerts WHERE status = 'active' AND alert_type = 'price_drop'`
  - [ ] Batch-fetch current min prices: one query for all distinct `game_id`s (`SELECT game_id, MIN(price) FROM products WHERE game_id = ANY(%s) AND in_stock = true GROUP BY game_id`) — avoid N+1 (AC-5)
  - [ ] For each alert where `current_min_price IS NOT NULL AND current_min_price <= target_price`: `UPDATE price_alerts SET status = 'triggered' WHERE id = %s` **first**, then call `send_price_drop_email()` (AC-2)
  - [ ] On `send_price_drop_email()` returning `False`: `UPDATE price_alerts SET status = 'active' WHERE id = %s` and log the failure (AC-6)
  - [ ] Skip alerts whose `game_id` has no in-stock products (`current_min_price` is `NULL` from the `GROUP BY` — no row for that game) — nothing to compare, not an error

- [ ] Task 2 — Fail-fast env checks + `main()` entrypoint (AC: 4)
  - [ ] `main()` reads `DATABASE_URL`; if missing, log error and `sys.exit(1)` — follow `db_health.py`'s `main()` pattern exactly (`utils/db_health.py:119-132`)
  - [ ] `BREVO_API_KEY` check is implicit: `brevo_client.py` already raises `EnvironmentError` at import time if missing (`utils/brevo_client.py:21-23`) — importing `send_price_drop_email` at module top-level in `alert_engine.py` is sufficient, no duplicate check needed
  - [ ] `psycopg2.connect(database_url)` wrapped in try/except `psycopg2.OperationalError` → log + `sys.exit(2)`, matching `db_health.py:128-132`

- [ ] Task 3 — `alert_engine.yml` GitHub Actions workflow (AC: 3)
  - [ ] Create `.github/workflows/alert_engine.yml` with `on: workflow_run: workflows: ["Daily Scraper"], types: [completed]`, guarded by `if: github.event.workflow_run.conclusion == 'success'`
  - [ ] Steps: checkout, setup Python 3.11, `pip install uv`, `cd scraper && uv sync`, `uv run python -m alert_engine` with `DATABASE_URL` and `BREVO_API_KEY` secrets
  - [ ] Remove the "Step 5 — Alert engine placeholder (Epic 6)" echo step from `.github/workflows/scraper.yml` (lines 83-84) — it's superseded by this separate workflow-triggered file, not an inline step

- [ ] Task 4 — Tests (AC: 1, 2, 4, 5, 6)
  - [ ] Create `scraper/tests/test_alert_engine.py`
  - [ ] Mock `psycopg2` connection/cursor the same way as `test_db_health.py` (`MagicMock` with `__enter__`/`__exit__` context manager on `cursor()`)
  - [ ] Mock `send_price_drop_email` via `unittest.mock.patch('alert_engine.send_price_drop_email')` — do not call the real Brevo API in tests
  - [ ] Cover: price at/below target triggers email + status → `triggered`; price above target does nothing; status set to `triggered` before the send call (assert call order via `Mock` call sequence, not just end state); failed send resets status to `active`; missing `DATABASE_URL` → `sys.exit(1)`; 100-alert batch issues exactly one `products` query (assert `cur.execute` call count for the batch query), not one per alert; alert for a game with zero in-stock products is skipped without error

## Dev Notes

### Existing Brevo-send Pattern to Follow (Story 6.4)

`scraper/utils/brevo_client.py` establishes the pattern `send_price_drop_email()` (Story 6.6) will follow: `send_doi_email()` returns `True`/`False`, never raises for HTTP-level failures, retries once on 429 after 2s, logs only `SHA-256(email)[:8]` never the raw address (`utils/brevo_client.py:55-91`). `alert_engine.py` should treat `send_price_drop_email()` the same way — a boolean-returning call with no exception handling needed around it, only around the DB update logic.

### DB Connection Pattern — Reuse, Don't Reinvent

`scraper/utils/db_health.py` is the exact template for this story's `main()`: `psycopg2.connect(database_url)` wrapped in try/except, `conn.close()` in `finally`, `logging.basicConfig()` + `load_dotenv()` at the top of `main()` (`utils/db_health.py:119-147`). Follow this file's structure for `alert_engine.py`'s `main()` — same imports (`psycopg2`, `dotenv.load_dotenv`), same env-var-missing → `sys.exit(1)` behavior, same "cannot connect" → `sys.exit(2)` behavior.

### `price_alerts` / `products` Schema (web/src/db/schema.ts)

- `priceAlerts` (`web/src/db/schema.ts:118-144`): `status` is `'pending_doi' | 'active' | 'cancelled'` in the TS `$type<>` — **this story adds `'triggered'` as a fourth runtime value used only by the Python side**; the TS union isn't updated by this story (no web-side UI reads `'triggered'` yet) but flag this for the next story that touches `price_alerts.status` in TS. `alert_type` is `'price_drop' | 'availability'` — this story only processes `'price_drop'` (AC-1); `'availability'` alerts belong to Epic 8.
- `products` (`schema.ts:64-79`): `price` is `numeric(10,2)`, nullable; `in_stock` boolean, `game_id` FK. The `MIN(price) WHERE in_stock = true` aggregate returns `NULL` (no row) for a game with zero in-stock products — Task 1 must treat that as "skip, not an error," not a crash.
- Per CLAUDE.md: prices are always `NUMERIC(10,2)` — never `float`/`real`. Comparing `current_min_price <= target_price` in SQL (both `NUMERIC` columns) avoids any Python float-precision issue; do the comparison in the `SELECT`/`WHERE` clause or with `Decimal`, never `float()`.

### Workflow Trigger — Resolve a Contradiction Before Building Task 3

`.github/workflows/scraper.yml` (lines 83-84) currently has an inline placeholder: `Step 5 — Alert engine placeholder (Epic 6)` that just echoes a message. The epics.md AC (and this story's AC-3) is explicit that alert checking happens via a **separate** `alert_engine.yml` workflow using `workflow_run` after `scraper.yml` (named `"Daily Scraper"`) completes — not as an inline step inside `scraper.yml`. Follow the AC literally: create the separate file and delete the placeholder echo step from `scraper.yml`. Do not repurpose the placeholder step in place of the new workflow file.

### Previous Story Intelligence (6.4)

- `brevo_client.py` already fails fast on missing `BREVO_API_KEY`/`BREVO_SENDER_EMAIL`/`BREVO_SENDER_NAME` at import time (`utils/brevo_client.py:19-31`) — importing `send_price_drop_email` from that module at the top of `alert_engine.py` gets this check for free; no need to duplicate it.
- 6.4's tests (`scraper/tests/test_brevo_client.py`) mock `httpx.post` directly rather than the whole client — for `alert_engine.py`, mock at the `send_price_drop_email` boundary instead (it's a different module under test), consistent with how `test_db_health.py` mocks `psycopg2` connections rather than the database itself.
- 6.4 went through two rounds of code review (env var whitespace handling, template placeholder re-injection) — keep `alert_engine.py` narrowly scoped to the AC's stated behavior to minimize review churn; do not add speculative retry/backoff logic beyond what AC-6 states (single reset-to-active on failure, no in-process retry loop — the retry *is* the next scrape cycle).

### Git Intelligence

Recent commits establish the pattern: one module + one co-located test file, `feat: Story N.N — <name>, N tests` commit message, `uv run pytest` for the scraper package. `db_health.py` (Story 2.6) is the closest structural analog to this story — same "connect, run checks, exit code on failure" shape, just querying `price_alerts`/`products` instead of `scrape_runs`.

### Testing Approach

`pytest` + `unittest.mock`, same pattern as `test_db_health.py`: build `MagicMock` connections with `cursor()` returning a context-manager mock whose `fetchall()`/`fetchone()` return canned rows. Patch `send_price_drop_email` at the `alert_engine` module's import site (`@patch('alert_engine.send_price_drop_email')`), not at `brevo_client`'s definition site, so the mock is actually used regardless of how the real function is later implemented.

### Common Pitfalls

- ❌ Do NOT set `status = 'triggered'` after the Brevo call — AC-2 requires it before, so a crash/failure mid-send never leaves an alert stuck in `'active'` re-sending duplicates, and a failed send correctly resets to `'active'` per AC-6 (not "never triggered at all").
- ❌ Do NOT query `products` once per alert — batch by distinct `game_id` (AC-5); test asserts a single query for the batch.
- ❌ Do NOT use `float()` anywhere on `price`/`target_price` — compare as `NUMERIC`/`Decimal` per CLAUDE.md.
- ❌ Do NOT implement `send_price_drop_email()` in this story — it's Story 6.6's file/function ownership; see Prerequisite.
- ❌ Do NOT add the alert-engine call as an inline step in `scraper.yml` — AC-3 requires a separate `workflow_run`-triggered file.

### Project Structure Notes

- New: `scraper/alert_engine.py`
- New: `scraper/tests/test_alert_engine.py`
- New: `.github/workflows/alert_engine.yml`
- Modified: `.github/workflows/scraper.yml` (remove placeholder Step 5, lines 83-84)
- No schema changes in this story — `'triggered'` is a new runtime string value in the existing `status` text column, not a migration (Drizzle `$type<>` union update is optional follow-up, not blocking)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.5]
- [Source: scraper/utils/brevo_client.py — `send_doi_email()` pattern to mirror for calling `send_price_drop_email()`]
- [Source: scraper/utils/db_health.py — `main()`/connection/exit-code pattern to reuse]
- [Source: scraper/tests/test_db_health.py — mock-connection test pattern]
- [Source: web/src/db/schema.ts — `priceAlerts`, `products` tables]
- [Source: .github/workflows/scraper.yml — placeholder Step 5 to remove, workflow name `"Daily Scraper"` for `workflow_run` reference]
- [Source: _bmad-output/implementation-artifacts/6-4-brevo-client-doi-email-template.md — Brevo client conventions, RODO email-hashing rules]
- [Source: CLAUDE.md — NUMERIC price rule, `datetime.now(timezone.utc)` rule, `logging.getLogger(__name__)` not `print()`]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
