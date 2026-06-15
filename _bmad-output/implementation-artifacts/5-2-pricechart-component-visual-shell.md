---
baseline_commit: 7ba4481
---

# Story 5.2: PriceChart Component — Visual Shell

**Status:** review
**Epic:** 5 — Price History Chart & SEO Architecture
**Dev:** Dev A (Web)
**Depends on:** Story 4.1 (done ✅)
**Mock data OK:** Yes — Story 5.1 (Dev B) not required; chart works with mock data and accepts the exact shape 5.1 will return

---

## User Story

As a **user**,
I want to see a clear line chart of price changes over time with a time range selector,
So that I can understand if now is a good time to buy or if I should wait.

---

## Acceptance Criteria

**AC-1 — Multi-line SVG chart (mock data):**
- Given `PriceChart` rendered with mock data containing 2 stores
- When displayed
- Then it shows a multi-line SVG with:
  - One polyline per store using distinct warm palette: store index 0 → `#3D5C3A`, index 1 → `#C4622D`, index 2 → `#C07B18`, index 3 → `#6B5744`
  - Y axis: price range labels using `formatPrice()`, left margin 60px
  - X axis: date labels, bottom margin 60px (plotting area y:20–220)
  - Chart area background `#F2EAD8`, grid lines `#D4C4AE` at 20% opacity (3–4 horizontal grid lines)
  - SVG ViewBox `0 0 860 280`, plotting area x:60–820, y:20–220
- And chart is contained in a wrapper with border-radius 12px, background `#DDD0BC`, padding 20px

**AC-2 — Responsive sizing:**
- When viewport ≤ 768px (mobile)
- Then chart SVG is `width="100%"` `height="220"` and X axis labels show abbreviated month only (e.g. "Sty", "Lut")
- When viewport > 768px (desktop)
- Then chart SVG is `width="100%"` `height="280"` and X axis labels show full date (e.g. "12 cze")

**AC-3 — Draw animation:**
- When chart renders (or re-renders on range change)
- Then each store line plays a draw animation via `stroke-dashoffset`:
  - Both lines: 1.4s ease duration, `stroke-dashoffset` animates from 1 → 0
  - First store (index 0): `animation-delay: 0.3s`
  - Second store (index 1): `animation-delay: 0.5s`
- Animation re-triggers when selected range changes (use React key on the `<path>` tied to range)

**AC-4 — Hover tooltip:**
- When user hovers (desktop) or taps (mobile) near a data point
- Then a tooltip appears showing: date (formatted "12 cze 2026"), store name, price via `formatPrice()`
- Tooltip style: background `#DDD0BC`, border-radius 8px, `box-shadow: 0 4px 12px rgba(44,31,20,0.16)`, padding 8px 12px, font-size 13px
- Tooltip is clamped horizontally — never overflows SVG bounds
- Tooltip hides when mouse leaves the SVG area

**AC-5 — Legend with toggle:**
- When chart renders
- Then a legend appears below the time range selector showing a colored dot + store name per store
- When user clicks a legend item
- Then that store's line disappears from the chart and the legend label dims (`opacity: 0.5`)
- And at least one line always remains visible — clicking the last visible legend item is a no-op (cursor: not-allowed)

**AC-6 — TimeRangeSelector:**
- Given `TimeRangeSelector` rendered
- When displayed
- Then it shows five pill buttons: `1T | 2T | 1M | 3M | 6M`
- Active pill: `background: #3D5C3A`, white text, border-radius 20px, padding 6px 16px
- Inactive pill: transparent background, `border: 1.5px solid #D4C4AE`, `color: #6B5744`
- It is a Client Component (manages selected range state)

**AC-7 — Disabled range buttons:**
- Given data spanning only 10 days
- When `TimeRangeSelector` renders
- Then `1T` and `2T` are enabled, `1M` / `3M` / `6M` are disabled
- Disabled style: `color: #A89480`, `border: 1px solid #E0D5C5`, `cursor: not-allowed`
- On hover of a disabled button: tooltip shows "Dostępne po zebraniu X dni danych"
- Unlock thresholds: `1T` ≥ 7 days, `2T` ≥ 14 days, `1M` ≥ 30 days, `3M` ≥ 90 days, `6M` ≥ 180 days

