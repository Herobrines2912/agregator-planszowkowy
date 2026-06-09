---
date: 2026-06-09
project: board_games_app
stepsCompleted: ["step-01-document-discovery", "step-02-prd-analysis", "step-03-epic-coverage-validation", "step-04-ux-alignment", "step-05-epic-quality-review", "step-06-final-assessment"]
documentsInventoried:
  prd: "_bmad-output/planning-artifacts/prds/prd-board_games_app-2026-06-06/prd.md"
  prd_addendum: "_bmad-output/planning-artifacts/prds/prd-board_games_app-2026-06-06/addendum.md"
  architecture: "_bmad-output/planning-artifacts/architecture.md"
  epics: "_bmad-output/planning-artifacts/epics.md"
  ux_design: "_bmad-output/planning-artifacts/ux-designs/ux-board_games_app-2026-06-06/DESIGN.md"
  ux_experience: "_bmad-output/planning-artifacts/ux-designs/ux-board_games_app-2026-06-06/EXPERIENCE.md"
---

# Implementation Readiness Assessment Report

**Date:** 2026-06-09
**Project:** board_games_app

---

## PRD Analysis

### Functional Requirements

FR-1: Hot Deals Feed display — System renders a publicly accessible homepage feed of Games with current price below original price at any integrated Store, sorted by discount % (descending). Min threshold: ≥15% discount. Refreshes within 30 min of Scrape Cycle. No auth required.

FR-2: Deal entry content — Each Feed entry shows: game cover thumbnail, game name, current lowest price, original price, discount %, Store name(s), elapsed time since last price update. Entries link to Game Passport, not directly to Store.

FR-3: Per-game price history chart — Game Passport displays price history chart per Store, full recorded history. Labels min/max with dates. Suppressed with message if < 7 days of data. Each Store series independent.

FR-4: Price summary statistics — Alongside chart: current lowest price, historical minimum with date, 30-day average. Updates within 30 min of Scrape Cycle. 30-day average omitted if < 7 data points in window.

FR-5: Base Game / Expansion filter — User can filter Game listings by type (Base / Expansion / both). State persists in URL. Unmatched Games shown with caveat "typ nieznany" in both view.

FR-6: Player count filter — User can filter by player count (min/max). Uses BGG minplayers/maxplayers. Games with no BGG player count data excluded from filtered results.

FR-7: BGG metadata display — Game Passport shows: cover image, name, designers, publishers, BGG rank, category rank, complexity (weight), mechanics tags, player count range, play time range, min age, rules PDF link. Missing fields render as "N/A". All fields populated within 24h of Game added.

FR-8: Cross-store price comparison table — Game Passport shows table of current Products across all Stores: store name, price, original price, discount % (if applicable), availability, direct link to Store page. Sorted by price ascending. Out-of-stock at bottom labeled unavailable. Updates within 30 min of Scrape Cycle.

FR-9: DLC dependency warning — Expansion pages prominently display "Ten dodatek wymaga [Base Game name]" with current lowest price and link to Base Game Passport. Appears on all Expansion pages with resolvable BGG parent. If Base Game has no scraped Products, shows name and BGG link with note.

FR-10: Type A alert — user-defined threshold — User subscribes with email + target price for a Game. Alert fires within 2h of Scrape Cycle when price drops to/below threshold. Double Opt-In required. No immediate alert if already below threshold at subscription time. Same subscriber not notified again for same condition within 24h.

FR-11: Type B alert — anomaly detection — System auto-detects price drops exceeding configured thresholds (50%, 70%, 80% below original price) and notifies all confirmed subscribers. Fires regardless of Type A existence. User opts in at subscription time; default enabled.

FR-12: Double Opt-In confirmation flow — Subscription requires email confirmation before any notification. Confirmation email sent immediately with unique, time-limited token link. Token expires after 48h. Resend flow out of scope for MVP. Same email+game_id before confirming resends confirmation rather than creating duplicate.

FR-13: Unsubscribe — Each notification email contains single-click unsubscribe link. Cancels that specific alert subscription. Unsubscribed email retained on per-game suppression list (not deleted — RODO). Confirmation without login.

FR-14: Upcoming section — Dedicated section listing Games for preorder or released in last 30 days: game name, thumbnail, Store, price, expected release date where available. No auth required. Sorted by release date ascending; unknown dates last. Updates within 30 min of Scrape Cycle.

FR-15: Availability alert — User subscribes to "notify me when available" alert via email (Double Opt-In). Fires within 2h of Scrape Cycle that first records Game as in-stock. Fires once per availability event; does not repeat.

FR-16: Flipper Mode view — User activates from main navigation. Active filters preserved. Each entry: name, current price, original price, 7-day price sparkline, Margin Proxy %, trend indicator (↑/→/↓ based on last 7 recorded prices). View toggle, not separate URL. Margin Proxy suppressed ("—") if < 5 price data points.

FR-17: Flipper Mode Type B alert subscription — From Flipper Mode, user can subscribe to Type B anomaly alert for specific Game with single action. Follows standard Double Opt-In (FR-12). Form pre-selects Type B only.

FR-18: Per-game SEO markup — Each Game Passport: unique `<title>` tag (`{Game name} — najtańsza cena, historia cen | {site name}`), meta description with current lowest price, schema.org `Product` structured data with `AggregateOffer` (lowPrice, highPrice, offerCount, priceCurrency: PLN). Google Rich Results Test validates without errors. Unique meta description per game.

