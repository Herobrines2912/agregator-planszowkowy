---
baseline_commit: 9346cf6
---

# Story 4.4: Best Deal Banner

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want to immediately see the best available deal at the top of the game page,
so that I can click through to buy without scanning the entire price table.

## Acceptance Criteria

**AC-1 — Best in-stock deal banner:**
- Given `BestDealBanner` receives `product: GameProduct | null` where `product.in_stock === true` (the cheapest in-stock product, see Dev Notes for how this is resolved)
- When rendered
- Then it shows: store name (no logo — see Dev Notes gap), current price (`formatPrice(product.price)`, Playfair Display 28px 800w `#3D5C3A`), original price (`formatPrice(product.price_orig)`, muted strikethrough) when `price_orig` is non-null, a discount badge when `calcDiscount(...) > 0`, and a CTA link with text `Kup za {formatPrice(product.price)} w {product.store_name} →`
- And the banner has `backgroundColor: '#DDD0BC'`, `border-radius: 12px`, and a green (`#3D5C3A`) left accent bar 4px wide

**AC-2 — All products out of stock:**
- Given `product` is non-null but `product.in_stock === false` (the cheapest product overall, resolved the same way as AC-1 — see Dev Notes)
- When rendered
- Then the banner renders in a dimmed state (`opacity: 0.55`) showing store name and price, with the CTA area replaced by "Aktualnie niedostępne — sprawdź sklepy poniżej" (muted text) — **no CTA link is rendered**

