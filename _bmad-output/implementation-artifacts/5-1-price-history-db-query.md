---
baseline_commit: 41cc6d8
---

# Story 5.1: Price History DB Query

Status: review

**Epic:** 5 — Price History Chart & SEO Architecture
**Dev:** Dev B (Scraper/Infra)
**Depends on:** Story 4.5 (done ✅ — `game-passport.ts` establishes `game.id` lookup; also `products`/`price_history` populated by Epic 2, done ✅)
**Blocks:** Story 5.3 (Dev A) — cannot wire `PriceChart` to real data or add client-side range switching until this story ships `getPriceHistory()` + `/api/price-history` route
**Mock data OK:** No — Story 5.2 (`PriceChart.tsx`, `TimeRangeSelector.tsx`) is already done using mock data; this story provides the real data source it will be wired to in Story 5.3

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

---

## Story

As a **developer**,
I want a `getPriceHistory()` query plus a `GET /api/price-history` route that return price history data shaped exactly for the already-built `PriceChart` component,
so that Story 5.3 (Dev A) can render the chart from real historical prices — both for the initial server-rendered range and for client-side range switching — without building their own queries or reshaping data in the component.

---

## Acceptance Criteria

**AC-1 — `getPriceHistory(gameId, range)` returns chart-shaped rows:**
- Given `web/src/db/queries/price-history.ts` implementing `getPriceHistory(gameId: number, range: Range)`
- When called for a game with price history across multiple stores
- Then it returns `PriceDataPoint[]` — array of `{ date: string, storeId: number, storeName: string, price: string }`
- And `date` is `"YYYY-MM-DD"` (day only, no time/offset) — **this exact shape is a locked contract**, already consumed by `PriceChart.tsx` (`web/src/components/PriceChart.tsx:8`, done in Story 5.2)
- And `price` is a string (e.g. `"89.99"`) — cast in SQL, never `parseFloat`/`float` in the query layer

**AC-2 — Sorted oldest → newest:**
- Given the query result
- When returned
- Then rows are sorted by `scraped_at` ascending (oldest first)

**AC-3 — Range filtering by day-count threshold:**
- Given `range` is one of `'1T' | '2T' | '1M' | '3M' | '6M'` (the `Range` type already exported from `web/src/components/TimeRangeSelector.tsx`)
- When called
- Then rows are filtered to `price_history.scraped_at >= NOW() - INTERVAL 'N days'` where N = `RANGE_DAYS[range]` (7/14/30/90/180 — **reuse the existing `RANGE_DAYS` export**, do not redeclare a second copy of these thresholds)

**AC-4 — Empty / no-data cases don't crash:**
- Given a game with zero `price_history` rows in the selected window (new game, or range longer than available data)
- When `getPriceHistory()` is called
- Then it returns `[]` — never `null`, never throws
- And rows where `price IS NULL` (FR-23 "not seen" cycles) are excluded — the chart only plots actual prices

**AC-5 — Single round-trip, no N+1:**
- Given a game with 3 stores each scraped daily for 180 days
- When `getPriceHistory()` is called
- Then it executes exactly one query (JOIN `price_history` → `products` → `stores`, filtered by `products.game_id`) — no per-store or per-row follow-up queries