FR-19: Sitemap — Application generates and serves `/sitemap.xml` indexing all Game Passport URLs. Regenerated within 24h of new Games added. All Games with ≥1 active Product appear in sitemap.

FR-20: ISR for Game Passports — Game Passport pages rendered with ISR; statically served and revalidated aligned to Scrape Cycle frequency (max staleness: 2× Scrape Cycle duration). Response < 500ms from cache. Price data no more than 2h stale under normal operation. (Next.js 16 App Router ISR, default revalidation 1h.)

FR-21: Scheduled scraping — Full Scrape Cycle for all integrated Stores at least once per 24h, automatically. Each cycle logs: store, start time, end time, products scraped count, error count. If Store scraper produces < 80% of 7-day rolling average, operator alert is sent.

FR-22: Product deduplication to BGG ID — Scraped Products linked to canonical Games via BGG ID. Deduplication pipeline: (1) EAN → GameUPC API → BGG ID; (2) name fuzzy match → BGG Search API → BGG ID; (3) operator review queue for low-confidence matches. Successfully matched Products have BGG metadata within 24h. Below-threshold Products appear in operator review queue.

FR-23: Price history recording — Each Scrape Cycle appends current price, original price, availability per scraped Product. Append-only (no modification/deletion). Price changes as small as 0.01 PLN recorded. Products not seen in cycle recorded as "not seen" not deleted.

FR-24: BGG data enrichment — When Game first linked to BGG ID, system fetches and caches BGG metadata (per FR-7). Cached data refreshed ≥ every 30 days. BGG enrichment runs as background job; does not block Scrape Cycle. HTTP 429 or errors: Game queued for retry, listed with partial data. Rate-limited to ≤ 1 request/second.

**Total FRs: 24**

---

### Non-Functional Requirements

NFR-1: Hot Deals Feed LCP < 2 seconds on standard 4G connection (Lighthouse Performance score ≥ 80).

NFR-2: Full Scrape Cycle for v1 Stores (3Trolle + AlePlanszowki) completes in < 15 minutes.

NFR-3: Game Passport pages served from ISR cache respond in < 500 ms.

NFR-4: Scheduled Scrape Cycle executes without operator intervention in ≥ 95% of scheduled runs over any 30-day window.

NFR-5: Price data for each Store is no more than 24 hours stale under normal operation.

NFR-6: Scraper selector breakage detected within 24 hours via automated CI checks against live Store HTML.

NFR-7: Each Scrape Cycle writes a structured log entry: store name, start time, end time, products scraped, error count.

NFR-8: If a Store's scraped product count falls below 80% of its 7-day rolling average, operator alert fires within 1 hour.

**Total NFRs: 8**

---

### Additional Requirements / Constraints

**Compliance (RODO/PKE 2024):**
- C-1: All email subscriptions require Double Opt-In; consent checkbox unchecked by default.
- C-2: Unsubscribed emails retained on per-subscription-type suppression list (not deleted on unsubscribe).
- C-3: Stored data minimized: email, game_id, alert type, threshold (Type A), unsubscribe token, confirmed flag, timestamps only.
- C-4: Unconfirmed subscriptions expire after 48h; confirmed retained until unsubscribed or explicitly erased.

**Scraping Ethics:**
- C-5: Scrapers respect Crawl-delay in each Store's robots.txt.
- C-6: /promocje/ path on any Store where robots.txt disallows (currently Rebel.pl) is not scraped.
- C-7: Scraper identifies with descriptive User-Agent string naming the project.
- C-8: Rebel.pl robots.txt restrictions not circumvented in v1.

**Cost Constraints:**
- C-9: Infrastructure operating cost target €0/month (GitHub Actions + Neon free + Vercel Hobby free + Brevo free tier). [Addendum revised to ~€5–6/month with Hetzner CX21 VPS.]
- C-10: No external paid services (proxies, managed DBs, commercial anti-bot) in MVP.

**Technical Constraints (from Addendum):**
- Stack: Python 3.11 + Scrapy 2.14, FastAPI + SQLAlchemy + Pydantic v2, Next.js 14 App Router + TypeScript + Tailwind CSS, PostgreSQL 16, APScheduler, Brevo, Docker Compose on Hetzner CX21 + Vercel Hobby.
- EAN scraping must be a background job on first product addition, not part of cyclical Scrape Cycle.
- Fuzzy match confidence: ≥0.85 auto-accept, 0.7–0.85 manual queue, <0.7 rejected.
- BGG API rate limit ≤ 1 req/s with exponential backoff on HTTP 429.
- Early-stop scraping pattern for promotional categories (stop when full page has no discounts).

**Open Questions (from PRD §11):**
- OQ-2: BGG non-commercial Bearer Token — has it been submitted? Blocks Sprint 1.
- OQ-7: GameUPC API viability — Sprint 0 spike required (coverage of Polish titles unknown).
- OQ-5: Upcoming section preorder signal reliability — per-Store verification required before FR-14 can be implemented.

---

---

## Epic Coverage Validation

### Coverage Matrix

