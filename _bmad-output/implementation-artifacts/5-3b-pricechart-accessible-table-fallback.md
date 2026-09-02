---
baseline_commit: c1601c6
---

# Story 5.3b: PriceChart Accessible Table Fallback

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user korzystający z czytnika ekranu**,
I want dostęp do tych samych danych historii cen co widoczne na wykresie, w formie dostępnej tabeli,
so that mogę korzystać z serwisu niezależnie od tego, czy widzę wykres SVG (UX-DR12 accessibility floor).

**Epic:** 5 — Price History Chart & SEO Architecture
**Dev:** Dev A (Web)
**Type:** Follow-up — split out of Story 5.3 (see 5.3 "Known Scope Gap" note). Closes the last unmet clause of UX-DR12.
**Depends on:** Story 5.3 (done ✅ — real `getPriceHistory()` data wired into `<PriceChart>`; table needs real data to be meaningful).
**Files (all MODIFY — no new files):** `web/src/components/PriceChart.tsx`, `web/src/components/PriceChart.test.tsx`

## Acceptance Criteria

**AC-1 — Dynamic `aria-label` on the `<svg>`:**
- Given `PriceChart` rendered with a non-empty selected range
- When displayed
- Then the `<svg>` `aria-label` describes the current price data — e.g. `"Wykres historii cen: aktualna cena {formatPrice(stats.current)}, zakres {selectedRange}"` — not the current static string `"Wykres historii cen"`
- And when `filteredData.length === 0`, the `aria-label` describes that state — e.g. `"Wykres historii cen: brak danych dla wybranego zakresu"`
- And `role="img"` on the `<svg>` is unchanged

**AC-2 — Visually-hidden data table alongside the chart:**
- Given `PriceChart` with non-empty `filteredData` for the selected range
- When rendered
- Then a visually-hidden `<table>` is rendered next to the `<svg>`, with **one row per visible data point**, columns: **Data** (`formatDateMedium(point.date)`), **Sklep** (`storeName`), **Cena** (`formatPrice(point.price)`)
- And the table has a `<caption>` giving context — the selected range at minimum (e.g. `"Historia cen — zakres {selectedRange}"`); include the game name only if a name/label prop is already available to the component (it is **not** today — do not add a prop just for this, range-only caption is acceptable)
- And rows are ordered by date ascending (tie-break by `storeName`) so the reading order matches the visual left-to-right trend
- And the `<thead>` has `<th scope="col">` for each of the 3 columns

**AC-3 — Hide technique keeps the table in the accessibility tree:**
- Given the visually-hidden table
- When inspected
- Then it is hidden with the standard sr-only pattern — `position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0` — **never** `display: none` or `visibility: hidden` or `hidden` attr (those drop it from the a11y tree)
- And there is no existing sr-only utility in this project (confirmed — no `sr-only` class in `web/`, no equivalent in `globals.css`), so define the style object locally in `PriceChart.tsx` as a module-level `const` (e.g. `SR_ONLY_STYLE`)

**AC-4 — Table respects legend (hidden-store) state:**
- Given the user hides a store via the legend (click)
- When the table re-renders
- Then rows for the hidden store disappear from the table — parity with that store's line disappearing from the chart
- And un-hiding the store restores its rows

**AC-5 — Empty state renders no table:**
- Given `filteredData.length === 0` (the "Za mało danych dla wybranego zakresu" message is showing)
- When rendered
- Then **no** `<table>` is rendered at all — the message is already screen-reader-readable text; an empty table adds nothing
- Given exactly one data point (single-dot case, Story 5.2 AC-10) — `filteredData.length === 1`
- Then the table **is** rendered with its single row (this is not the empty state — `isEmpty` is `filteredData.length === 0` only, unchanged)

**AC-6 — Tests (`PriceChart.test.tsx`):**
- Table row count === number of visible data points for the selected range
- Hiding a store via its legend button removes that store's rows from the table (query `<tbody> <tr>` count before/after `fireEvent.click`)
- `<svg>` `aria-label` contains the current price (`formatPrice(stats.current)` substring) for a non-empty range, and contains `"brak danych"` for `data={[]}`
- `data={[]}` → no `<table>` element in the DOM
- Existing tests #1 (empty-state message) and #2 (single-point `<circle>`) still pass unmodified

## Tasks / Subtasks