**AC-6 — `GET /api/price-history` route (needed by Story 5.3's client-side range switch):**
- Given `web/src/app/api/price-history/route.ts` handling `GET /api/price-history?gameId=<id>&range=<range>`
- When called with a valid `gameId` (positive integer) and valid `range`
- Then it calls `getPriceHistory(gameId, range)` and responds `200` with `ApiResponse<PriceDataPoint[]>` — `{ success: true, data: [...] }` (per `CLAUDE.md` — never a bare array, never `null` for empty data)

**AC-7 — Route validates input, mirrors nothing to the DB layer:**
- Given `gameId` missing, non-numeric, or ≤ 0
- When the route is called
- Then it responds `400` with `{ success: false, error: "Nieprawidłowe gameId" }`
- Given `range` missing or not one of the 5 valid values
- When the route is called
- Then it responds `400` with `{ success: false, error: "Nieprawidłowy zakres czasu" }`
- And `getPriceHistory()` is never called with an unvalidated/unbounded `range` — the interval threshold always comes from the fixed `RANGE_DAYS` map, never a raw user string

---

## Tasks / Subtasks

- [x] Task 1 — Create `web/src/db/queries/price-history.ts` (AC: 1, 2, 3, 4, 5)
  - [x] Import `Range` type + `RANGE_DAYS` const from `@/components/TimeRangeSelector` (type-only + const import — do not redeclare)
  - [x] Define `PriceDataPoint` type matching `PriceChart.tsx`'s existing interface exactly: `{ date: string; storeId: number; storeName: string; price: string }`
  - [x] Implement `_getPriceHistory(gameId, range)`: single raw SQL query, `price_history ph INNER JOIN products p ON p.id = ph.product_id INNER JOIN stores s ON s.id = p.store_id WHERE p.game_id = ${gameId} AND ph.price IS NOT NULL AND ph.scraped_at >= NOW() - (${days} * INTERVAL '1 day') ORDER BY ph.scraped_at ASC`, casting `ph.scraped_at::date::text AS date` and `ph.price::text AS price`
  - [x] Wrap with `unstable_cache`, key `['price-history']`, `{ revalidate: 7200, tags: ['price-history'] }` (same pattern as `hot-deals.ts` / `game-passport.ts`)
  - [x] Add row-parsing guard function (`parsePriceHistoryRow`) following `parseHotDealRow`/`parseProductRow` runtime-check pattern — do not trust `db.execute()` rows as pre-typed
  - [x] Create `web/src/db/queries/price-history.test.ts` mocking `@/db/index` (same pattern as `hot-deals.test.ts`) — see Testing section below

- [x] Task 2 — Create `web/src/app/api/price-history/route.ts` (AC: 6, 7)
  - [x] `GET` handler reading `gameId` and `range` from `request.nextUrl.searchParams` (or `new URL(request.url).searchParams`)
  - [x] Validate `gameId`: `Number.isInteger` and `> 0`, else `400`
  - [x] Validate `range`: must be in `ALL_RANGES` (imported from `@/components/TimeRangeSelector`), else `400`
  - [x] Call `getPriceHistory(gameId, range)`, wrap result in `ApiResponse<PriceDataPoint[]>`, return `Response.json(body)`
  - [x] Create `web/src/app/api/price-history/route.test.ts` covering: valid request, missing `gameId`, non-numeric `gameId`, `gameId <= 0`, missing `range`, invalid `range` string

- [x] Task 3 — Wire cache invalidation (AC: none directly — prevents silent staleness bug like the one 4.5 had to fix)
  - [x] Add `revalidateTag('price-history', {})` to `web/src/app/api/revalidate/route.ts` alongside the existing `hot-deals`/`scrape-time`/`game-passport` tags

---

## Dev Notes

### ⚠️ Locked Contract — Do Not Redesign the Return Shape

Story 5.2 (`PriceChart.tsx`, `TimeRangeSelector.tsx`) is **already implemented and merged** using mock data with this exact interface:

```typescript
// web/src/components/PriceChart.tsx:7-12
export interface PriceDataPoint {
  date: string       // ISO date string "YYYY-MM-DD"
  storeId: number
  storeName: string
  price: string       // Decimal→string from DB, e.g. "89.99"
}
```

`getPriceHistory()` must return exactly `PriceDataPoint[]` — not `{ data, tooFewDataPoints }` (see conflict note below), not full ISO timestamps, not numeric prices. `PriceChart.tsx` already does its own range-filtering, unlock-threshold, and "too few data points" logic client-side (`filterByRange`, `computeUnlockedRanges`, the `isEmpty` SVG message) — **the query does not need to replicate any of that.** Give it the full unfiltered-by-UI, range-filtered-by-SQL array and let the component do the rest.

**Do not redeclare the `Range` union or the day-count thresholds.** Both already exist and are exported:

```typescript
// web/src/components/TimeRangeSelector.tsx
export type Range = '1T' | '2T' | '1M' | '3M' | '6M'
export const RANGE_DAYS: Record<Range, number> = { '1T': 7, '2T': 14, '1M': 30, '3M': 90, '6M': 180 }
export const ALL_RANGES: Range[] = ['1T', '2T', '1M', '3M', '6M']
```

Import these (type + consts are erased/tree-shaken for server code; importing from a `'use client'` file is safe for non-component named exports — Next.js only wraps component exports at the client boundary). This guarantees the query's thresholds can never drift out of sync with the component's unlock logic.

### ⚠️ Conflict: architecture.md vs epics.md — follow epics.md (more specific, written later)

- `architecture.md` (line ~539, file tree sketch) says `price-history.ts` returns `{ data, tooFewDataPoints }` and takes a single `productId: number` param, with no `range` param and no API route listed in the FR coverage table (line ~640 shows "API Routes: —" for price history).
- `epics.md` Story 5.1's AC — and Story 5.3's explicit dependency text ("`app/api/price-history/route.ts` jest gotowy z Story 5.1") — describe `getPriceHistory(gameId, range)` returning a plain array, plus a required GET route for client-side range switching.
- **Resolution:** follow `epics.md` + the already-shipped `PriceChart.tsx` contract. `productId` doesn't match FR-3 anyway ("chart per Store" implies aggregating **all** of a game's products across stores, not one product), and the "too few data points" decision already lives in `PriceChart.tsx` (component-level), not the query. Same category of doc drift already resolved for Story 4.5 (`game.ts` vs `game-passport.ts` naming) and Story 6.1b (`/api/alerts` vs `/api/alerts/subscribe`) — architecture.md predates the more detailed epics.md AC's in these cases.

