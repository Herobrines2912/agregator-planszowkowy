---
baseline_commit: 55ac065
---

# Story 7.4: Flipper DB Query & calcMarginProxy()

Status: done

**Epic:** 7 — Flipper Mode
**Dev:** Dev B (Scraper/Infra) — _pliki: `web/src/db/queries/flipper.ts` (CREATE), `web/src/lib/calc.ts` (MODIFY), `web/src/lib/calc.test.ts` (CREATE), `web/src/db/queries/flipper.test.ts` (CREATE)_
**Depends on:** Story 7.1 (spike PASSED — `docs/spike-results/flipper-margin-proxy.md`) + real data in DB. Not blocked by 7.2/7.3 (UI stories, Dev A) — this story is pure query/calc layer, no UI dependency.

## Story

As a **developer**,
I want a query that returns flipper data sorted by margin descending and a pure function for margin calculation,
so that the Flipper Mode page always shows the most profitable opportunities first.

## Acceptance Criteria

1. **Given** `getFlipperDeals(filters?)` in `db/queries/flipper.ts` **when** called **then** it returns games with: `current_min_price` (lowest in-stock product price), `historical_max_price` (max from `price_history`), `margin_pct` (computed), `profit_estimate` (computed), sorted by `margin_pct` descending **and** games where `historical_max_price IS NULL` or `historical_max_price <= current_min_price` are excluded (margin ≤ 0% is not a flip opportunity).
2. **Given** `calcMarginProxy(currentPrice: string, historicalMax: string): number | null` in `lib/calc.ts` **when** called **then** returns `round((parseFloat(historicalMax) - parseFloat(currentPrice)) / parseFloat(currentPrice) * 100, 1)` — margin on cost, not on price **and** returns `null` if either argument is not a valid positive number — never throws, never returns `NaN`.
3. **Given** `getFlipperDeals()` with filter `{ type: 'base' }` **when** called **then** returns only games with `is_expansion = false` — same filter logic as hot-deals query.
4. **Given** the query **when** DB has 200 games but only 40 have sufficient price history **then** returns only the 40 — no padding with null rows.
5. **Given** `calcMarginProxy` in `lib/calc.ts` **when** unit-tested **then** covers: normal case, both null inputs, zero historicalMax, currentPrice > historicalMax → returns negative (valid — filtered out at query level, not calc level).

## Tasks / Subtasks

