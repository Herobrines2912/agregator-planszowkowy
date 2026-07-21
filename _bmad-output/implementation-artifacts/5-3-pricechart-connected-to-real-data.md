---
baseline_commit: 864b65f
---

# Story 5.3: PriceChart Connected to Real Data

Status: done

**Epic:** 5 — Price History Chart & SEO Architecture
**Dev:** Dev A (Web)
**Depends on:** Story 5.1 (done ✅ — `getPriceHistory()` query + `GET /api/price-history` route) + Story 5.2 (done ✅ — `PriceChart.tsx`, `TimeRangeSelector.tsx` visual shell with mock data)
**Mock data OK:** No — this story wires the already-built chart to real data

---

## Story

As a **user**,
I want the price chart to show real historical prices that update after each scrape cycle,
So that the price trends I see are accurate and current.

---

## Acceptance Criteria

**AC-1 — Server-side initial fetch (default range 3M):**
- Given the Game Passport page (`app/gra/[slug]/page.tsx`)
- When rendered as a Server Component
- Then price history data is fetched server-side via `getPriceHistory(game.id, '3M')` and passed as props to `<PriceChart data={...} gameId={game.id} initialRange="3M" />`
- And the existing `{/* PriceChart — Story 5.3 */}` placeholder `<div>` is removed