**AC-3 — CTA external link:**
- Given the CTA link (AC-1 state only)
- When clicked
- Then it opens `product.product_url` in a new tab: `target="_blank"`, `rel="noopener noreferrer"` — **no `affiliate_url`** (field doesn't exist on `GameProduct`, same as `PriceTable`, Story 4.3)

**AC-4 — Mobile responsive (≤768px):**
- Given `BestDealBanner` on a viewport ≤ 768px
- When rendered
- Then it stacks vertically: price above store name, CTA button full-width below — no horizontal overflow (desktop: inline/row layout)

**AC-5 — No products at all:**
- Given `product === null` (game has zero products — see Dev Notes for how this happens)
- When rendered
- Then `BestDealBanner` renders `null` — no crash, no empty-state banner (the neighboring `PriceTable`'s "Brak aktywnych ofert" notice already communicates this; do not add a second one)

**AC-6 — `page.tsx` wiring (integration, required for the story to have any effect):**
- Given `web/src/app/gra/[slug]/page.tsx` currently has a static placeholder div for "BestDealBanner (Story 4.4)" at lines ~108–123
- When this story is implemented
- Then that placeholder is replaced with `<BestDealBanner product={game.best_product ?? game.products[0] ?? null} />`
- And the neighboring `AlertSubscribeForm`, `PriceTable`, and `PriceChart` blocks are left untouched

**AC-7 — `BestDealBanner.test.tsx` coverage:**
- Given the test file
- When run
- Then it covers: full banner render with in-stock product (store name, price, CTA text, link attributes), all-out-of-stock dimmed state (no CTA link, unavailable label present), `product === null` → renders nothing, discount badge shown when `price_orig` present and discount > 0, discount badge absent when `price_orig` is null, discount badge color at threshold boundaries (consistent with `DealCard.test.tsx`: 30→green, 50→amber, 80→red)

## Tasks / Subtasks

- [x] Task 1 — Create `web/src/components/BestDealBanner.tsx` (AC: 1, 2, 3, 4, 5)
  - [x] Define `BestDealBannerProps = { product: GameProduct | null }`, import `GameProduct` type from `@/db/queries/game-passport`
  - [x] Server Component — no `'use client'` (plain `<a>` link only, no interactivity, same reasoning as `PriceTable`)
  - [x] Guard: `if (!product) return null`
  - [x] Local `badgeColor(discount: number): string` helper — duplicate the same 3-line function from `PriceTable.tsx`/`DealCard.tsx`, do not import/export it (out of scope, same precedent as Story 4.3)
  - [x] Compute `discount = product.price && product.price_orig ? calcDiscount(parseFloat(product.price), parseFloat(product.price_orig)) : null`, show badge only when `discount !== null && discount > 0`
  - [x] Branch on `product.in_stock`: `true` → full banner with CTA link (AC-1); `false` → dimmed banner with "Aktualnie niedostępne — sprawdź sklepy poniżej" replacing the CTA (AC-2)
  - [x] CTA link: `<a href={product.product_url} target="_blank" rel="noopener noreferrer">Kup za {formatPrice(product.price)} w {product.store_name} →</a>`
  - [x] Add `className="best-deal-banner"` (or similar) on the root element so `globals.css` can apply the ≤768px stacking media query — inline styles cannot express media queries (see Dev Notes)
  - [x] Use `formatPrice()` for all price display — never hand-format

- [x] Task 2 — Add mobile stacking rule to `web/src/app/globals.css` (AC: 4)
  - [x] Inside the existing `@media (max-width: 768px) { ... }` block (starts at line ~62, already contains `.passport-grid` and `.game-meta-cover` overrides), add a rule for `.best-deal-banner` that switches its layout to `flex-direction: column` and makes the CTA element `width: 100%`
  - [x] Match the exact class name(s) used in Task 1's JSX structure

- [x] Task 3 — Wire into `web/src/app/gra/[slug]/page.tsx` (AC: 6)
  - [x] Add import: `import { BestDealBanner } from '@/components/BestDealBanner'`
  - [x] Replace the placeholder `<div>...BestDealBanner (Story 4.4)...</div>` block (lines ~108–123) with `<BestDealBanner product={game.best_product ?? game.products[0] ?? null} />`
  - [x] Do not touch `AlertSubscribeForm`, `PriceTable`, or the `PriceChart` placeholder blocks

- [x] Task 4 — Create `web/src/components/BestDealBanner.test.tsx` (AC: 7)
  - [x] Follow `PriceTable.test.tsx` / `DealCard.test.tsx` conventions: `vitest` + `@testing-library/react`, `describe`/`test`/`expect`, `data-testid` for assertions
  - [x] Write all cases listed in AC-7

## Dev Notes

### Critical: epics AC terms vs. the real `GameProduct` shape

Same reconciliation gap as Story 4.3 — the epics.md wording (line ~1244) predates the real Story 4.5 query shape:

| Epics AC says | Reality (`web/src/db/queries/game-passport.ts`) | What to actually do |
|---|---|---|
| "store logo (32px)" | No `logo_url` anywhere in schema or `GameProduct` — confirmed zero logo assets project-wide (same gap documented in Story 4.3's dev notes) | **Do not invent a logo path.** Render store name text only. |
| Banner shows "the best in-stock product" | `game.best_product` is `GameProduct \| null` — `null` when **either** there are zero products **or** all products are out of stock. These are two different UI states (AC-5 vs AC-2) that `best_product` alone cannot distinguish. | See "Resolving which product to pass" below — resolve in `page.tsx`, not inside the component. |
| CTA implies `affiliate_url ?? product_url` | `GameProduct` has no `affiliate_url` field | Use `product.product_url` only — identical to `PriceTable`'s Story 4.3 precedent. |

### Resolving which product to pass — do this in `page.tsx`, not in the component

`game-passport.ts`'s SQL orders products `ORDER BY p.in_stock DESC NULLS LAST, p.price ASC NULLS LAST`, and `best_product` is independently computed as `products.filter(p => p.in_stock).sort(...)[0] ?? null`. Because of that shared ordering:

- If **any** product is in stock → `game.products[0]` is exactly `game.best_product` (the cheapest in-stock item).
- If **no** product is in stock (but `products.length > 0`) → `game.best_product` is `null`, and `game.products[0]` is the cheapest product overall (out of stock).
- If `game.products.length === 0` → both are unavailable → pass `null`.

This is why `page.tsx` passes `game.best_product ?? game.products[0] ?? null` (AC-6) — a single resolved `product` prop that already carries its own `in_stock` flag, so `BestDealBanner` just branches on `product.in_stock` without recomputing anything. **Do not add a second query or a `.sort()` inside `BestDealBanner`** — the resolution above is O(1) and belongs in the caller, same philosophy as `PriceTable`'s `bestProductId` prop (Story 4.3 Dev Notes: "do not recompute, just compare/select").

### `GameProduct` type (import, do not redefine)

```typescript
// from '@/db/queries/game-passport' — ESLint-safe; only '@/db/index' is restricted
export type GameProduct = {
  id: number
  store_name: string
  price: string | null
  price_orig: string | null
  in_stock: boolean
  product_url: string
}
```

### Component code shape (embed directly, do not deviate)

```typescript
import { formatPrice } from '@/lib/format'
import { calcDiscount } from '@/lib/calc'
import type { GameProduct } from '@/db/queries/game-passport'

export interface BestDealBannerProps {
  product: GameProduct | null
}

function badgeColor(discount: number): string {
  if (discount < 40) return '#3D5C3A'
  if (discount <= 70) return '#C07B18'
  return '#C42B2B'
}

export function BestDealBanner({ product }: BestDealBannerProps) {
  if (!product) return null

  const discount =
    product.price && product.price_orig
      ? calcDiscount(parseFloat(product.price), parseFloat(product.price_orig))
      : null
  const hasDiscount = discount !== null && discount > 0

  return (
    <div
      className="best-deal-banner"
      data-testid="best-deal-banner"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        backgroundColor: '#DDD0BC',
        borderRadius: '12px',
        borderLeft: '4px solid #3D5C3A',
        padding: '20px',
        opacity: product.in_stock ? 1 : 0.55,
      }}
    >
      <div>
        <div data-testid="best-deal-store" style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          {product.store_name}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span
            data-testid="best-deal-price"
            style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '28px', fontWeight: 800, color: '#3D5C3A' }}
          >
            {formatPrice(product.price)}
          </span>
          {product.price_orig && (
            <span style={{ fontSize: '14px', color: 'var(--color-text-muted)', textDecoration: 'line-through' }}>
              {formatPrice(product.price_orig)}
            </span>
          )}
          {hasDiscount && (
            <span
              data-testid="discount-badge"
              style={{ backgroundColor: badgeColor(discount as number), color: '#fff', fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px' }}
            >
              -{discount}%
            </span>
          )}
        </div>
      </div>

      {product.in_stock ? (
        <a
          href={product.product_url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="best-deal-cta"
          className="best-deal-banner-cta"
          style={{ padding: '12px 20px', borderRadius: '8px', backgroundColor: '#3D5C3A', color: '#fff', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          Kup za {formatPrice(product.price)} w {product.store_name} →
        </a>
      ) : (
        <span data-testid="best-deal-unavailable-label" style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
          Aktualnie niedostępne — sprawdź sklepy poniżej
        </span>
      )}
    </div>
  )
}
```

This is a shape reference, not literal copy-paste — apply the project's existing inline-style + CSS-var conventions from `GameMeta.tsx`/`PriceTable.tsx`. The banner background, accent bar, and price colors must stay literal hex (`#DDD0BC`, `#3D5C3A`) per the epics AC wording and to match `toHaveStyle` assertions in tests (jsdom does not resolve CSS custom properties — same reasoning `PriceTable.tsx`'s Dev Notes documented for its badge colors).

### `globals.css` — mobile stacking rule (Task 2)

The existing media block (`web/src/app/globals.css` lines 62–72) already handles `.passport-grid` and `.game-meta-cover`. Add to it:

```css
@media (max-width: 768px) {
  /* ...existing .passport-grid and .game-meta-cover rules... */

  .best-deal-banner {
    flex-direction: column;
    align-items: stretch;
  }

  .best-deal-banner-cta {
    width: 100%;
    text-align: center;
  }
}
```

This matches AC-4 ("price above store name, CTA full-width below") given the component shape above renders price/store in the first flex child and the CTA/label as the second — stacking the flex container vertically achieves the required order without reordering JSX.

### `page.tsx` — exact integration point

Current placeholder (`web/src/app/gra/[slug]/page.tsx`, lines 108–123, between `AlertSubscribeForm` and `PriceTable`):

```tsx
{/* BestDealBanner — Story 4.4 */}
<div
  style={{
    backgroundColor: 'var(--color-surface)',
    borderRadius: '12px',
    padding: '20px',
    minHeight: '80px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-text-muted)',
    fontSize: '13px',
  }}
>
  BestDealBanner (Story 4.4)
</div>
```

Replace with:

```tsx
<BestDealBanner product={game.best_product ?? game.products[0] ?? null} />
```

No conditional wrapper needed at the call site — `BestDealBanner` already returns `null` internally when `product` is `null` (AC-5).

### Existing Utilities — Do NOT Reinvent

- `formatPrice()` — `@/lib/format` — handles `null` → "—" automatically, never hand-format a price
- `calcDiscount()` — `@/lib/calc` — never recompute `(orig - price) / orig * 100` inline
- No `assertNever()` needed — no `switch` on a `.$type<>()` enum field in this component

### Common Pitfalls

- ❌ Do NOT invent a store logo image path — no such data exists (see reconciliation table)
- ❌ Do NOT reference `product.affiliate_url` — the field doesn't exist
- ❌ Do NOT recompute "cheapest product" inside `BestDealBanner` (no `.sort()`, no second look at `game.products`) — the caller (`page.tsx`) resolves and passes a single `product` prop
- ❌ Do NOT treat `price` / `price_orig` as always-present strings — both are `string | null`
- ❌ Do NOT add `'use client'` — no client-side state or router needed
- ❌ Do NOT duplicate an empty-state "Brak ofert" message for the `product === null` case — `PriceTable` already shows one; `BestDealBanner` should render nothing
- ❌ Do NOT try to express the ≤768px stacking via inline styles — inline `style` props cannot contain media queries; use the `globals.css` class approach (Task 2)
- ❌ Do NOT import `@/db/index` in `BestDealBanner.tsx` — ESLint blocks it; only `@/db/queries/*` is allowed

### Testing Approach

- Follow `PriceTable.test.tsx` conventions: `vitest`, `@testing-library/react`, `render`/`screen`, `data-testid` for assertions
- No DB mocking needed — `BestDealBanner` is a pure presentational component driven entirely by the `product` prop
- Test discount badge color at the same threshold boundaries as `DealCard.test.tsx`/`PriceTable.test.tsx` (30 → `#3D5C3A`, 50 → `#C07B18`, 80 → `#C42B2B`) for consistency
- `render(<BestDealBanner product={null} />)` → assert `container.firstChild` is `null` (mirrors `DealCard`'s `price_orig === null` test and `PriceTable`'s empty-array test)

### Previous Story Intelligence (4.3 — PriceTable, Dev A, done; 4.5 — Game Passport DB Queries, Dev B, done)

- `badgeColor()` is duplicated locally in both `DealCard.tsx` and `PriceTable.tsx` rather than shared — continue that precedent here rather than introducing a shared import (an out-of-scope refactor for this story)
- Discount badge / accent colors must stay literal hex, not `var(--color-badge-*)`, because `toHaveStyle` in jsdom tests doesn't resolve CSS custom properties (confirmed pitfall from Story 4.3)
- `getGameBySlug()` is cached via `unstable_cache`, tag `'game-passport'`, `revalidate: 7200` — no action needed in this story, just be aware banner data can be up to 2h stale without a `/api/revalidate` call
- `game.products` array is pre-sorted by the query (`in_stock DESC, price ASC NULLS LAST`) — this story's `page.tsx ?? ` fallback chain relies on that exact order; do not re-sort anywhere

### Project Structure Notes

- New file: `web/src/components/BestDealBanner.tsx` — follows `DealCard.tsx` / `PriceTable.tsx` sibling pattern (component + co-located `.test.tsx`)
- New file: `web/src/components/BestDealBanner.test.tsx`
- Modified: `web/src/app/gra/[slug]/page.tsx` — placeholder replacement only (lines ~108–123), no other changes
- Modified: `web/src/app/globals.css` — one new rule inside the existing `@media (max-width: 768px)` block (~line 62)
- No schema changes, no new queries, no migrations

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.4: Best Deal Banner]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4: Game Passport Core — dependency table, 4.4 depends on 4.3]
- [Source: _bmad-output/implementation-artifacts/4-3-price-table-multi-store-price-comparison.md — badgeColor duplication precedent, literal-hex-over-CSS-var precedent, GameProduct reconciliation pattern]
- [Source: _bmad-output/implementation-artifacts/4-5-game-passport-db-queries.md — GameProduct/GamePassportData shape, best_product computation logic, affiliate_url gap]
- [Source: web/src/db/queries/game-passport.ts — actual shipped query, SQL ORDER BY, best_product logic, GameProduct type]
- [Source: web/src/app/gra/[slug]/page.tsx — current BestDealBanner placeholder location (lines 108–123) and page structure]
- [Source: web/src/components/PriceTable.tsx — sibling component pattern, badgeColor duplication, data-testid conventions, formatPrice/formatNull usage]
- [Source: web/src/components/DealCard.tsx / DealCard.test.tsx — discount badge color thresholds, external link pattern, tested hex values]
- [Source: web/src/app/globals.css — existing `@media (max-width: 768px)` block (lines 62–72) with `.passport-grid`/`.game-meta-cover` precedent for viewport-responsive rules]
- [Source: web/src/lib/calc.ts — calcDiscount()]
- [Source: web/src/lib/format.ts — formatPrice()]
- [Source: web/src/db/schema.ts — products/stores tables, confirms no logo/affiliate_url columns]
- [Source: web/eslint.config.mjs — @/db/index import restriction, @/db/queries/* allowed]
- [Source: CLAUDE.md — formatNull rule, no inline price parsing beyond calcDiscount precedent, domain-named components]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npx vitest run src/components/BestDealBanner.test.tsx` — 14/14 passed
- `npx vitest run` (full suite) — 22 files, 262/262 passed, no regressions
- `npx eslint src/components/BestDealBanner.tsx src/components/BestDealBanner.test.tsx "src/app/gra/[slug]/page.tsx"` — clean
- `npx tsc --noEmit` — clean
- `npm run lint` (project-wide) — 3 pre-existing errors + 1 warning in `PriceChart.tsx` (React Compiler memoization/ref issues), confirmed pre-existing via `git stash` before/after comparison; unrelated to this story

### Completion Notes List

- Implemented `BestDealBanner.tsx` exactly per the Dev Notes component shape reference: guards `product === null` (AC-5), branches on `in_stock` for full CTA banner (AC-1) vs. dimmed unavailable state (AC-2), literal-hex badge/accent colors (duplicated `badgeColor()`, no shared import, matching `PriceTable`/`DealCard` precedent).
- CTA uses `product.product_url` only, `target="_blank"` + `rel="noopener noreferrer"` (AC-3); no `affiliate_url` reference.
- Added `.best-deal-banner` / `.best-deal-banner-cta` rules inside the existing `@media (max-width: 768px)` block in `globals.css` for AC-4 mobile stacking.
- Wired `<BestDealBanner product={game.best_product ?? game.products[0] ?? null} />` into `page.tsx`, replacing the Story 4.4 placeholder; `AlertSubscribeForm`, `PriceTable`, and the `PriceChart` placeholder were left untouched.
- Wrote 14 tests in `BestDealBanner.test.tsx` covering all AC-7 cases (in-stock full render + CTA attributes, out-of-stock dimmed state with no CTA, `null` product, discount badge presence/absence, badge color thresholds at 30/50/80, plus two extra checks for the mobile-stacking CSS class hooks).
- Full regression suite (262 tests, 22 files) and `tsc --noEmit` pass clean; `npm run lint` shows only pre-existing, unrelated `PriceChart.tsx` errors (verified via `git stash`).
- Sprint status: `4-4-best-deal-banner` moved `backlog → in-progress → review` in `sprint-status.yaml` (was `backlog` at start of this session despite the story file already being `ready-for-dev`; reconciled per CLAUDE.md "sprint-status.yaml is source of truth").

### File List

- `web/src/components/BestDealBanner.tsx` (new)
- `web/src/components/BestDealBanner.test.tsx` (new)
- `web/src/app/gra/[slug]/page.tsx` (modified — placeholder replaced with `BestDealBanner`, import added)
- `web/src/app/globals.css` (modified — `.best-deal-banner` / `.best-deal-banner-cta` rules added to existing `@media (max-width: 768px)` block)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — `4-4-best-deal-banner` status)

## Change Log

- 2026-07-20 — Implemented Story 4.4: `BestDealBanner` component (in-stock CTA banner / dimmed out-of-stock state), mobile stacking CSS, wired into Game Passport page, 14 new unit tests. Status: ready-for-dev → review.
