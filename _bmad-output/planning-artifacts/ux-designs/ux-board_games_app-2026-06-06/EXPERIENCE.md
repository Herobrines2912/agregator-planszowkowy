---
title: EXPERIENCE.md — Agregator Cen Planszówek
status: final
created: 2026-06-07
updated: 2026-06-07
---

# EXPERIENCE.md — Agregator Cen Planszówek

---

## Foundation

**Form factor (DEC-07):** Desktop-first. The initial build targets a 1280px design width for desktop browsers. The product is mobile-responsive to MVP — layouts adapt, but are not redesigned for mobile. Native mobile app is a separate, later phase; when that phase launches, the desktop version will be partially deprioritized in favor of full mobile focus. Components are designed mobile-aware from the start so that design tokens and component logic carry over cleanly into the native app.

**UI system:** Custom design system. No component framework (shadcn, MUI, Radix, etc. not used). All visual identity is defined in DESIGN.md. Component behavior is defined in this document.

**Tech stack:** Next.js 14

---

## Information Architecture

### Surfaces

| Surface | Path | Description |
|---|---|---|
| Hot Deals Feed (card view) | `/` | Homepage, default view — 4-column card grid |
| Hot Deals Feed (list view) | `/` (toggle state) | Same route, list view state — toggled via Karty/Lista control |
| Game Passport | `/gra/[slug]` | Per-game detail page — cover, metadata, price table, history chart |
| Flipper Mode | `/flipper` | Transactional resale view — dense table sorted by Margin Proxy. [NOTE: Architectural decision — Flipper Mode is a dedicated route, not a view toggle. This overrides PRD FR-16's "view toggle" language. `/flipper` is confirmed as the canonical path.] |
| Email Alert Modal | Overlay on `/gra/[slug]` | No dedicated route — modal state over Game Passport |
| Alert Confirmation Landing | `/alerty/potwierdz/{token}` | [NOTE FOR UX: confirmation landing page not yet designed — reached via email link after Step 2. Should display Step 3 success state or equivalent standalone page. Design TBD.] |
| Search Results | `/szukaj?q=` | [NOTE FOR UX: not yet mocked — structure TBD] |

### Navigation Structure

**Sticky header (64px):** Present on all surfaces. Layout: `[Logo]` → `[Search bar, max-width 440px, centered]` → `[Flipper Mode button] [Hamburger button]`.

**Hamburger menu:** 38×38px button with 3-line icon. Reveals secondary navigation. [NOTE FOR UX: content of hamburger menu not yet specified — candidate items include: O projekcie, API, Kontakt, possibly category links or user alert management]

**Breadcrumb bar:** Present only on Game Passport, immediately below the header. Contains: `← Wróć do okazji` link → `/` separator → current game name. Background and border match header. Provides single-level back navigation without JavaScript history dependency.

**Filter strip:** Present on Hot Deals Feed (both views), part of the content area. Not a separate bar — rendered within `main` padding context on card view; rendered as a separate `#EDE5D4` bar on list view.

**No footer nav hierarchy needed.** This is a single-level application — footer contains only: logo mark, copyright/data freshness note ("Dane aktualizowane co 6h"), and three tertiary links (O projekcie, API, Kontakt).

---

## Voice and Tone

**Language:** Polish only for v1. No English-language UI strings in production.

**Register:** Warm, knowledgeable, community peer — as if a trusted fellow hobbyist built this. Never corporate. Never salesy. Information-dense but not clinical.

**Price formatting:**
- Prices always end with "zł" suffix: `99 zł`, `74 zł`
- Never use "PLN", never use the "zł" prefix, never use currency symbol

**Discount formatting:**
- Always: `−38%` (minus sign + number + percent, no space)
- Never: `38% OFF`, `RABAT 38%`, `38% taniej` (in badge context), `SUPER OKAZJA!!!`

**Availability:**
- In stock: `✓ Dostępny` (with green dot indicator)
- Out of stock: `Niedostępny` badge (grayed out row)

**CTA button language** — imperative, specific, never generic:
- Primary store link: `Zobacz ofertę →`
- Compact store link (list view): `Zobacz →`
- Flipper buy: `Kup →`
- Alert setup: `Ustaw alert`
- Back to feed: `Wróć do okazji`
- Alert confirmation: `Wyślij potwierdzenie →`
- Return from success: `Wróć do gry →`
- BGG link: `Otwórz na BGG →`
- Exit Flipper Mode: `Wyjdź z Flipper Mode`

**Never use:** `Kliknij tutaj`, `Dowiedz się więcej`, `Sprawdź` as a standalone CTA without context.

**Empty states:** Warm, not clinical. Acknowledge the situation, offer the next step.
- No filter results: `Brak okazji spełniających filtry — spróbuj rozszerzyć kryteria` + `Wyczyść filtry` button
- Game not found: warm 404 message [NOTE FOR UX: copy not yet written]
- No price history yet: `Dane historyczne pojawią się po pierwszym cyklu scrapowania`

**Error states:** Empathetic. Explain what happened, offer next step.
- Stale scraper data (>12h): amber banner in feed: `Dane mogą być nieaktualne — ostatnia aktualizacja X temu`
- Store unavailable: row grayed out in price table with `Niedostępny` badge

**Timestamps:**
- Recent (< 24h): relative — `2h temu`, `wczoraj`
- Historical / chart labels: absolute — `Sty`, `Lut`, `Mar` (abbreviated Polish month names)
- Data freshness note in footer: `Dane aktualizowane co 6h`

---

## Component Patterns (behavioral)

### Deal Card (card view)

- **Hover:** `translateY(-3px)`, shadow deepens to `0 8px 28px rgba(44,31,20,0.16)`, HOT sticker enters wiggle animation (`hotWiggle` keyframe, ±1–2deg range, infinite alternate)
- **Click (anywhere on card):** Navigates to `/gra/[slug]`
- **"Zobacz ofertę →" button click:** Navigates to store product page (external link, new tab) — button click does not propagate to card-level navigation
- **Image placeholder:** Colored gradient background with emoji icon until real BGG cover images are available. Cover images will be sourced from BGG API (pending token — see project blockers)
- **Load animation:** `cardFadeIn` — opacity 0→1, translateY 16→0. Stagger: 70ms per card, starting at 50ms for first card

### List Row (list view)

- **Hover:** `translateY(-1px)`, `box-shadow: 0 4px 16px rgba(44,31,20,0.13)`
- **Click anywhere on row except CTA button:** Navigates to Game Passport (`/gra/[slug]`)
- **"Zobacz →" CTA button:** Navigates to store product page (external link, new tab). Event propagation stops — does not trigger row navigation
- **Best deal row:** `border-left: 3px solid #3D5C3A` visual indicator, no behavioral difference
- **Load animation:** `fadeInUp` — opacity 0→1, translateY 10→0. Stagger: 50ms per row

### Filter System

- **"Filtry (n)" button:** Opens filter panel. [NOTE FOR UX: panel behavior not yet defined — modal overlay or inline expand below filter bar. Panel contents (filter options, price range slider, category chips, player count, etc.) not yet designed]
- **Filter count bubble (n):** Updates to reflect number of currently active filters
- **Active filter tags:** Each tag shows the active criterion with a `×` remove button. Clicking `×` removes that single filter and immediately updates the result count and feed
- **"Wyczyść" button:** Removes all active filters simultaneously, returns to full unfiltered feed
- **Result count:** Updates immediately on filter change — shown as `— 23 okazje` in the filter strip
- **Sort dropdown:** Options — Rabat ↓, Cena rosnąco, Cena malejąco, Popularność. Re-orders visible results without re-fetching

### View Toggle (Karty / Lista)

- **State persists** in `localStorage` — returning user sees their last-used view
- **Switching view:** Animates transition between grid and list layout [ASSUMPTION: crossfade or layout morph, exact animation not yet defined]
- **Data is identical** between card and list view — no re-fetch needed on toggle. All deal data is already in-memory; only rendering changes
- Active segment in toggle button is filled green (#3D5C3A), inactive is transparent with muted text

### Flipper Mode

- **Activation:** Clicking "⚡ Flipper Mode" button in header navigates to `/flipper`. The button visually transitions from outline state to filled green state (see DESIGN.md component 7)
- **Mode banner:** Always visible at the top of `/flipper` — green background, white title "⚡ Flipper Mode", subtitle, amber warning chip, "Wyjdź z Flipper Mode" button
- **Exit:** "Wyjdź z Flipper Mode" button returns to `/` (homepage Hot Deals Feed)
- **Table columns:** Gra | Cena | Rabat | Śr. hist. | Margin Proxy | Trend | Akcja
- **Row sorting:** Default sorted by Margin Proxy descending (highest opportunity first)
- **Top pick rows:** `border-left: 3px solid #3D5C3A` for rows where Margin Proxy qualifies as a strong pick (threshold not yet formally defined — mockup shows top 3 rows as `.top-pick`)
- **Margin Proxy color coding:**
  - > 30% — green (`{colors.primary-dark}` / `#2E4A2C`), `↑` arrow
  - 10–30% — amber (`#C07B18`), `→` arrow
  - < 10% — red (`#C42B2B`), `↓` arrow
- **Sparklines:** Tiny inline SVG (62×26px). Green line = falling price (good for flipper — price is dropping, buy now). Red line = rising price (bad — price is recovering, opportunity may have passed). Amber = flat/unclear trend
- **"Kup →" button:** External link to store product page, new tab
- **Margin Proxy explainer:** Collapsible card below table. Formula: `(Średnia historyczna − Cena bieżąca) / Cena bieżąca × 100%`. Includes caveat that Allegro/OLX data is unavailable in MVP — proxy uses internal price history only

### Email Alert Modal

**Trigger:** Price threshold input row in Game Passport hero — user enters threshold in "Powiadom mnie gdy cena spadnie poniżej" field, then clicks "Ustaw alert" button. Modal opens over the Game Passport with a `rgba(44,31,20,0.5)` + `backdrop-filter: blur(3px)` dim layer.

**Step 1 — Form:**
- Shows current game and store in modal subtitle
- Current price chip visible for reference
- Price threshold: large Playfair Display numeric input + "zł" suffix label + range slider below (visual slider, range: 50 zł to current retail price, thumb default at ~90% of current price)
- Email field: standard email input
- Type B checkbox: optional — subscribes to additional large price-drop alerts for this game beyond the specific threshold
- Privacy note: "Nie tworzymy konta. E-mail używany tylko do tego alertu."
- CTA: "Wyślij potwierdzenie →" — sends double opt-in email, transitions to Step 2

**Step 2 — Pending (double opt-in required per RODO/PKE 2024):**
- Large email icon (56px)
- Confirms email address sent to
- States: link valid 48 godzin (48 hours)
- Resend link for users who missed the email [NOTE FOR UX: resend link rendered in Step 2 UI but endpoint deferred to post-MVP. Render as visually present but non-functional in MVP, or hide. Decision: post-MVP.]
- "Sprawdź SPAM" prompt
- Two secondary actions: "Zmień e-mail" (goes back to Step 1 with email field focused) and "Zamknij" (dismisses modal without active alert)

**Step 3 — Success (after email confirmation link clicked):**
- Green modal title "✅ Alert aktywny!" 
- Green checkmark circle (64px)
- Summary card showing: game name, threshold, store, AKTYWNY badge
- Suggestion chips for related games ("+ Brass: Birmingham", "+ Azul") — clicking a chip opens that game's passport
- "Wróć do gry →" primary CTA returns focus to Game Passport
- "Zarządzaj alertami (sprawdź e-mail)" ghost link — management is email-based, no account

**Dismissal:** Modal dismissible at any step via `×` close button (top-right of modal header) or by clicking the dim overlay outside the modal. Escape key also dismisses.

**No account creation at any step.**

### Price History Chart

- SVG line chart, no external JS charting library
- ViewBox: `0 0 860 280`, plotting area: x 60–820, y 20–220
- Lines animate on page load via `stroke-dashoffset` draw animation: `strokeDashArray: 1000`, `strokeDashOffset: 1000→0`, duration 1.4s ease, AlePlanszowki line at 0.3s delay, 3Trolle line at 0.5s delay
- Maximum 2 lines in MVP (one per store: AlePlanszowki in `#3D5C3A`, 3Trolle in `#C4622D`)
- End-point badge: small rect with `rx=5`, "TERAZ" label + current price below, styled in store's color
- Shaded area under the lower-priced line: `fill: rgba(61,92,58,0.06)`
- Data point dots: `r=3.5`, store color, `opacity: 0.5` on historical points; `r=6` with white stroke on current endpoint
- Grid lines: horizontal at price intervals, vertical at month markers, stroke `#D4C4AE`, low opacity
- Y-axis labels: `#6B5744`, font-size 11px, text-anchor end
- X-axis labels: abbreviated Polish month names, font-size 12px, weight 500
- Historical low note: below chart, centered, italic, `#6B5744` — e.g., "Najniższa cena historyczna: 89 zł (3Trolle, Marzec)"
- Legend: centered below chart, dot + store name for each line

---

## State Patterns

### Loading States

[ASSUMPTION: Skeleton screens matching card dimensions (card view) and row dimensions (list view) — exact skeleton design not yet mocked. Skeleton placeholders should use `#DDD0BC` base with `#EDE5D4` shimmer, matching card/row shape including border-radius]

### Empty States

| Trigger | Message | Action offered |
|---|---|---|
| No deals matching active filters | `Brak okazji spełniających filtry — spróbuj rozszerzyć kryteria` | "Wyczyść filtry" button |
| Game slug not found | Warm 404 message [NOTE FOR UX: copy not yet written] | Link back to feed |
| No price history data | `Dane historyczne pojawią się po pierwszym cyklu scrapowania` | None — informational only |
| No Flipper Mode data | [NOTE FOR UX: not yet designed] | TBD |

### Error States

| Trigger | Treatment |
|---|---|
| Scraper data stale (> 12h) | Amber banner in feed: `Dane mogą być nieaktualne — ostatnia aktualizacja X temu` |
| Store product page unavailable | Row in price table grayed out, `Niedostępny` badge replaces availability indicator |
| Email send failure (alert modal) | [NOTE FOR UX: error state for Step 1 → Step 2 transition not yet designed] |

### Success States

| Trigger | Treatment |
|---|---|
| Alert set and confirmed | Green modal Step 3 with AKTYWNY badge and summary |
| Filter applied | Active filter chip appears immediately in filter strip |
| View toggled | Active view button fills green, previous view button clears |
| Flipper Mode activated | Header button fills green, mode banner appears |

---

## Interaction Primitives

### Animations

All timing uses `ease` easing unless noted. No `linear` timing on visible transitions.

| Animation | Trigger | Duration | Effect |
|---|---|---|---|
| Card fade-in | Page load | 0.5s, staggered +70ms per card | `opacity: 0→1`, `translateY: 16px→0` |
| List row fade-in | Page load / filter change | 0.35s, staggered +50ms per row | `opacity: 0→1`, `translateY: 10px→0` |
| Card hover lift | Mouse enter card | 220ms | `translateY(-3px)`, shadow deepens |
| List row hover lift | Mouse enter row | 150ms | `translateY(-1px)`, shadow appears |
| HOT sticker wiggle | Parent card hover (while hovered) | 0.4s, `infinite alternate` | `rotate(-5deg) scale(1.04)` ↔ `rotate(-3deg) scale(1.07)` |
| Chart line draw | Page load (Game Passport) | 1.4s, AlePlanszowki at 0.3s, 3Trolle at 0.5s | `stroke-dashoffset: 1000→0` |
| Filter chip activation | Filter toggle | 180ms | `background-color` transition |
| Button hover fill | Mouse enter any button | 180ms | `background`, `color` transition |
| Page hero fade-in (Passport) | Page load | 0.55s, left col at 0.05s, right col at 0.18s | `opacity: 0→1`, `translateY: 18px→0` |
| Modal appear | Trigger (Ustaw alert) | [ASSUMPTION: fade + scale `0.95→1.0`, 200ms ease] | opacity + subtle scale |

### Focus & Accessibility

- **Focus ring:** `box-shadow: 0 0 0 3px rgba(61,92,58,0.12)` (from `.search-input:focus`) — canonicalize focus ring to `outline: 3px solid rgba(61,92,58,0.4)` at `3px offset` for all interactive elements [ASSUMPTION: explicit focus ring implementation not shown in all mockup CSS — rule inferred from search input and brand token]
- **Discount badge contrast:** Percentage text always visible (not color-only communication)
- **HOT sticker contrast:** `#C4622D` terracotta on `#fff` text — meets WCAG AA for normal text at this size
- **All interactive elements:** keyboard accessible (tab order follows visual reading order)

---

## Accessibility Floor

- `lang="pl"` on `<html>` element (all mockups confirm this)
- All game cover images (when real covers replace placeholders): `alt` = game title
- Discount badges: percentage value always shown as text — color reinforces, not replaces, the value
- Semantic HTML:
  - `<header>` for sticky navigation bar
  - `<main>` for page content area
  - `<nav>` for footer links
  - `<section>` or `<article>` for individual deal cards [ASSUMPTION: mockups use `div` — semantic elements to be applied in implementation]
- Search input: associated `<label>` or `aria-label="Szukaj gry"` (mockups use placeholder only — label required in implementation)
- Modal (Email Alert):
  - Focus trap — keyboard focus does not leave modal while open
  - Escape key closes modal at any step
  - `aria-modal="true"` on modal container
  - `role="dialog"` with descriptive `aria-labelledby` pointing to modal title
- Price history chart:
  - `aria-label` describing the chart data: e.g., `aria-label="Historia cen Wingspan — ostatnie 6 miesięcy. AlePlanszowki: 99 zł. 3Trolle: 149 zł."`
  - Accessible table fallback [ASSUMPTION: `<table>` with price data rendered visually-hidden, or `<details>` below chart with tabular data]
- Flipper Mode Margin Proxy directional indicators: text values shown numerically (`+224%`) alongside directional arrow — color + text, not color alone

---

## Key Flows

### Flow 1 — Marta spots a deal (Hot Deals Feed → Game Passport → Email Alert)

**Persona:** Casual buyer, not a flipper. Wants a good price on a game she's been watching.

1. Marta lands on `/` — Hot Deals Feed in card view (default)
2. Scrolls the 4-column grid; notices the Brass: Birmingham card with `−75%` red badge and tilted HOT sticker
3. Clicks anywhere on the card → navigates to `/gra/brass-birmingham`
4. Sees Game Passport hero: 52px title, BGG rating, metadata grid (Gracze, Czas gry, Trudność, Rok), 2-sentence italic description
5. Sees the green "Najlepsza cena: 74 zł w 3Trolle" callout box, clicks "Zobacz ofertę →" to confirm
6. Scrolls down to "Historia cen" section — chart lines draw in, confirms this is near the historical low
7. Returns to hero, enters `90 zł` in the threshold input next to "Powiadom mnie gdy cena spadnie poniżej"
8. Clicks "Ustaw alert" — modal opens (Step 1): threshold prefilled, she enters her email, optionally checks Type B, clicks "Wyślij potwierdzenie →"
9. Modal Step 2 — checks email inbox, clicks confirmation link
10. Modal Step 3 — "Alert aktywny!" confirmation with summary card. Sees suggestions for Azul and Brass: Birmingham. Clicks "Wróć do gry →"
11. Zero accounts created. One email used exactly once for confirmation.

### Flow 2 — Paweł evaluates a flip (Flipper Mode)

**Persona:** Experienced flipper. Buys deeply discounted games at retail, resells on Allegro.

1. Paweł opens app at `/`, clicks "⚡ Flipper Mode" in the header
2. Header button fills green; app navigates to `/flipper`; green mode banner appears confirming active mode and displaying amber warning chip
3. Scans the Flipper Mode table, sorted by Margin Proxy descending
4. Row 1: Brass: Birmingham — `74 zł`, `−75%` discount, Margin Proxy `+224% ↑` in green, sparkline shows steep falling price (green line)
5. Clicks game title "Brass: Birmingham" → opens Game Passport at `/gra/brass-birmingham` [ASSUMPTION: opens in same tab — new tab behavior not specified in mockup]
6. Verifies price history chart supports the thesis — historical average well above 74 zł
7. Returns to Flipper Mode, clicks "Kup →" in the table row → external link to 3Trolle product page, new tab

### Flow 3 — Agnieszka researches a gift (Direct landing on Game Passport)

**Persona:** Gift buyer. Doesn't know the board game community, came from Google.

1. Agnieszka Googles "Wingspan cena" → lands on `/gra/wingspan` (direct SEO entry)
2. No prior context — reads the hero: game title, BGG rating 8.1/10, BGG rank #14
3. Metadata grid confirms: 1–5 graczy, 40–70 min, Trudność 2.9/5 — suitable for the friend she's buying for
4. Italic description (Playfair Display italic): quick 2-sentence summary confirms it's about birds and engine-building
5. Notices DLC warning banner: "Wingspan: Europejskie ptaki wymaga tej gry podstawowej" — decides to buy the base game only
6. Checks "Porównanie cen" table:
   - AlePlanszowki: `99 zł` (`−55%`) — "Najtaniej" badge, green left border
   - 3Trolle: `149 zł` (`−32%`)
7. Clicks "Zobacz ofertę →" on AlePlanszowki row (primary filled button) → external link to AlePlanszowki, new tab
8. Did not visit BGG. Did not browse any store homepage. Decision made entirely within the Game Passport.

---

## Responsive & Platform

**Design width:** 1280px (desktop-first, matching mockup browser frame)

**Responsive targets (MVP — behavior, not redesign):**

| Breakpoint | Target | Notes |
|---|---|---|
| 1280px | Desktop | Full design as mocked |
| 768px | Tablet | [NOTE FOR UX: layout adaptations not yet mocked] |
| 375px | Mobile | [NOTE FOR UX: layout adaptations not yet mocked] |

**Expected mobile layout changes (Phase 2 detail):**

- Card grid: 4 columns → 2 columns (tablet) → 1 column (mobile)
- Header search: collapsed behind search icon on narrow viewports
- Filter strip: becomes bottom sheet / drawer
- Navigation: bottom navigation bar replaces hamburger-in-header pattern
- Game Passport hero: stacked single column (cover above metadata)

**Native mobile app:** Separate phase. Design system tokens (colors, typography, spacing, radii) are defined to carry over. Component logic defined in this document remains the target behavior model.

**Print:** Not in scope.

---

## Implementation Notes

- **localStorage hydration (View Toggle):** View toggle persistence via localStorage requires two-pass render or URL parameter (`?view=list`) to avoid Next.js 14 SSR hydration mismatch. Treat as implementation decision for Sprint 1.