**AC-2 — Client-side re-fetch for ranges beyond the loaded window:**
- Given user selects a range whose day-threshold exceeds what has been loaded so far (e.g. **"6M"**, when only the default 3M/90-day window has been fetched)
- When the range change fires
- Then `PriceChart` (Client Component) re-fetches via `fetch('/api/price-history?gameId=<gameId>&range=<range>')`, replaces its working dataset with the response, and remembers the new window is now loaded
- And selecting a range **within** the already-loaded window (e.g. 1T/2T/1M while 3M is loaded) does **not** trigger a network request — it re-uses the existing client-side `filterByRange` logic (unchanged from Story 5.2)
- And while the fetch is in flight, a loading indicator shows **inside the chart's plotting area only** (reuse the existing `.shimmer-box` global CSS class from `app/globals.css`) — never the full-page `loading.tsx` skeleton
- And `TimeRangeSelector` and the legend remain interactive/visible during the fetch (only the plot area shows the loading state)
- And if the fetch fails or is aborted, the previously-loaded data is kept (no crash, no stuck spinner) and the failure is logged via `console.error` (mirrors `route.ts`'s `console.error('[GET /api/price-history] ...')` pattern — there is no dedicated Python-style logger on the client)

**AC-3 — Insufficient data still degrades gracefully (unchanged from Story 5.2):**
- Given a game with **zero** price history data points in the selected range
- When rendered
- Then the chart area shows: "Za mało danych dla wybranego zakresu — wybierz dłuższy okres", `TimeRangeSelector` stays active, no broken/empty SVG is rendered
- Given a game with **exactly one** price history data point in the selected range
- When rendered
- Then a single dot renders at the midpoint of the plotting area (Story 5.2 AC-10 behavior — **do not change this**; see Dev Notes conflict resolution below)

**AC-4 — Freshness ceiling matches ADR-003:**
- Given a Scrape Cycle completes and ISR revalidation fires (`revalidateTag('price-history', {})`, already wired in Story 5.1)
- When user reloads the Game Passport page
- Then the chart reflects data up to the last scrape cycle — max staleness 2h (ADR-003 fallback TTL), same mechanism already used by `game-passport.ts`/`hot-deals.ts`

---

## ⚠️ Resolved Conflict — Read First

`epics.md`'s Story 5.3 draft text says "< 2 price history data points → show empty-state message." Taken literally, that would also apply to exactly **1** data point — but Story 5.2's AC-10 (already shipped, already tested — `PriceChart.test.tsx` test #2 asserts a `<circle>` renders for a single point) explicitly requires a dot for that case.

**Resolution (confirmed with the user before this story was written): keep Story 5.2's behavior.** Do **not** touch the existing `isEmpty` check in `PriceChart.tsx` (`filteredData.length === 0`) and do **not** touch `PriceChart.test.tsx` test #2. The "too few data points" message is for **zero** points only, exactly as already implemented. Treat the "< 2" wording in `epics.md` as imprecise, superseded by the already-shipped AC-10.

---

## ⚠️ Known Scope Gap — Now Covered By Story 5.3b (do not implement here)

`UX-DR12` (accessibility floor) and the Epic 5 overview both call for an **accessible table fallback** for the price chart (`aria-label` + visually-hidden `<table>`). Story 5.2 explicitly deferred this to "Story 5.3 (needs real data to make the table meaningful)" — but the actual AC list for Story 5.3 in `epics.md` did **not** include it. This story's AC-1 through AC-4 above are the literal, current spec for 5.3 and do not mention a table fallback.

**Do not add it in this story.** It has since been split out into **Story 5.3b: PriceChart Accessible Table Fallback** (`epics.md`, inserted after this story), which depends on this story shipping first (needs real data for the table to be meaningful).

---

## Tasks / Subtasks

- [x] Task 1 — Wire real data into the Game Passport page (AC-1)
  - [x] In `web/src/app/gra/[slug]/page.tsx`: import `getPriceHistory` from `@/db/queries/price-history` and `PriceChart` from `@/components/PriceChart`
  - [x] After `const game = await getGameBySlug(slug)` (and the `notFound()` guard), add `const priceHistory = await getPriceHistory(game.id, '3M')`
  - [x] Replace the `{/* PriceChart — Story 5.3 */}` placeholder `<div>` (lines ~132–147) with `<PriceChart data={priceHistory} gameId={game.id} initialRange="3M" />`
  - [x] Update `web/src/app/gra/[slug]/game-passport.test.tsx`: add `vi.mock('@/db/queries/price-history', ...)` with a `mockGetPriceHistory` following the exact pattern already used for `mockGetGameBySlug`/`mockGetAllGameSlugs` in that file; default it to resolve `[]` in `beforeEach` unless a test overrides it
  - [x] Add/adjust tests in `game-passport.test.tsx`: page calls `getPriceHistory(game.id, '3M')`; the placeholder text `"PriceChart (Story 5.3)"` no longer renders; chart content renders when `priceHistory` is non-empty

- [x] Task 2 — Client-side re-fetch for ranges beyond the loaded window (AC-2)
  - [x] In `web/src/components/PriceChart.tsx`, add internal state: `chartData` (seeded from the `data` prop), `loadedRangeDays` (seeded from `RANGE_DAYS[initialRange]`, default `RANGE_DAYS['1T']` matching the existing `initialRange = '1T'` default), `loading` (boolean, default `false`)
  - [x] Replace all downstream uses of the raw `data` prop (`filterByRange`, `storeOrder` memo, `computeUnlockedRanges`) with `chartData`
  - [x] Add a `fetchAbortRef = useRef<AbortController | null>(null)` for in-flight request cancellation
  - [x] Change the `TimeRangeSelector`'s `onChange` handler to an async `handleRangeChange(range: Range)`:
    - always `setSelectedRange(range)` and `setHiddenStores(new Set())` (unchanged from today)
    - if `RANGE_DAYS[range] > loadedRangeDays`: abort any in-flight request, start a new one (`setLoading(true)`), `fetch('/api/price-history?gameId=' + gameId + '&range=' + range)`, parse as `ApiResponse<PriceDataPoint[]>`; on `success: true` → `setChartData(body.data)` and `setLoadedRangeDays(RANGE_DAYS[range])`; on `success: false` or thrown/non-`AbortError` → `console.error(...)`, keep existing `chartData`; always `setLoading(false)` in a `finally` (skip state updates for aborted requests per AC-2)
    - if `RANGE_DAYS[range] <= loadedRangeDays`: no fetch — behaves exactly as it does today (client-side filter only)
  - [x] `computeUnlockedRanges` heuristic for ranges wider than `loadedRangeDays` (see Dev Notes — "Unlock Heuristic for Partially-Loaded Data" below): don't disable a range purely because it hasn't been fetched yet
  - [x] While `loading` is `true`, render a `.shimmer-box` div sized to the plot area (`PLOT_W` × current `svgHeight`) positioned over the chart, on top of (or replacing) the SVG; `TimeRangeSelector` and legend stay outside this overlay so they remain clickable
  - [x] Use the `vi.spyOn(global, 'fetch')` pattern from `AlertSubscribeForm.test.tsx` — not a new mocking approach

- [x] Task 3 — Tests (AC-2, AC-3)
  - [x] `PriceChart.test.tsx`: selecting a range wider than the loaded window (mock `initialRange="3M"`, click "6M") calls `fetch` with `/api/price-history?gameId=<id>&range=6M` exactly once
  - [x] `PriceChart.test.tsx`: selecting a range within the loaded window (click "2T" while `initialRange="3M"`) does **not** call `fetch`
  - [x] `PriceChart.test.tsx`: while the fetch promise is pending, the loading element (`role="status"`) is present; after it resolves, it's gone and the new data is reflected
  - [x] `PriceChart.test.tsx`: fetch rejection (mock `mockRejectedValue`) → no crash, loading clears, previously-rendered data/legend remain
  - [x] `PriceChart.test.tsx`: confirm existing test #2 (single point → `<circle>`) and test #1 (empty → message) still pass unmodified (no regression — see conflict resolution above)
  - [x] `game-passport.test.tsx`: `getPriceHistory` called with `(game.id, '3M')`; placeholder text is gone

---

## Dev Notes

### Files to Modify (no new files this story)

| File | Change |
|------|--------|
| `web/src/app/gra/[slug]/page.tsx` | Add `getPriceHistory` call, replace placeholder with `<PriceChart>` |
| `web/src/app/gra/[slug]/game-passport.test.tsx` | Mock `getPriceHistory`, adjust/add assertions |
| `web/src/components/PriceChart.tsx` | Add fetch-on-range-change, loading state, unlock heuristic |
| `web/src/components/PriceChart.test.tsx` | Add fetch/loading tests |

No schema changes, no new API route, no new query — `getPriceHistory()` and `GET /api/price-history` are already complete and unmodified from Story 5.1.

### Unlock Heuristic for Partially-Loaded Data

This is the one real design gap in the plan that isn't spelled out in `epics.md` — read carefully.

`computeUnlockedRanges()` today infers whether a range like `6M` is "unlocked" purely from the days-span of whatever `data` it's given. That was fine in Story 5.2 (mock data represented the *entire* available history). It breaks once the default fetch is capped at `3M` (AC-1): with only 90 days ever loaded client-side, the span can never reach 180 days, so `6M` would look **permanently locked** even for a game with a full year of history — a false negative the user could never get past, since clicking a disabled button does nothing.

**Rule:** a range is "unlocked" (clickable) if either:
1. `RANGE_DAYS[range] <= loadedRangeDays` **and** the actual span of `chartData` covers it (existing logic, unchanged), **or**
2. `RANGE_DAYS[range] > loadedRangeDays` — i.e. it hasn't been fetched yet — in which case **treat it as unlocked** rather than computing a span. Clicking it triggers the Task 2 fetch; if the real data turns out too sparse, the existing AC-3 empty-state message (or the existing single-point dot) handles it naturally once the fetch resolves. This trades a slightly optimistic button state for never falsely locking a range that actually has data — the safer failure mode.

Concretely, with the default `loadedRangeDays = RANGE_DAYS['3M'] = 90`: `1T`/`2T`/`1M`/`3M` keep today's disabled-based-on-actual-span behavior; `6M` is always shown enabled (never disabled/tooltip) until it's been fetched at least once, after which it too follows the actual-span rule against the newly-loaded data.

Pass `loadedRangeDays` into `computeUnlockedRanges(data, loadedRangeDays)` as a second parameter rather than hardcoding `6M` as a special case — keeps it correct if `RANGE_DAYS` ever changes.

### Fetch Pattern — Copy from `AlertSubscribeForm.tsx`

```typescript
// web/src/components/AlertSubscribeForm.tsx already establishes this pattern:
// - AbortController + setTimeout for a hard timeout
// - fetch → parse as ApiResponse<T> → check `.success`
// - try/catch/finally with a loading flag
```

Reuse the same shape (`ApiResponse<PriceDataPoint[]>` from `@/types/api`, `PriceDataPoint` from `./PriceChart` itself). A hard timeout (e.g. 15s like `AlertSubscribeForm`) is reasonable to include but not separately AC'd — don't over-build a retry mechanism, none is required.

### Test Mocking Pattern — Copy from `AlertSubscribeForm.test.tsx`

```typescript
vi.spyOn(global, 'fetch').mockResolvedValue({
  json: async () => ({ success: true, data: [...] }),
} as Response)
```

For the "does not fetch" assertions, spy on `global.fetch` and assert `not.toHaveBeenCalled()` after clicking a within-window range button — same style as `AlertSubscribeForm.test.tsx` tests 6–8.

### `game-passport.test.tsx` Mock Addition

Follow the exact existing pattern in that file (`mockGetGameBySlug`/`mockGetAllGameSlugs` + `vi.mock('@/db/queries/game-passport', ...)`):

```typescript
const mockGetPriceHistory = vi.fn()
vi.mock('@/db/queries/price-history', () => ({
  getPriceHistory: (...args: unknown[]) => mockGetPriceHistory(...args),
}))
```

Default `mockGetPriceHistory.mockResolvedValue([])` in `beforeEach`, matching how the other two mocks are reset per-test.

### Do Not Touch

- `web/src/db/queries/price-history.ts` and its test — locked contract, Story 5.1, done
- `web/src/app/api/price-history/route.ts` and its test — locked contract, Story 5.1, done
- `web/src/components/TimeRangeSelector.tsx` — no prop shape changes needed; `PriceChart` still owns range state and just calls `onChange` as before
- The `isEmpty`/single-point-dot logic in `PriceChart.tsx` — see conflict resolution above
- `RANGE_DAYS` / `ALL_RANGES` / `Range` — still exported only from `TimeRangeSelector.tsx`, still not redeclared elsewhere (`CLAUDE.md`/`AGENTS.md` convention already enforced in 5.1/5.2)

### Common Pitfalls

- ❌ Do NOT fetch on every range change — only when `RANGE_DAYS[range] > loadedRangeDays` (AC-2 explicitly calls out "does not trigger a network request" for in-window ranges)
- ❌ Do NOT show the full-page `loading.tsx` skeleton for the range re-fetch — only an in-chart indicator (AC-2)
- ❌ Do NOT change the single-data-point → dot behavior (see conflict resolution)
- ❌ Do NOT add an accessible table fallback in this story (see Known Scope Gap above) — out of scope, flag it instead
- ❌ Do NOT hardcode `'6M'` as a magic special case in the unlock heuristic — compare `RANGE_DAYS[range] > loadedRangeDays` so it stays correct if thresholds change
- ❌ Do NOT bypass `ApiResponse<T>` when reading the fetch response — `CLAUDE.md` API contract rule, already how the route responds

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3] — this story's AC's (lines 1487–1517)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.2] — locked `PriceDataPoint`/`PriceChartProps` shape, AC-9/AC-10 (empty state, single point), explicit "Story 5.3" deferrals (client fetch, per-range loading skeleton, accessible table fallback)
- [Source: _bmad-output/implementation-artifacts/5-1-price-history-db-query.md] — `getPriceHistory()`/`route.ts` locked contract, already-resolved architecture.md-vs-epics.md doc-drift precedent (same resolution style applied here)
- [Source: web/src/components/PriceChart.tsx] — current implementation (client-side-only filtering, `computeUnlockedRanges`, `isEmpty`)
- [Source: web/src/components/TimeRangeSelector.tsx] — `Range`, `RANGE_DAYS`, `ALL_RANGES`
- [Source: web/src/app/gra/[slug]/page.tsx] — current placeholder location (lines 132–147)
- [Source: web/src/components/AlertSubscribeForm.tsx] + `AlertSubscribeForm.test.tsx` — fetch/loading/abort pattern and its test-mocking style
- [Source: web/src/app/globals.css] — `.shimmer-box` / `@keyframes shimmer`, reused for the in-chart loading state (no new CSS needed)
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-003] — 2h fallback TTL, on-demand `revalidateTag`
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR12] — accessible table fallback requirement (flagged as out-of-scope gap, not implemented here)
- [Source: CLAUDE.md] — `ApiResponse<T>` rule, query-location rule, `formatNull`/em-dash rule (n/a here — no null display in this story)