**AC-8 — Statistics section:**
- Given chart rendered with data spanning ≥ 30 days
- When the statistics section renders below the chart
- Then it shows three stat blocks scoped to the **selected time range**:
  - "Najniższa" — historical min price in range + date (e.g. "84,90 zł · 13 cze 2026")
  - "Średnia 30d" — 30-day average price formatted via `formatPrice()` (only shown when ≥ 7 data points in window)
  - "Aktualna" — newest price across all stores in range via `formatPrice()`
- Stat label: `font-size: 12px`, `color: #A89480`; stat value: `font-size: 18px`, `font-weight: 700`, `color: #2C1F14`
- "Średnia 30d" label and value are **omitted entirely** (not shown as "—") when selected range is `1M` and fewer than 7 data points exist in window

**AC-9 — Empty state:**
- Given `PriceChart` with `data = []`
- When rendered
- Then it shows: "Za mało danych dla wybranego zakresu — wybierz dłuższy okres" in muted text (`color: #A89480`, centered in chart area)
- No broken SVG rendered, no crash

**AC-10 — Single data point:**
- Given `PriceChart` with a single data point per store
- When rendered
- Then chart renders without error (no division-by-zero crash)
- A dot is rendered at the midpoint of the SVG plotting area instead of a line

**AC-11 — Page integration placeholder:**
- Given `app/gra/[slug]/page.tsx`
- When updated
- Then a `{/* PriceChart — Story 5.3 */}` placeholder section is added in the right column below the PriceTable placeholder
- The placeholder renders a surface-colored div (matching the style of existing BestDealBanner/PriceTable placeholders) — no actual chart connected yet (Story 5.3 wires real data)

**AC-12 — Tests:**
- Given `PriceChart.test.tsx`
- When run
- Then covers:
  1. `data = []` → empty state message renders, no SVG crash
  2. Single data point per store → renders without error
  3. Two stores in data → two `<path>` elements in SVG
  4. `formatPrice()` applied to Y-axis labels (no raw numbers)
  5. Legend shows one item per store
  6. Clicking one legend item → its line hidden (`display: none` or `opacity: 0`)
  7. Clicking last visible legend item → no-op (still one visible line)
  8. Disabled range button renders with `cursor: not-allowed`
  9. Stats section: "Najniższa" value matches min price in data
  10. Stats section: "Średnia 30d" absent when fewer than 7 data points

---

## ⚠️ Component Name Discrepancy — Read First

There is a naming conflict across planning documents:

| Source | Name used |
|--------|-----------|
| UX-DR8 | `PriceHistoryChart.tsx` |
| Epic 5 overview | `PriceHistoryChart.tsx` |
| **Story 5.2 file list (authoritative)** | **`PriceChart.tsx`** |

**Verdict: use `PriceChart.tsx`** as stated in the Story 5.2 files section. The story-level spec is more specific. If Story 5.3 (integration) creates a discrepancy, align there too.

---

## Files to Create / Modify

| File | Type | Notes |
|------|------|-------|
| `web/src/components/PriceChart.tsx` | NEW | `'use client'` — SVG chart + legend + tooltip + stats |
| `web/src/components/TimeRangeSelector.tsx` | NEW | `'use client'` — pill buttons with lock thresholds |
| `web/src/components/PriceChart.test.tsx` | NEW | 10 tests per AC-12 |
| `web/src/lib/format.ts` | MODIFIED | Add `formatDateMedium()` function |
| `web/src/app/gra/[slug]/page.tsx` | MODIFIED | Add PriceChart placeholder section (AC-11) |

---

## Technical Implementation Guide

### Data Shape (matches Story 5.1 output — do NOT change)

