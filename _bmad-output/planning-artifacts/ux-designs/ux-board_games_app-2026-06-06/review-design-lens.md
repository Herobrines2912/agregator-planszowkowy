# Design Lens Review — Agregator Cen Planszówek
_Reviewer: design-lens agent | Input: DESIGN.md + EXPERIENCE.md | Date: 2026-06-07_

---

## Dimensional Ratings

**Information architecture: 7/10** — it's a 7 because the hamburger menu has a styled component with zero specified contents (EXPERIENCE.md line 34 explicitly says "not yet specified"), and the filter panel has no IA definition (line 111 says "modal overlay or inline expand... not yet designed"). Both anchor points in the header and the primary interaction surface of the feed are stubs. A 10 would have: hamburger contents enumerated with hierarchy, filter panel layout and available filter options specified with grouping rationale.

**Interaction state coverage: 5/10** — it's a 5 because multiple core interactive elements have documented gaps plus several silent ones:

- Acknowledged: Email send failure (modal Step 1 → Step 2 — line 211), No Flipper Mode data (line 204), Game slug 404 copy (line 77), Filter panel contents (line 111)
- Acknowledged (loading): Skeleton screens app-wide are only an `[ASSUMPTION]` — "exact skeleton design not yet mocked" (line 195). The shimmer colors are guessed, not decided.
- Silent: Best Price Box on Game Passport has no out-of-stock state; deal card has no lifecycle state when its offer sells out (card persists? grays out? disappears from feed?); Flipper Mode Margin Proxy with insufficient price history shows no fallback; the modal step 3 confirmation page has no spec for where it renders when the confirmation link is clicked hours later in a new browser session.

A 10 would enumerate every state (loading, empty, error, success, partial/degraded) for every interactive component with specified content — not ASSUMPTION placeholders.

**User flow completeness: 6/10** — it's a 6 because the three documented flows cover the happy paths well but leave edge cases unresolved:

- Flow 1 (alert): Step 9 says user "clicks confirmation link" but no spec for the destination. Where does Step 3 render? The modal is anchored to `/gra/[slug]` — if the user clicks the link from a different device or a cold browser session, that page context doesn't exist. The "link valid 24 hours" (line 159) has no expired-link state.
- Zero-results search: a user who searches for a game that isn't in the database has no specified flow (the search results page is the only surface marked entirely TBD).
- Browsing with all visible games out of stock: no stated behavior for the feed or the Best Price Box.

**Responsive/accessibility: 7/10** — it's a 7 because accessibility is meaningfully specified (focus trap, escape key, aria-modal, chart fallback, semantic HTML assignments — lines 255-272), but responsive behavior for tablet and mobile (768px, 375px) is deferred entirely to "not yet mocked" (lines 332-333) despite the doc claiming "mobile-responsive to MVP" (line 8). The bottom navigation bar mentioned for mobile (line 341) has no designed state. This is a nominal commitment without implementation specification. A 10 would either explicitly scope mobile behavior out of MVP or spec the adaptive layouts.

**Unresolved design decisions: 5/10** — it's a 5 because several decisions affect implementation:

- Filter panel: open as modal overlay or inline expand? What filter options exist? (line 111 — labeled as undesigned)
- Hamburger menu contents: entirely unspecified (line 34)
- Flipper Mode top-pick threshold: "not yet formally defined" (line 133) — implementer cannot build the `.top-pick` row selection logic
- View toggle transition animation: "crossfade or layout morph, exact animation not yet defined" (line 122)
- Flipper Mode → Game Passport navigation: "same tab — new tab behavior not specified in mockup" (line 305)
- Sort dropdown in filter strip: "Re-orders visible results without re-fetching" (line 116) — means all data must be loaded upfront; this is a silent pagination/infinite scroll decision that hasn't been made explicit

---

## Silent Gaps Not Acknowledged in the Document

### 1. Pagination / Infinite Scroll — entirely absent
Confidence: 100

Neither DESIGN.md nor EXPERIENCE.md mentions how the feed handles more than a screenfull of deals. The staggered card animation (70ms per card) applied to a 50-card feed would run ~3.5 seconds. The sort dropdown description ("re-orders visible results without re-fetching") implies all deals are loaded at once, but no explicit load-more pattern, pagination control, or infinite scroll trigger is specified. An implementer has no basis for choosing between approaches, and the choice affects perceived performance, animation design, and filter result counts.

### 2. Flipper Mode Has No Stale-Data Warning
Confidence: 100