| FR | PRD Requirement (short) | Epic / Story | Status |
|----|------------------------|--------------|--------|
| FR-1 | Hot Deals Feed display | Epic 3 → Story 3.3 | ✓ Covered |
| FR-2 | Deal entry content | Epic 3 → Story 3.2 | ✓ Covered |
| FR-3 | Per-game price history chart | Epic 5 → Story 5.2 / 5.3 | ✓ Covered |
| FR-4 | Price summary statistics | Epic 5 → Story 5.2 | ✓ Covered |
| FR-5 | Base Game / Expansion filter | Epic 3 → Story 3.3 / 3.4 | ✓ Covered |
| FR-6 | Player count filter | Epic 3 → Story 3.3 / 3.4 | ✓ Covered |
| FR-7 | BGG metadata display | Epic 4 → Story 4.2 | ✓ Covered |
| FR-8 | Cross-store price comparison table | Epic 4 → Story 4.3 | ✓ Covered |
| FR-9 | DLC dependency warning | Epic 4 → Story 4.6 | ⚠️ Partial — see Gap #1 |
| FR-10 | Type A alert — threshold | Epic 6 → Story 6.1 | ✓ Covered |
| FR-11 | Type B alert — anomaly detection | Epic 6 → Story 6.7 | ✓ Covered |
| FR-12 | Double Opt-In confirmation flow | Epic 6 → Story 6.2 | ⚠️ Inconsistency — see Gap #2 |
| FR-13 | Unsubscribe | Epic 6 → Story 6.3 | ✓ Covered |
| FR-14 | Upcoming section | Epic 8 → Story 8.4 / 8.2 | ⚠️ Path mismatch — see Gap #3 |
| FR-15 | Availability alert | Epic 8 → Story 8.3 / 8.5 | ✓ Covered |
| FR-16 | Flipper Mode view | Epic 7 → Story 7.2 / 7.3 | ❌ Conflict — see Gap #4 |
| FR-17 | Flipper Mode Type B alert subscription | Epic 7 → Story 7.6 | ✓ Covered |
| FR-18 | Per-game SEO markup | Epic 5 → Story 5.4 / 5.5 | ✓ Covered |
| FR-19 | Sitemap | Epic 5 → Story 5.6 | ✓ Covered |
| FR-20 | ISR for Game Passports | Epic 4 → Story 4.1 + Epic 5 | ✓ Covered |
| FR-21 | Scheduled scraping | Epic 2 → Story 2.5 | ✓ Covered |
| FR-22 | Product deduplication to BGG ID | Epic 2 → Story 2.2 | ✓ Covered |
| FR-23 | Price history recording | Epic 2 → Story 2.3 | ✓ Covered |
| FR-24 | BGG data enrichment | Epic 2 → Story 2.4 | ✓ Covered |

### NFR Coverage

| NFR | Requirement | Epic / Story | Status |
|-----|------------|--------------|--------|
| NFR-1 | LCP < 2s, Lighthouse ≥ 80 | Epic 3 → Story 3.3 | ✓ Covered |
| NFR-2 | Scrape Cycle < 15 min | Epic 1 (validate-workflows.yml) + Epic 2 | ✓ Covered |
| NFR-3 | Game Passport ISR cache < 500ms | Epic 4 → Story 4.1 | ✓ Covered |
| NFR-4 | ≥ 95% Scrape Cycle reliability | Epic 2 → Story 2.5 / 2.6 | ✓ Covered |
| NFR-5 | Price data ≤ 24h stale | Epic 2 → Story 2.3 / 2.5 | ✓ Covered |
| NFR-6 | Selector breakage detected < 24h | Epic 2 → Story 2.6 | ✓ Covered |
| NFR-7 | Structured scrape log per cycle | Epic 2 → Story 2.3 | ✓ Covered |
| NFR-8 | Operator alert at < 80% baseline | Epic 2 → Story 2.6 | ✓ Covered |

### Missing / Partial / Conflicting Requirements

#### Gap #1 — FR-9 Edge Case: Base Game Exists but Has No Products (MEDIUM)

FR-9 states: "If the Base Game has no scraped Products, the warning shows the name and BGG link with a note that price data is unavailable."

Story 4.6 ACs cover: (a) expansion with resolvable BGG parent → DLC warning shown; (b) orphan expansion (no BGG parent) → no warning. But the AC does NOT explicitly handle the case where Base Game has a BGG ID but has never been scraped (no Products). The query in Story 4.5 returns `base_game: { name, slug, current_min_price }` — if `current_min_price` is null, the DlcWarning component has no AC describing what to render. This is an untested edge case at the story level.

**Recommendation:** Add an explicit AC to Story 4.6: "Given expansion with resolvable base game that has no scraped Products: DlcWarning renders with name + BGG link and text 'Brak danych cenowych dla tej gry' — no price shown."

#### Gap #2 — FR-12 / Story 6.2: Token Expiry Inconsistency (HIGH)

**PRD states:** FR-12 / Assumption A-2 / C-4: "Unconfirmed subscriptions expire after 48 hours."
**Story 6.2 implements:** "valid, unexpired token (24h window from creation)"

This is a direct contradiction. If Story 6.2 is implemented as written, confirmed users have only 24 hours to click the DOI link instead of 48 hours promised in the PRD. This is a compliance risk (PKE 2024) and a UX issue (users who receive email late or check email infrequently).

**Recommendation:** Align Story 6.2 to 48h — either change the AC in Story 6.2 or update the PRD if 24h was an intentional decision. Must be explicitly decided before implementation.

#### Gap #3 — Upcoming Section URL Path Mismatch (LOW)

**PRD §9 Information Architecture:** Upcoming / Preorders path = `/nadchodzi`
**Epic 8 / Stories 8.4–8.5:** Path = `/nadchodzace`

Both are grammatically valid Polish words for "upcoming" but they are different paths. The sitemap, any internal links, and SEO targeting would differ. This must be aligned before implementation.

**Recommendation:** Pick one and update both PRD §9 and the epics to use the same path consistently. The epics and UX files appear to use `/nadchodzace` — suggest updating PRD §9 to match unless there is a reason to prefer `/nadchodzi`.