- [x] **Task 1 — `calcMarginProxy()` pure function** (AC: 2, 5) — `web/src/lib/calc.ts` (MODIFY)
  - [x] 1.1 Add `calcMarginProxy(currentPrice: string, historicalMax: string): number | null` — parses both args with `parseFloat`, validates both are finite and `> 0` (not just non-NaN — a `0` or negative `currentPrice` must also return `null`, since dividing by it is meaningless/would blow up), returns `null` on any invalid input instead of throwing.
  - [x] 1.2 Round result to 1 decimal per the spec formula (mirror `calcDiscount`'s existing `Math.round` shape, but 1 decimal place, e.g. `Math.round(x * 10) / 10`).
  - [x] 1.3 `web/src/lib/calc.test.ts` (CREATE — no test file exists yet for `calc.ts`; `calcDiscount`/`calcMinPrice` are currently only covered indirectly via component tests, this story adds the first dedicated one). Cover per AC 5: normal case (e.g. `calcMarginProxy('50.00', '150.00')` → `200.0`), both args null/invalid strings → `null`, `historicalMax = '0'` → `null` (fails the `> 0` validation), `currentPrice > historicalMax` → negative number (not `null` — filtering negative margins out is the query's job, not this function's, per AC 5's explicit wording).

- [x] **Task 2 — `getFlipperDeals()` query** (AC: 1, 3, 4) — `web/src/db/queries/flipper.ts` (CREATE)
  - [x] 2.1 Mirror the exact SQL shape already validated in Story 7.1's spike (`scraper/scripts/spike_flipper_margin_proxy.py` — this spike's SQL **is** this story's production formula, per Story 7.1's Dev Notes: "a PASS here would not predict what `getFlipperDeals()` actually returns in production" if the formulas ever diverged, so don't invent a different shape): `current_min_price` = lowest in-stock product price per game (`DISTINCT ON (game_id) ... WHERE in_stock = true AND price IS NOT NULL ORDER BY game_id, price ASC` — same cheapest-in-stock-offer pattern as `hot-deals.ts`'s `candidates`/`best_deals` CTEs), `historical_max_price` = `MAX(ph.price)` from `price_history` joined via `products.game_id`, exclude `historical_max_price <= current_min_price`.
  - [x] 2.2 Compute `margin_pct` and `profit_estimate` in SQL (not by calling `calcMarginProxy` after the fact — the query needs `margin_pct` to `ORDER BY`). `profit_estimate = round(historical_max_price - current_min_price, 2)` per Story 7.3's spec (`epics.md` L2134: `profit calculation: round(historical_max - current_price, 2)`). Cast all `NUMERIC` columns to `::text` in the final `SELECT` before returning, matching `hot-deals.ts`/`price-history.ts`'s existing pattern — never let a raw `Decimal`/`numeric` leak into the JS layer un-stringified.
  - [x] 2.3 `filters?: { type?: 'base' | 'expansion' }` — `type: 'base'` → `AND g.is_expansion = FALSE`, `type: 'expansion'` → `TRUE`, omitted → no clause. Identical shape to `hot-deals.ts`'s `typeClause`.
  - [x] 2.4 Return type `FlipperDeal[]` — include at minimum: `slug`, `game_name`, `cover_image_url`, `current_min_price`, `historical_max_price`, `margin_pct`, `profit_estimate`, `store_name`, `store_url` (the last two so Story 7.3's "Kup →" button has a link without a second query — same fields `hot-deals.ts` already returns for the same purpose).
  - [x] 2.5 `ORDER BY margin_pct DESC`. Wrap in `unstable_cache` with a `flipper-deals` tag, mirroring `getHotDeals`/`getPriceHistory`'s revalidate/tag pattern (check `hot-deals.ts`'s `revalidate: 7200` value for consistency — reuse the same cadence unless Dev Notes below say otherwise).
  - [x] 2.6 Runtime row-shape validation function (`parseFlipperDealRow`) matching `hot-deals.ts`'s `parseHotDealRow` defensive-parsing pattern — throw on missing/wrong-typed fields rather than silently returning malformed data.

- [x] **Task 3 — Query tests** (AC: 1, 3, 4) — `web/src/db/queries/flipper.test.ts` (CREATE)
  - [x] 3.1 Mirror `hot-deals.test.ts`'s mocking setup exactly (`vi.mock('@/db/index')`, `vi.mock('next/cache')`, `vi.mock('drizzle-orm')` with the same `sql` proxy shape) — empty rows → `[]`; mapped rows → correct shape; `type: 'base'` → SQL contains `is_expansion = FALSE`; `type: 'expansion'` → `TRUE`; no filter → clause empty; DB throws → rejects.
  - [x] 3.2 Regression-guard test (per `hot-deals.test.ts`'s own precedent comment on `ORDER BY id, price_numeric ASC`, not the text-cast column): assert the query text orders the `current_min_price` CTE by a numeric column, not a `::text`-cast one, and separately asserts `ORDER BY margin_pct DESC` appears in the final `SELECT`'s query text — both are silent-wrong-order bugs a text-based read wouldn't catch in review.
  - [x] 3.3 Test that a row with `historical_max_price` absent from the CTE join (game with no `price_history`) never appears — assert the exclusion clause (`historical_max_price <= current_min_price` / join semantics) is present in the query text, matching AC 1's wording.

## Dev Notes

### This story's SQL is not new — it's already been spiked and measured

Story 7.1's spike (`docs/spike-results/flipper-margin-proxy.md`, `scraper/scripts/spike_flipper_margin_proxy.py`) already ran this exact query shape against production data and confirmed 32.4% of in-stock games (2558 total) produce a sensible margin_pct. Do not redesign the formula — port the spike's SQL into TypeScript/`sql` template literal form, add the `is_expansion` filter (not present in the spike, which measured all games), and add caching. If the ported query's shape diverges from the spike's, the spike's PASS conclusion no longer predicts what this query actually returns — re-verify against the spike script if you change the CTE logic.

### Known caveat carried over from the 7.1 spike — do not treat as a bug to fix in this story

The 7.1 spike found a pre-existing `game_id` dedup contamination bug (208/4159 games have unrelated products merged under one `game_id`, tracked separately as **Story 2.2c**, currently `backlog`). This query will surface the same contamination — some rows may show a nonsensical `margin_pct` for a game whose `products` are actually a mix of unrelated titles. **Out of scope for this story** — 2.2c owns the fix. Do not add ad-hoc filtering here to work around it; that would duplicate/diverge from 2.2c's eventual fix.

### `current_min_price` pattern — reuse, don't reinvent

`hot-deals.ts`'s `candidates`/`best_deals` CTEs already solve "cheapest in-stock offer per game" (`DISTINCT ON (id) ... WHERE p.price IS NOT NULL AND p.in_stock = TRUE ... ORDER BY id, price_numeric ASC` — ordering by the **numeric** column, not the `::text`-cast one, per that file's own regression-guard test comment: sorting by text is lexicographic and silently picks the wrong "cheapest" row, e.g. `"199.00" < "89.00"`). Story 7.1's spike CTE (`current_prices`) already applies the same fix (`ORDER BY game_id, price ASC` on the numeric column). Follow this exactly — it's the single most likely place to reintroduce a bug already found and fixed once in this codebase.

### `NUMERIC(10,2)` / Decimal handling

Per project-wide rule (`CLAUDE.md`): prices are always `NUMERIC(10,2)` in Postgres, never `float`/`real`. `db.execute(sql...)` returns them as strings once cast with `::text` in the query (see `hot-deals.ts`/`price-history.ts` — neither ever lets a raw numeric leak through). `calcMarginProxy`'s signature takes `string` inputs for the same reason — parse with `parseFloat` only inside the pure function, never store as `number` in a query result type.

### Project Structure Notes

- Queries belong exclusively in `web/src/db/queries/*.ts` (CLAUDE.md, ESLint-enforced) — never inline in a page/component. Story 7.2/7.3 (Dev A, UI) will import `getFlipperDeals` from here; this story does not touch any `app/` or `components/` file.
- `lib/calc.ts` currently has two functions (`calcDiscount`, `calcMinPrice`), neither with dedicated tests — this story's `calc.test.ts` is new, not an addition to an existing test file.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.4] — this story's AC, verbatim
- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.3] — `profit_estimate` formula consumer spec (`round(historical_max - current_price, 2)`), margin badge thresholds this query's `margin_pct` feeds
- [Source: docs/spike-results/flipper-margin-proxy.md] — Story 7.1's validated SQL shape and measured coverage (32.4%/31.5%), the source of truth for this query's formula
- [Source: scraper/scripts/spike_flipper_margin_proxy.py] — runnable reference implementation of the exact CTEs to port
- [Source: web/src/db/queries/hot-deals.ts] — `current_min_price`/cheapest-in-stock-offer CTE pattern, `unstable_cache` usage, defensive row-parsing pattern to mirror
- [Source: web/src/db/queries/hot-deals.test.ts] — test mocking setup and regression-guard-test convention to mirror
- [Source: web/src/db/queries/price-history.ts] — `::text` cast pattern for NUMERIC columns
- [Source: web/src/lib/calc.ts] — existing pure-function conventions (`calcDiscount`, `calcMinPrice`) to extend
- [Source: web/src/db/schema.ts:32-97] — `games`/`products`/`price_history` table definitions
- [Source: _bmad-output/implementation-artifacts/2-2c-dedup-game-id-contamination-cleanup.md] — the game_id contamination caveat this story's query will inherit (out of scope here)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