EXPERIENCE.md line 210 scopes the stale-data amber banner to "in feed" — the specific wording is "Amber banner in feed." The `/flipper` surface is a separate route with its own table, and nothing in either document says the staleness warning appears there. This is the highest-stakes version of the gap: Flipper Mode is explicitly for users making buy-to-resell decisions on Margin Proxy figures. If those figures are based on scraper data that is 12+ hours old, a user could make a losing purchase with no warning on the surface where the decision is made. The Margin Proxy explainer (line 139) caveats the Allegro/OLX data gap but never mentions data freshness.

### 3. All-Stores-Out-of-Stock State
Confidence: 100

EXPERIENCE.md covers a single-store unavailability (line 211: row grayed out in price table). But there is no state for when every store in the price table is out of stock. The Best Price Box (DESIGN.md component 9) shows only a price + store + CTA — its empty/OOS variant is entirely unspecified. Similarly, a deal card on the feed whose offer has sold out has no documented lifecycle: does it disappear from the feed? Remain and gray out? Show a "niedostępny" overlay on the image area?

### 4. Email Confirmation Link — Destination and Expired State
Confidence: 100

Step 2 states "link valid 24 hours" (EXPERIENCE.md line 159) but neither document specifies:
- Where the link resolves to when clicked (a dedicated confirmation route? the Game Passport? a generic confirmation page?)
- What the user sees when the link has expired (no expired-link error state designed)
- What happens when Step 3 needs to render in a new browser session with no prior modal context

The flow is: confirmation email arrives → user clicks link in email client → something renders. That "something" has no spec.

### 5. Filter Panel Contents and Behavior
Confidence: 100

The `Filtry (n)` button is fully styled and behaviorally specified (count bubble, active tag removal, Wyczyść action) but the panel it opens is explicitly undesigned: "modal overlay or inline expand below filter bar. Panel contents (filter options, price range slider, category chips, player count, etc.) not yet designed" (line 111). This is a primary interaction path on every page view of the feed. An implementer cannot build this without design decisions on: panel open behavior, available filter dimensions, filter option presentation (chips, sliders, checkboxes), and panel close/apply behavior.

---

## Acknowledged TBDs Ranked by MVP Blocking Impact

| TBD | Location | MVP blocker? |
|---|---|---|
| Filter panel behavior and contents | EXPERIENCE.md line 111 | Yes — feed's primary interaction |
| Hamburger menu contents | EXPERIENCE.md line 34 | Yes — all pages have it; must contain something |
| Email modal Step 1→2 error state | EXPERIENCE.md line 211 | Yes — double opt-in failure path has no recovery |
| No Flipper Mode empty state | EXPERIENCE.md line 204 | Yes — zero data is likely in early launch |
| Flipper Mode top-pick threshold | EXPERIENCE.md line 133 | Yes — cannot render `.top-pick` rows without it |
| Skeleton screens (app-wide) | EXPERIENCE.md line 195 | Yes — loading states are assumed, not designed |
| Game slug 404 copy | EXPERIENCE.md line 77 | Medium — needs copy, not design work |
| Search results page structure | EXPERIENCE.md line 28 | Medium — deferred but search is in header on every page |
| View toggle transition animation | EXPERIENCE.md line 122 | Low — any crossfade works; pick one |
| Tablet/mobile layouts (768px, 375px) | EXPERIENCE.md lines 332–333 | Low — explicitly deferred for MVP |

---

## AI Slop Check

9/10 — not a slop risk. These documents explicitly enumerate and reject generic AI-generated interface patterns: no countdown timers, no red/yellow promotional language, no pure-white backgrounds, no generic CTA copy. The aesthetic direction is grounded in product-specific reasoning (enthusiast magazine, hand-stamp feel, community passion project). Color decisions include documented rationale (DEC-05, DEC-06). The HOT sticker rotation angle has a reason. The terracotta badge color is explained relative to what it must not be confused with. This is the opposite of AI slop — it is opinionated, specific, and coherent.

---

## Summary of Most Important Gaps

1. Filter panel is the largest unresolved design decision — fully styled trigger, zero specified behavior or contents
2. Hamburger menu has a designed button with no specified contents on any page
3. Flipper Mode stale-data warning is scoped to "in feed" only — the surface where money decisions are made has no staleness indicator
4. Pagination/infinite scroll is a silent gap — no load model for feeds larger than one screen
5. All-stores-OOS state is unspecified for Best Price Box and deal cards
6. Email confirmation link destination and expired-link state have no spec
7. Flipper Mode top-pick threshold is undefined — blocks building the `.top-pick` row selection logic