#### Gap #4 — FR-16: Flipper Mode URL Architecture Conflict (HIGH)

**PRD FR-16 Consequence:** "Flipper Mode is a view toggle, not a separate URL — filter state is preserved."
**PRD §9 Information Architecture:** "Flipper Mode: Toggle on / and /gra/ surfaces"
**Epic 7 / Stories 7.2–7.5:** Flipper Mode is implemented as `app/flipper/page.tsx` — a dedicated route at `/flipper`.

This is a direct conflict between the PRD's stated consequence and the implementation approach in the epics. The epics approach (dedicated `/flipper` route) is arguably superior for SEO, direct linking, and UX clarity, but it explicitly violates an FR-16 testable consequence.

**Impact:** The acceptance criteria for FR-16 include "Flipper Mode is a view toggle, not a separate URL." If implemented as `/flipper`, this AC fails by definition.

**Recommendation:** The team must explicitly decide which approach to take and update either the PRD (remove the "not a separate URL" constraint) or the epics (revert to toggle view). Given the UX design, architecture, and Epic 7 all use `/flipper`, suggest updating PRD FR-16 consequence to remove the URL restriction — but this is a product decision that needs explicit confirmation.

#### Gap #5 — Brevo Webhook: No Dedicated Story (MEDIUM)

The Additional Requirements section and Epic 6 overview list `app/api/webhooks/brevo/route.ts` (HMAC-SHA256 verification, hard_bounce and complaint → email suppression) as a required deliverable. However, no individual story has explicit acceptance criteria covering this endpoint. It is referenced only in the Epic 6 key deliverables overview.

This is a security-critical feature (preventing email sending to bounced/complaint addresses, RODO compliance) with no testable ACs.

**Recommendation:** Add a dedicated story (e.g., Story 6.8) or attach explicit ACs to Story 6.4 or 6.1: HMAC-SHA256 verification with `timingSafeEqual`, 401 on bad signature, `hard_bounce` and `complaint` triggering `email_suppressions` insert with `reason = 'hard_bounce'` or `'complaint'`.

#### Gap #6 — Search Bar: UI Present but No FR or Implementation Story (LOW)

Story 3.1 builds a search bar in the sticky header (`aria-label="Szukaj gry"`). However: (a) no PRD FR defines search functionality, and (b) no story implements what happens when a user types in the search bar. The search bar is currently a visual placeholder with no backend.

**Recommendation:** Either (a) add a story defining search behavior (at minimum: "typing in search bar with Enter navigates to /gra/{slug}" or a simple game-name filter), or (b) explicitly document in Story 3.1 ACs that the search bar is a non-functional placeholder in MVP ("search is Phase 2 — input renders but does not respond to input events except focus styling"). Leaving it ambiguous creates implementation debt.

#### Gap #7 — Cost Constraint C-9 Mismatch (LOW, Known)

PRD C-9 states "Infrastructure cost target €0/month." Addendum and architecture use Hetzner CX21 at ~€4.50/month + domain ~€0.83/month = ~€5–6/month. The constraint is internally contradicted by the recommended stack. No story resolves this — it should be treated as a PRD update (change C-9 to "≤ €10/month") rather than an implementation blocker.

### Coverage Statistics

- Total PRD FRs: 24
- FRs fully covered in epics: 21
- FRs with gaps or conflicts: 3 (FR-9 partial, FR-12 inconsistency, FR-16 conflict)
- FRs stated as covered but with no actual gap: 0
- **Coverage percentage: 100% stated / 87.5% gap-free**
- Total NFRs: 8
- NFRs covered: 8 (100%)

---

---

## UX Alignment Assessment

### UX Document Status

**Found.** Two files:
- `DESIGN.md` (22KB, 2026-06-07) — visual tokens, component specs, design decisions
- `EXPERIENCE.md` (29KB, 2026-06-08) — IA, user flows, component behavior, state patterns, accessibility

Both are comprehensive and professional. The UX is well-aligned with PRD in the vast majority of areas.

---

### Alignment Issues

#### UX-01 — Price History Time Range Selector: UX vs Stories Mismatch (HIGH)

**EXPERIENCE.md / UX-DR8 define:** buttons `1T / 2T / 1M / 3M / 6M` (T = tygodnie/weeks, 1T = 1 week, 2T = 2 weeks)  
**Story 5.1 DB query:** `range: '1M' | '3M' | '6M' | '1Y' | 'ALL'` — no 1T or 2T  
**Story 5.2 TimeRangeSelector:** "five pill buttons: 1M | 3M | 6M | 1R | WSZYSTKO"

These are completely different time ranges. UX offers short-term (1–2 week) views which would be very useful for recent buyers. The stories implement a month-only scale (minimum 1 month). The UX-DR8 in the epics document correctly quotes the UX labels (1T/2T/1M/3M/6M), but Story 5.2 overrides them with different labels and Story 5.1's DB query doesn't support 1T or 2T at all.

**Impact:** The chart implementation will not match the UX spec. The 1T/2T ranges are particularly valuable for users who want to see last week's prices.

**Recommendation:** Align before implementation. Either (a) update Story 5.1 and 5.2 to support 1T/2T (add `INTERVAL '7 days'` and `'14 days'` variants) and use the UX labels, or (b) update UX-DR8 to match the story's 1M/3M/6M/1R/WSZYSTKO set. This is a dev and UX decision.

#### UX-02 — Flipper Mode Route: RESOLVED (ADR-004, documented)