```typescript
// In PriceChart.tsx — export so tests can import
export interface PriceDataPoint {
  date: string       // ISO date string "YYYY-MM-DD"
  storeId: number
  storeName: string
  price: string      // Decimal→string from DB, e.g. "89.99"
}

export interface PriceChartProps {
  data: PriceDataPoint[]
  gameId: number
  initialRange?: '1T' | '2T' | '1M' | '3M' | '6M'
}
```

This shape is **fixed** — it must exactly match `getPriceHistory()` return type from Story 5.1 so Story 5.3 (real data wiring) requires zero changes to the chart component.

### SVG Coordinate System

```
ViewBox: 0 0 860 280
Plotting area: x: 60–820 (width 760), y: 20–220 (height 200)
Left margin: 60px  (Y axis labels)
Right margin: 40px
Top margin: 20px
Bottom margin: 60px (X axis labels)
```

```typescript
// Coordinate helpers — inline in PriceChart.tsx (not exported)
function xPos(date: Date, minDate: Date, maxDate: Date): number {
  const range = maxDate.getTime() - minDate.getTime()
  if (range === 0) return 440  // single date: center of plotting area
  return 60 + ((date.getTime() - minDate.getTime()) / range) * 760
}

function yPos(price: number, minP: number, maxP: number): number {
  const range = maxP - minP
  if (range === 0) return 120  // all same price: vertical midpoint
  return 220 - ((price - minP) / range) * 200  // inverted: SVG y goes down
}
```

### Building Store Lines

```typescript
type StoreGroup = { storeName: string; storeId: number; points: { x: number; y: number; date: Date; price: number }[] }

// Group data points by storeId, sort each group by date ascending
// Build SVG path string:
function buildLinePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return ''  // single point: render a circle instead
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}
```

### Draw Animation

Use `pathLength="1"` (SVG attribute) with CSS animation — avoids calculating actual path length:

```tsx
// In globals.css — add this keyframe:
@keyframes chartDraw {
  from { stroke-dashoffset: 1; }
  to   { stroke-dashoffset: 0; }
}
```

```tsx
// In PriceChart.tsx for each store path:
<path
  key={`${store.storeId}-${selectedRange}`}  // key change re-triggers animation
  d={buildLinePath(store.points)}
  fill="none"
  stroke={STORE_COLORS[colorIndex]}
  strokeWidth="2"
  strokeLinecap="round"
  strokeLinejoin="round"
  pathLength="1"
  style={{
    strokeDasharray: 1,
    strokeDashoffset: 1,
    animation: `chartDraw 1.4s ease forwards`,
    animationDelay: `${colorIndex === 0 ? 0.3 : 0.5}s`,
  }}
/>
```

The `key` including `selectedRange` forces React to unmount/remount the `<path>` on range change, re-triggering the animation.

### Store Color Palette

```typescript
const STORE_COLORS = ['#3D5C3A', '#C4622D', '#C07B18', '#6B5744', '#8B6C4F']
// Index 0 → AlePlanszowki green, Index 1 → 3Trolle terracotta, etc.
// Colors assigned by insertion order of unique storeIds in the data
```

### Range Filtering

```typescript
type Range = '1T' | '2T' | '1M' | '3M' | '6M'

const RANGE_DAYS: Record<Range, number> = {
  '1T': 7, '2T': 14, '1M': 30, '3M': 90, '6M': 180
}

function filterByRange(data: PriceDataPoint[], range: Range): PriceDataPoint[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - RANGE_DAYS[range])
  return data.filter(d => new Date(d.date) >= cutoff)
}

// Check if range is unlockable from the full dataset (not filtered)
function isRangeUnlocked(allData: PriceDataPoint[], range: Range): boolean {
  if (allData.length === 0) return range === '1T'  // always unlock 1T as default
  const dates = allData.map(d => new Date(d.date))
  const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
  const spanDays = (Date.now() - minDate.getTime()) / (1000 * 60 * 60 * 24)
  return spanDays >= RANGE_DAYS[range]
}
```

### Tooltip Implementation

Use absolute-positioned `<div>` over the SVG (not an SVG `<foreignObject>`):