- [x] **Task 1 — Dynamic `aria-label`** (AC: 1)
  - [x] 1.1 In `PriceChart.tsx`, compute an `svgLabel` string near the existing `const isEmpty = ...` / `const stats = ...` lines: non-empty → `` `Wykres historii cen: aktualna cena ${formatPrice(stats!.current)}, zakres ${selectedRange}` ``; empty → `"Wykres historii cen: brak danych dla wybranego zakresu"`. `stats` is `null` exactly when `filteredData.length === 0`, so gate on `isEmpty`, not a separate null check.
  - [x] 1.2 Replace `aria-label="Wykres historii cen"` on the `<svg>` (line ~460) with `aria-label={svgLabel}`. Leave `role="img"`.
- [x] **Task 2 — sr-only style constant** (AC: 3)
  - [x] 2.1 Add a module-level `const SR_ONLY_STYLE: CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0 }` near `STORE_COLORS`. (Imported `type CSSProperties` from `react` rather than `React.CSSProperties` — the file has no default `React` import.)
- [x] **Task 3 — Build table rows** (AC: 2, 4)
  - [x] 3.1 Derive `tableRows` from `filteredData` (memoize on `[filteredData, hiddenStores]`): `filteredData.filter(d => !hiddenStores.has(d.storeId))`, sorted by `d.date.localeCompare(...)` asc (ISO strings sort chronologically), tie-break `d.storeName.localeCompare(..., 'pl')`. Rows keep the raw `PriceDataPoint` (`date`, `storeName`, `price` string).
  - [x] 3.2 Did **not** touch `storeGroups` / `buildStoreGroups` / `filterByRange` — the table is a parallel read of the same `filteredData`.
- [x] **Task 4 — Render the table** (AC: 2, 3, 5)
  - [x] 4.1 Inside the `{/* Chart area */}` `<div style={{ position: 'relative' }}>`, right after the closing `</svg>`, render `{!isEmpty && (<table style={SR_ONLY_STYLE}> ... </table>)}`.
  - [x] 4.2 `<caption>{`Historia cen — zakres ${selectedRange}`}</caption>`, `<thead><tr><th scope="col">…</th>×3</tr></thead>`, `<tbody>` mapping `tableRows` → `<tr>` with `formatDateMedium(row.date)`, `row.storeName`, `formatPrice(row.price)`. Row `key`: `` `${row.storeName}-${row.date}-${i}` `` — index appended because a store can have >1 product for a game, so `storeName+date` is not guaranteed unique (per Dev Notes).
- [x] **Task 5 — Tests** (AC: 6)
  - [x] 5.1 Added tests 16–19 to `PriceChart.test.tsx`: table row count = visible points (6 for `2T`/`mockData`); legend-hide removes that store's rows (6→3); `<svg>` aria-label carries current price + `zakres 2T`, and describes the empty state; `data=[]` → no `<table>`.
  - [x] 5.2 Full `PriceChart.test.tsx` (19) + `game-passport.test.tsx` (28) green. **Existing tests #1 and #2 unchanged.** Tests #5, #6, #7, #14 had their legend lookups changed from `screen.getByText('<store>')` to `screen.getByRole('button', { name: '<store>' })` — the store name now also appears as plain text in the new fallback `<table>`, so a bare `getByText` matched multiple nodes. Behaviour asserted is identical; documented inline in the test file.
- [x] **Task 6 — Verify** (AC: all)
  - [x] 6.1 `cd web && npx tsc --noEmit` clean.
  - [x] 6.2 `cd web && npx eslint src/components/PriceChart.tsx src/components/PriceChart.test.tsx` — clean, zero errors/warnings (no new lint issues introduced).
  - [x] 6.3 `cd web && npx vitest run` — 403 passed / 36 files, zero regressions.

## Dev Notes

### What "accessible table fallback" means here (UX-DR12)

UX-DR12 verbatim: *"price history chart `aria-label` with current price data + accessible table fallback"*. Two deliverables, both in this story: (1) the `aria-label` currently says only `"Wykres historii cen"` — make it carry the current price + range; (2) there is **no** table fallback at all today — add a visually-hidden one. Nothing else in UX-DR12 is open (`lang="pl"` shipped in 1.4, focus rings / semantic HTML / alt text shipped across Epic 3/4).

### Current state of `PriceChart.tsx` (verified @ c1601c6) — what you're extending, not rewriting