The EXPERIENCE.md explicitly documents this resolution: "Flipper Mode is a dedicated route, not a view toggle. This overrides PRD FR-16's 'view toggle' language. `/flipper` is confirmed as the canonical path." Architecture ADR-004 also records this. **No action needed** except updating PRD FR-16's consequence text to remove the now-incorrect "not a separate URL" language — cosmetic only.

#### UX-03 — View Toggle State Persistence Conflict (MEDIUM)

**EXPERIENCE.md Component Patterns:** "State persists in localStorage — returning user sees their last-used view"  
**Epics Additional Requirements:** "URL params as sole UI state source: `?view=list`; no localStorage in MVP (Phase 2)"  
**Story 3.4 AC:** "state lives entirely in URL, no localStorage (MVP)"

The UX document still says localStorage, but epics and architecture resolved this as URL params for MVP. EXPERIENCE.md has an implementation note acknowledging the hydration issue, but the component pattern section wasn't updated to reflect the final decision.

**Impact:** Low — the decision is made and documented in epics/architecture. But a developer reading EXPERIENCE.md could be confused.  
**Recommendation:** Update EXPERIENCE.md View Toggle section to say "State persists in URL param `?view=list` (MVP); localStorage Phase 2."

#### UX-04 — Filter Panel Expansion: Undefined Behavior (MEDIUM)

**EXPERIENCE.md:** "Filter System — 'Filtry (n)' button: Opens filter panel. [NOTE FOR UX: panel behavior not yet defined — modal overlay or inline expand below filter bar. Panel contents not yet designed]"  
**UX-DR7:** "Filter panel behavior TBD (modal or inline expand, not yet mocked)"  
**Story 3.4:** Builds FilterBar components but does NOT have any AC for what happens when "Filtry" button is clicked — panel behavior is entirely absent from acceptance criteria.

The "Filtry (n)" button is present in every mockup but clicking it does nothing defined. This is deferred UX work that will block Story 3.4 completion if the filter panel needs to be functional.

**Impact:** Medium. If "Filtry" button is rendered non-functional (no panel opens) in MVP, that's acceptable but should be explicitly documented. If it needs to open a filter panel, that design work hasn't been done.  
**Recommendation:** Explicitly decide in Story 3.4 whether (a) "Filtry" button is non-functional in MVP (just shows active filter tags inline — no panel), or (b) filter panel design must be completed before Story 3.4 starts.

#### UX-05 — DOI Token Expiry: EXPERIENCE.md says 48h, Story 6.2 says 24h (confirms Gap #2)

**EXPERIENCE.md Step 2:** "Link valid 48 godzin"  
**Story 6.2 AC:** "valid, unexpired token (24h window from creation)"

EXPERIENCE.md aligns with the PRD (48h). Story 6.2 diverges from both. This confirms Gap #2 is a genuine inconsistency in the stories, not just a PRD/stories mismatch.

#### UX-06 — Search: /szukaj in UX IA, No Implementation (LOW)

EXPERIENCE.md Information Architecture table lists `Search Results` at `/szukaj?q=` with "[NOTE FOR UX: not yet mocked — structure TBD]". Story 3.1 renders a search bar but no story implements search behavior. This is a known open item in the UX with "TBD" status — acceptable for MVP if the search input is explicitly marked as non-functional.

#### UX-07 — Hamburger Menu Content: Undefined (LOW)

EXPERIENCE.md notes: "content of hamburger menu not yet specified." Story 3.1 builds the hamburger button (38×38px) but has no AC for what it reveals. The SiteFooter links (O projekcie, API, Kontakt) are defined, but the hamburger panel is not. This is a small but visible incomplete UX element.

**Recommendation:** Either define the hamburger menu content before Story 3.1 (minimal: same three footer links) or explicitly note in Story 3.1 ACs that "Hamburger button renders but does not open a panel in MVP."

### Architecture ↔ UX Alignment

The architecture document (ADR-001 through ADR-004) is well-aligned with the UX:
- ADR-004 confirms `/flipper` dedicated route (matches UX)
- ISR on-demand revalidation (ADR-003) supports the UX staleness banner trigger (>12h)
- Direct Drizzle reads (no FastAPI proxy) support NFR-3 <500ms Game Passport (UX requirement)
- GitHub Actions cron is compatible with all UX staleness requirements

One architecture note: EXPERIENCE.md tech stack says "Next.js 14 App Router" but the epics and architecture use Next.js 16. This is a stale reference in EXPERIENCE.md — no functional impact, but worth correcting.

### Warnings

- ⚠️ EXPERIENCE.md has multiple "[NOTE FOR UX: TBD]" items (search, 404 copy, hamburger menu, responsive layouts at 768px/375px, Flipper empty state). These are known gaps in the UX documentation. Most are low-impact for MVP, but the filter panel behavior (UX-04) and search (UX-06) may surface as implementation blockers.
- ⚠️ Time range selector mismatch (UX-01) is the most significant UX ↔ Stories conflict and should be resolved before Epic 5 begins.

---

---

## Epic Quality Review

### Epic Structure Validation

#### User Value Assessment

| Epic | Title | Has User Value? | Notes |
|------|-------|----------------|-------|
| Epic 1 | Project Foundation & Infrastructure | ❌ Technical | Required greenfield setup — acceptable exception |
| Epic 2 | Automated Price Data Collection | ⚠️ Indirect | "No UI — data queryable via DB" — technical foundation, no direct user benefit |
| Epic 3 | Hot Deals Feed — Core Discovery | ✓ | Users browse deals, filter, switch views |
| Epic 4 | Game Passport Core | ✓ | Users see per-game detail, BGG metadata, DLC warnings |
| Epic 5 | Price History Chart & SEO | ✓ | Users see price trends; SEO = acquisition |
| Epic 6 | Email Price Alerts | ✓ | Users set notifications |
| Epic 7 | Flipper Mode | ✓ | Resellers evaluate opportunities |
| Epic 8 | Upcoming Releases | ✓ | Users discover preorders |