### Query Pattern — Copy from `hot-deals.ts` / `game-passport.ts`

```typescript
import { getDb } from '@/db/index'
import { sql } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { RANGE_DAYS, type Range } from '@/components/TimeRangeSelector'

export type PriceDataPoint = {
  date: string
  storeId: number
  storeName: string
  price: string
}

function parsePriceHistoryRow(row: Record<string, unknown>): PriceDataPoint {
  if (typeof row.date !== 'string') throw new Error('price-history: invalid date')
  if (typeof row.store_id !== 'number') throw new Error('price-history: invalid store_id')
  if (typeof row.store_name !== 'string') throw new Error('price-history: invalid store_name')
  if (typeof row.price !== 'string') throw new Error('price-history: invalid price')
  return { date: row.date, storeId: row.store_id, storeName: row.store_name, price: row.price }
}

async function _getPriceHistory(gameId: number, range: Range): Promise<PriceDataPoint[]> {
  const db = getDb()
  const days = RANGE_DAYS[range]

  const result = await db.execute(sql`
    SELECT
      ph.scraped_at::date::text AS date,
      s.id                      AS store_id,
      s.name                    AS store_name,
      ph.price::text            AS price
    FROM price_history ph
    INNER JOIN products p ON p.id = ph.product_id
    INNER JOIN stores   s ON s.id = p.store_id
    WHERE p.game_id = ${gameId}
      AND ph.price IS NOT NULL
      AND ph.scraped_at >= NOW() - (${days} * INTERVAL '1 day')
    ORDER BY ph.scraped_at ASC
  `)

  return (result.rows as Record<string, unknown>[]).map(parsePriceHistoryRow)
}

export const getPriceHistory = unstable_cache(_getPriceHistory, ['price-history'], {
  revalidate: 7200,
  tags: ['price-history'],
})
```

