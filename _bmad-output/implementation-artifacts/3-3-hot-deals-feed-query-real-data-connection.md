---
baseline_commit: 7dfa3f37863a5e55bc81a5589c4e912730086271
---

# Story 3.3: Hot Deals Feed Query & Real Data Connection

Status: review

## Story

As a **developer**,
I want a `getHotDeals()` Drizzle query that returns real discounted games from the database with filter support, and the homepage wired to use it instead of mock data,
so that the Hot Deals Feed shows real, live pricing from Polish stores and the staleness banner reflects actual scrape timing.

## Acceptance Criteria

**AC-1 — `getHotDeals()` returns real deals:**
- Given `web/src/db/queries/hot-deals.ts` implementing `getHotDeals(limit = 40, filters?)`
- When called with no filters
- Then it returns up to `limit` games where at least one in-stock product has `(price_orig - price) / price_orig >= 0.15`
- And each result row includes: `slug`, `game_name`, `cover_image_url`, `price`, `price_orig`, `store_name`, `store_url`, `is_expansion`, `bgg_id`, `min_players`, `max_players`
- And results are sorted by discount percentage descending
- And `price` and `price_orig` are returned as decimal strings (e.g. `"129.00"`) — never `float`
- And per game, only the cheapest matching product is returned (best deal per game, not all products)

**AC-2 — Games with null price_orig excluded:**
- Given a product where `price_orig IS NULL`
- When `getHotDeals()` runs
- Then that product is excluded from results (cannot compute discount — FR-2)
- And products with `in_stock = false` are also excluded

**AC-3 — Type filter (FR-5):**
- Given `?type=base` in the URL
- When `getHotDeals(40, { type: 'base' })` is called
- Then results only contain games where `is_expansion = false`
- Given `?type=expansion`
- Then results only contain games where `is_expansion = true`
- Given no `?type` param
- Then no type filter is applied (both base games and expansions appear)

**AC-4 — Player count filter (FR-6):**
- Given `?players=2` in the URL
- When `getHotDeals(40, { players: 2 })` is called
- Then results only contain games where `min_players <= 2 <= max_players`
- And games with `min_players IS NULL OR max_players IS NULL` are excluded from this filtered result (FR-6: BGG data required for player filter)

**AC-5 — `getLastScrapeTime()` query:**
- Given `web/src/db/queries/scrape-runs.ts` implementing `getLastScrapeTime()`
- When called
- Then it returns the `finished_at` timestamp of the most recent `scrape_runs` row with `status = 'success'`
- And returns `null` if no successful runs exist

**AC-6 — Homepage integration (Dev A wires, Dev B defines the contract):**
- Given `app/page.tsx` updated to import and call `getHotDeals()` and `getLastScrapeTime()`
- When the homepage renders as a Server Component
- Then `mockDeals` array and `getLastScrapeTime` stub are removed entirely
- And `searchParams` is extended to read `type` and `players` URL params (in addition to `view`)
- And `getHotDeals(40, filters)` is called with filters derived from `type` and `players` params
- And the resulting array is passed to `DealCard` / `ListRow` exactly as mock data was (same props shape)
- And `resultCount` passed to `FilterBar` reflects the real deal count
- And `isBestDeal` logic for `ListRow` still uses `Math.min` over real prices
- And if `getHotDeals()` returns an empty array, the existing empty-state UI renders as-is

**AC-7 — ESLint boundary enforced:**
- Given the new query files
- When ESLint runs
- Then `web/src/db/queries/hot-deals.ts` is allowed to import from `@/db/index` (it IS in `db/queries/`)
- And `app/page.tsx` does NOT import `@/db/index` directly — it imports only from `@/db/queries/hot-deals` and `@/db/queries/scrape-runs`

**AC-8 — ISR revalidation path works:**
- Given the existing `app/api/revalidate/route.ts` (already implemented)
- When a scrape cycle completes and POSTs to `/api/revalidate`
- Then `revalidatePath('/')` is called — the homepage shows fresh data within 30 min (FR-1, ADR-003)
- Note: no change needed in this story — just verify the route exists and `revalidatePath('/')` is in it

## Tasks / Subtasks