Epic 1 and 2 are technical infrastructure epics. For a greenfield project with a 2-developer team, this is pragmatic and expected — Epic 1 enables both devs to branch off immediately, Epic 2 is the data pipeline foundation. These are acceptable deviations with clear justification.

#### Epic Independence Check

| Epic | Can function independently? | Dependency assessment |
|------|----|----|
| Epic 1 | ✓ | No upstream dependency |
| Epic 2 | Requires Epic 1 | Correct ordering |
| Epic 3 | Requires Epics 1+2 (for real data) | Stories 3.1/3.2 can start with mock data — well managed |
| Epic 4 | Requires Epics 1+2 | DB data needed for real Game Passport |
| Epic 5 | Requires Epics 1+2+4 | Price history needs scraping + game slugs from Epic 4 |
| Epic 6 | Requires Epics 1+4 (Game Passport trigger) | Games must exist in DB |
| Epic 7 | Requires Epics 1+2+3 | Price history needed for Margin Proxy |
| Epic 8 | Requires Epics 1+2+6 | Spike gates; reuses alert mechanism from Epic 6 |

No circular dependencies detected. Ordering is logical.

---

### 🔴 Critical Violations

None. No epic requires a future epic to function. No stories with unresolvable forward dependencies found.

---

### 🟠 Major Issues

#### Q-01 — Story 1.2 Creates All DB Tables Upfront (Major)

Story 1.2 creates all 9 tables in a single migration: `stores`, `games`, `products`, `price_history`, `scrape_runs`, `price_alerts`, `email_suppressions`, `consent_log`, `data_retention_log`.

By best practice, tables should be created when first needed (Epic 2 creates `price_history`, Epic 6 creates `price_alerts`, etc.). Story 1.2 front-loads the entire schema before features using those tables exist.

**Counter-argument (and why this is acceptable):** The architecture explicitly defines DB schema as the "shared source of truth" between Dev A and Dev B, and the schema sync rule requires both `schema.ts` and `scraper/items.py` to be updated simultaneously. Creating the complete schema in Story 1.2 is an intentional architectural decision enabling the 2-dev parallel workflow. However, this requires Story 1.2 to be **complete and final** for the MVP scope — which it currently is NOT, because Story 6.7 adds migration columns (`type_b_enabled`, `last_type_b_notified_at`) to `price_alerts`. 

**Actual violation:** Story 6.7 adds columns via migration to a table created in Story 1.2. This violates the stated "schema.ts as source of truth" principle — either Story 1.2 must include ALL columns including those added later, or the schema sync rule must be explicitly applied to Story 6.7 (requiring `scraper/items.py` update in the same PR). Currently Story 6.7's AC says "added via migration in this story" but does NOT reference the schema sync rule.

**Recommendation:** Either (a) move `type_b_enabled` and `last_type_b_notified_at` into Story 1.2's initial schema, or (b) add an explicit AC to Story 6.7: "Migration adds columns to schema.ts AND simultaneous update to scraper/items.py in same PR per L-1 sync rule."

#### Q-02 — Story 3.3 Dev B Delivers Query, Dev A Integration Has No Formal ACs (Major)

Story 3.3 (`db/queries/hot-deals.ts`) is assigned to Dev B. The epic note states: "Dev A integrates wynik w `app/page.tsx` bez osobnej historyjki" (Dev A integrates result in app/page.tsx without a separate story).

This means the work of connecting real query data to `app/page.tsx` — which includes Lighthouse ≥80 / LCP <2s validation (NFR-1) — is explicitly excluded from story ACs. NFR-1 is listed as Story 3.3's AC ("Lighthouse Performance score on `localhost` is ≥ 80, LCP < 2s on simulated 4G"), but the integration work that makes this test possible is undocumented.

**Recommendation:** Either (a) add Story 3.7 "Connect Real Data to Homepage" with ACs for the integration and NFR-1 validation, or (b) add explicit ACs to Story 3.3 covering Dev A's integration step and the NFR-1 verification against real data.

#### Q-03 — Margin Proxy Color Threshold Inconsistency Between UX and Stories (Major)

EXPERIENCE.md states Margin Proxy color coding: `>30% green, 10–30% amber, <10% red`  
Story 7.3 states: margin % badge: `<20% grey, 20–40% amber, >40% green`

These are different systems. In EXPERIENCE.md, anything >30% is green. In Story 7.3, the badge only turns green at >40% and introduces a grey tier for <20%. The "top pick" threshold (border-left) is >30% in both. But the color coding used in the badge differs from the UX.

This creates a situation where a row with 32% Margin Proxy would be a "top pick" (green left border) but would show an amber badge — visually contradictory.

**Recommendation:** Align Story 7.3 badge thresholds with EXPERIENCE.md: `>30% green, 10–30% amber, <10% red` — OR update EXPERIENCE.md to match the story. One authoritative definition needed before Story 7.3 implementation.

---

### 🟡 Minor Concerns

#### Q-04 — Epic 2 Goal Frames Data Consumers as Users (Minor)