`${days} * INTERVAL '1 day'` keeps the interval parameterized (via Drizzle's `sql` tagged template) rather than string-interpolating `INTERVAL '${days} days'` — `days` only ever comes from the fixed `RANGE_DAYS` lookup so it's not attacker-controlled either way, but this form avoids raw string building in SQL entirely.

### API Route Pattern — Copy from `revalidate/route.ts`, Validate Like `alerts/subscribe/route.ts`

```typescript
import type { NextRequest } from 'next/server'
import { getPriceHistory, type PriceDataPoint } from '@/db/queries/price-history'
import { ALL_RANGES, type Range } from '@/components/TimeRangeSelector'
import type { ApiResponse } from '@/types/api'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const gameId = Number(searchParams.get('gameId'))
  const range = searchParams.get('range')

  if (!Number.isInteger(gameId) || gameId <= 0) {
    const body: ApiResponse<never> = { success: false, error: 'Nieprawidłowe gameId' }
    return Response.json(body, { status: 400 })
  }
  if (!range || !ALL_RANGES.includes(range as Range)) {
    const body: ApiResponse<never> = { success: false, error: 'Nieprawidłowy zakres czasu' }
    return Response.json(body, { status: 400 })
  }

  const data = await getPriceHistory(gameId, range as Range)
  const body: ApiResponse<PriceDataPoint[]> = { success: true, data }
  return Response.json(body)
}
```

Note `Number(searchParams.get('gameId'))` on a missing param is `Number(null)` → `0`, which correctly fails the `> 0` check — no separate null-check needed, but keep it explicit/readable rather than relying on this coercion quietly.

### `unstable_cache` + `/api/revalidate` — Same Gap 4.5 Had to Close

Story 4.5 shipped `game-passport.ts` with `unstable_cache` but initially forgot to add its tag to `/api/revalidate/route.ts` — caught and fixed within that same story. Don't repeat it: `revalidateTag('price-history', {})` must be added to `web/src/app/api/revalidate/route.ts` in **this** story (Task 3), not deferred.

### Existing Utilities — Do Not Reinvent

- `getDb()` from `@/db/index` — per-request factory, no pool
- `unstable_cache` from `next/cache` — pattern in `hot-deals.ts` and `game-passport.ts`
- `Range`, `RANGE_DAYS`, `ALL_RANGES` from `@/components/TimeRangeSelector` — do not redeclare
- `ApiResponse<T>` from `@/types/api` — every route must use it (`CLAUDE.md`)
- Row-validation-guard pattern — see `parseHotDealRow` in `hot-deals.ts` / `parseProductRow` in `game-passport.ts`

### Testing Approach

Mirror `hot-deals.test.ts` for the query (mock `@/db/index`, assert `db.execute` called once, assert row shape/sort/filter behavior). Key cases:
- Multi-store rows returned with correct `date`/`storeId`/`storeName`/`price` shape
- Rows outside the range window excluded (mock rows spanning > 180 days, assert `'1T'` only returns last 7 days worth)
- `price IS NULL` rows excluded (never reach the parser)
- No price history for the game → `[]`, not thrown
- Sort order: oldest → newest

For the route, mirror `alerts/subscribe/route.test.ts` validation-style tests: valid request → `200` + data passthrough; missing/invalid `gameId` → `400`; missing/invalid `range` → `400`.

### Common Pitfalls

- ❌ Do NOT return `{ data, tooFewDataPoints }` — that shape is not what `PriceChart.tsx` expects (see conflict note above)
- ❌ Do NOT take a single `productId` — must aggregate across all of a game's products/stores (`WHERE p.game_id = ...`), matching FR-3 ("chart per Store" = multiple stores, one game)
- ❌ Do NOT redeclare `Range`/`RANGE_DAYS`/`ALL_RANGES` — import from `TimeRangeSelector.tsx`
- ❌ Do NOT cast `scraped_at::text` (full timestamp) — must be `::date::text` to match `"YYYY-MM-DD"`
- ❌ Do NOT forget `ph.price IS NOT NULL` — "not seen" cycles (FR-23) write `price = NULL` rows that must not reach the chart
- ❌ Do NOT skip `unstable_cache` or the `/api/revalidate` tag wiring
- ❌ Do NOT return a bare array from the API route — must be `ApiResponse<T>` per `CLAUDE.md`

### Project Structure Notes

- New file: `web/src/db/queries/price-history.ts` — matches `architecture.md` file tree location
- New file: `web/src/db/queries/price-history.test.ts`
- New file: `web/src/app/api/price-history/route.ts` — first *nested single-segment* API route beyond `/api/revalidate` and `/api/alerts/subscribe`; follows the same flat `route.ts` convention
- New file: `web/src/app/api/price-history/route.test.ts`
- Modified: `web/src/app/api/revalidate/route.ts` — add one `revalidateTag` line
- No schema changes — reads existing `price_history`, `products`, `stores` tables only
- ESLint boundary: only files under `db/queries/` may import `@/db/index`; the route imports the query, never `@/db/index` directly

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.1] — query AC's, dev/file assignment
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3] — confirms the API route is this story's deliverable, describes client-side range-switch fetch behavior that depends on it
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR8] — time range unlock thresholds, statistics section behavior (component-level, already implemented in Story 5.2)
- [Source: _bmad-output/planning-artifacts/architecture.md#File Organization Patterns] — price-history.ts location; noted contradicting sketch (see conflict note)
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-003] — on-demand `revalidateTag` invalidation strategy, 2h fallback TTL
- [Source: web/src/components/PriceChart.tsx:7-12] — locked `PriceDataPoint` interface (Story 5.2, already shipped)
- [Source: web/src/components/TimeRangeSelector.tsx] — `Range`, `RANGE_DAYS`, `ALL_RANGES` (Story 5.2, already shipped)
- [Source: web/src/db/queries/hot-deals.ts] — `unstable_cache` + raw SQL + row-guard pattern
- [Source: web/src/db/queries/game-passport.ts] — multi-join query pattern, `Story 4.5`
- [Source: web/src/app/api/revalidate/route.ts] — existing route pattern, tags to extend
- [Source: web/src/db/schema.ts] — `price_history` (product_id, price, price_orig, in_stock, scraped_at), `products` (game_id, store_id), `stores` (id, name)
- [Source: web/src/types/api.ts] — `ApiResponse<T>`
- [Source: CLAUDE.md] — query location rule, NUMERIC=string, ApiResponse<T> rule, no inline queries

