---
baseline_commit: d723e12
---

# Story 4.3: PriceTable — Multi-Store Price Comparison

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want to see all stores offering this game with their current prices in one table,
so that I can compare prices and choose where to buy.

## Acceptance Criteria

**AC-1 — Table structure & columns:**
- Given `PriceTable` receives `products: GameProduct[]` (already sorted by the query, see Dev Notes)
- When rendered
- Then it shows a `<table>` with columns: **Sklep** (store name — no logo, see Dev Notes gap), **Cena** (`formatPrice(product.price)`), **Cena oryginalna** (strikethrough `formatPrice(product.price_orig)` if `price_orig` is non-null), **Rabat** (badge, see AC-5), **Dostępność** (status text), **Akcja** (button/link, see AC-6/AC-7)
- And rows render in the exact order of the `products` array — **the component does not sort**

**AC-2 — Cheapest row highlight:**
- Given `bestProductId: number | null` prop
- When a row's `product.id === bestProductId`
- Then that row has `border-left: 3px solid #3D5C3A` and a "NAJTANIEJ" chip in the Sklep cell (green outline, `#3D5C3A`, 10px font, `data-testid="najtaniej-chip"`)
- And when `bestProductId === null` (all products out of stock), no row gets the highlight — this is correct, not a bug

**AC-3 — Out-of-stock row treatment:**
- Given a product with `in_stock === false`
- When rendered
- Then the `<tr>` has `opacity: 0.55`, the Akcja cell shows "Niedostępny" in muted text instead of the buy link, and the Dostępność cell shows "Niedostępny"
- Note: the row's *position* in the table is whatever the input array gives it (query already orders out-of-stock last) — do not reorder in the component

**AC-4 — Discount badge (Rabat column):**
- Given a product row
- When both `product.price` and `product.price_orig` are non-null and `calcDiscount(parseFloat(price), parseFloat(price_orig)) > 0`
- Then the Rabat cell shows a `-{discount}%` badge colored by threshold (< 40 → `#3D5C3A`, 40–70 → `#C07B18`, > 70 → `#C42B2B` — see Dev Notes for the exact function to use)
- Otherwise (no `price_orig`, or discount ≤ 0) the Rabat cell shows `formatNull(null)` → "—"

**AC-5 — "Kup →" external link:**
- Given an in-stock product's Akcja cell
- When the "Kup →" link is rendered
- Then `href={product.product_url}` (no `affiliate_url` field exists — see Dev Notes), `target="_blank"`, `rel="noopener noreferrer"`

**AC-6 — Never crashes on edge-size input:**
- Given `products` with exactly 1 item (regardless of stock status)
- When rendered
- Then the table renders that single row without error
- Given `products = []`
- When rendered
- Then `PriceTable` renders `null` (page-level empty-state messaging is handled by the caller — see Task 2)

**AC-7 — `PriceTable.test.tsx` coverage:**
- Given the test file
- When run
- Then it covers: cheapest-row highlight via `bestProductId` match, out-of-stock dimming + "Niedostępny" label, single-row table (no crash), empty-array table (renders `null`, no crash), "NAJTANIEJ" chip visibility (present/absent), external link attributes, discount badge color at each threshold boundary, no badge when `price_orig` is null, `bestProductId === null` → no row highlighted

