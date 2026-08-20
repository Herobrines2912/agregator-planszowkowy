---
baseline_commit: 317c3b7af04abbc52a1528c2ac313783ceace527
---

# Story 6.7: Type B Anomaly Detection

Status: done

**Epic:** 6 — Email Price Alerts
**Dev:** Dev B (Scraper/Infra) — _pliki: `scraper/alert_engine.py` (MODIFY), `scraper/utils/brevo_client.py` (MODIFY), `scraper/templates/price_drop_email.html` (MODIFY), `web/src/db/schema.ts` (MODIFY — schema-owner exception, see Prerequisite), `db/migrations/*` (NEW — generated), `scraper/tests/test_alert_engine.py` (MODIFY), `scraper/tests/test_brevo_client.py` (MODIFY)_
**Depends on:** Story 6.5 (done) — `run_alert_engine()`; Story 6.6 (done, `review`) — `send_price_drop_email()`'s current 7-arg signature and `price_drop_email.html`, both extended (not replaced) by this story.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Prerequisite — Read Before Starting (epics.md is stale here; five real decisions this story resolves)

epics.md's Story 6.7 section describes a design that doesn't match the current codebase in several places. Read this section fully before touching code — it resolves every ambiguity so `dev-story` has one unambiguous spec, not a guess.