- `'use client'` component. Owns range state (`selectedRange`), `hiddenStores: Set<number>`, `chartData`/`loadedRangeDays`/`loading` (Story 5.3 fetch-on-widen).
- `filteredData` (memo, deps `[chartData, selectedRange]`) — the range-windowed points. **This is your data source for the table.** Each element is `PriceDataPoint { date: string /* "YYYY-MM-DD" */, storeId: number, storeName: string, price: string /* "89.99" */ }`.
- `hiddenStores` — legend toggles add/remove `storeId`. Chart lines check `hiddenStores.has(store.storeId)` at render. Your table must apply the **same** filter (AC-4).
- `stats = computeStats(filteredData, selectedRange)` — returns `null` iff `filteredData.length === 0`, else `{ min, current: number, avg30 }`. `stats.current` is the newest point's price as a `number` → wrap in `formatPrice()` for the label.
- `const isEmpty = filteredData.length === 0` (line ~392) — the single source of truth for the empty state. Story 5.3's "Resolved Conflict" locked this: **one** data point is NOT empty (renders a `<circle>` + now a 1-row table); **zero** is empty (message, no table). Do not touch `isEmpty`.
- The `<svg>` is at lines ~452–581: `aria-label="Wykres historii cen"` `role="img"` — the only line Task 1 changes.
- Chart area wrapper: `<div style={{ position: 'relative' }}>` at line ~451 — render the table inside it so `SR_ONLY_STYLE`'s `position: absolute` is scoped to a positioned ancestor (harmless even if not, it's 1px and clipped, but keep it tidy).

### `formatPrice` / `formatDateMedium` — already imported, use as-is

