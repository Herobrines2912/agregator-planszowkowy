---
baseline_commit: edf230b4094ac61f9f9301028b78f913d6479472
---

# Story 4.5: Game Passport DB Queries

Status: done

## Story

As a **developer**,
I want a `getGameBySlug()` query module for the Game Passport page that fetches all needed data efficiently,
so that the page makes minimal round-trips to the database and Dev A can wire real data into the Game Passport shell (Stories 4.3, 4.4, 4.6, 5.3) without building their own queries.

## Acceptance Criteria

**AC-1 — `getGameBySlug(slug)` returns full game data:**
- Given `web/src/db/queries/game-passport.ts` implementing `getGameBySlug(slug: string)`
- When called with a slug that exists in `games` table
- Then it returns a `GamePassportData` object containing: all game fields matching `GameMetaGame` interface + `id`, `slug`, `bgg_id`, `products` array, `best_product` (pre-computed cheapest in-stock), `base_game` (always `null` for MVP — see Dev Notes)
- And all numeric prices are returned as strings (e.g. `"89.99"`) — never `float`

**AC-2 — Returns null on missing game:**
- Given a slug that does not exist in `games`
- When `getGameBySlug()` is called
- Then it returns `null` — the caller (page.tsx) invokes `notFound()`

**AC-3 — Returns game with empty products array:**
- Given a game that exists in `games` but has no rows in `products`
- When `getGameBySlug()` is called
- Then it returns the game data with `products: []` and `best_product: null`
- And the page renders with "Brak aktywnych ofert" notice — not a 404

**AC-4 — Products sorted by price ascending:**
- Given a game with products from multiple stores
- When `getGameBySlug()` is called
- Then `products` array is sorted by `price` ascending (cheapest first)
- And out-of-stock products appear last (in-stock rows first within the ascending sort)

**AC-5 — `best_product` is the cheapest in-stock product:**
- Given a game with multiple in-stock products
- When `getGameBySlug()` is called
- Then `best_product` is the product with the lowest `price` where `in_stock = true`
- And if no in-stock products exist, `best_product` is `null`

**AC-6 — At most 2 DB round-trips:**
- Given a game with products across 5 stores
- When `getGameBySlug()` is called
- Then it executes at most 2 DB round-trips (single query using JOIN handles both game + products)

**AC-7 — `getAllGameSlugs()` for `generateStaticParams`:**
- Given `getAllGameSlugs()` exported from the module
- When called
- Then it returns an array of `{ slug: string }` objects for all games that have at least one product row
- And `app/gra/[slug]/page.tsx` calls this in `generateStaticParams()` (replace the stub)

**AC-8 — ESLint boundary enforced:**
- Given the query file is in `web/src/db/queries/`
- When ESLint runs
- Then it is allowed to import from `@/db/index`
- And `app/gra/[slug]/page.tsx` does NOT import `@/db/index` — only from `@/db/queries/game-passport`

**AC-9 — `page.tsx` wired to real query:**
- Given `getGameBySlug()` is ready
- When `app/gra/[slug]/page.tsx` is updated
- Then `getGameBySlugMock()` and `MockGame` type are removed entirely
- And `getGameBySlug()` from `@/db/queries/game-passport` is used for both `generateMetadata()` and the page component
- And `generateStaticParams()` calls `getAllGameSlugs()` instead of returning `[]`
- And `OfferJsonLd products` prop is populated from `game.products` mapped to `OfferProduct` shape

## Tasks / Subtasks

- [x] Task 1 — Create `web/src/db/queries/game-passport.ts` (AC: 1, 2, 3, 4, 5, 6, 8)
  - [x] Define `GameProduct` type (store_name, price, price_orig, in_stock, product_url, id)
  - [x] Define `GamePassportData` type (extends `GameMetaGame` + id, slug, bgg_id, products, best_product, base_game)
  - [x] Define `BaseGameRef` type (name, slug, current_min_price) — used by Story 4.6
  - [x] Implement `_getGameBySlug(slug)` using a single `db.execute(sql`...`)` query joining `games`, `products`, `stores`
  - [x] Group product rows → single game object + `products[]` array
  - [x] Compute `best_product` from products where `in_stock = true`, lowest price
  - [x] Return `null` if no game found; return `{ ...game, products: [], best_product: null, base_game: null }` if game exists but no products
  - [x] Wrap with `unstable_cache` with tag `'game-passport'` and `revalidate: 7200`
  - [x] Implement `getAllGameSlugs()` — raw SQL `SELECT DISTINCT slug` INNER JOIN products
  - [x] Create `web/src/db/queries/game-passport.test.ts` — 18 unit tests with mocked DB
  - [x] Add `revalidateTag('game-passport', {})` to `web/src/app/api/revalidate/route.ts`