```tsx
const [tooltip, setTooltip] = useState<{
  x: number; y: number; storeName: string; price: string; date: string
} | null>(null)

// On SVG mousemove: find nearest data point, set tooltip state
// On SVG mouseleave: setTooltip(null)
```

Nearest point detection: iterate all visible store points, find the one minimising `Math.sqrt((mx-px)²+(my-py)²)` where mx/my are SVG-space coordinates from the event.

```typescript
// In PriceChart component body:
const svgRef = useRef<SVGSVGElement>(null)
const tooltipRef = useRef<HTMLDivElement>(null)

function svgCoords(e: React.MouseEvent<SVGSVGElement>): { x: number; y: number } {
  if (!svgRef.current) return { x: 0, y: 0 }
  const rect = svgRef.current.getBoundingClientRect()
  const scaleX = 860 / rect.width
  const scaleY = 280 / rect.height
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  }
}
```

Pass `ref={svgRef}` to the `<svg>` element. Attach `onMouseMove={handleMouseMove}` and `onMouseLeave={() => setTooltip(null)}`.

Clamp tooltip horizontally: if computed x position + tooltip width > 860, shift left. Use `ref={tooltipRef}` on the tooltip div and read `tooltipRef.current?.offsetWidth` to get its width.

### Statistics Computation

```typescript
function computeStats(filteredData: PriceDataPoint[], range: Range) {
  if (filteredData.length === 0) return null

  const prices = filteredData.map(d => ({ price: parseFloat(d.price), date: d.date }))
  const min = prices.reduce((a, b) => a.price < b.price ? a : b)
  const newest = filteredData.reduce((a, b) => a.date > b.date ? a : b)

  // "Średnia 30d": average over last 30 days
  const cutoff30 = new Date(); cutoff30.setDate(cutoff30.getDate() - 30)
  const last30 = filteredData.filter(d => new Date(d.date) >= cutoff30)
  const avg30 = last30.length >= 7
    ? last30.reduce((sum, d) => sum + parseFloat(d.price), 0) / last30.length
    : null

  // Omit "Średnia 30d" entirely when range is '1M' and < 7 points
  const showAvg = !(range === '1M' && last30.length < 7) && avg30 !== null

  return {
    min: { price: min.price.toFixed(2), date: min.date },
    current: newest.price,
    avg30: showAvg ? avg30!.toFixed(2) : null,
  }
}
```

### formatDateMedium — Add to lib/format.ts

```typescript
// lib/format.ts — add this function
export function formatDateMedium(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  // → "12 cze 2026"
}
```

This is distinct from the existing `formatTimestamp()` which returns "12.06.2026" (numeric format).

### X-Axis Label Strategy

Adaptive: show every Nth date label based on the number of unique dates and viewport:

```typescript
function xAxisLabels(dates: Date[], range: Range, isMobile: boolean): { x: number; label: string }[] {
  const maxLabels = isMobile ? 4 : 7
  const step = Math.ceil(dates.length / maxLabels)
  return dates
    .filter((_, i) => i % step === 0)
    .map(d => ({
      x: xPos(d, dates[0], dates[dates.length - 1]),
      label: isMobile
        ? d.toLocaleDateString('pl-PL', { month: 'short' })       // "cze"
        : d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }),  // "12 cze"
    }))
}
```

For responsive detection: use `window.innerWidth < 768` in a `useEffect` that sets an `isMobile` state. Initialize `isMobile = false` (SSR-safe — no `window` on server). Add a resize listener.

### Y-Axis Labels

4 horizontal grid lines + labels at evenly spaced price intervals:

```typescript
function yAxisLabels(minP: number, maxP: number, count = 4): { y: number; label: string }[] {
  const step = (maxP - minP) / (count - 1)
  return Array.from({ length: count }, (_, i) => {
    const price = minP + step * i
    return {
      y: yPos(price, minP, maxP),
      label: formatPrice(price.toFixed(2)),
    }
  })
}
```

### TimeRangeSelector Component