1. **`price_alerts.type_b_enabled` already exists** (`web/src/db/schema.ts:128`, `boolean.notNull().default(false)`, from the original schema migration). epics.md's AC says `DEFAULT TRUE` — that's stale/aspirational. **Do not touch this column or its default.** Flipping existing subscribers to Type B by default without consent would be a RODO-relevant product decision far outside this story's scope. No migration needed for this column.
2. **`price_alerts.last_type_b_notified_at` does NOT exist yet** — this story adds it via migration. Use `timestamptz` (CLAUDE.md: always `TIMESTAMPTZ`, never bare `TIMESTAMP` — epics.md's plain "TIMESTAMP" wording is wrong), nullable, no default (`NULL` = never notified).
3. **Cooldown is per-alert-row, not per-threshold-level.** epics.md's AC says cooldown is "per (email_hash, game_id, threshold_level)", but only one timestamp column exists (`last_type_b_notified_at`) — there's no column to track *which* threshold was last notified. Building that would mean a second new column and materially more logic for a distinction nothing in the acceptance criteria actually exercises. **Decision:** treat the cooldown as one 24h window per alert row, gating on `last_type_b_notified_at` alone, regardless of which threshold triggers next. This fully satisfies the one concrete test scenario in epics.md ("crossed 50% last cycle, still below it — no duplicate"). If per-threshold granularity is ever needed, that's a follow-up story with its own column.
4. **One email per alert per run, using the deepest threshold crossed** — not "one email per threshold crossed" as epics.md's plural phrasing suggests. If a price suddenly crosses 50%, 70%, and 80% in the same run (e.g. after being untouched for a while), sending three separate emails in one run is spammy and provides no extra value over one email reporting the best number. Compute `max(threshold for threshold in [80, 70, 50] if drop_pct >= threshold)` and send a single email naming that threshold.
5. **`send_price_drop_email()` gets one new optional kwarg, not a fork.** `price_drop_email.html` gets one new placeholder, `{{header_prefix}}`. Do not create a second template or a second send function — Story 6.6 already established "extend, don't replace" for this exact function, and Type B is the same email shape with a different heading/subject prefix and a different discount framing, not a different email.

## Story

As a **user**,
I want to receive an alert when a game's price drops dramatically (50%/70%/80% below its original price),
so that I'm notified about exceptional deals even without setting a specific price threshold.

## Acceptance Criteria

1. **Given** `price_alerts.last_type_b_notified_at` (`timestamptz`, nullable, added via migration in this story), **when** the migration runs, **then** `web/src/db/schema.ts` gets the matching field in the same PR (existing rows get `NULL` — never-notified — no backfill needed). `type_b_enabled` is **not** touched (see Prerequisite #1).
2. **Given** a new `run_type_b_alerts(conn)` function in `scraper/alert_engine.py`, **when** called, **then** it queries `price_alerts WHERE status = 'active' AND alert_type = 'price_drop' AND type_b_enabled = true`, resolves each alert's `game_id` to its cheapest in-stock offer (reusing the same query shape `run_alert_engine()` already uses — see Task 2 on extracting a shared helper), and for offers where `price_orig IS NOT NULL AND price_orig > 0` computes `drop_pct = (price_orig - price) / price_orig`.
3. **Given** an alert whose current cheapest offer's `drop_pct >= 0.50`, **when** `last_type_b_notified_at` is `NULL` or more than 24h old, **then** it sends one Type B email using the deepest crossed threshold among `[0.80, 0.70, 0.50]` (Prerequisite #4) and sets `last_type_b_notified_at = now()`. **`status` is not changed** — Type B alerts stay `'active'` indefinitely and re-evaluate every run (Prerequisite #3), unlike Type A's one-shot `'triggered'` transition.
4. **Given** an alert whose `last_type_b_notified_at` is within the last 24h, **when** `run_type_b_alerts()` runs again and the game is still above any new threshold, **then** no email is sent and no DB write happens for that alert (matches epics.md's only concrete test case).
5. **Given** a game with `price_orig IS NULL` (or `<= 0`) on its cheapest offer, **when** `run_type_b_alerts()` evaluates that alert, **then** it is skipped — same exclusion pattern as `hot-deals.ts`'s `price_orig IS NOT NULL AND price_orig::numeric > 0` guard (`web/src/db/queries/hot-deals.ts:80-81`).
6. **Given** `send_price_drop_email(..., header_prefix: str = "")` (new optional kwarg, default preserves Story 6.6's existing call sites unchanged), **when** `header_prefix` is non-empty, **then** it is HTML-escaped and substituted into `{{header_prefix}}` in `price_drop_email.html` (placed immediately before "Cena spadła!" in the `<h1>`) and prepended to the email subject. **Every call site must pass `header_prefix` explicitly or rely on the default — never leave the template's `{{header_prefix}}` token unsubstituted** (see Dev Notes — this is the exact bug class code review caught in Story 6.6 for `doi_email.html`'s `{{game_url}}`).
7. **Given** a Type B email, **when** constructed, **then** `header_prefix="WYJĄTKOWA OKAZJA! "` (note trailing space, so it reads "WYJĄTKOWA OKAZJA! Cena spadła!" with no double-space and no missing space), and the buy URL/store name come from the same cheapest-in-stock-offer resolution as Type A (Story 6.6 pattern) — one email using the cheapest offer, never one per store.
8. **Given** the alert's `target_price` is `NULL` (valid — a pure Type B subscription created with no threshold, per epics.md's Flipper Mode flow, Story 7.6), **when** building the Type B email, **then** pass the literal string `"—"` (em dash) as `target_price` to `send_price_drop_email()` so the template's existing "Twój cel: X zł" line renders as "Twój cel: — zł" instead of leaving a blank or `None`-shaped value (matches this project's `formatNull` em-dash convention; do not add template conditionals for this — accepted minor cosmetic tradeoff, see Dev Notes).
9. **Given** `run_alert_engine()` (existing Type A logic, unrenamed — see Dev Notes) and `run_type_b_alerts()` (new), **when** `main()` runs, **then** it calls both sequentially against the same connection — single entry point for GitHub Actions, matching epics.md's orchestrator requirement without the literal `run_type_a_alerts()` rename epics.md's stale text implies (renaming would force-update all ~20 existing `test_alert_engine.py` call sites for zero behavioral gain).

## Tasks / Subtasks

- [x] **Task 1 — Migration + schema.ts** (AC: 1) — `web/src/db/schema.ts` (MODIFY), `db/migrations/*` (NEW)
  - [x] 1.1 Add `last_type_b_notified_at: timestamptz('last_type_b_notified_at'),` to the `priceAlerts` table definition in `web/src/db/schema.ts` (nullable, no default — insert it near `type_b_enabled` for readability).
  - [x] 1.2 Run `cd web && npx drizzle-kit generate` to produce the migration file + journal/meta entries automatically. **Do not hand-write the `db/migrations/meta/*_snapshot.json` files** — they're generated artifacts; follow the existing numbered-file convention (`db/migrations/0006_*.sql`) that `drizzle-kit generate` will produce.
  - [x] 1.3 Verify the generated SQL: `db/migrations/0006_right_star_brand.sql` contains a single `ALTER TABLE "price_alerts" ADD COLUMN "last_type_b_notified_at" timestamp with time zone;` — nullable, no default, no backfill. Deviation from this subtask's originally-worded `IF NOT EXISTS` expectation: drizzle-kit's own generated output (confirmed against `0005_games_add_parent_game_id.sql`, also drizzle-generated) never adds `IF NOT EXISTS` — only the one hand-written migration (`0004`) does. Kept the generated form to match the actual tool convention; harmless since this column has never existed before.

- [x] **Task 2 — Extract shared cheapest-in-stock-offer helper** (AC: 2, 5, 7) — `scraper/alert_engine.py` (MODIFY)
  - [x] 2.1 Extract `run_alert_engine()`'s existing products+stores lookup (the `DISTINCT ON (game_id) ... AND price IS NOT NULL ... ORDER BY game_id, price ASC, store_id ASC` query plus the batched `stores` lookup, added in Story 6.6's code review fix) into a shared helper, e.g. `_cheapest_in_stock_offers(conn, game_ids) -> dict[int, dict]`, returning `{game_id: {"price": ..., "price_orig": ..., "url": ..., "store_name": ...}}`. Add `price_orig` to the `SELECT` list (Type A already ignores it; Type B needs it) — do not change the `WHERE`/`ORDER BY` clauses otherwise, they're correct as-is (Story 6.6 review-fixed).
  - [x] 2.2 Update `run_alert_engine()` to call this helper instead of its inline query block. Confirm `test_alert_engine.py`'s existing mocks (which mock `cur.fetchall()` in query order, not by function name) still line up — the helper still issues exactly 2 queries (products, stores), so call-order-based mocks are unaffected as long as the helper is called at the same point in the sequence.
  - [x] 2.3 Reason for extracting now rather than duplicating: Story 6.6's code review caught a P0 (NULL-price crash) in this exact query shape. Two independent copies of a `DISTINCT ON` + NULL-guard query is exactly the kind of duplication where one copy gets fixed and the other doesn't. One helper, one place to get it right.

- [x] **Task 3 — `run_type_b_alerts()`** (AC: 2, 3, 4, 5, 9) — `scraper/alert_engine.py` (MODIFY)
  - [x] 3.1 Add `run_type_b_alerts(conn) -> None`: query `SELECT id, game_id, email, target_price, last_type_b_notified_at FROM price_alerts WHERE status = 'active' AND alert_type = 'price_drop' AND type_b_enabled = true`. If empty, log and return (mirror `run_alert_engine()`'s early-return style).
  - [x] 3.2 Batch-resolve cheapest in-stock offers for the distinct `game_id`s via the Task 2 helper.
  - [x] 3.3 Per alert: skip if no offer for `game_id`; skip if `offer["price_orig"] is None or offer["price_orig"] <= 0` (AC-5); compute `drop_pct = (offer["price_orig"] - offer["price"]) / offer["price_orig"]`; determine the deepest crossed threshold via `next((t for t in (Decimal("0.80"), Decimal("0.70"), Decimal("0.50")) if drop_pct >= t), None)` — skip if `None`.
  - [x] 3.4 Cooldown check (AC-4): skip (no email, no DB write) if `last_type_b_notified_at is not None and (datetime.now(timezone.utc) - last_type_b_notified_at) < timedelta(hours=24)`. `datetime.now(timezone.utc)` per CLAUDE.md — never naive `datetime.now()`.
  - [x] 3.5 Resolve `game_name`/`game_slug` the same way `run_alert_engine()` does (batched `games` query — can reuse the same batching pattern, doesn't need extraction into a shared helper since it's a single trivial `SELECT`).
  - [x] 3.6 Build `target_price` arg per AC-8 (`"—"` when the alert's `target_price` column is `NULL`, else `str(target_price)`).
  - [x] 3.7 Call `send_price_drop_email(..., header_prefix="WYJĄTKOWA OKAZJA! ")` inside the same `try/except Exception` pattern `run_alert_engine()` uses around its send call (log + treat as failed, do not let one alert's exception crash the batch — this mirrors the exact regression class Story 6.6's code review found and fixed in the Type A path).
  - [x] 3.8 On successful send: `UPDATE price_alerts SET last_type_b_notified_at = now() WHERE id = %s`, commit. **Do not touch `status`.** On failed send: log a warning, do not update `last_type_b_notified_at` (so it retries next run, same cooldown-not-yet-started semantics as a fresh alert).
  - [x] 3.9 Update `main()` to call `run_type_b_alerts(conn)` after `run_alert_engine(conn)`, same connection, sequentially (AC-9).

- [x] **Task 4 — `send_price_drop_email()` + template `header_prefix`** (AC: 6, 7) — `scraper/utils/brevo_client.py` (MODIFY), `scraper/templates/price_drop_email.html` (MODIFY)
  - [x] 4.1 Add `header_prefix: str = ""` as the last parameter of `send_price_drop_email()`. Pass it through `_render()` as a new kwarg. Build the subject as `f"{header_prefix}{PRICE_DROP_EMAIL_SUBJECT}"` (empty prefix reproduces today's exact subject, no behavior change for existing Type A callers).
  - [x] 4.2 In `price_drop_email.html`, change `<h1 ...>Cena spadła!</h1>` to `<h1 ...>{{header_prefix}}Cena spadła!</h1>`.
  - [x] 4.3 Update `run_alert_engine()`'s existing Type A call site to pass `header_prefix=""` explicitly (don't rely on the default silently) — makes the contract visible at the call site and matches this story's own AC-6 requirement that every caller pass it explicitly.
  - [x] 4.4 Update `test_brevo_client.py`'s `TestSendPriceDropEmail`: existing calls keep passing (default `header_prefix=""` reproduces old behavior — verify via one assertion that the rendered subject/HTML has no leading prefix when omitted); add new assertions for a non-empty `header_prefix` call (subject prefixed, `{{header_prefix}}` substituted in `htmlContent`, no literal `{{header_prefix}}` leaking through when empty string is passed — this is the specific defect class to guard against per AC-6).

- [x] **Task 5 — Tests for `run_type_b_alerts()`** (AC: 2, 3, 4, 5, 8, 9) — `scraper/tests/test_alert_engine.py` (MODIFY)
  - [x] 5.1 New `TestRunTypeBAlerts` class, following the existing `_make_conn(query_results)` mock pattern. Cover: (a) drop >= 50% with `last_type_b_notified_at = NULL` → email sent, `last_type_b_notified_at` updated, `status` untouched; (b) drop >= 80% → deepest threshold (0.80, not 0.50) confirmed via the `threshold=%s` log line; (c) `last_type_b_notified_at` 1 hour ago → no email, no DB write (cooldown); (d) `last_type_b_notified_at` 25 hours ago → email sent again (cooldown expired); (e) `price_orig IS NULL` → skipped; (f) `price_orig <= 0` → skipped; (g) `target_price IS NULL` on the alert row → `send_price_drop_email` called with `target_price="—"`; (h) send raises an exception → caught, no crash, `last_type_b_notified_at` NOT updated (retries next run); (i) no active alerts → noop; (j) 100 active Type B alerts → still a fixed, small number of queries (no N+1) — mirrors `TestBatchQuery`'s pattern. 10 tests total.
  - [x] 5.2 Added `TestMainEntrypoint.test_main_calls_both_type_a_and_type_b_in_sequence` — mocks `psycopg2.connect`, `run_alert_engine`, `run_type_b_alerts` at module level, asserts both called once each with the same connection object — matches AC-9.
  - [x] 5.3 Regression: all 13 pre-existing `TestRunAlertEngineTrigger`/`TestBatchQuery` tests pass unmodified in assertions after the Task 2 extraction — only their fixture tuples grew a `price_orig` element (5-tuple instead of 4-tuple) to match the extended `SELECT`, per Task 2.1's explicit scope. No other changes were needed.

## Dev Notes

### What NOT to touch

- `type_b_enabled`'s existing column/default — see Prerequisite #1. Do not add a migration for it.
- `price_alerts.status`'s Type A semantics (`'triggered'` one-shot transition) — untouched, Type B never writes `status`.
- Story 6.3 (`unsubscribe_token`) is still `backlog` — same placeholder pattern as Story 6.6 applies here too; nothing new to do, the Type B email reuses the same template's existing (placeholder) unsubscribe link.
- Do not build a second email template or a second send function for Type B — see Prerequisite #5.

### The `{{header_prefix}}` bug class — read this before Task 4

Story 6.6's code review found and fixed a real production bug: a template placeholder (`{{game_url}}` in `doi_email.html`) that no caller ever substituted, so it rendered as a literal, broken `{{game_url}}` string in the sent email. `_render()`'s substitution is purely mechanical — **any `{{name}}` in a template with no matching kwarg from the caller is left in the output verbatim.** `header_prefix` is a new placeholder in a template Type A *already* calls — if Task 4.3 is skipped (i.e. the existing `run_alert_engine()` call site isn't updated to pass `header_prefix=""`), every Type A price-drop email sent after this story ships will contain the literal text `{{header_prefix}}Cena spadła!` in production. This is not a hypothetical — it is the exact same defect class from the immediately preceding story. Task 4.4's "no literal `{{header_prefix}}` leaking through when empty string is passed" test exists specifically to catch this before it ships.

### `run_alert_engine()` naming — why it's not renamed

epics.md's Story 6.5/6.7 text calls the Type A function `run_type_a_alerts()`. The actual codebase (Story 6.5, `done`) named it `run_alert_engine()`, and ~20 tests across `test_alert_engine.py` call it by that name. Renaming now is pure churn — every existing test would need a mechanical find/replace for zero behavioral change — so this story keeps the name and satisfies AC-9's "single entry point" requirement via `main()` calling both functions, not via a name matching epics.md's draft literally.

### `price_orig` / discount-percentage precedent

`web/src/db/queries/hot-deals.ts:72-81` already computes the identical ratio (`(price_orig - price) / price_orig`) with the identical guard (`price_orig IS NOT NULL AND price_orig::numeric > 0`) for the Hot Deals feed. This story's Python-side `drop_pct` calculation and guard are the server-side (Postgres/psycopg2, `Decimal`) equivalent of that same TS/SQL pattern — same formula, same edge-case exclusion, different runtime. `web/src/lib/calc.ts`'s `calcDiscount()` (client-side display rounding, `Math.round(...)`) is a different concern (UI badge percentage) and not what this story computes — this story's thresholds (0.50/0.70/0.80) are compared directly against the unrounded ratio.

### Testing Approach

Same as Stories 6.5/6.6: `pytest` + `unittest.mock`, mock `psycopg2` cursors returning canned tuples, mock `httpx.post` for brevo_client-level tests. Prices as `Decimal`, never `str`, in test fixtures that feed comparison logic (matches existing test file's own documented convention). Run via `cd scraper && uv run pytest` (or `.venv\Scripts\python.exe -m pytest` if the `uv` trampoline errors on a path containing spaces — known issue from Story 6.6, same interpreter/venv either way).

### Common Pitfalls

- ❌ Do NOT add a migration for `type_b_enabled` or change its default — it already exists (Prerequisite #1).
- ❌ Do NOT set `price_alerts.status = 'triggered'` anywhere in `run_type_b_alerts()` — Type B alerts stay `'active'` forever, gated only by `last_type_b_notified_at`.
- ❌ Do NOT hand-write `db/migrations/meta/*_snapshot.json` — use `npx drizzle-kit generate`.
- ❌ Do NOT forget `header_prefix=""` at the existing Type A call site — see "The `{{header_prefix}}` bug class" above.
- ❌ Do NOT duplicate the cheapest-in-stock-offer query — extract the shared helper (Task 2) first.
- ❌ Do NOT send one email per threshold crossed — one email, deepest threshold only (Prerequisite #4).

### Project Structure Notes

- Modified: `web/src/db/schema.ts` (add `last_type_b_notified_at` to `priceAlerts`)
- New (generated via `drizzle-kit generate`): `db/migrations/0006_*.sql` + matching `db/migrations/meta/*` entries
- Modified: `scraper/alert_engine.py` (extract shared offer-lookup helper, add `run_type_b_alerts()`, update `main()`)
- Modified: `scraper/utils/brevo_client.py` (`header_prefix` kwarg on `send_price_drop_email()`)
- Modified: `scraper/templates/price_drop_email.html` (`{{header_prefix}}` placeholder in `<h1>`)
- Modified: `scraper/tests/test_alert_engine.py` (new `TestRunTypeBAlerts`, helper-extraction regression coverage)
- Modified: `scraper/tests/test_brevo_client.py` (`header_prefix` coverage)
- No changes to `scraper/scraper/items.py` — `price_alerts` is not a scraper-written table (the CLAUDE.md schema.ts/items.py sync rule only applies to tables the scraper populates: `products`, `price_history`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.7] — original AC text; several points are stale/aspirational per Prerequisite above (DEFAULT TRUE, per-threshold cooldown, `run_type_a_alerts()` naming, "for each threshold crossed")
- [Source: _bmad-output/implementation-artifacts/6-6-email-o-spadku-ceny.md] — the `{{game_url}}` unsubstituted-placeholder bug this story must not repeat with `{{header_prefix}}`; the NULL-price/`DISTINCT ON` query this story extracts into a shared helper
- [Source: web/src/db/schema.ts:118-144] — `priceAlerts` table, confirms `type_b_enabled` already exists (default `false`), `last_type_b_notified_at` does not
- [Source: web/src/db/queries/hot-deals.ts:72-81] — `discount_ratio` formula and `price_orig` NULL/zero guard this story's Python logic mirrors
- [Source: scraper/alert_engine.py] — current `run_alert_engine()` (post-6.6) this story extends
- [Source: scraper/utils/brevo_client.py, scraper/templates/price_drop_email.html] — current `send_price_drop_email()`/template this story extends
- [Source: db/migrations/0004_price_alerts_token_issued_at.sql] — existing migration convention for adding a nullable timestamptz column to `price_alerts`
- [Source: CLAUDE.md] — TIMESTAMPTZ-always rule, NUMERIC/Decimal rule, `datetime.now(timezone.utc)` rule, schema.ts/items.py sync rule (and its scope — scraper-written tables only)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npx tsc --noEmit` clean after `schema.ts` change.
- `npx vitest run` (web): 314 passed, 26 files, no regressions.
- `.venv\Scripts\python.exe -m pytest` (scraper, `uv` trampoline still errors on this path with spaces — same known issue as Story 6.6): 242 passed pre-review, 247 passed post-review-fixes, 4 deselected (`live` marker), no regressions.

### Completion Notes List

- Task 1: `web/src/db/schema.ts` — added `last_type_b_notified_at: timestamptz(...)` to `priceAlerts` (nullable, no default). Migration generated via `npx drizzle-kit generate` → `db/migrations/0006_right_star_brand.sql`, a single `ALTER TABLE ... ADD COLUMN` with no backfill (existing rows → `NULL` = never notified). `type_b_enabled` left untouched per Prerequisite #1.
- **Post-implementation code review fix (P1):** `run_type_b_alerts()`'s query originally filtered `status = 'active'`. A single `price_alerts` row can carry both a Type A `target_price` and `type_b_enabled=true` — once Type A's one-shot target fires, `run_alert_engine()` sets `status='triggered'`, which was silently and permanently removing that same row from all future Type B evaluation (contradicts AC-3's "Type B alerts stay active indefinitely and re-evaluate every run"). Fixed by matching `status IN ('active', 'triggered')` instead — only `'cancelled'`/`'pending_doi'` rows are now excluded. Added `test_alert_triggered_by_type_a_still_evaluated_for_type_b`.
- **Post-implementation code review fix (P2, reliability + adversarial):** `main()` called `run_alert_engine(conn)` then `run_type_b_alerts(conn)` with no failure isolation — an unhandled exception in the Type A pass would abort the whole job and skip Type B entirely for that cycle. Wrapped each pass in its own `try/except Exception` (log + continue), with `main()` now exiting non-zero (`sys.exit(3)`) if either pass failed, so the GitHub Actions run still surfaces as failed. Added `test_type_a_failure_does_not_prevent_type_b_from_running`.
- **Post-implementation code review fix (P2, reliability):** the post-send `UPDATE price_alerts SET last_type_b_notified_at = now()` was unguarded — a DB failure there (after a successful email send) would crash the whole Type B batch and leave the cooldown unpersisted (risking a duplicate email next run for every other pending alert in that batch too). Wrapped in its own `try/except Exception` (log only, matches Type A's existing failure-tolerance philosophy for post-send DB writes). Added `test_cooldown_update_failure_does_not_crash_batch`.
- **Post-implementation code review fix (testing gaps, P2 x2):** added `test_no_in_stock_offer_at_all_is_skipped` and `test_missing_game_record_skipped_without_sending` for `run_type_b_alerts()`, mirroring the equivalent already-covered Type A skip paths.
- Ran `compound-engineering:ce-code-review` (10 reviewers: correctness, adversarial, testing, maintainability, project-standards, performance, reliability, data-migration, agent-native, learnings-researcher) against the full diff (staged, HEAD=317c3b7). 1 P1 + 3 P2 findings fixed above (247 tests passing, up from 242); everything else was clean, pre-existing, or an accepted low-confidence residual risk (e.g. `_cheapest_in_stock_offers()` running twice per `main()` invocation — negligible at once-daily cron frequency, not fixed).
- Task 2: extracted `_cheapest_in_stock_offers(conn, game_ids)` from `run_alert_engine()`'s inline query block; added `price_orig` to its `SELECT`. `run_alert_engine()` now calls the helper — all 13 pre-existing Type A tests pass with only their fixture tuples extended by one `price_orig` element.
- Task 3: `run_type_b_alerts(conn)` added — queries `type_b_enabled = true` alerts, resolves cheapest in-stock offers via the shared helper, computes `drop_pct`, picks the deepest crossed threshold from `(0.80, 0.70, 0.50)`, gates on a 24h cooldown (`last_type_b_notified_at`), sends via `send_price_drop_email(..., header_prefix="WYJĄTKOWA OKAZJA! ")`, and on success only updates `last_type_b_notified_at` (never `status` — Type B alerts stay `'active'` and re-evaluate every run). `main()` now calls `run_alert_engine(conn)` then `run_type_b_alerts(conn)` sequentially.
- Task 4: `send_price_drop_email()` gained `header_prefix: str = ""` (last param, backward-compatible default). Subject becomes `f"{header_prefix}{PRICE_DROP_EMAIL_SUBJECT}"`; template's `<h1>` gained a `{{header_prefix}}` placeholder immediately before "Cena spadła!". `run_alert_engine()`'s existing call site updated to pass `header_prefix=""` explicitly, per AC-6's "every caller must pass it explicitly" requirement — this is the exact bug class (unsubstituted template token) Story 6.6's code review caught for `doi_email.html`'s `{{game_url}}`; verified no `{{header_prefix}}` leaks through in either the empty or non-empty case via new tests.
- Task 5: added `TestRunTypeBAlerts` (10 tests) and `TestMainEntrypoint.test_main_calls_both_type_a_and_type_b_in_sequence`. Full scraper suite: 229 → 242 passed (13 new tests: 10 Type B + 1 main-integration + 2 header_prefix in `test_brevo_client.py`).
- All 9 ACs verified: AC-1 (migration + schema.ts, `type_b_enabled` untouched), AC-2/5 (cheapest-offer resolution + `price_orig` NULL/≤0 guard), AC-3/4 (send + 24h cooldown, `status` untouched), AC-6 (backward-compatible `header_prefix` kwarg, no template-token leak), AC-7 (Type B prefix + cheapest-offer reuse), AC-8 (`target_price` em-dash fallback), AC-9 (`main()` calls both sequentially).

### File List

- Modified: `web/src/db/schema.ts`
- New (generated): `db/migrations/0006_right_star_brand.sql`
- New (generated): `db/migrations/meta/0006_snapshot.json`
- Modified (generated): `db/migrations/meta/_journal.json`
- Modified: `scraper/alert_engine.py`
- Modified: `scraper/utils/brevo_client.py`
- Modified: `scraper/templates/price_drop_email.html`
- Modified: `scraper/tests/test_alert_engine.py`
- Modified: `scraper/tests/test_brevo_client.py`

### Review Findings

- [x] [Review][Patch] Missing `conn.rollback()` between Type A and Type B passes in `main()` — a real DB-level error in `run_alert_engine()` leaves `conn` in an aborted-transaction state, cascading `InFailedSqlTransaction` into `run_type_b_alerts()` and defeating the intended failure isolation [scraper/alert_engine.py:main()] — fixed, `conn.rollback()` added to both except blocks, regression test `test_type_a_db_failure_rolls_back_before_type_b_runs` added
- [x] [Review][Defer] `priceAlerts.status` TS `.$type<>()` union omits `'triggered'`, a real value written by the scraper and now formally relied upon by Story 6.7's `status IN ('active', 'triggered')` — pre-existing since Story 6.5, `confirmAlert()`'s `assertNever` switch is type-unsound as a result [web/src/db/schema.ts:135, web/src/db/queries/alerts.ts:157-215] — deferred, pre-existing