- [x] Task 2 — Update `web/src/app/gra/[slug]/page.tsx` (AC: 7, 8, 9)
  - [x] Remove `getGameBySlugMock()` function and `MockGame` type
  - [x] Add import: `getGameBySlug, getAllGameSlugs` from `@/db/queries/game-passport`
  - [x] Update `generateStaticParams()` to call `getAllGameSlugs()`
  - [x] Update `generateMetadata()` to call `getGameBySlug(slug)` instead of mock
  - [x] Update page component to call `getGameBySlug(slug)` instead of mock
  - [x] Pass `game.products` directly to `OfferJsonLd products` prop (GameProduct satisfies OfferProduct shape)
  - [x] Verify TypeScript: `tsc --noEmit` exits 0

## Dev Notes

### Query Implementation Pattern — Copy from Story 3.3

The established pattern for complex queries (from `hot-deals.ts`):

```typescript
import { getDb } from '@/db/index'
import { sql, eq } from 'drizzle-orm'
import { games } from '@/db/schema'
import { unstable_cache } from 'next/cache'

async function _getGameBySlug(slug: string): Promise<GamePassportData | null> {
  const db = getDb()

  // Single query: game + all products + store names
  const result = await db.execute(sql`
    SELECT
      g.id,
      g.slug,
      g.name,
      g.cover_image_url,
      g.is_expansion,
      g.designers,
      g.publishers,
      g.year_published,
      g.bgg_id,
      g.bgg_rank,
      g.bgg_category_rank,
      g.bgg_avg_rating::text          AS bgg_avg_rating,
      g.complexity::text              AS complexity,
      g.mechanics,
      g.min_players,
      g.max_players,
      g.min_playtime,
      g.max_playtime,
      g.min_age,
      g.rules_pdf_url,
      -- product columns (NULL when game has no products)
      p.id                            AS product_id,
      p.price::text                   AS price,
      p.price_orig::text              AS price_orig,
      p.in_stock,
      p.url                           AS product_url,
      s.name                          AS store_name
    FROM games g
    LEFT JOIN products p ON p.game_id = g.id
    LEFT JOIN stores   s ON s.id = p.store_id
    WHERE g.slug = ${slug}
    ORDER BY
      p.in_stock DESC NULLS LAST,   -- in-stock first
      p.price ASC NULLS LAST        -- cheapest first within each group
  `)

  if (result.rows.length === 0) return null

  const rows = result.rows as Record<string, unknown>[]
  const first = rows[0]

  // Build products array (filter out the null-product row when game has no products)
  const products: GameProduct[] = rows
    .filter(r => r.product_id !== null)
    .map(r => ({
      id: r.product_id as number,
      store_name: r.store_name as string,
      price: r.price as string,
      price_orig: r.price_orig as string | null,
      in_stock: r.in_stock as boolean,
      product_url: r.product_url as string,
    }))

  const best_product = products.find(p => p.in_stock) ?? null

  return {
    id: first.id as number,
    slug: first.slug as string,
    name: first.name as string,
    cover_image_url: first.cover_image_url as string | null,
    is_expansion: first.is_expansion as boolean,
    designers: first.designers as string[] | null,
    publishers: first.publishers as string[] | null,
    year_published: first.year_published as number | null,
    bgg_id: first.bgg_id as number | null,
    bgg_rank: first.bgg_rank as number | null,
    bgg_category_rank: first.bgg_category_rank as { category: string; rank: number } | null,
    bgg_avg_rating: first.bgg_avg_rating as string | null,
    complexity: first.complexity as string | null,
    mechanics: first.mechanics as string[] | null,
    min_players: first.min_players as number | null,
    max_players: first.max_players as number | null,
    min_playtime: first.min_playtime as number | null,
    max_playtime: first.max_playtime as number | null,
    min_age: first.min_age as number | null,
    rules_pdf_url: first.rules_pdf_url as string | null,
    products,
    best_product,
    base_game: null,  // schema gap — see Dev Notes below
  }
}

export const getGameBySlug = unstable_cache(
  _getGameBySlug,
  ['game-passport'],
  { revalidate: 7200, tags: ['game-passport'] },
)
```