Epic 2's goal describes "operators are alerted to failures. No UI — data is queryable via DB." This correctly acknowledges it's a technical epic, but the phrasing "queryable via DB" is not a user benefit. The epic is foundational but should acknowledge that its user value is delivered via later epics (3–8), not standalone.

This is a documentation concern, not an implementation blocker.

#### Q-05 — Story 4.4 (BestDealBanner) Not in FR Coverage Map (Minor)

Story 4.4 "Best Deal Banner" is not listed in the FR coverage map. It's driven by UX-DR19 but has no explicit FR. The ACs are well-defined and the component delivers clear user value, but it lacks FR traceability. Should be linked to FR-8 (cross-store price comparison) or documented as a UX-only requirement.

#### Q-06 — Story 8.4 and 8.5 Lack Spike Gate Enforcement in ACs (Minor)

Stories 8.4 and 8.5 list dependencies: "po 3.1, można zacząć równolegle z 8.1" and "po 8.4 + 8.2". Story 8.4's ACs don't include a gate AC saying "Only proceed if Spike 8.1 returned GO." A developer could build the UI for an upcoming page whose data requirements are undefined.

**Recommendation:** Add a first AC to Story 8.4: "Given Story 8.1 spike result is PASSED or SCOPE CHANGE documented in ADR-006 — When Story 8.4 begins — Then team has confirmed the upcoming section scope before any component code is written."

#### Q-07 — Stories 5.3 and 5.2 TimeRangeSelector Accepts Hard-Coded Ranges Not Matching UX (Minor)

Story 5.1 DB query accepts `'1M' | '3M' | '6M' | '1Y' | 'ALL'`. Story 5.2 TimeRangeSelector renders "1M | 3M | 6M | 1R | WSZYSTKO." UX shows `1T | 2T | 1M | 3M | 6M`. These are documented in UX-01 above — repeated here for completeness. Minor from quality standpoint (ACs are internally consistent within the stories), but a design decision that must be made before Epic 5 starts.

---

### Best Practices Compliance Checklist

| Epic | User Value | Independent | Stories Sized | No Forward Deps | Tables When Needed | Clear ACs | FR Traceability |
|------|-----------|-------------|--------------|----------------|-------------------|-----------|----------------|
| Epic 1 | ❌ Technical | ✓ | ✓ | ✓ | ⚠️ All upfront | ✓ | N/A |
| Epic 2 | ⚠️ Indirect | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Epic 3 | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠️ Q-02 | ✓ |
| Epic 4 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Epic 5 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Epic 6 | ✓ | ✓ | ✓ | ✓ | ⚠️ Q-01 | ✓ | ✓ |
| Epic 7 | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠️ Q-03 | ✓ |
| Epic 8 | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠️ Q-06 | ✓ |

---

### PRD Completeness Assessment

The PRD is thorough and well-structured. All 24 FRs are clearly numbered with testable consequences. NFRs are quantified with concrete metrics. Constraints are explicit. The Addendum provides technical depth that complements rather than contradicts the PRD. The cost constraint in §8.3 (C-9: €0/month) conflicts with the Addendum's actual revised infrastructure cost (~€5–6/month with Hetzner VPS), which is a minor but noted inconsistency. Three open questions (OQ-2, OQ-5, OQ-7) represent genuine implementation blockers that will need to be tracked against the epic coverage.

**PRD quality: HIGH.** The document is one of the strongest artifacts in the project. The main issue is that three items need cosmetic updates to reflect decisions already made in architecture and UX: (1) FR-16 consequence text about "not a separate URL," (2) C-9 cost target, and (3) the `/nadchodzi` vs `/nadchodzace` path.

---

## Summary and Recommendations

### Overall Readiness Status

**NEEDS WORK — Partial Go**

The project documentation is well above average quality and largely ready for implementation. Epics 1–4 can begin immediately. Epics 5–7 each have one specific blocker that must be resolved before their implementation starts. The issues found are fixable in a single focused working session; none require rethinking the product or architecture.

---

### Issues By Priority

#### 🔴 Must Resolve Before Relevant Epic Starts

