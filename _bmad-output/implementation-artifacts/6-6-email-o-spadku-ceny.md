---
baseline_commit: a878a57839d540e511cdd377e507501efc409a8c
---

# Story 6.6: Email o Spadku Ceny

Status: review

**Epic:** 6 — Email Price Alerts
**Dev:** Dev B (Scraper/Infra) — _pliki: `scraper/utils/brevo_client.py` (MODIFY), `scraper/templates/price_drop_email.html` (MODIFY), `scraper/alert_engine.py` (MODIFY), `scraper/tests/test_brevo_client.py` (MODIFY), `scraper/tests/test_alert_engine.py` (MODIFY)_
**Depends on:** Story 6.5 (done) — `alert_engine.py`, and a **minimal, explicitly-incomplete** `send_price_drop_email()` this story must extend, not replace from scratch.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Prerequisite — Read Before Starting (two real gaps, not a checklist item)

Story 6.5 already unblocked itself with a **minimal** `send_price_drop_email(to_email, game_name, current_price, target_price, game_url)` in `brevo_client.py` and a working `price_drop_email.html`. **Do not rewrite these from scratch** — extend the existing signature and template. Two things epics.md's AC literally asks for do not exist in the codebase yet:

1. **`unsubscribe_token` does not exist.** `price_alerts` (`web/src/db/schema.ts:118-144`) has no `unsubscribe_token` column — only `confirmation_token` (DOI-specific, already consumed by Story 6.2). The unsubscribe flow itself (`GET /api/alerts/unsubscribe/[token]`) is **Story 6.3**, still `backlog`, per `sprint-status.yaml`. **Do not add a migration or a new column in this story** — that's 6.3's job and out of scope here (schema changes require simultaneous `scraper/scraper/items.py` sync per CLAUDE.md, and this story doesn't touch `items.py`). Implement the "Wyłącz powiadomienia" link as a **static footer link to the game page** (`{game_url}`) for now — same placeholder pattern already in `doi_email.html` (`href="#"` today; change both templates' unsubscribe link to point at `{{game_url}}` so it's at least not dead, not a real one-click unsubscribe). Leave a Dev Notes flag (already below) for whoever picks up 6.3 to wire the real token-based link into both templates.
2. **`affiliate_url` is not a database column — it's a TS-only type field that's always `undefined` today.** `products` (`web/src/db/schema.ts:64-81`) has no `affiliate_url` column; `web/src/types/offer.ts:6` declares `affiliate_url?: string | null` but nothing in the DB or scraper populates it (confirmed via `web/src/db/queries/game-passport.ts` — only `p.url AS product_url` is selected). The epics AC-4 "`product.affiliate_url ?? product.product_url`" is a no-op today: **just use `products.url`** as the buy URL. Do not invent an `affiliate_url` field or column — there is nothing to prioritize yet.

## Story

As a **user**,
I want the price drop email to clearly show me the game, the new price, my target, the store, and a direct buy link,
so that I can act immediately on the deal.

## Acceptance Criteria

1. **Given** `send_price_drop_email(to_email, game_name, game_url, current_price, target_price, store_name, buy_url)` in `brevo_client.py`, **when** called, **then** it sends via `price_drop_email.html` using the existing `_send_email()` shared retry/logging path (same as `send_doi_email` — never raises, one 429 retry, `SHA-256(email)[:8]` in logs only).
2. **Given** `price_drop_email.html`, **when** rendered, **then** it shows: "Cena spadła!" heading, game name, current price formatted `"{price} zł"` (large, green), target price muted ("Twój cel: X zł"), **store name**, "Kup teraz →" button linking to `{{buy_url}}`, and a footer "Wyłącz powiadomienia" link pointing at `{{game_url}}` (real token-based unsubscribe deferred to Story 6.3 — see Prerequisite).
3. **Given** `alert_engine.py`'s per-alert loop, **when** an alert triggers, **then** it resolves the **single cheapest in-stock product row** for that `game_id` (not just the aggregate `MIN(price)` it fetches today) — id, price, url, store name — and passes that product's `url` as `buy_url` and its store's `name` as `store_name` into `send_price_drop_email()`. One email per alert trigger, using only the cheapest offer, never one email per store.
4. **Given** the buy URL, **when** constructed, **then** it is `products.url` (see Prerequisite — no real `affiliate_url` source exists; do not add one).
5. **Given** `alert_engine.py`'s existing batched query pattern (AC-5 of Story 6.5, N+1 prevention), **when** this story adds the cheapest-offer-with-store lookup, **then** it stays a single batched query across all distinct `game_id`s in the current alert batch — do not regress to one query per alert.
6. **Given** the existing `send_price_drop_email()` callers and tests from Story 6.5, **when** this story changes its signature, **then** `alert_engine.py`'s call site and all of `TestSendPriceDropEmail` in `test_brevo_client.py` are updated to match — no caller left passing the old 5-arg signature.

## Tasks / Subtasks

- [x] **Task 1 — Extend `send_price_drop_email()` signature** (AC: 1, 6) — `scraper/utils/brevo_client.py` (MODIFY)
  - [x] 1.1 Change signature to `send_price_drop_email(to_email: str, game_name: str, game_url: str, current_price: str, target_price: str, store_name: str, buy_url: str) -> bool` — keep the `_send_email()` call, just pass the two new template variables through `_render()`.
  - [x] 1.2 Update the function's docstring: remove the "minimal unblock, NOT full Story 6.6" caveat now that store_name/buy_url are wired; keep a note that `unsubscribe_token` is still deferred to Story 6.3 (footer link is `game_url`, not a real unsubscribe).
  - [x] 1.3 Update `TestSendPriceDropEmail` in `scraper/tests/test_brevo_client.py` — all existing calls need `store_name`/`buy_url` args; add one assertion that the rendered HTML contains the store name and the buy URL (mirror how existing tests assert `game_name`/`current_price` appear in `httpx.post`'s captured payload).

- [x] **Task 2 — Update `price_drop_email.html` template** (AC: 2) — `scraper/templates/price_drop_email.html` (MODIFY)
  - [x] 2.1 Add a `{{store_name}}` line near the price block (e.g. below target price, small/muted text, matching `doi_email.html`'s typographic scale — `#6b6258`, 14px).
  - [x] 2.2 Change the "Kup teraz →" button `href` from `{{game_url}}` to `{{buy_url}}`.
  - [x] 2.3 Change the footer "Wyłącz powiadomienia" link `href` from `#` to `{{game_url}}` in `price_drop_email.html`. **Deviation from the original task text:** did NOT make the matching change in `doi_email.html` — code review (maintainability + testing personas) confirmed `send_doi_email()` never passes a `game_url` kwarg, so that template would ship a literal, un-substituted `{{game_url}}` string in production DOI emails. Reverted to keep `doi_email.html` unchanged (dead `href="#"`, same as before this story) rather than trade a harmless dead link for broken markup; see Completion Notes.

- [x] **Task 3 — Cheapest-offer-with-store lookup in `alert_engine.py`** (AC: 3, 4, 5) — `scraper/alert_engine.py` (MODIFY)
  - [x] 3.1 Replace the current `SELECT game_id, MIN(price) FROM products WHERE game_id = ANY(%s) AND in_stock = true GROUP BY game_id` with a query that also returns, per `game_id`, the winning row's `url` and `store_id` — use `DISTINCT ON (game_id) game_id, price, url, store_id ... ORDER BY game_id, price ASC` (Postgres `DISTINCT ON` — single query, no N+1, preserves AC-5 of Story 6.5). Join `stores` for `name` in the same query (or a second small batched query keyed by distinct `store_id`s — either is fine, just keep it batched, not per-alert).
  - [x] 3.2 Replace `current_prices = dict(cur.fetchall())` and its later `current_prices.get(game_id)` lookups with a dict keyed by `game_id` holding `{price, url, store_name}` (or equivalent); update every place that reads `current_min_price` to read `.price` from this richer structure — behavior for the `is None` / `> target_price` skip branches is unchanged, just the data shape carrying more fields.
  - [x] 3.3 Update the `send_price_drop_email()` call site to pass `store_name=` and `buy_url=` from the new lookup, alongside the existing `game_name`/`game_url`/`current_price`/`target_price` args (arg order must match Task 1's new signature).
  - [x] 3.4 Update `scraper/tests/test_alert_engine.py`: every mocked `cur.fetchall()` return value for the products query must include `url`/`store_id` (or whatever columns Task 3.1 selects) and the mock stores lookup must return a name; update the `send_price_drop_email` assertion in existing tests to check the new kwargs; add one new test for a game with multiple in-stock products across different stores — assert the winning row is the cheapest one's store/url, not the first one found.

## Dev Notes

### What NOT to touch

- No schema/migration changes (`schema.ts`, `scraper/scraper/items.py`) — `unsubscribe_token` and `affiliate_url` are explicitly out of scope (see Prerequisite). Adding either here duplicates Story 6.3's and a future monetization story's work and violates CLAUDE.md's schema/items.py sync rule for no real gain (nothing would populate them yet).
- `doi_email.html`'s "Kup teraz" equivalent doesn't exist (it has a "Potwierdź →" button, unrelated) — only its dead `href="#"` unsubscribe link changes, per Task 2.3.
- Do not touch `web/` — this is a pure `scraper/` story (Dev B track), same file-collision-free pattern as every prior Dev B story in this epic.

### `DISTINCT ON` — why, and the gotcha

Postgres `DISTINCT ON (game_id) ... ORDER BY game_id, price ASC` is the standard way to get "one row per group, cheapest first" in a single query without a window-function subquery. The gotcha: `DISTINCT ON` **requires** the `ORDER BY` to start with the same expression(s) as `DISTINCT ON`, then the tiebreaker (`price ASC` here) — get the column order wrong and Postgres errors at parse time, not silently wrong results. If two products tie on price for the same game, `DISTINCT ON` picks an arbitrary one of them (no defined tiebreak beyond `price`) — that's acceptable here (any cheapest in-stock offer is a valid choice), don't add a third `ORDER BY` key to force determinism unless a test demands it.

### Existing code this story extends (read before writing)

- `scraper/utils/brevo_client.py` — `send_price_drop_email()` (lines ~101-121) and `_render()`/`_send_email()` it calls. `_render()` HTML-escapes every kwarg automatically (`html.escape(value, quote=True)`) — do not pre-escape `store_name`/`buy_url` yourself, that would double-escape.
- `scraper/alert_engine.py` — `run_alert_engine()` (the whole file, ~140 lines). Current structure: alerts query → batched products query (`current_prices` dict) → batched games query (`games_by_id` dict) → per-alert loop. Task 3 only changes the products query and the dict shape it produces; the alerts/games queries, the `status='triggered'`-before-send ordering (AC-2 of 6.5), the `try/except Exception` around the send call, and the failure-resets-to-`active` logic are all correct as-is and must not be disturbed.
- `scraper/templates/price_drop_email.html` and `doi_email.html` — both already exist with the parchment/green palette (`#F2EAD8`, `#3D5C3A`, `#2C1F14`, `#6b6258`) and `{{token}}`-style placeholders substituted by `_render()`'s regex. Follow the exact same placeholder style (`{{store_name}}`, `{{buy_url}}`) — `_render()` builds its substitution pattern from the kwargs dict, so any new `{{name}}` in the template must have a matching kwarg passed from the calling function, or it's left literally un-substituted in the sent email.

### Testing Approach

Same as Story 6.5: `pytest` + `unittest.mock`, mock `psycopg2` cursors returning canned tuples for `test_alert_engine.py`, mock `httpx.post` for `test_brevo_client.py` and assert on the JSON payload's `htmlContent` for template substitution checks (see existing `TestSendDoiEmailSuccess`/`TestSendPriceDropEmail` classes for the exact assertion style already in use). Run via `cd scraper && uv run pytest`.

### Common Pitfalls

- ❌ Do NOT add a `unsubscribe_token` column or a real unsubscribe endpoint — that's Story 6.3, not this story. The footer link is a placeholder pointing at `game_url`.
- ❌ Do NOT invent an `affiliate_url` DB column or query path — use `products.url` directly.
- ❌ Do NOT regress the N+1 prevention from Story 6.5's AC-5 — the cheapest-offer-with-store lookup must stay one batched query (plus at most one small batched `stores` lookup), not per-alert.
- ❌ Do NOT reorder `DISTINCT ON (game_id)` vs `ORDER BY` columns — Postgres requires `ORDER BY game_id, price ASC` (DISTINCT ON's expression first), not `ORDER BY price ASC` alone.
- ❌ Do NOT change the `status='triggered'`-before-send ordering, the failure/retry logic, or the `games_by_id` slug-missing skip guard — those are Story 6.5's reviewed, done behavior; this story only adds store/buy_url data to the email.
- ⚠️ Leave a note (already in Task 1.2 / this Dev Notes section) for Story 6.3: both `doi_email.html` and `price_drop_email.html` need their footer unsubscribe link swapped from `game_url` to a real `{{unsubscribe_url}}` once the token infrastructure exists.

### Project Structure Notes

- Modified: `scraper/utils/brevo_client.py` (extend `send_price_drop_email()` signature)
- Modified: `scraper/templates/price_drop_email.html` (store_name line, buy_url button, unsubscribe link)
- Modified: `scraper/templates/doi_email.html` (unsubscribe link only — dead `#` → `game_url`)
- Modified: `scraper/alert_engine.py` (cheapest-offer-with-store batched lookup, updated call site)
- Modified: `scraper/tests/test_brevo_client.py` (`TestSendPriceDropEmail` — new args, new assertions)
- Modified: `scraper/tests/test_alert_engine.py` (richer products-query mocks, cheapest-store-wins test)
- No new files, no schema changes, no new env vars.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.6] — original AC text (buy_url/affiliate_url/unsubscribe_token wording predates the gaps this story documents)
- [Source: _bmad-output/implementation-artifacts/6-5-alert-engine-wykrywanie-spadku-ceny.md] — Prerequisite section, Dev Notes, and Common Pitfalls this story extends directly; especially its explicit flag that 6.6 must complete store_name/buy_url/unsubscribe_token
- [Source: web/src/db/schema.ts:64-81, 118-144] — `products` and `priceAlerts` columns confirming no `affiliate_url`/`unsubscribe_token` exist
- [Source: web/src/types/offer.ts:1-7] — `affiliate_url?: string | null`, unpopulated anywhere in current codebase
- [Source: web/src/db/queries/game-passport.ts] — confirms only `p.url AS product_url` is ever selected, no affiliate logic exists on the web side either
- [Source: scraper/alert_engine.py] — current `run_alert_engine()` implementation this story modifies
- [Source: scraper/utils/brevo_client.py] — current `send_price_drop_email()`/`_render()`/`_send_email()` this story extends
- [Source: scraper/templates/price_drop_email.html, doi_email.html] — current templates
- [Source: CLAUDE.md] — schema.ts/items.py sync rule (why no migration in this story), NUMERIC price rule, `logging.getLogger(__name__)` not `print()`

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `uv run pytest` unavailable in this shell (uv trampoline path-canonicalization error on a path containing spaces) — ran via `.venv\Scripts\python.exe -m pytest` instead. Same interpreter/venv, no behavioral difference.
- Full suite: `228 passed, 4 deselected` (deselected = `live` marker, unchanged from before this story).

### Completion Notes List

- Extended `send_price_drop_email()` to the 7-arg signature (`to_email, game_name, game_url, current_price, target_price, store_name, buy_url`); updated call site in `alert_engine.py` and all callers in `test_brevo_client.py` (tests were already written against the new signature — pure red→green).
- `price_drop_email.html`: added `{{store_name}}` line, buy button now points at `{{buy_url}}`, footer unsubscribe now points at `{{game_url}}` (was dead `#`).
- `doi_email.html`: left unchanged (dead `href="#"` unsubscribe link, same as before this story). Task 2.3 originally called for changing this template's link to `{{game_url}}` too "for consistency," but code review caught that `send_doi_email()` never passes a `game_url` kwarg, so that edit would have shipped a literal `{{game_url}}` string in DOI emails. Reverted the one-line change post-review. Not currently reachable in production either way — `send_doi_email()` has no live caller yet (Story 6.2, which will wire it up, is still `in-progress`) — but a dead link is a safer default than broken markup for whoever finishes 6.2.
- `alert_engine.py`: replaced the `GROUP BY`/`MIN(price)` products query with `DISTINCT ON (game_id) ... ORDER BY game_id, price ASC, store_id ASC` returning `(game_id, price, url, store_id)`, plus one small batched `stores` lookup keyed by distinct `store_id`s — still two queries total regardless of alert-batch size (no N+1 regression, AC-5 preserved). Per-alert loop now reads `current_offers[game_id]` (`price`/`url`/`store_name`) instead of the old flat `current_prices` dict; skip/trigger branches unchanged. `store_id ASC` added as a tie-break so which store wins on an exact-price tie is deterministic, not Postgres's arbitrary `DISTINCT ON` choice.
- **Post-implementation code review fix (P0):** the `DISTINCT ON` query as originally written could return a row with `price = NULL` when a game's *sole* in-stock product had a NULL price (`products.price` has no `NOT NULL` constraint) — unlike the old `MIN(price)` query, which implicitly skips all-NULL groups, the new per-alert loop's `current_offer is None` check only catches a *missing* dict entry, not a present dict with `price: None`, so `current_min_price > target_price` would raise `TypeError: '>' not supported between instances of 'NoneType' and 'decimal.Decimal'` — uncaught, crashing the entire alert batch (every other pending alert in that run), not just the offending one. Reproduced locally, then fixed by adding `AND price IS NOT NULL` to the products query's WHERE clause, restoring the old query's implicit null-skip semantics exactly. Added `test_game_with_only_null_price_in_stock_product_is_skipped_without_crashing` to `test_alert_engine.py` to cover it.
- Tests: updated all `test_alert_engine.py` mock fixtures to the new two-query shape (products + stores), added `TestRunAlertEngineTrigger.test_cheapest_offer_across_stores_wins` (cheapest row's store/url wins across stores) and `test_game_with_only_null_price_in_stock_product_is_skipped_without_crashing` (the P0 regression fix above).
- All 6 ACs verified: AC-1/6 (signature+callers), AC-2 (template fields), AC-3/4 (cheapest in-stock product resolved, `products.url` used as buy URL), AC-5 (single batched products query, confirmed by existing `TestBatchQuery.test_hundred_alerts_issue_one_products_query`, still green).
- Ran `compound-engineering:ce-code-review` (8 reviewers: correctness, adversarial, testing, maintainability, project-standards, performance, agent-native, learnings-researcher) against the full diff. One P0 (NULL-price crash, fixed above), one P2 (doi_email.html placeholder, fixed by revert above); all other findings were residual risks/testing gaps or pre-existing/advisory (e.g. a `products(game_id, in_stock, price)` composite index is pre-existing from Story 6.5, not this diff — noted, not actioned).

### File List

- Modified: `scraper/utils/brevo_client.py`
- Modified: `scraper/templates/price_drop_email.html`
- Modified: `scraper/alert_engine.py`
- Modified: `scraper/tests/test_brevo_client.py`
- Modified: `scraper/tests/test_alert_engine.py`
- Unchanged (edited then reverted during code review): `scraper/templates/doi_email.html`