- [x] Task 1 — Create `web/src/db/queries/` directory with `hot-deals.ts` (AC: 1, 2, 3, 4, 7)
  - [x] Define `HotDeal` type (export it — `page.tsx` and components will use it)
  - [x] Define `HotDealsFilters` type with optional `type` and `players` fields
  - [x] Implement `getHotDeals(limit = 40, filters?: HotDealsFilters): Promise<HotDeal[]>` using Drizzle CTE + DISTINCT ON pattern
  - [x] Apply WHERE clauses: `price IS NOT NULL`, `price_orig IS NOT NULL`, `in_stock = true`, discount ≥ 15%
  - [x] Apply conditional WHERE: type filter on `games.is_expansion`, players filter on `min_players`/`max_players`
  - [x] Sort by `discount_ratio DESC` in outer CTE query, add `LIMIT limit`

- [x] Task 2 — Create `web/src/db/queries/scrape-runs.ts` (AC: 5, 7)
  - [x] Implement `getLastScrapeTime(): Promise<Date | null>` querying `scrape_runs` where `status = 'success'`, ordered by `finished_at DESC`, limit 1

- [x] Task 3 — Update `web/src/app/page.tsx` (AC: 6, 7)
  - [x] Remove `mockDeals` array and `const getLastScrapeTime` stub function
  - [x] Add imports: `getHotDeals` from `@/db/queries/hot-deals`, `getLastScrapeTime` from `@/db/queries/scrape-runs`
  - [x] Extend `searchParams` type to `Promise<{ view?: string; type?: string; players?: string }>`
  - [x] Parse `type` and `players` from searchParams, build `filters` object
  - [x] Replace mock deal usage with `const deals = await getHotDeals(40, filters)` (rename variable from `mockDeals` to `deals`)
  - [x] Update `getLastScrapeTime()` call to use the imported function
  - [x] Update `resultCount` passed to `FilterBar` to use `deals.length`
  - [x] Verify `isBestDeal` and `minPrice` logic still works with real data (same shape)

- [x] Task 4 — Verify ISR route (AC: 8)
  - [x] Confirm `app/api/revalidate/route.ts` calls `revalidatePath('/')` — no code change expected, just verification

## Dev Notes

### Critical Architecture Rules