**AC-8 — `page.tsx` wiring (integration, not in epics' file list but required for the story to have any effect):**
- Given `web/src/app/gra/[slug]/page.tsx` currently has a static placeholder div for "PriceTable (Story 4.3)" at lines ~124–139
- When this story is implemented
- Then that placeholder is replaced with `<PriceTable products={game.products} bestProductId={game.best_product?.id ?? null} />`, rendered only when `game.products.length > 0`; otherwise a "Brak aktywnych ofert" notice (muted text, same wrapper card styling) is shown
- And the neighboring `BestDealBanner` (Story 4.4) and `PriceChart` (Story 5.3) placeholder blocks are left untouched

## Tasks / Subtasks

- [x] Task 1 — Create `web/src/components/PriceTable.tsx` (AC: 1, 2, 3, 4, 5, 6)
  - [x] Define `PriceTableProps = { products: GameProduct[]; bestProductId: number | null }`, import `GameProduct` type from `@/db/queries/game-passport`
  - [x] Server Component — no `'use client'` directive (no interactivity beyond plain `<a>` links; unlike `DealCard`, there's no whole-card `onClick`/`useRouter`)
  - [x] Guard: `if (products.length === 0) return null`
  - [x] Render `<table>` with the 6 columns from AC-1, mapping `products` in input order (no `.sort()` call anywhere in this component)
  - [x] Per-row: compute `isCheapest = product.id === bestProductId`, apply border-left + NAJTANIEJ chip when true
  - [x] Per-row: apply `opacity: 0.55` + "Niedostępny" swaps when `!product.in_stock`
  - [x] Local `badgeColor(discount: number): string` helper (duplicate the 5-line function — do not import/export from `DealCard.tsx`, which is outside this story's file scope)
  - [x] Discount cell: `product.price && product.price_orig ? calcDiscount(parseFloat(product.price), parseFloat(product.price_orig)) : null`, render badge only when result `> 0`
  - [x] Cena / Cena oryginalna cells: use `formatPrice()` from `@/lib/format` (handles null → "—" automatically — never format prices manually)
  - [x] Akcja cell: `<a>` with `product.product_url`, `target="_blank"`, `rel="noopener noreferrer"`, text "Kup →"; swapped for muted "Niedostępny" text when out of stock

- [x] Task 2 — Wire into `web/src/app/gra/[slug]/page.tsx` (AC: 8)
  - [x] Add import: `import { PriceTable } from '@/components/PriceTable'`
  - [x] Replace the placeholder `<div>...PriceTable (Story 4.3)...</div>` block (lines ~124–139) with the conditional render described in AC-8
  - [x] Do not touch the `BestDealBanner` or `PriceChart` placeholder blocks

- [x] Task 3 — Create `web/src/components/PriceTable.test.tsx` (AC: 7)
  - [x] Follow `DealCard.test.tsx` conventions: `vitest` + `@testing-library/react`, `describe`/`test`/`expect`
  - [x] Write all cases listed in AC-7

## Dev Notes

### Critical: epics AC terms vs. the real `GameProduct` shape

The epics.md wording for this story (`_bmad-output/planning-artifacts/epics.md` line ~1203) was written before Story 4.5 (Dev B) landed the actual query. Several terms in that text do **not** match the real data model. Do not implement the epics wording literally — use this reconciliation:

| Epics AC says | Reality (`web/src/db/queries/game-passport.ts`) | What to actually do |
|---|---|---|
| "store name **+ logo 24px**" | No `logo_url` on `stores` table, none on `GameProduct`. Zero logo assets/mapping exist anywhere in the codebase (verified — grepped for `logo` project-wide). | **Do not invent a logo path like `/logos/${store}.png` — it will 404.** Render store name text only, no image. This is a known schema gap, same category as the `base_game: null` gap documented in Story 4.5. |
| "`product.affiliate_url ?? product.product_url`" | `GameProduct` has no `affiliate_url` field (confirmed: Story 4.5's own dev notes say "no affiliate_url in schema yet") | Use `product.product_url` only. |
| "`discount_pct >= 40`" as if it's a field | Not a DB field or a `GameProduct` property | Compute with `calcDiscount()` from `@/lib/calc`, exactly like `DealCard.tsx` does. |
| Prices assumed always present | `GameProduct.price` and `price_orig` are `string \| null` (the real code, not the `string` claimed in Story 4.5's own doc) | Always null-guard before `parseFloat()`. `formatPrice()` already returns "—" for null — use it for display, don't hand-roll. |

### `GameProduct` type (import, do not redefine)

```typescript
// from '@/db/queries/game-passport' — this import is ESLint-safe;
// the only restricted import is '@/db/index', not '@/db/queries/*'
export type GameProduct = {
  id: number
  store_name: string
  price: string | null
  price_orig: string | null
  in_stock: boolean
  product_url: string
}
```

### Sort order is already correct — do not re-sort

`getGameBySlug()`'s SQL does `ORDER BY p.in_stock DESC NULLS LAST, p.price ASC NULLS LAST`, and `best_product` is pre-computed as the cheapest in-stock item. The `products` array arriving as a prop is **already** in the exact display order the AC wants (in-stock first, cheapest-to-most-expensive within that, out-of-stock last). `PriceTable` must render it as-is. Do not add a `.sort()` — that would be redundant logic that could disagree with the query's tie-breaking and would fail a code review as an unnecessary abstraction.

For the "cheapest row" highlight, do not recompute "is this the min price" — just compare `product.id === bestProductId`. The caller passes `game.best_product?.id ?? null`.

### Component code shape (embed directly, do not deviate)

```typescript
import { formatPrice, formatNull } from '@/lib/format'
import { calcDiscount } from '@/lib/calc'
import type { GameProduct } from '@/db/queries/game-passport'

export interface PriceTableProps {
  products: GameProduct[]
  bestProductId: number | null
}

function badgeColor(discount: number): string {
  if (discount < 40) return '#3D5C3A'
  if (discount <= 70) return '#C07B18'
  return '#C42B2B'
}

export function PriceTable({ products, bestProductId }: PriceTableProps) {
  if (products.length === 0) return null

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th>Sklep</th>
          <th>Cena</th>
          <th>Cena oryginalna</th>
          <th>Rabat</th>
          <th>Dostępność</th>
          <th>Akcja</th>
        </tr>
      </thead>
      <tbody>
        {products.map((product) => {
          const isCheapest = product.id === bestProductId
          const discount =
            product.price && product.price_orig
              ? calcDiscount(parseFloat(product.price), parseFloat(product.price_orig))
              : null

          return (
            <tr
              key={product.id}
              data-testid="price-table-row"
              style={{
                opacity: product.in_stock ? 1 : 0.55,
                borderLeft: isCheapest ? '3px solid #3D5C3A' : '3px solid transparent',
              }}
            >
              <td>
                {product.store_name}
                {isCheapest && (
                  <span data-testid="najtaniej-chip" style={{ /* green outline, 10px, per AC-2 */ }}>
                    NAJTANIEJ
                  </span>
                )}
              </td>
              <td>{formatPrice(product.price)}</td>
              <td style={{ textDecoration: product.price_orig ? 'line-through' : undefined }}>
                {product.price_orig ? formatPrice(product.price_orig) : formatNull(null)}
              </td>
              <td>
                {discount !== null && discount > 0 ? (
                  <span data-testid="discount-badge" style={{ backgroundColor: badgeColor(discount) }}>
                    -{discount}%
                  </span>
                ) : (
                  formatNull(null)
                )}
              </td>
              <td>{product.in_stock ? 'Dostępny' : 'Niedostępny'}</td>
              <td>
                {product.in_stock ? (
                  <a href={product.product_url} target="_blank" rel="noopener noreferrer" data-testid="buy-link">
                    Kup →
                  </a>
                ) : (
                  <span data-testid="unavailable-label">Niedostępny</span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
```

This is a shape reference, not literal copy-paste — apply the project's existing inline-style conventions from `GameMeta.tsx` (CSS custom properties like `var(--color-text-primary)` for anything not covered by the fixed hex values above; the discount badge and cheapest-row-border colors must stay as the literal hex `#3D5C3A` / `#C07B18` / `#C42B2B` to match `DealCard.test.tsx`'s tested convention — jsdom's `toHaveStyle` does not resolve CSS custom properties, so a `var(--color-badge-discount-low)` value will fail `toHaveStyle({ backgroundColor: '#3D5C3A' })` assertions).

### `page.tsx` — exact integration point

Current placeholder (`web/src/app/gra/[slug]/page.tsx`, inside the right column, between `BestDealBanner` and `PriceChart` placeholders):

```tsx
{/* PriceTable — Story 4.3 */}
<div style={{ backgroundColor: 'var(--color-surface)', borderRadius: '12px', padding: '20px', minHeight: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
  PriceTable (Story 4.3)
</div>
```

Replace with:

```tsx
{game.products.length > 0 ? (
  <PriceTable products={game.products} bestProductId={game.best_product?.id ?? null} />
) : (
  <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: '12px', padding: '20px', minHeight: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
    Brak aktywnych ofert
  </div>
)}
```

`web/src/app/gra/[slug]/game-passport.test.tsx` (page-level test) does not currently assert on the placeholder text — safe to replace without breaking existing tests.

### Existing Utilities — Do NOT Reinvent

- `formatPrice()`, `formatNull()` — `@/lib/format` — never hand-format a price or write your own null fallback string
- `calcDiscount()` — `@/lib/calc` — never recompute `(orig - price) / orig * 100` inline
- No `assertNever()` needed — this component has no `switch` on a `.$type<>()` enum field

### Common Pitfalls

- ❌ Do NOT invent a store logo image path — no such data exists (see reconciliation table)
- ❌ Do NOT reference `product.affiliate_url` — the field doesn't exist
- ❌ Do NOT add a `.sort()` to the `products` array — it's already correctly ordered by the query
- ❌ Do NOT treat `price` / `price_orig` as always-present strings — both are `string | null`
- ❌ Do NOT add `'use client'` — this component needs no client-side state or router
- ❌ Do NOT modify `DealCard.tsx` to export `badgeColor` — out of this story's scope; duplicate the small function instead
- ❌ Do NOT import `@/db/index` in `PriceTable.tsx` — ESLint blocks it; only `@/db/queries/*` is allowed

### Testing Approach

- Follow `DealCard.test.tsx` / `GameMeta.test.tsx` conventions: `vitest`, `@testing-library/react`, `render`/`screen`, `data-testid` for assertions (not text-content matching where structure is styled)
- No DB mocking needed — `PriceTable` is a pure presentational component driven entirely by props
- Test the discount badge color at the exact threshold boundaries used in `DealCard.test.tsx` (discount 30 → green, 50 → amber, 80 → red) for consistency

### Previous Story Intelligence (4.5 — Game Passport DB Queries, Dev B, done)

- `getGameBySlug()` is cached via `unstable_cache` with tag `'game-passport'`, `revalidate: 7200` — no action needed here, but be aware stale data can persist up to 2h without a `/api/revalidate` call
- Story 4.5's own doc claimed `price` is always a `string` — the actual shipped code (`game-passport.ts`) has `price: string | null`. Trust the code, not the older doc.
- `best_product` selection logic in the real code: `products.filter(p => p.in_stock).sort(...)[0] ?? null` — cheapest in-stock, `null` if none in stock. This is exactly `bestProductId` source.

### Project Structure Notes

- New file: `web/src/components/PriceTable.tsx` — follows `DealCard.tsx` / `GameMeta.tsx` sibling pattern (component + co-located `.test.tsx`)
- New file: `web/src/components/PriceTable.test.tsx`
- Modified: `web/src/app/gra/[slug]/page.tsx` — placeholder replacement only, no other changes
- No schema changes, no new queries, no migrations

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.3: PriceTable — Multi-Store Price Comparison]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4: Game Passport Core — dependency table, 4.3 depends on 4.5]
- [Source: _bmad-output/implementation-artifacts/4-5-game-passport-db-queries.md — GameProduct/GamePassportData shape, best_product logic, affiliate_url gap]
- [Source: web/src/db/queries/game-passport.ts — actual shipped query, sort order, types]
- [Source: web/src/app/gra/[slug]/page.tsx — current placeholder location and page structure]
- [Source: web/src/components/DealCard.tsx — discount badge color thresholds, external link pattern]
- [Source: web/src/components/DealCard.test.tsx — tested hex values for badge colors, confirms hex not CSS-var]
- [Source: web/src/components/GameMeta.tsx — inline-style + CSS-var + data-testid conventions]
- [Source: web/src/lib/calc.ts — calcDiscount()]
- [Source: web/src/lib/format.ts — formatPrice(), formatNull()]
- [Source: web/src/db/schema.ts — products/stores tables, confirms no logo/discount_pct/affiliate_url columns]
- [Source: web/src/app/globals.css — --color-badge-discount-low/mid/high vars, confirm same hex as DealCard]
- [Source: web/eslint.config.mjs — @/db/index import restriction, @/db/queries/* allowed]
- [Source: CLAUDE.md — formatNull rule, no inline price parsing beyond calcDiscount precedent, domain-named components]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

### Completion Notes List

- `PriceTable.tsx` implemented as a Server Component (no `'use client'`) — pure presentational, props-driven, no DB access
- Rows render in exact `products` array input order — no client-side re-sort, matching the pre-sorted contract from `getGameBySlug()`
- Cheapest-row highlight and NAJTANIEJ chip driven by `product.id === bestProductId`, not by recomputing min price
- `badgeColor()` duplicated locally (5 lines) rather than extracted from `DealCard.tsx` — kept out of scope per Dev Notes decision
- Discount badge/border-left colors kept as literal hex (`#3D5C3A`/`#C07B18`/`#C42B2B`) rather than `var(--color-badge-discount-*)` — required because jsdom's `toHaveStyle` in tests does not resolve CSS custom properties
- Added `data-testid="rabat-cell"` to the Rabat `<td>` (not originally in the Dev Notes code shape) — needed because both the Rabat and Cena oryginalna cells can independently render "—", making `getByText('—')` ambiguous in tests
- `page.tsx` wired: `PriceTable` renders only when `game.products.length > 0`; otherwise a "Brak aktywnych ofert" notice — `BestDealBanner` and `PriceChart` placeholders left untouched
- Full regression suite: 244/244 tests pass (231 pre-existing + 13 new in `PriceTable.test.tsx`)
- `eslint .` on the full project shows 3 pre-existing errors in `web/src/components/PriceChart.tsx` (react-hooks/refs, react-hooks/preserve-manual-memoization) — confirmed via `git stash` that these exist on `main` at baseline commit `d723e12`, unrelated to this story (PriceChart is Story 5.2/5.3 scope, not touched here)
- `tsc --noEmit` and `eslint` clean on all 3 files this story touches (`PriceTable.tsx`, `PriceTable.test.tsx`, `page.tsx`)

### File List

- `web/src/components/PriceTable.tsx` (created)
- `web/src/components/PriceTable.test.tsx` (created)
- `web/src/app/gra/[slug]/page.tsx` (modified — wired PriceTable into the Story 4.3 placeholder)

## Change Log

- 2026-07-09 — Implemented Story 4.3: `PriceTable` component (multi-store price comparison table), wired into Game Passport page, 13 new unit tests. Status: ready-for-dev → review.