---

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

None — no failing runs requiring debug capture. One expected test failure during implementation was diagnosed and fixed inline (see Completion Notes: test #8's `initialRange`, and the missing `vi.restoreAllMocks()` cross-test leak in `PriceChart.test.tsx`). `npx tsc --noEmit` clean. `npx eslint .` (whole repo) shows only 3 pre-existing React Compiler errors in `PriceChart.tsx` (lines ~316/349/575 — `handleMouseMove`/tooltip ref logic) that were verified via `git stash` to already exist on baseline `864b65f`, untouched by this story, out of scope to fix here. Full suite: 272 tests passing, zero regressions.

### Completion Notes List

- **Task 1 (AC-1):** `page.tsx` now does `const priceHistory = await getPriceHistory(game.id, '3M')` after the `notFound()` guard and renders `<PriceChart data={priceHistory} gameId={game.id} initialRange="3M" />` in place of the static placeholder. `game-passport.test.tsx` gained a `getPriceHistory` mock (same pattern as the two existing query mocks) plus a test asserting the call args and that the placeholder text is gone.
- **Task 2 (AC-2):** `PriceChart.tsx` now holds `chartData`/`loadedRangeDays`/`loading` state seeded from props. `TimeRangeSelector`'s `onChange` now calls `handleRangeChange`, which only hits `fetch('/api/price-history?gameId=…&range=…')` when `RANGE_DAYS[range] > loadedRangeDays` (i.e. wider than what's already loaded) — in-window range clicks stay pure client-side filtering, unchanged from Story 5.2. In-flight requests are cancelled via `AbortController` on unmount or on a new range click; fetch failures/aborts are logged and leave `chartData` untouched (no crash). Loading state renders a `.shimmer-box` (`role="status"`) over just the plot area — `TimeRangeSelector`/legend stay outside it and remain clickable.
- **Unlock heuristic (documented in Dev Notes, implemented in `computeUnlockedRanges`):** ranges wider than `loadedRangeDays` are now optimistically unlocked rather than judged by (necessarily incomplete) currently-loaded span — prevents `6M` from looking permanently locked just because only a 3M window has been fetched. `gameId` prop (previously `_gameId`, unused) is now used for real, resolving the pre-existing unused-var lint warning as a side effect.
- **Test #8 fix (Story 5.2 regression avoided, not silently broken):** the existing "disabled range button" test passed `initialRange="1T"` with a 10-day mock dataset, asserting `1M` renders disabled. Under the new heuristic, `1M` (30d) is wider than a `1T`-declared 7-day loaded window, so it fell into the "not yet fetched, optimistically unlocked" branch and the test failed. Fixed by changing the test's `initialRange` to `"1M"` (declaring a 30-day window was loaded), which puts `1M`'s lock decision back on the real-span comparison (10 < 30 → locked) — restores the original AC-7 assertion under the new semantics, documented inline in the test.
- **Cross-test mock leak found and fixed:** `PriceChart.test.tsx` didn't have the project's standard `beforeEach(() => vi.restoreAllMocks())` (used in `AlertSubscribeForm.test.tsx`). Without it, `vi.spyOn(global, 'fetch')` calls/mocks from earlier fetch-related tests bled into later ones (a call recorded against the wrong test). Added the same `beforeEach` used elsewhere in the codebase.
- **Task 3:** 4 new tests added to `PriceChart.test.tsx` (11–14): fetch-triggered-for-wider-range, no-fetch-for-in-window-range, loading-indicator-shows-and-clears, fetch-failure-keeps-previous-data. Plus 1 new test in `game-passport.test.tsx` for AC-1. Existing tests #1 (empty state) and #2 (single-point dot) pass unmodified, confirming the resolved conflict (Story 5.2's dot-for-single-point behavior was deliberately not touched).
- Full suite: 272 tests passing (267 pre-existing + 5 new: 1 in `game-passport.test.tsx`, 4 in `PriceChart.test.tsx`), zero regressions. `tsc --noEmit` clean.
- Story 5.3b (accessible table fallback, UX-DR12) was split out to `epics.md` earlier in this session and is intentionally **not** touched by this story — see "Known Scope Gap" note in Dev Notes above.