- `npx vitest run src/lib/calc.test.ts` and `src/db/queries/flipper.test.ts` confirmed RED before implementation (function/module didn't exist), then GREEN after.
- Full suite: `npx vitest run` → 32 files, 370 tests, all passing, no regressions.
- `npx eslint` on all 4 touched files: clean.
- `npx tsc --noEmit`: clean.

### Completion Notes List

- `calcMarginProxy(currentPrice, historicalMax): number | null` added to `lib/calc.ts` — validates both inputs are finite and `> 0` (guards div-by-zero and nonsensical negative inputs), rounds to 1 decimal, returns a negative number (not `null`) when `currentPrice > historicalMax` per AC 5's explicit spec (filtering is the query's job).
- `getFlipperDeals(filters?)` added to `db/queries/flipper.ts` — CTE shape ported directly from Story 7.1's validated spike SQL (`current_prices`/`historical_max` CTEs), with `is_expansion` filter added and `unstable_cache` (`flipper-deals` tag, 7200s, matching `hot-deals.ts`/`price-history.ts`'s cadence). All NUMERIC columns cast to `::text` before returning. `DISTINCT ON (p.game_id) ... ORDER BY p.game_id, price ASC` orders by the numeric column, not a text-cast one — same fix `hot-deals.ts` already applies for cheapest-in-stock-offer selection.
- Used separate `_numeric`-suffixed CTE column names distinct from the final `::text`-cast output aliases (e.g. `current_min_price_numeric` vs `current_min_price`) so the `WHERE hm.historical_max_price_numeric > cp.current_min_price_numeric` exclusion clause compares numeric values, not the text-cast output columns — Postgres doesn't allow referencing SELECT-list output aliases in `WHERE` anyway, so this was required, not just a style choice.
- Known caveat (not fixed here, per Dev Notes): this query will surface the Story 2.2c `game_id` contamination bug on the same ~5% of games Story 7.1's spike flagged. Out of scope — 2.2c owns the fix.
- No new dependencies added.