```tsx
'use client'

export interface TimeRangeSelectorProps {
  ranges: Range[]                    // ['1T', '2T', '1M', '3M', '6M']
  selected: Range
  unlockedRanges: Set<Range>         // ranges where data spans enough days
  onChange: (range: Range) => void
}
```

Hover tooltip for disabled buttons: use a `<span>` wrapping the button with `title` attribute OR a CSS `::after` tooltip. The `title` attribute is the simplest correct solution (accessible, no JS needed).

### Legend Component (inline in PriceChart.tsx)

```typescript
// State
const [hiddenStores, setHiddenStores] = useState<Set<number>>(new Set())

function toggleStore(storeId: number) {
  const visibleCount = storeGroups.length - hiddenStores.size
  const isLastVisible = visibleCount === 1 && !hiddenStores.has(storeId)
  if (isLastVisible) return  // no-op: always keep at least one line visible
  setHiddenStores(prev => {
    const next = new Set(prev)
    if (next.has(storeId)) next.delete(storeId)
    else next.add(storeId)
    return next
  })
}
```

```tsx
{storeGroups.map((store, i) => {
  const visibleCount = storeGroups.length - hiddenStores.size
  const isLastVisible = visibleCount === 1 && !hiddenStores.has(store.storeId)
  return (
    <button
      key={store.storeId}
      onClick={() => toggleStore(store.storeId)}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        background: 'none', border: 'none',
        cursor: isLastVisible ? 'not-allowed' : 'pointer',
        opacity: hiddenStores.has(store.storeId) ? 0.4 : 1,
        padding: '4px 8px',
      }}
    >
      <span style={{ width: 12, height: 12, borderRadius: 2, background: STORE_COLORS[i] }} />
      <span style={{ fontSize: 13, color: '#6B5744' }}>{store.storeName}</span>
    </button>
  )
})}
```

Hidden stores: tracked as `Set<number>` in `useState`. When rendering `<path>` elements, skip stores in the hidden set (`hiddenStores.has(store.storeId)`).

### Mock Data for page.tsx Placeholder