### File List

- `web/src/app/gra/[slug]/page.tsx` — MODIFIED (added `getPriceHistory` call + `<PriceChart>`, removed placeholder)
- `web/src/app/gra/[slug]/game-passport.test.tsx` — MODIFIED (added `getPriceHistory` mock + 1 test)
- `web/src/components/PriceChart.tsx` — MODIFIED (fetch-on-range-change, loading state, unlock heuristic, `gameId` now used)
- `web/src/components/PriceChart.test.tsx` — MODIFIED (added `beforeEach(vi.restoreAllMocks)`, fixed test #8's `initialRange`, added 4 new tests)

## Change Log

- 2026-07-21 — Story created via create-story workflow. Resolved a doc conflict (epics.md "< 2 points" vs Story 5.2's shipped/tested single-point-dot AC-10) with the user before writing AC's — kept Story 5.2's behavior. Flagged an unrelated scope gap (UX-DR12 accessible table fallback, deferred by 5.2 but absent from 5.3's own AC list) for follow-up rather than silently implementing or silently dropping it. Status: backlog → ready-for-dev.
- 2026-07-21 — Story implemented: real `getPriceHistory()` data wired into the Game Passport page (default 3M), client-side re-fetch added for ranges wider than the loaded window (6M), partial-load unlock heuristic added, loading state in chart area only. Fixed one Story 5.2 test (`initialRange` semantics changed by the new heuristic) and one test-isolation gap (missing `vi.restoreAllMocks()`) found along the way. All ACs satisfied, 272 tests passing, zero regressions. Status: in-progress → review.