---

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

None — no failing runs requiring debug capture. `npx tsc --noEmit` and `npx eslint` clean on all new/modified files. Full suite: 228 tests passing (204 pre-existing + 16 new query tests + 8 new route tests), zero regressions.

### Completion Notes List

- `getPriceHistory(gameId, range)` implemented exactly per the locked `PriceDataPoint` contract already consumed by `PriceChart.tsx` (Story 5.2) — reused `Range`/`RANGE_DAYS`/`ALL_RANGES` from `TimeRangeSelector.tsx` instead of redeclaring, so day-thresholds can never drift from the chart's unlock logic.
- Query joins `price_history` → `products` (on `game_id`) → `stores` in one round-trip; `ph.price IS NOT NULL` excludes "not seen" cycle rows (FR-23); `ph.scraped_at::date::text` yields `"YYYY-MM-DD"` matching the component's expected date shape exactly (not a full timestamp).
- Followed `epics.md`/Story 5.3's contract over the stale `architecture.md` sketch (`{ data, tooFewDataPoints }` / single `productId`) — documented as a resolved doc-drift conflict in Dev Notes, same category as Story 4.5's `game.ts` naming conflict.
- `GET /api/price-history` validates `gameId` (positive integer) and `range` (must be one of the 5 known values) before ever calling `getPriceHistory()` — invalid input never reaches the DB layer, matching AC-7.
- Added `revalidateTag('price-history', {})` to `/api/revalidate/route.ts` in this same story (Task 3) rather than deferring it — Story 4.5 had to fix this as a follow-up round; done up front here.
- 16 new tests in `price-history.test.ts` (empty case, row shape, sort order, price-as-string, multi-store, single round-trip, bound-parameter checks for `gameId` and each range's day-count, NULL-price exclusion, `game_id` join guard, DB-throw passthrough) + 8 new tests in `route.test.ts` (valid request, missing/non-numeric/non-positive/non-integer `gameId`, missing/invalid `range`, empty-array passthrough). Full suite: 228 tests passing, zero regressions.

### File List

- `web/src/db/queries/price-history.ts` — CREATED
- `web/src/db/queries/price-history.test.ts` — CREATED
- `web/src/app/api/price-history/route.ts` — CREATED
- `web/src/app/api/price-history/route.test.ts` — CREATED
- `web/src/app/api/revalidate/route.ts` — MODIFIED (added `revalidateTag('price-history', {})`)

## Change Log

- 2026-07-07 — Story implemented: `getPriceHistory()` query + `GET /api/price-history` route + cache-invalidation wiring. All ACs satisfied, 228 tests passing, zero regressions. Status: ready-for-dev → review.