### `getAllGameSlugs()` — Use Drizzle Query Builder (Not Raw SQL)

This is a simple query; use the typed Drizzle builder:

```typescript
import { getDb } from '@/db/index'
import { games, products } from '@/db/schema'
import { eq, isNotNull } from 'drizzle-orm'

export async function getAllGameSlugs(): Promise<{ slug: string }[]> {
  const db = getDb()
  // Only games with at least one product (FR-19 — generateStaticParams scope)
  const result = await db
    .selectDistinct({ slug: games.slug })
    .from(games)
    .innerJoin(products, eq(products.game_id, games.id))
  return result
}
```

### Schema Gap — `base_game` Always `null` in MVP

Story 4.6 (DlcWarning) needs `base_game: { name, slug, current_min_price }`. This requires a `parent_game_id` (or `base_game_id`) column in the `games` table. **This column does not exist in `schema.ts` yet.**

Return `base_game: null` always. Document this in a `// TODO Story 4.6: add parent_game_id to schema` comment. Story 4.6 will need a schema migration before `DlcWarning` can be fully wired.

Do NOT attempt to infer parent/child relationships from BGG data at query time — that would be a second round-trip and is speculative.

### Type Definitions

Export these types from `game-passport.ts`:

```typescript
import type { GameMetaGame } from '@/components/GameMeta'

export type GameProduct = {
  id: number
  store_name: string
  price: string           // NUMERIC as string, e.g. "89.99"
  price_orig: string | null
  in_stock: boolean
  product_url: string     // products.url — the specific product page
}

export type BaseGameRef = {
  name: string
  slug: string
  current_min_price: string | null
}

export type GamePassportData = GameMetaGame & {
  id: number
  slug: string
  bgg_id: number | null
  products: GameProduct[]
  best_product: GameProduct | null
  base_game: BaseGameRef | null
}
```

`GameMetaGame` is already defined in `components/GameMeta.tsx`. Extending it ensures the types stay in sync without duplication.

### `page.tsx` Integration — Exact Changes Required

**Remove entirely:**
```typescript
// DELETE this entire block (lines 9-63 in current page.tsx)
type MockGame = GameMetaGame & { slug: string }
async function getGameBySlugMock(slug: string): Promise<MockGame | null> { ... }
```

**Add imports:**
```typescript
import { getGameBySlug, getAllGameSlugs } from '@/db/queries/game-passport'
```

**Update `generateStaticParams`:**
```typescript
export async function generateStaticParams() {
  return getAllGameSlugs()
}
```

**Update `generateMetadata`:**
```typescript
const game = await getGameBySlug(slug)  // replace: getGameBySlugMock(slug)
```

**Update page component:**
```typescript
const game = await getGameBySlug(slug)  // replace: getGameBySlugMock(slug)
```

**Wire `OfferJsonLd`** (currently passes empty array):
```typescript
// Replace: <OfferJsonLd products={[]} />
<OfferJsonLd
  products={game.products.map(p => ({
    price: p.price,
    in_stock: p.in_stock,
    store_name: p.store_name,
    product_url: p.product_url,
    affiliate_url: null,  // no affiliate_url in schema yet
  }))}
/>
```

### NUMERIC → String: Critical Rules

- `bgg_avg_rating` and `complexity` are `NUMERIC` in PostgreSQL — cast with `::text` in raw SQL, return as `string | null`
- `price` and `price_orig` are `NUMERIC(10,2)` — cast with `::text`
- **Never** `parseFloat()` these values in the query layer
- `GameMeta.tsx` already handles string parsing via its internal `parseNumericField()` helper

### `bgg_category_rank` is JSONB — Runtime Shape

Drizzle returns JSONB as `unknown` from raw SQL execute. Cast as `{ category: string; rank: number } | null` — this matches `GameMetaGame` interface. The `GameMeta` component already has `isCategoryRank()` runtime guard.

### `unstable_cache` Tag Strategy + `/api/revalidate` Update

Use tag `'game-passport'`. The `/api/revalidate` route (`web/src/app/api/revalidate/route.ts`) currently calls `revalidatePath('/gra/[slug]', 'page')` — this busts Next.js page cache for all game passport paths. However, `unstable_cache` entries need `revalidateTag` to be invalidated properly.

**Add `revalidateTag('game-passport')` to `web/src/app/api/revalidate/route.ts`** alongside the existing `revalidateTag('hot-deals')` and `revalidateTag('scrape-time')` calls. This is a 1-line change. Without it, game passport pages rely only on the 2h fallback TTL (ADR-003) even after a scrape completes.