Both imported at the top of `PriceChart.tsx` from `@/lib/format`. `formatPrice('89.99') → "89,99 zł"`, `formatPrice(84.9) → "84,90 zł"` (accepts string or number). `formatDateMedium('2026-06-12') → "12 cze 2026"` (accepts ISO string). No `formatNull` needed — every table cell always has a real value (no nullable display in this story, so the em-dash rule in `CLAUDE.md` doesn't apply here).

### sr-only technique — why `clip-path`, not `display: none`

`display: none` and `visibility: hidden` and the `hidden` attribute all remove the element from the accessibility tree — a screen reader would never announce the table, defeating the whole story. The `position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%)` pattern keeps it rendered and in the a11y tree while taking zero visual space. This is the canonical "visually hidden" recipe (Tailwind's `sr-only`, `@testing-library` docs). It does **not** exist anywhere in this repo yet (grep for `sr-only`/`clipPath` in `web/` → only `public/globe.svg`), so define it locally — do not add a global CSS utility class in this story (scope creep; a shared util can come later if a second component needs it).

### Table shape

```tsx
{!isEmpty && (
  <table style={SR_ONLY_STYLE}>
    <caption>{`Historia cen — zakres ${selectedRange}`}</caption>
    <thead>
      <tr>
        <th scope="col">Data</th>
        <th scope="col">Sklep</th>
        <th scope="col">Cena</th>
      </tr>
    </thead>
    <tbody>
      {tableRows.map(row => (
        <tr key={`${row.storeName}-${row.date}`}>
          <td>{formatDateMedium(row.date)}</td>
          <td>{row.storeName}</td>
          <td>{formatPrice(row.price)}</td>
        </tr>
      ))}
    </tbody>
  </table>
)}
```

`tableRows` — a `useMemo` keyed on `[filteredData, hiddenStores]`:

```tsx
const tableRows = useMemo(
  () =>
    filteredData
      .filter(d => !hiddenStores.has(d.storeId))
      .slice()
      .sort((a, b) =>
        a.date === b.date
          ? a.storeName.localeCompare(b.storeName, 'pl')
          : a.date.localeCompare(b.date), // ISO "YYYY-MM-DD" → lexical sort === chronological
      ),
  [filteredData, hiddenStores],
)
```

Note: `filteredData` can contain multiple points on the same date for the same store only if the DB returns them — `getPriceHistory` returns one row per (product, scrape date), and a store can have >1 product for a game, so `storeName + date` is **not** guaranteed unique. If a duplicate key warning appears in tests, fall back to `key={i}` (index) — acceptable here since the list is never reordered by anything but the stable sort above.

### Test patterns — mirror `PriceChart.test.tsx` as it stands

- `render(<PriceChart data={mockData} gameId={1} initialRange="2T" />)` + `container.querySelectorAll('tbody tr')` for row counts. `mockData` (2 stores × 5 dates spanning ~28d) already exists in the file — `initialRange="2T"` windows it to 2 points/store = 4 rows.
- Legend-hide: `fireEvent.click(screen.getByText('AlePlanszowki').closest('button')!)` then re-query `tbody tr` — expect 4 → 2.
- aria-label: `container.querySelector('svg')!.getAttribute('aria-label')` → `expect(...).toContain('zł')` (non-empty) / `.toContain('brak danych')` (`data={[]}`).
- `data={[]}` → `expect(container.querySelector('table')).toBeNull()`.
- `beforeEach(() => vi.restoreAllMocks())` is already at the top of the file — don't re-add.
- Test framework is **Vitest + @testing-library/react** (`import { describe, test, expect, vi, beforeEach } from 'vitest'`). Not Jest.

### Do Not Touch

- `isEmpty` / single-point `<circle>` logic — Story 5.3 "Resolved Conflict", locked
- `filterByRange`, `computeStats`, `buildStoreGroups`, `computeUnlockedRanges`, the fetch/`handleRangeChange` path — none of it changes
- `web/src/db/queries/price-history.ts`, `web/src/app/api/price-history/route.ts`, `TimeRangeSelector.tsx` — locked contracts (Story 5.1/5.2)
- `web/src/app/gra/[slug]/page.tsx` and `game-passport.test.tsx` — 5.3b is entirely inside `PriceChart` + its test; the passport page passes no new props
- The 3 pre-existing React-Compiler eslint errors in `PriceChart.tsx` (5.3 Debug Log) — out of scope, verified pre-existing on baseline
- `RANGE_DAYS` / `ALL_RANGES` / `Range` — still imported from `@/lib/price-range`, not redeclared

### Common Pitfalls

- ❌ `display: none` / `visibility: hidden` / `hidden` attr on the table — kills the a11y tree, fails AC-3
- ❌ Rendering the table when `isEmpty` — fails AC-5; gate on `!isEmpty`
- ❌ Building table rows from `chartData` or `storeGroups` instead of `filteredData` — wrong window / wrong hidden-store handling
- ❌ Forgetting the `hiddenStores` filter on `tableRows` — fails AC-4 (chart line hides, table row doesn't → no parity)
- ❌ Adding a `gameName`/`label` prop to `PriceChart` just for the `<caption>` — not worth a prop-shape change; range-only caption satisfies AC-2
- ❌ Adding a global `.sr-only` class to `globals.css` — scope creep; local `const` per AC-3
- ❌ `formatPrice` on an already-formatted string — `stats.current` is a `number`, `row.price` is a raw `"89.99"` string; both are valid `formatPrice` inputs, pass them raw
- ❌ Sorting `tableRows` by `new Date(...)` object comparison in a way that mutates `filteredData` — `.slice()` before `.sort()`

### Project Structure Notes

- No new files. Both touched files are existing siblings in `web/src/components/`.
- Component naming: `PriceChart` is already a domain name (`CLAUDE.md` "Nazwy komponentów") — no new component, no naming decision.
- No schema / `items.py` impact — pure client rendering of already-fetched data. No API route, no query.
- No `switch` on a `.$type<>()` enum introduced → no `assertNever` needed.
- Web tests run via `cd web && npx vitest run`; typecheck `cd web && npx tsc --noEmit`; lint `cd web && npx eslint .`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3b] — this story's AC's (lines 1520–1552)
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR12] — accessibility floor, "aria-label with current price data + accessible table fallback" (line 133)
- [Source: _bmad-output/implementation-artifacts/5-3-pricechart-connected-to-real-data.md] — "Known Scope Gap" note splitting this out; locked `isEmpty` / single-point behavior; fetch/loading architecture; the 3 pre-existing eslint errors
- [Source: _bmad-output/implementation-artifacts/5-2-*] — original `PriceDataPoint` / `PriceChartProps` shape, "Out of Scope" table-fallback deferral
- [Source: web/src/components/PriceChart.tsx] — current implementation (`filteredData`, `hiddenStores`, `stats`, `isEmpty`, the `<svg aria-label>`)
- [Source: web/src/components/PriceChart.test.tsx] — existing 15 tests, `mockData` fixture, Vitest + @testing-library patterns, `beforeEach(vi.restoreAllMocks)`
- [Source: web/src/lib/format.ts] — `formatPrice` (string|number → "x,xx zł"), `formatDateMedium` (ISO → "12 cze 2026")
- [Source: CLAUDE.md] — component naming, query-location, `formatNull` (n/a here), no-`print` (n/a — TS)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

None requiring capture. Two iterations during test authoring, both diagnosed inline:
1. Initial new tests used `initialRange="1M"` — the unlock heuristic (Story 5.3) does not unlock `1M` for `mockData`'s ~28-day span, so `selectedRange` fell back to `1T` and row counts/label range didn't match. Fixed by using `initialRange="2T"` (unlocked by the 28d span) — 3 in-window points/store = 6 rows.
2. Test 18's empty-state branch used `rerender(<PriceChart data={[]} />)` — `chartData` is `useState(data)`, seeded once and not updated on prop change (existing 5.3 behaviour), so the rerender kept the old data. Fixed by a fresh `render()` for the empty case.

`npx tsc --noEmit` clean. `npx eslint` on both changed files clean. Full suite 403/403.

### Completion Notes List

- **Task 1 (AC-1):** `<svg aria-label>` is now `svgLabel` — `"Wykres historii cen: aktualna cena {formatPrice(stats.current)}, zakres {selectedRange}"` when data is present, `"Wykres historii cen: brak danych dla wybranego zakresu"` when `isEmpty`. `role="img"` untouched.
- **Task 2 (AC-3):** Module-level `SR_ONLY_STYLE: CSSProperties` — `position:absolute; width:1; height:1; padding:0; margin:-1; overflow:hidden; clipPath:'inset(50%)'; whiteSpace:'nowrap'; border:0`. No `display:none`/`visibility:hidden`, so the table stays in the a11y tree. No global CSS utility added (none existed; kept it local per AC-3).
- **Task 3/4 (AC-2, AC-4, AC-5):** `tableRows` memo = `filteredData` minus legend-hidden stores, sorted date-asc then store-name. Rendered as `{!isEmpty && <table style={SR_ONLY_STYLE}>}` inside the existing `position:relative` chart-area div: `<caption>Historia cen — zakres {range}</caption>`, `<thead>` with 3 `<th scope="col">` (Data/Sklep/Cena), one `<tr>` per visible point (`formatDateMedium` / storeName / `formatPrice`). Empty state (`filteredData.length === 0`) renders no table; single-point case renders a 1-row table (`isEmpty` unchanged).
- **No changes** to `filterByRange`, `computeStats`, `buildStoreGroups`, `computeUnlockedRanges`, the fetch path, `isEmpty`/single-point logic, `page.tsx`, `game-passport.test.tsx`, or any locked Story 5.1/5.2 contract.
- **Test file:** 4 new tests (16–19). Tests #5/#6/#7/#14 switched legend lookups to `getByRole('button', { name })` (store name now also renders as `<td>` text — bare `getByText` became ambiguous); assertions unchanged. Tests #1, #2 untouched.
- Full suite: 403 passing (was 403 → +4 new PriceChart tests, and the pre-existing count already included the 15 PriceChart tests; net file total 19). Zero regressions across 36 test files. `tsc` + `eslint` clean.

### File List

- `web/src/components/PriceChart.tsx` — MODIFIED (dynamic `aria-label`, `SR_ONLY_STYLE` const, `type CSSProperties` import, `tableRows` memo, visually-hidden `<table>` render)
- `web/src/components/PriceChart.test.tsx` — MODIFIED (4 new tests 16–19; tests #5/#6/#7/#14 legend lookups → `getByRole('button')`)

## Change Log

- 2026-09-02 — Story created via create-story workflow. Split from Story 5.3's flagged UX-DR12 scope gap; context pass verified all referenced files @ c1601c6 (no sr-only pattern exists in repo, `isEmpty` semantics locked by 5.3, `stats`/`filteredData`/`hiddenStores` shapes confirmed). Status: backlog → ready-for-dev.
- 2026-09-02 — Story implemented: dynamic chart `aria-label` (current price + range / empty state) and a visually-hidden (`clip-path` sr-only) `<table>` fallback mirroring the visible points and legend-hidden state, closing the last open clause of UX-DR12. 4 new tests; 4 existing legend tests re-pointed to role-based queries (new `<td>` store-name text made `getByText` ambiguous). `tsc`/`eslint` clean, 403 tests pass, zero regressions. Status: in-progress → review.