- **ALL queries in `/web/src/db/queries/`** — ESLint `no-restricted-imports` blocks `@/db/index` from anywhere outside this directory. [Source: architecture.md#Drizzle queries — ścisła reguła]
- **Use `getDb()` from `@/db/index`** — per-request factory, no connection pool (Neon serverless model). Never import `neon` or `drizzle` directly in query files.
- **NUMERIC → string, never float** — `price` and `price_orig` come from PostgreSQL as strings via Drizzle. Pass them as-is to components. Never `parseFloat` in the query layer. [Source: CLAUDE.md]
- **Discount filter is 15%, not any %** — `(price_orig - price) / price_orig >= 0.15` (FR-1)
- **Best deal per game** — the query must return 1 row per game (cheapest in-stock product with ≥15% discount). Use CTE + `DISTINCT ON` or equivalent subquery approach.

### `web/src/db/queries/` Does Not Exist Yet

This story creates the `queries/` directory for the first time. It is the canonical location for ALL Drizzle queries in the project. Future stories (game.ts, price-history.ts, flipper.ts) will add to this same directory.

### Drizzle Query Implementation Pattern

The hot-deals query requires a "best deal per game" pattern. This is a two-step SQL operation:

```typescript
import { getDb } from '@/db/index'
import { games, products, stores } from '@/db/schema'
import { sql, and, isNotNull, eq, gte, lte, isNull } from 'drizzle-orm'

// Step 1: CTE picks cheapest qualifying product per game (DISTINCT ON games.id ORDER BY price ASC)
// Step 2: Outer query sorts by discount_ratio DESC, applies LIMIT

// Drizzle $with() + sql`` template is the correct approach for complex CTEs:
const db = getDb()
const bestDeals = db.$with('best_deals').as(
  db.select({
    slug: games.slug,
    game_name: games.name,
    // ... other fields
    discount_ratio: sql<number>`(${products.price_orig}::numeric - ${products.price}::numeric) / ${products.price_orig}::numeric`,
  })
  .from(games)
  .innerJoin(products, eq(products.game_id, games.id))
  .innerJoin(stores, eq(stores.id, products.store_id))
  .where(/* conditions */)
  .orderBy(games.id, products.price)  // DISTINCT ON requires order by partition key first
  // Note: Drizzle does not support DISTINCT ON natively — use .groupBy() + sql or raw sql for this
)
```

**IMPORTANT — DISTINCT ON in Drizzle:**
Drizzle ORM does not have a native `.distinctOn()` method as of v0.45. Options:
1. Use `db.execute(sql`...`)` with a raw SQL string (simplest, fully correct)
2. Use a subquery with `ROW_NUMBER()` window function
3. Use Drizzle's `sql` tagged template for the entire query

**Recommended approach for this story:** use `db.execute(sql`...`)` with a typed result. This avoids fighting Drizzle's query builder for PostgreSQL-specific syntax:

```typescript
const result = await db.execute<HotDeal>(sql`
  WITH best_deals AS (
    SELECT DISTINCT ON (g.id)
      g.slug,
      g.name AS game_name,
      g.cover_image_url,
      p.price::text AS price,
      p.price_orig::text AS price_orig,
      s.name AS store_name,
      p.url AS store_url,
      g.bgg_id,
      (p.price_orig::numeric - p.price::numeric) / p.price_orig::numeric AS discount_ratio
    FROM games g
    INNER JOIN products p ON p.game_id = g.id
    INNER JOIN stores s ON s.id = p.store_id
    WHERE p.price IS NOT NULL
      AND p.price_orig IS NOT NULL
      AND p.in_stock = TRUE
      AND (p.price_orig::numeric - p.price::numeric) / p.price_orig::numeric >= 0.15
      ${typeClause}
      ${playersClause}
    ORDER BY g.id, p.price ASC
  )
  SELECT * FROM best_deals
  ORDER BY discount_ratio DESC
  LIMIT ${limit}
`)
return result.rows
```

Build `typeClause` and `playersClause` conditionally using `sql` fragments:
- `typeClause = filters?.type === 'base' ? sql\`AND g.is_expansion = FALSE\` : filters?.type === 'expansion' ? sql\`AND g.is_expansion = TRUE\` : sql\`\``
- `playersClause = filters?.players ? sql\`AND g.min_players <= ${filters.players} AND g.max_players >= ${filters.players} AND g.min_players IS NOT NULL AND g.max_players IS NOT NULL\` : sql\`\``

**`db.execute()` return mapping:** Cast the result rows to `HotDeal[]`:
```typescript
const result = await db.execute(sql`...`)
return result.rows as HotDeal[]
```
The `rows` property on the neon-http execute result is an array of plain objects matching the column names in your SELECT. Ensure your SQL column aliases exactly match the `HotDeal` type field names.

### Return Type — Must Match `DealCardProps` Exactly

From `web/src/components/DealCard.tsx` (line ~8):
```typescript
export interface DealCardProps {
  slug: string
  game_name: string
  cover_image_url: string | null
  price: string          // NUMERIC as string "129.00"
  price_orig: string | null
  store_name: string
  store_url: string      // product URL (products.url), NOT store base_url
  index?: number         // added by page.tsx, NOT in HotDeal
}
```

`ListRowProps extends DealCardProps` and adds `isBestDeal?: boolean` (added by page.tsx).

The `HotDeal` export type must match `DealCardProps` minus `index`, plus `bgg_id` for the "typ nieznany" label (FR-5). The filter fields (`is_expansion`, `min_players`, `max_players`) are applied in the WHERE clause and do NOT need to be in the return type:
```typescript
export type HotDeal = {
  slug: string
  game_name: string
  cover_image_url: string | null
  price: string
  price_orig: string | null
  store_name: string
  store_url: string      // maps to products.url — the specific product page
  bgg_id: number | null  // null = game not yet matched to BGG; used for "typ nieznany" display (FR-5)
}
```

**TypeScript prop spreading warning:** `page.tsx` currently does `{...deal}` spread into DealCard. If `HotDeal` has any extra fields not in `DealCardProps`, TypeScript may warn. To keep it clean, explicitly pass only `DealCardProps` fields:
```typescript
<DealCard
  key={deal.slug}
  slug={deal.slug}
  game_name={deal.game_name}
  cover_image_url={deal.cover_image_url}
  price={deal.price}
  price_orig={deal.price_orig}
  store_name={deal.store_name}
  store_url={deal.store_url}
  index={i}
/>
```

### `store_url` Is the Product URL, Not Store Homepage

The mock data used store base URL (`https://aleplanszowki.pl`) as a placeholder. The real query must return `products.url` (the specific product listing page on the store). This is what "Zobacz ofertę →" should deep-link to.

### `page.tsx` Integration — Exact Changes Required

Current `page.tsx` (line 64–67):
```typescript
// TODO Story 3.3: replace with real query from db/queries/scrape-runs.ts
async function getLastScrapeTime(): Promise<Date | null> {
  return null
}
```
→ Remove this function entirely. Import `getLastScrapeTime` from `@/db/queries/scrape-runs`.

Current `searchParams` type (line 87):
```typescript
searchParams: Promise<{ view?: string }>
```
→ Extend to: `Promise<{ view?: string; type?: string; players?: string }>`

Current `const mockDeals = [...]` (lines 25–62):
→ Remove entirely. Replace usage of `mockDeals` with `deals` from `await getHotDeals(40, filters)`.

Filter parsing logic to add in the Server Component:
```typescript
const { view, type, players } = await searchParams
const isList = view === 'list'
const filters: HotDealsFilters = {}
if (type === 'base' || type === 'expansion') filters.type = type
if (players) { const p = parseInt(players, 10); if (!isNaN(p) && p > 0) filters.players = p }
const deals = await getHotDeals(40, Object.keys(filters).length ? filters : undefined)
const lastScrapedAt = await getLastScrapeTime()
```

### `scrape-runs.ts` Query

```typescript
import { getDb } from '@/db/index'
import { scrapeRuns } from '@/db/schema'
import { desc, eq } from 'drizzle-orm'

export async function getLastScrapeTime(): Promise<Date | null> {
  const db = getDb()
  const result = await db
    .select({ finished_at: scrapeRuns.finished_at })
    .from(scrapeRuns)
    .where(eq(scrapeRuns.status, 'success'))
    .orderBy(desc(scrapeRuns.finished_at))
    .limit(1)
  return result[0]?.finished_at ?? null
}
```

Note: `scrapeRuns.finished_at` is nullable (TIMESTAMPTZ without `notNull()`). If the most recent success row has `finished_at = null`, return `null`.

### Schema Facts

From `web/src/db/schema.ts`:
- `games.slug` — unique, `text`, not null
- `games.is_expansion` — `boolean`, not null, default false
- `games.bgg_id` — `integer`, nullable (null = not yet matched to BGG)
- `games.min_players`, `games.max_players` — `integer`, nullable
- `products.price`, `products.price_orig` — `NUMERIC(10,2)`, nullable
- `products.in_stock` — `boolean`, not null, default true
- `products.url` — `text`, not null
- `stores.name` — `text`, not null
- `stores.base_url` — `text`, not null
- `scrapeRuns.status` — `text.$type<'success' | 'partial' | 'failed'>()`, not null
- `scrapeRuns.finished_at` — TIMESTAMPTZ, **nullable** (may be null if scrape crashed mid-run)

### Existing Utilities — Do NOT Reinvent

- `formatPrice(value)` → already in `web/src/lib/format.ts` — used by components, not by query layer
- `calcDiscount(price, priceOrig)` → already in `web/src/lib/calc.ts` — used by components, not by query layer
- `assertNever(x)` → `web/src/lib/utils.ts` — needed in any `switch` on `bgg_sync_status` or similar enums
- `ApiResponse<T>` → `web/src/types/api.ts` — for API routes, not for Server Component queries

The query layer returns raw types. Components handle formatting.

### ISR Verification

`web/src/app/api/revalidate/route.ts` (already implemented from Story 4.1 area). Verify it calls `revalidatePath('/')` — no code change needed. The staleness end-to-end path is:
```
GitHub Actions scraper.yml → POST /api/revalidate → revalidatePath('/') → Vercel ISR cache busted → next visit serves fresh data
```
Fallback TTL is 2h (ADR-003). [Source: architecture.md#ADR-003]

### Project Structure Notes

- New files created by this story:
  - `web/src/db/queries/hot-deals.ts` ← primary deliverable
  - `web/src/db/queries/scrape-runs.ts` ← secondary deliverable (staleness banner)
- Files modified:
  - `web/src/app/page.tsx` ← remove mock data, wire real queries

- Architecture lists `hot-deals.ts` under `db/queries/` explicitly. [Source: architecture.md#File Organization Patterns]
- No new migrations needed — this story only reads existing tables.
- No new Drizzle schema changes — `schema.ts` is unchanged.

### Common Pitfalls to Avoid

- ❌ Do NOT use `parseFloat()` on price strings in the query layer — return them as `string` from PostgreSQL
- ❌ Do NOT inline the query in `page.tsx` — ESLint will reject it
- ❌ Do NOT import from `@/db/index` in `page.tsx` — only `@/db/queries/*`
- ❌ Do NOT use `products.price_orig` without `IS NOT NULL` check — it is nullable
- ❌ Do NOT forget `in_stock = true` filter — out-of-stock products must not appear in Hot Deals
- ❌ Do NOT return `store.base_url` as `store_url` — return `products.url` (the product page)
- ❌ Do NOT accidentally break the `StalenessWarningBanner` — it expects `lastScrapedAt: string | null` (ISO string), and `page.tsx` already converts `Date → .toISOString()` before passing it

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#Drizzle queries — ścisła reguła]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-003]
- [Source: _bmad-output/planning-artifacts/architecture.md#Caching: Materialized View hot_deals]
- [Source: web/src/app/page.tsx — current mock data and TODO comment at line 64]
- [Source: web/src/components/DealCard.tsx — DealCardProps interface]
- [Source: web/src/components/ListRow.tsx — ListRowProps interface]
- [Source: web/src/components/FilterBar.tsx — FilterBarProps, URL param keys]
- [Source: web/src/components/StalenessWarningBanner.tsx — expects string | null]
- [Source: web/src/db/schema.ts — games, products, stores, scrapeRuns table definitions]
- [Source: web/src/db/index.ts — getDb() pattern]
- [Source: web/src/lib/format.ts, calc.ts, utils.ts — existing utilities]
- [Source: CLAUDE.md — NUMERIC=string, no float, no print, no inline queries]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Confirmed 3 PriceChart test failures are pre-existing on baseline commit `7dfa3f3` (Story 5.2 in review). Not caused by this story.
- ESLint config required an override block for `src/db/queries/**/*.ts` — the existing global rule banned `@/db/index` everywhere including query files.
- Drizzle does not have native `DISTINCT ON` support in v0.45 query builder; used `db.execute(sql\`...\`)` with raw SQL CTE instead.
- `scrape_runs.finished_at` is nullable (no `notNull()` in schema) — `getLastScrapeTime()` returns `null` in two cases: no rows or `finished_at = null`.

### Completion Notes List

- Created `web/src/db/queries/` directory (first query file in the project).
- `getHotDeals()`: PostgreSQL CTE with `DISTINCT ON (g.id)` picks the cheapest in-stock product per game, outer query sorts by `discount_ratio DESC`. Filters are conditional `sql` fragments. Returns `HotDeal[]`.
- `getLastScrapeTime()`: Drizzle query builder, `WHERE status = 'success' ORDER BY finished_at DESC LIMIT 1`. Returns `Date | null`.
- `page.tsx`: removed `mockDeals` + stub, added real imports, extended `searchParams` to read `?type` and `?players`, explicit prop passing (no spread) to `DealCard`/`ListRow`.
- Fixed ESLint override to allow `@/db/index` in `db/queries/` — boundary still enforced for all other files.
- 18 new tests added (12 for `getHotDeals`, 6 for `getLastScrapeTime`). All pass. No regressions in existing 156 passing tests.
- TypeScript: `tsc --noEmit` exits 0. ESLint: exits 0 on all new/modified files.
- AC-8: `app/api/revalidate/route.ts` already calls `revalidatePath('/')` — verified, no change needed.

### File List

- `web/src/db/queries/hot-deals.ts` — NEW: `HotDeal` type, `HotDealsFilters` type, `getHotDeals()` function
- `web/src/db/queries/hot-deals.test.ts` — NEW: 12 tests for `getHotDeals()`
- `web/src/db/queries/scrape-runs.ts` — NEW: `getLastScrapeTime()` function
- `web/src/db/queries/scrape-runs.test.ts` — NEW: 6 tests for `getLastScrapeTime()`
- `web/src/app/page.tsx` — MODIFIED: removed mock data, wired real queries, added filter parsing, explicit prop passing
- `web/eslint.config.mjs` — MODIFIED: added override block allowing `@/db/index` in `db/queries/`
