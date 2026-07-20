---
title: Discount Badge Components — Duplicate badgeColor(), Use Literal Hex Not CSS Vars
date: 2026-07-21
category: conventions
module: "web/src/components — price/discount display (DealCard.tsx, PriceTable.tsx, BestDealBanner.tsx)"
problem_type: convention
component: testing_framework
severity: low
applies_when:
  - "Adding or modifying a discount-badge-bearing component (DealCard, PriceTable, BestDealBanner, or a future sibling)"
  - "Writing or reviewing toHaveStyle assertions in vitest/jsdom tests against colors defined as CSS custom properties elsewhere in the project"
tags: [discount-badge, jsdom, css-custom-properties, tohavestyle, price-display, testing-convention]
---

# Discount Badge Components — Duplicate badgeColor(), Use Literal Hex Not CSS Vars

## Context

Three sibling components render a discount badge with the same three-tier color
logic: `DealCard.tsx` (original), `PriceTable.tsx` (Story 4.3), and
`BestDealBanner.tsx` (Story 4.4). Each time a new one was added, two questions
resurfaced that aren't obvious from reading any single file in isolation:
should `badgeColor()` finally be extracted to a shared module, and why do these
components hardcode hex values instead of the project's `--color-*` CSS custom
properties used almost everywhere else.

## Guidance

**1. Duplicate `badgeColor()` locally in each component — do not extract a shared helper.**

```typescript
function badgeColor(discount: number): string {
  if (discount < 40) return '#3D5C3A'
  if (discount <= 70) return '#C07B18'
  return '#C42B2B'
}
```

This 5-line function is intentionally copy-pasted into `DealCard.tsx`,
`PriceTable.tsx`, and `BestDealBanner.tsx` rather than imported from a shared
module. This was an explicit decision made in Story 4.3 and reaffirmed in
Story 4.4 — not an oversight later flagged by review.

**2. Keep the badge/accent colors as literal hex strings, not `var(--color-*)`.**

```typescript
// Correct — literal hex, matches what toHaveStyle can actually assert on
style={{ backgroundColor: '#3D5C3A' }}

// Wrong for these components — jsdom cannot resolve this in tests
style={{ backgroundColor: 'var(--color-badge-green)' }}
```

## Why This Matters

- **Duplication over sharing**: three call sites is not (yet) enough
  duplication to justify the coupling cost of a shared import across
  independent presentational components that may evolve their own badge
  logic later (e.g. a different threshold for a future component). Extracting
  early would create a shared dependency between components that otherwise
  have no reason to change together.
- **Literal hex over CSS var**: `jsdom` (the DOM implementation vitest/
  `@testing-library/react` runs against) does not resolve CSS custom
  properties — `getComputedStyle` in jsdom returns the raw `var(--x)` string,
  not the value it would resolve to in a real browser. A `toHaveStyle({
  backgroundColor: '#3D5C3A' })` assertion only passes if the component's
  inline style literally contains that hex string. If the color were a CSS
  var, either the test would need to duplicate the CSS variable resolution
  logic itself (fragile, indirect) or the assertion would need to change to
  something weaker. Literal hex keeps the test a direct, honest check of what
  actually renders.

## When to Apply

- Adding a fourth (or later) component that needs the same discount-badge
  color tiers — duplicate the function again unless/until there are enough
  call sites that the coupling cost of sharing clearly outweighs the
  duplication cost (no fixed number is prescribed; use judgment, but 3 was
  judged not enough).
- Writing `toHaveStyle` assertions against any color that the component also
  expresses via a CSS custom property elsewhere in the app — use the literal
  hex value the component actually renders, not the CSS var name.
- If a *new* component's badge/accent color is only ever styled via CSS
  classes (no inline style, no `toHaveStyle` assertion needed), this
  literal-hex rule doesn't apply — it exists specifically for the
  inline-style + `toHaveStyle` combination these three components use.

## Examples

`BestDealBanner.tsx`, `PriceTable.tsx`, and `DealCard.tsx` all contain the
identical `badgeColor()` function and all assert colors like this in their
test files:

```typescript
// web/src/components/BestDealBanner.test.tsx
test('9. discount 30% → badge green (#3D5C3A)', () => {
  render(<BestDealBanner product={product({ price: '70.00', price_orig: '100.00' })} />)
  const badge = screen.getByTestId('discount-badge')
  expect(badge).toHaveStyle({ backgroundColor: '#3D5C3A' })
})
```

The same three threshold boundaries (30/50/80, plus the exact 40/70 edges)
are tested identically across `PriceTable.test.tsx` and
`BestDealBanner.test.tsx` — a new sibling component should mirror both the
values and the boundary-edge tests (discount exactly 40 and exactly 70), not
just the interior values.

## Related

- `_bmad-output/implementation-artifacts/4-4-best-deal-banner.md` — Story 4.4
  Dev Notes ("Previous Story Intelligence") document this precedent inline;
  this doc externalizes it so future stories don't have to re-derive it from
  a single story's Dev Notes.
- `web/src/components/PriceTable.tsx` / `PriceTable.test.tsx` — Story 4.3,
  where the literal-hex-for-jsdom reasoning was first worked out.
- `web/src/components/DealCard.tsx` / `DealCard.test.tsx` — original
  `badgeColor()` implementation.