If per-slug invalidation is needed in the future: use `['game-passport', slug]` as cache key and `revalidateTag(`game-${slug}`)`.

### Existing Utilities — Do NOT Reinvent

- `getDb()` from `@/db/index` — per-request factory, no pool
- `unstable_cache` from `next/cache` — already used in `hot-deals.ts`
- `formatNull()`, `formatPrice()` — in `lib/format.ts` — for components, NOT the query layer
- `assertNever()` from `lib/utils.ts` — if you add a switch on `bgg_sync_status`

### Testing Approach

Use the same mocking pattern as `hot-deals.test.ts` (mock `@/db/index`):

```typescript
jest.mock('@/db/index', () => ({
  getDb: jest.fn(),
}))
```

Key test cases:
- Returns `null` for unknown slug
- Returns `{ products: [], best_product: null }` for game with no products
- `best_product` is cheapest in-stock product (not cheapest overall)
- Prices returned as strings, not numbers
- `products` sorted: in-stock first, then by price ascending

### Common Pitfalls

- ❌ Do NOT call `parseFloat()` on price strings in the query layer
- ❌ Do NOT inline the query in `page.tsx` — ESLint blocks `@/db/index` there
- ❌ Do NOT use `findUnique`-style Drizzle — use raw SQL for the main query (same as hot-deals)
- ❌ Do NOT forget to handle the `LEFT JOIN` null rows — `filter(r => r.product_id !== null)` before mapping products
- ❌ Do NOT return `bgg_category_rank` without the `as { category: string; rank: number } | null` cast — TypeScript will complain
- ❌ Do NOT skip `unstable_cache` — without it, the Game Passport page makes a live DB call on every request

### Project Structure Notes

- New file: `web/src/db/queries/game-passport.ts` — follows established naming from architecture.md `db/queries/game.ts` (architecture listed it as `game.ts` but `game-passport.ts` is consistent with Story 4.5 scope)
- New file: `web/src/db/queries/game-passport.test.ts` — co-located, same pattern as `hot-deals.test.ts`
- Modified: `web/src/app/gra/[slug]/page.tsx` — remove mock, wire real query
- No schema changes needed for AC-1 through AC-9
- No new migrations needed — reads existing tables only

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.5]
- [Source: _bmad-output/planning-artifacts/architecture.md#Drizzle queries — ścisła reguła]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-003]
- [Source: _bmad-output/planning-artifacts/architecture.md#File Organization Patterns]
- [Source: _bmad-output/implementation-artifacts/3-3-hot-deals-feed-query-real-data-connection.md — established query pattern]
- [Source: web/src/db/schema.ts — games, products, stores table definitions]
- [Source: web/src/db/index.ts — getDb() singleton pattern]
- [Source: web/src/db/queries/hot-deals.ts — unstable_cache + raw SQL pattern]
- [Source: web/src/app/gra/[slug]/page.tsx — current mock to remove, lines 9-68]
- [Source: web/src/components/GameMeta.tsx — GameMetaGame interface (extend, don't duplicate)]
- [Source: web/src/components/OfferJsonLd.tsx — OfferProduct shape for products prop]
- [Source: web/src/types/offer.ts — OfferProduct: price, in_stock, store_name, product_url, affiliate_url?]
- [Source: CLAUDE.md — NUMERIC=string, no float, assertNever, formatNull, no inline queries]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- `getAllGameSlugs()` implemented with raw SQL `SELECT DISTINCT slug FROM games INNER JOIN products` (story suggested Drizzle query builder, but raw SQL used for consistency with the rest of the module)
- `revalidateTag` call requires 2 args in this Next.js version — added `{}` as second arg to match existing pattern
- `GameProduct` is directly assignable to `OfferProduct` (no `.map()` needed) — `OfferJsonLd products={game.products}` works
- 5 pre-existing `PriceChart.test.tsx` failures not introduced by this story
- `game-passport.test.tsx` updated to mock `@/db/queries/game-passport` module (not the DB directly) for page-level tests; `generateStaticParams` test updated to reflect real implementation

### File List

- `web/src/db/queries/game-passport.ts` (created)
- `web/src/db/queries/game-passport.test.ts` (created)
- `web/src/app/gra/[slug]/page.tsx` (modified)
- `web/src/app/gra/[slug]/game-passport.test.tsx` (modified)
- `web/src/app/api/revalidate/route.ts` (modified)