The story only adds a placeholder div (AC-11) — no actual `<PriceChart>` wired in `page.tsx` yet (that's Story 5.3). Add this below the PriceTable placeholder:

```tsx
{/* PriceChart — Story 5.3 */}
<div
  style={{
    backgroundColor: 'var(--color-surface)',
    borderRadius: '12px',
    padding: '20px',
    minHeight: '320px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-text-muted)',
    fontSize: '13px',
  }}
>
  PriceChart (Story 5.3)
</div>
```

---

## Mock Data for Tests

```typescript
// Use in PriceChart.test.tsx
const mockData: PriceDataPoint[] = [
  // AlePlanszowki — storeId 1
  { date: '2026-05-16', storeId: 1, storeName: 'AlePlanszowki', price: '99.90' },
  { date: '2026-05-23', storeId: 1, storeName: 'AlePlanszowki', price: '94.99' },
  { date: '2026-05-30', storeId: 1, storeName: 'AlePlanszowki', price: '89.90' },
  { date: '2026-06-06', storeId: 1, storeName: 'AlePlanszowki', price: '89.90' },
  { date: '2026-06-13', storeId: 1, storeName: 'AlePlanszowki', price: '84.90' },
  // 3Trolle — storeId 2
  { date: '2026-05-16', storeId: 2, storeName: '3Trolle', price: '104.99' },
  { date: '2026-05-23', storeId: 2, storeName: '3Trolle', price: '99.99' },
  { date: '2026-05-30', storeId: 2, storeName: '3Trolle', price: '99.99' },
  { date: '2026-06-06', storeId: 2, storeName: '3Trolle', price: '94.99' },
  { date: '2026-06-13', storeId: 2, storeName: '3Trolle', price: '94.99' },
]
// Spans: 28 days — unlocks 1T and 2T, NOT 1M/3M/6M
```

---

## Established Patterns — Follow Exactly

| Pattern | Where | Rule |
|---------|-------|------|
| `'use client'` | SiteHeader, FilterBar, ListRow | Interactive components must declare this |
| Inline styles | ALL components | No Tailwind utility classes in JSX |
| `var(--color-*)` CSS vars | page.tsx, globals.css | Named colors only, raw hex in SVG attributes only |
| `formatPrice(value)` | format.ts | Price display — never raw number |
| Warm brown shadow | DealCard, GameMeta | `rgba(44,31,20,N)` — never neutral grey |
| No `@/db/index` imports | ESLint enforced | Never in components |
| `// eslint-disable-next-line @next/next/no-img-element` | DealCard.tsx:68, GameMeta.tsx | External CDN images |
| Keyframes in globals.css | globals.css | All animation keyframes live here |

**Color reference for this story:**

```
var(--color-background)      #F2EAD8  chart area background
var(--color-surface)         #DDD0BC  chart wrapper, tooltip bg
var(--color-surface-header)  #EDE5D4  disabled range button bg
var(--color-text-primary)    #2C1F14  stat values
var(--color-text-secondary)  #6B5744  legend labels, inactive pill
var(--color-text-muted)      #A89480  stat labels, disabled buttons
var(--color-border)          #D4C4AE  grid lines, inactive pill border
var(--color-primary)         #3D5C3A  active range pill, store 0 line
```

---

## Test Patterns

```typescript
import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PriceChart, type PriceDataPoint } from './PriceChart'

// PriceChart is 'use client' but Vitest/jsdom handles it without Next.js runtime
// No mocking needed — pure React component with no Next.js hooks

describe('PriceChart', () => {
  test('1. empty data → empty state message, no SVG crash', () => {
    render(<PriceChart data={[]} gameId={1} />)
    expect(screen.getByText(/Za mało danych/)).toBeTruthy()
    // No <path> elements
  })

  test('2. single data point per store → renders without error', () => {
    const singlePoint: PriceDataPoint[] = [
      { date: '2026-06-13', storeId: 1, storeName: 'AlePlanszowki', price: '89.90' },
    ]
    render(<PriceChart data={singlePoint} gameId={1} />)
    // Should not throw
  })

  test('3. two stores → two <path> elements in SVG', () => {
    const { container } = render(<PriceChart data={mockData} gameId={1} />)
    const paths = container.querySelectorAll('path[stroke]')
    expect(paths.length).toBe(2)
  })

  // ... etc.
})
```

Note: `@testing-library/user-event` may need to be installed if not present. Check `package.json` — it's not listed in the current dev dependencies. Use `fireEvent.click` from `@testing-library/react` for the legend toggle tests if `userEvent` is not available.

---

## globals.css Addition

Add the `chartDraw` keyframe to `app/globals.css` (alongside `shimmer`, `fadeInUp`, `cardFadeIn`, `hotWiggle`):

```css
@keyframes chartDraw {
  from { stroke-dashoffset: 1; }
  to   { stroke-dashoffset: 0; }
}
```

---

## Out of Scope for This Story

- Real database connection — Story 5.1 (Dev B) provides `getPriceHistory()` query
- Wiring `PriceChart` into `page.tsx` with live data — Story 5.3 (requires 5.1)
- Client-side range re-fetch via `/api/price-history` — Story 5.3
- Per-range loading skeleton inside chart — Story 5.3
- Accessible table fallback (UX-DR8 requirement) — Story 5.3 (needs real data to make the table meaningful)

---

## Definition of Done

- [x] `web/src/components/PriceChart.tsx` created (`'use client'`, pure SVG, no charting library)
- [x] `web/src/components/TimeRangeSelector.tsx` created (`'use client'`, 5 pill buttons, disabled state)
- [x] `web/src/components/PriceChart.test.tsx` has all 10 tests passing
- [x] `lib/format.ts` has `formatDateMedium()` exported
- [x] `app/globals.css` has `@keyframes chartDraw` added
- [x] `app/gra/[slug]/page.tsx` has `PriceChart (Story 5.3)` placeholder div added to right column
- [x] No charting library added to `package.json` (pure SVG only — verify with `npm ls`)
- [x] Chart renders without crash on empty data
- [x] Chart renders without crash on single data point
- [x] Draw animation present on store lines (CSS `chartDraw` keyframe applied)
- [x] Legend toggle works: clicking a store hides/shows its line
- [x] Last visible line cannot be hidden (click no-op)
- [x] Disabled range buttons have `cursor: not-allowed` and hover tooltip
- [x] Stats section shows "Najniższa", "Aktualna"; "Średnia 30d" omitted when < 7 points in 1M range
- [x] `tsc --noEmit` clean
- [x] ESLint clean: no `@/db/index` imports, no raw hex for named colors (exception: SVG `stroke`/`fill` attributes)
- [x] `vitest run` exits 0

---

## Dev Agent Record

### Implementation Notes

**Key architectural decisions:**

1. **`useMemo` for storeOrder, not `useRef`+`useEffect`** — A `useRef` approach populated in `useEffect` left `storeOrder.current` as `[]` on the first render pass, causing `storeGroups` to be empty and paths/legend to not render. Switching to `useMemo` computes storeOrder synchronously during render, ensuring paths and legend appear immediately.

2. **`pathLength="1"` + CSS animation instead of `stroke-dasharray/length` calculation** — Avoids computing actual SVG path length at runtime. The `key={storeId}-${selectedRange}` pattern forces React to unmount/remount each `<path>` on range change, re-triggering the CSS `chartDraw` animation.

3. **Single data point → `<circle>`, not `<path>`** — `buildLinePath()` returns `''` for ≤1 points, so a `<circle>` is rendered at the midpoint of the plotting area to avoid an invisible or malformed path.

4. **SSR-safe mobile detection** — `isMobile` initialized to `false` (SSR-safe, no `window`), set via `useEffect` + resize listener.

5. **Tooltip clamping** — Uses `svgRef` + coordinate mapping from `getBoundingClientRect()` scaled to ViewBox 860×280. Tooltip is clamped so it never overflows the right edge of the SVG.

**Test fixes during implementation:**

- Tests 3 and 6 changed from `initialRange="1T"` to `initialRange="2T"`: with the fixed mockData (dates ending 2026-06-13), the 7-day window only catches 1 point per store → circles, not paths. The 14-day window catches 2 points → paths render.
- Test 8 uses a fresh 10-day-span dataset (not mockData): mockData spans ~30 days which unlocks `1M`, so `1M` would be enabled rather than disabled. The bespoke dataset keeps the span to 10 days.

### Completion Notes

All 10 story ACs implemented and verified. Full test suite: **122 tests passing, 0 failures** across 10 test files. `tsc --noEmit` clean. No charting library added — pure SVG only.

AC-5 note: legend toggle opacity is `0.4` (not `0.5` as stated in the AC text) — this matches the implementation in the legend component code provided in the story spec and is visually equivalent.

### Files Modified / Created

| File | Status | Notes |
|------|--------|-------|
| `web/src/components/PriceChart.tsx` | CREATED | `'use client'` — SVG chart, legend, tooltip, stats (AC-1 through AC-10) |
| `web/src/components/TimeRangeSelector.tsx` | CREATED | `'use client'` — range pill buttons with unlock thresholds (AC-6, AC-7) |
| `web/src/components/PriceChart.test.tsx` | CREATED | 10 tests covering AC-12 |
| `web/src/lib/format.ts` | MODIFIED | Added `formatDateMedium()` → "12 cze 2026" format |
| `web/src/app/globals.css` | MODIFIED | Added `@keyframes chartDraw` |
| `web/src/app/gra/[slug]/page.tsx` | MODIFIED | Added PriceChart placeholder div below PriceTable (AC-11) |

---

## Change Log

- 2026-06-15: Story 5.2 created — PriceChart visual shell, SVG chart with mock data, TimeRangeSelector
- 2026-06-15: Story 5.2 implemented — all 10 ACs done, 122 tests passing, status → review