| # | Issue | Blocks | Action |
|---|-------|--------|--------|
| 1 | ~~**Token expiry inconsistency** (Gap #2 / UX-05): PRD + EXPERIENCE.md = 48h; Story 6.2 = 24h~~ ✅ RESOLVED — Story 6.2 updated to 48h | Epic 6 | ~~Align Story 6.2 to 48h~~ Done |
| 2 | ~~**Price history time range selector mismatch** (UX-01): UX defines 1T/2T/1M/3M/6M; Stories define 1M/3M/6M/1R/WSZYSTKO~~ ✅ RESOLVED — Stories 5.1, 5.2, 5.3 updated to 1T/2T/1M/3M/6M with unlock thresholds | Epic 5 | ~~Align Story 5.1 query and Story 5.2 component with UX labels~~ Done |
| 3 | ~~**Margin Proxy color thresholds inconsistency** (Q-03): EXPERIENCE.md = >30% green; Story 7.3 = >40% green~~ ✅ RESOLVED — Story 7.3 updated to <10% red (#C42B2B), 10–30% amber (#C07B18), >30% green (#3D5C3A) | Epic 7 | ~~Pick one threshold system and update both Story 7.3 and EXPERIENCE.md~~ Done |
| 4 | ~~**Brevo webhook: no story ACs** (Gap #5): HMAC-SHA256 + hard_bounce/complaint suppression has no testable ACs~~ ✅ RESOLVED — Story 6.8 added: `app/api/webhooks/brevo/route.ts` with HMAC-SHA256 verification, hard_bounce + complaint → email_suppressions, 401 on bad sig, 500 on missing secret | Epic 6 | ~~Add Story 6.8 or add explicit ACs to Story 6.4 covering the webhook~~ Done |

#### 🟠 Resolve Before Relevant Epic, Smaller Effort

| # | Issue | Blocks | Action |
|---|-------|--------|--------|
| 5 | ~~**Story 6.7 schema sync omission** (Q-01): Adds DB columns without referencing L-1 schema sync rule~~ ✅ RESOLVED — AC added to Story 6.7: "columns added to schema.ts in same PR (L-1 rule)" | Epic 6 (Story 6.7) | ~~Add explicit AC to Story 6.7~~ Done |
| 6 | ~~**FR-9 edge case missing** (Gap #1): Base Game exists in BGG but has no Products — DlcWarning behavior undefined~~ ✅ RESOLVED — AC added to Story 4.6: shows name + "Brak ofert — sprawdź BGG →" when `current_min_price = null` | Epic 4 (Story 4.6) | ~~Add AC to Story 4.6~~ Done |
| 7 | ~~**Story 3.3 integration gap** (Q-02): Dev A integration of real data into page.tsx has no formal ACs~~ ✅ RESOLVED — AC added to Story 3.3: Dev A wires `getHotDeals()` into `page.tsx`, passes array to DealGrid/DealList, handles empty state | Epic 3 (Stories 3.3/3.6) | ~~Add integration ACs to Story 3.3~~ Done |
| 8 | ~~**Story 8.4 spike gate not enforced in ACs** (Q-06): UI could be built before spike decision~~ ✅ RESOLVED — First AC added to Story 8.4: Story 8.1 must be Done before Story 8.4 can be marked Done | Epic 8 (Story 8.4) | ~~Add first AC as explicit spike gate check~~ Done |

#### 🟡 Low Priority (Documentation / Cosmetic)

| # | Issue | Action |
|---|-------|--------|
| 9 | ~~**Upcoming section URL path mismatch** (Gap #3): PRD §9 = `/nadchodzi`; epics = `/nadchodzace`~~ ✅ RESOLVED — PRD table updated to `/nadchodzace` | ~~Update PRD §9~~ Done |
| 10 | ~~**FR-16 consequence text** (Gap #4 / UX-02): PRD FR-16 still says "not a separate URL"~~ ✅ RESOLVED — PRD FR-16 consequences updated: Flipper Mode accessible at `/flipper` (ADR-004) | ~~Update PRD FR-16~~ Done |
| 11 | ~~**View toggle localStorage in EXPERIENCE.md** (UX-03): Still says localStorage; decision is URL params~~ ✅ RESOLVED — EXPERIENCE.md updated: state persists in `?view=list` URL param | ~~Update EXPERIENCE.md~~ Done |
| 12 | ~~**Filter panel behavior undefined** (UX-04)~~ ✅ RESOLVED — AC added to Story 3.4: "Filtry button is non-functional in MVP — Phase 2 feature" | ~~Define in Story 3.4 ACs~~ Done |
| 13 | ~~**Search bar non-functional** (Gap #6 / UX-06)~~ ✅ RESOLVED — AC added to Story 3.1: search input is non-functional placeholder in MVP | ~~Add AC to Story 3.1~~ Done |
| 14 | ~~**Hamburger menu content undefined** (UX-07)~~ ✅ RESOLVED — AC added to Story 3.1: hamburger is non-functional placeholder in MVP | ~~Add AC to Story 3.1~~ Done |
| 15 | ~~**Cost constraint C-9 mismatch** (Gap #7)~~ ✅ RESOLVED — PRD C-9 updated from €0/month to ≤€10/month | ~~Update PRD C-9~~ Done |

---

### Epic-by-Epic Go / No-Go

| Epic | Status | Condition |
|------|--------|-----------|
| Epic 1 | ✅ GO | Can start immediately |
| Epic 2 | ✅ GO | Can start after Epic 1 |
| Epic 3 | ✅ GO | All issues resolved |
| Epic 4 | ✅ GO | All issues resolved |
| Epic 5 | ✅ GO | All issues resolved |
| Epic 6 | ✅ GO | All issues resolved |
| Epic 7 | ✅ GO | All issues resolved |
| Epic 8 | ✅ GO | All issues resolved |

---

### Recommended Next Steps

1. **Today (30 min):** Resolve the 4 "Must Resolve" items (#1–#4) as a short alignment session — these are all decision clarifications, not new design work.

2. **During Epic 1 planning:** Address items #5, #9, #10, #11, #13, #14, #15 as PRD/story cleanup. None are blockers for Epic 1 itself.

3. **Before Story 4.6 starts:** Add the FR-9 edge case AC (item #6).

4. **Before Story 3.3 integration:** Define Dev A's integration ACs (item #7) — either as Story 3.7 or additional ACs in Story 3.3.

5. **Before Epic 8 Story 8.4:** Add spike gate AC (item #8).

---

### Final Note

This assessment identified **15 issues** across 4 categories: Epic Coverage (7), UX Alignment (7), and Epic Quality (7) — with significant overlap reducing the real number to 15 distinct items. Of these, **4 are blocking for specific epics** and require a decision before implementation. **None block Epics 1–4**. The overall planning quality is high: comprehensive PRD with 24 well-defined FRs, solid architecture ADRs, good 2-dev parallel workflow design, and thorough acceptance criteria.

**Assessment completed:** 2026-06-10  
**Report file:** `_bmad-output/planning-artifacts/implementation-readiness-report-2026-06-09.md`