### File List

- `web/src/lib/calc.ts` — MODIFIED (added `calcMarginProxy`)
- `web/src/lib/calc.test.ts` — CREATED
- `web/src/db/queries/flipper.ts` — CREATED
- `web/src/db/queries/flipper.test.ts` — CREATED

## Senior Developer Review (AI)

**Date:** 2026-08-22
**Outcome:** Approved after fixes (bmad-code-review — Blind Hunter + Edge Case Hunter + Acceptance Auditor, parallel)

### Findings — fixed

1. **[High] `ORDER BY margin_pct DESC` sorted lexicographically, not numerically** — `margin_pct` is `::text`-cast in the SELECT list; Postgres resolved `ORDER BY margin_pct` to that text alias, so `"9.0"` would rank above `"80.0"`. Fixed by ordering on the raw numeric expression instead of the text alias. Same bug class the story's own Dev Notes warned about for `current_min_price`, but the fix wasn't applied to the outer `ORDER BY`. (Acceptance Auditor)
2. **[High] Division-by-zero when `current_min_price = 0`** — a product with `price = 0` (promo/bad scrape) would crash the whole query in the `margin_pct` division. `calcMarginProxy` already guarded this (`current <= 0 → null`) but the SQL path didn't. Fixed by adding `AND p.price > 0` to the `current_prices` CTE. (Blind Hunter + Edge Case Hunter, raised independently)

### Findings — reviewed, not changed (pre-existing pattern / by design)

- `unstable_cache` cache key doesn't include `filters` — identical pattern already in production in `hot-deals.ts`; not a regression introduced by this story.
- `calcMarginProxy` has no caller in this diff — intentional, per AC2 it's a standalone pure function for a future UI consumer (Story 7.3).
- All-time (unbounded) `historical_max` — spec-mandated, mirrors Story 7.1's validated spike formula exactly.
- `INNER JOIN stores`/no orphaned-`store_id` fallback, `parseFlipperDealRow` throws without row context, no `store_url` shape validation — all identical to existing `hot-deals.ts` conventions, not new risk.
- Divergent SQL vs. TS margin-rounding implementations — by design: AC1 (query-level `margin_pct` for sorting) and AC2 (standalone `calcMarginProxy`) are separately specified; no current caller compares their outputs.

## Change Log

- 2026-08-22 — Story created (bmad-create-story), switched from initially-suggested 7-2 (Dev A/Web) to 7-4 (Dev B/Infra) per epics.md's dev assignment.
- 2026-08-22 — Implemented `calcMarginProxy()` and `getFlipperDeals()` with full test coverage (TDD red-green). Full suite green (370/370), lint clean, typecheck clean. Status → review.
- 2026-08-22 — Code review (3-layer parallel adversarial review). 2 confirmed bugs fixed: lexicographic `ORDER BY margin_pct` (now orders by numeric expression), division-by-zero on zero-priced products (now excluded via `AND p.price > 0`). 2 new regression-guard tests added. Full suite green (371/371).
