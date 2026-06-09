---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-board_games_app-2026-06-06/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-designs/ux-board_games_app-2026-06-06/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-board_games_app-2026-06-06/EXPERIENCE.md
---

# board_games_app - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for board_games_app (Agregator Cen Planszówek), decomposing the requirements from the PRD, Architecture, and UX Design into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1: Hot Deals Feed display — system renders a publicly accessible homepage feed of Games with ≥15% discount, sorted by discount % descending, refreshed within 30 min of completed Scrape Cycle, no authentication required.

FR-2: Deal entry content — each Feed entry displays: game cover thumbnail, game name, current lowest price, original price, discount %, Store name(s), elapsed time since last price update. Entries link to Game Passport, not directly to Store. Games without original price data are excluded.

FR-3: Per-game price history chart — Game Passport displays a price history chart per Store, covering full recorded history. Chart labels historical min/max with dates. Suppressed (replaced with message) if fewer than 7 days of data exist.

FR-4: Price summary statistics — alongside chart: current lowest price (all Stores), historical minimum with date, 30-day average price. Statistics update within 30 min of Scrape Cycle. "30-day average" omitted if fewer than 7 data points in window.

FR-5: Base Game / Expansion filter — user can filter Game listing to show only Base Games, only Expansions, or both. Filter state persists via URL parameter. Games not yet matched to BGG ID shown with "typ nieznany" label.

FR-6: Player count filter — user can filter by player count (min/max). Uses BGG minplayers/maxplayers. Games without BGG player count data excluded from filtered results.

FR-7: BGG metadata display — Game Passport displays: cover image, name, designers, publishers, BGG overall rank, BGG category rank, complexity (weight), mechanics tags, player count range, play time range, minimum age, rules PDF link. All fields populated within 24 hours of Game added. Missing fields render as "—".

FR-8: Cross-store price comparison table — Game Passport displays table of current Products: store name, current price, original price, discount %, availability, direct link to Store product page. Sorted by price ascending. Out-of-stock shown at bottom. Updates within 30 min of Scrape Cycle.

FR-9: DLC dependency warning — when Game is an Expansion, page displays "Ten dodatek wymaga [Base Game name]" with Base Game's current lowest price and link to Base Game's Game Passport. Warning appears on every Expansion page with resolvable BGG parent.

FR-10: Type A alert — user-defined threshold — user subscribes by providing email + target price for a specific Game. When lowest price drops to or below threshold at any Store, notification email sent. Requires Double Opt-In. Fires within 2 hours of triggering Scrape Cycle. Does not fire if already below threshold at subscription time. Same subscriber not notified again within 24 hours for same condition.

FR-11: Type B alert — anomaly detection — system detects price drops exceeding 50%, 70%, 80% below original and notifies all confirmed subscribers. Type B alerts fire regardless of whether Type A alert exists. User opts in at subscription time (default enabled).

FR-12: Double Opt-In confirmation flow — subscription requires email confirmation. Confirmation email with unique time-limited token sent immediately. No notification sent before confirmed. Duplicate email+game_id before confirming resends confirmation email.

FR-13: Unsubscribe — each notification email contains single-click unsubscribe link. Cancels specific alert subscription. Unsubscribed email retained on per-game suppression list (not deleted — RODO). Following unsubscribe link confirms success without login.

FR-14: Upcoming section — application provides Upcoming section listing Games available for preorder or released in last 30 days: game name, thumbnail, Store, price, expected release date (if available). Accessible without authentication. Sorted by release date ascending; unknown dates last. Updates within 30 min of Scrape Cycle.

FR-15: Availability alert — user can subscribe to "notify me when available" alert for a specific Game (Double Opt-In, same mechanism as FR-10). Alert fires within 2 hours of Scrape Cycle that first records Game as in-stock. Fires once per availability event.

FR-16: Flipper Mode view — user navigates to /flipper from header. Active filters remain applied. Each Game entry displays: name, current price, original price, 7-day price sparkline, Margin Proxy %, trend indicator (↑/→/↓). Trend calculated from last 7 recorded prices. Margin Proxy suppressed if fewer than 5 price data points.

FR-17: Flipper Mode Type B alert subscription — from Flipper Mode, user can subscribe to Type B anomaly alert for specific Game with single action, following standard Double Opt-In flow (FR-12). Subscription form pre-selects Type B only.

FR-18: Per-game SEO markup — each Game Passport includes: unique `<title>` tag (`{Game name} — najtańsza cena, historia cen | {site name}`), meta description with current lowest price, schema.org Product structured data with AggregateOffer (lowPrice, highPrice, offerCount, priceCurrency: PLN). Google Rich Results Test validates without errors. Each page has unique meta description.

FR-19: Sitemap — application generates and serves /sitemap.xml indexing all Game Passport URLs. Regenerated within 24 hours of new Games added. All Games with at least one active Product appear.

FR-20: Incremental Static Regeneration for Game Passports — Game Passport pages rendered with ISR, statically served and revalidated on schedule (max staleness: 2× Scrape Cycle = 2h). Cached Game Passport responds in < 500 ms. Price data no more than 2 hours stale under normal operation.

FR-21: Scheduled scraping — system executes full Scrape Cycle for all integrated Stores at least once per 24 hours automatically. Each Scrape Cycle logs: store, start time, end time, products scraped count, error count. If Store scraper produces fewer products than 80% of 7-day rolling average, operator alert sent.

FR-22: Product deduplication to BGG ID — scraped Products linked to canonical Games via BGG ID. Pipeline attempts: (1) EAN → GameUPC API → BGG ID; (2) name fuzzy match → BGG Search API → BGG ID; (3) operator review queue for low-confidence matches. Successfully matched Products have BGG metadata populated within 24 hours. Low-confidence Products appear in operator review queue.

FR-23: Price history recording — each Scrape Cycle appends current price, original price, availability for each scraped Product to Price History. Price History is append-only. Price changes as small as 0.01 PLN recorded. Products not returned by scraper in a given cycle recorded as "not seen" rather than deleted.

FR-24: BGG data enrichment — when Game first linked to BGG ID, system fetches and caches BGG metadata. Cached BGG data refreshed at minimum every 30 days. Enrichment runs as background job, does not block Scrape Cycle. BGG API errors queue Game for retry. BGG API rate-limited to ≤ 1 request/second.

### NonFunctional Requirements

NFR-1: Hot Deals Feed LCP < 2 seconds on standard 4G connection (Lighthouse score ≥ 80 for Performance).

NFR-2: Full Scrape Cycle for v1 Stores (3Trolle + AlePlanszowki) completes in < 15 minutes.

NFR-3: Game Passport pages served from ISR cache respond in < 500 ms.

NFR-4: Scheduled Scrape Cycle executes without operator intervention in ≥ 95% of scheduled runs over any 30-day window.

NFR-5: Price data for each Store is no more than 24 hours stale under normal operation.

NFR-6: Scraper selector breakage is detected within 24 hours via automated CI checks against live Store HTML.

NFR-7: Each Scrape Cycle writes a structured log entry: store name, start time, end time, products scraped, error count.

NFR-8: If a Store's scraped product count falls below 80% of its 7-day rolling average, an operator alert fires within 1 hour.

### Additional Requirements

- **Starter Template (Sprint 0 Story 1):** `create-next-app@latest` (Next.js 16 App Router, TypeScript, Tailwind 4.x, ESLint, src-dir) + Python 3.11 + uv + Scrapy 2.16; monorepo with `/web`, `/scraper`, `/db/migrations`; `schema.ts` as source of truth for both sides.
- **BGG Bearer Token registration** must be completed before Sprint 1 — hard blocker for Game Passport, deduplication, DLC warning (A-6).
- **GameUPC spike** required before implementing EAN deduplication path: test 20–30 Polish titles to validate coverage (OQ-7 / Tech-1).
- **Neon PostgreSQL setup** (free tier, 0.5GB), connection strings in GitHub Secrets and Vercel env vars.
- **Brevo email integration** (RODO-native EU servers, free tier 300/day); alert_engine.py is sole Brevo caller.
- **GitHub Actions workflows:** `scraper.yml` (cron `0 6 * * *`: Scrapy → Neon → alert check → Brevo → revalidate Vercel); `selector-health.yml` (cron `0 8 * * *`: daily smoke test, NFR-6); `maintenance.yml` (weekly Sunday 3am UTC: data retention); `validate-workflows.yml` (push/PR: YAML lint, timeout ≤ 14 min for NFR-2).
- **ISR on-demand revalidation:** POST `/api/revalidate` with `REVALIDATION_SECRET` header; `--retry 3` from scraper.yml; fallback TTL 2h.
- **RODO consent_log:** append-only table, SHA-256 email hash, 6 action types (`opt_in_requested`, `opt_in_confirmed`, `unsubscribed`, `suppressed`, `suppression_overridden`, `reactivated`), indexed on (email_hash, created_at). Never DELETE from this table.
- **RODO email_suppressions:** stores the **raw email** (not hashed — matched by the alert-engine join in arch L-3); `reason` is one of `hard_bounce`, `complaint` (permanent), `user_request`, `global_optout` (both overridable via conscious resubscription: DELETE suppression + INSERT consent_log `suppression_overridden`).
- **Data retention policy (maintenance.yml):** `ip_hash` NULL in consent_log after 12 months; email SHA-256 anonymization in email_suppressions after 3 years; scrape_runs DELETE after 90 days; consent_log DELETE after 5 years **only for rows whose subscription is no longer active** (no `price_alerts` row with `status = 'active'` for that `email_hash`) — proof of consent for active subscribers is never deleted while processing continues.
- **Brevo webhook HMAC-SHA256 verification:** timingSafeEqual + 401 on bad signature; hard_bounce and complaint trigger email suppression.
- **Age restriction checkbox (16+)** on alert subscription form — required (submission rejected if unchecked); not stored as a separate flag — the `opt_in_requested` consent_log row is the durable proof the attestation passed (data minimization without losing accountability).
- **ESLint no-restricted-imports** enforcing DB access boundary: only `db/queries/` allowed to import `db/index` (components banned from direct Drizzle access).
- **assertNever pattern** required in every TypeScript switch on `.$type<>()` enum fields.
- **db_health.py** monitoring: SELECT pg_database_size(), alert when > 400MB.
- **GDPR rights procedure:** `privacy@[domain]` email published in Privacy Policy + footer, SLA 30 days, manual process for MVP.
- **URL params as sole UI state source:** `?view=list`, `?type=base&players=2`; no localStorage in MVP (Phase 2).
- **Public repo** (unlimited GitHub Actions free minutes + BGG non-commercial credibility).
- **Drizzle schema sync rule:** every `schema.ts` change requires simultaneous update to `scraper/scraper/items.py` (Pydantic models) in same PR.
- **Batch error handling in alert_engine.py:** infrastrural errors abort entire batch and raise (operator alert via GH Actions); per-item errors skip with log and continue.

### UX Design Requirements

UX-DR1: Implement custom design system with Tailwind 4.x CSS variables for all color tokens (background `#F2EAD8`, surface `#DDD0BC`, surface-header `#EDE5D4`, primary `#3D5C3A`, primary-dark `#2E4A2C`, text-primary `#2C1F14`, text-secondary `#6B5744`, text-muted `#A89480`, border `#D4C4AE`, border-strong `#C5B49A`, badge-hot `#C4622D`, badge-discount-low/mid/high, overlay). No external component framework (shadcn, MUI, Radix, etc.).

UX-DR2: Typography setup: Playfair Display (400/700/800 weights) + DM Sans (400/500/700 weights) via `next/font/google`; base-size 15px; line-height 1.5 globally; warm brown text (#2C1F14) — never pure black.

UX-DR3: Discount badge component with value-driven color system: `< 40%` → green (`#3D5C3A`), `40–70%` → amber (`#C07B18`), `> 70%` → red (`#C42B2B`); white text; border-radius 6–8px. In Flipper Mode table: soft semi-transparent variant. Color always determined by value, never by brand preference.

UX-DR4: HOT sticker component: terracotta `#C4622D`, `rotate(-4deg)` always, DM Sans 11px 700w uppercase letter-spacing 0.8px, `box-shadow: 2px 3px 8px rgba(196,98,45,0.45)`. On card hover: `hotWiggle` keyframe animation (±1–2deg, 0.4s infinite alternate). List view variant: 10px border-radius, `rotate(-2deg)`, 10px font, no shadow.

UX-DR5: Deal Card component (`DealCard.tsx`): 12px border-radius, 148px image area, card body padding 14px 16px 16px, `cardFadeIn` animation (opacity/translateY 16px, 0.5s, staggered +70ms per card from 50ms), hover lift `translateY(-3px)` + shadow deepens, warm brown shadows `rgba(44,31,20,N)`.

UX-DR6: List Row component: flex row, 48px×48px thumbnail (border-radius 8px), 10px border-radius rows, padding 12px 16px, gap 12px, `fadeInUp` animation (0.35s, staggered +50ms), hover `translateY(-1px)` + shadow. Best deal row: `border-left: 3px solid #3D5C3A`. Cards grid: 4-column, gap 22px.

UX-DR7: Filter system components: (a) Filtry button with active filter count bubble (green pill); (b) active filter tags (removable with ×); (c) result count display; (d) sort dropdown (Rabat ↓, Cena rosnąco, Cena malejąco, Popularność); (e) View Toggle (Karty/Lista) — URL param `?view=list` in MVP, localStorage in Phase 2; Filter panel behavior TBD (modal or inline expand, not yet mocked).

UX-DR8: Price History Chart (`PriceHistoryChart.tsx`): pure inline SVG, no JS charting library; ViewBox `0 0 860 280`, plotting area x:60–820 y:20–220; time range selector (1T/2T/1M/3M/6M) with unlock thresholds (1T≥7d, 2T≥14d, 1M≥30d, 3M≥90d, 6M≥180d); AlePlanszowki line `#3D5C3A`, 3Trolle line `#C4622D`; `stroke-dashoffset` draw animation 1.4s ease (AlePlanszowki 0.3s delay, 3Trolle 0.5s delay); re-animates on range change; x-axis labels adaptive per range; statistics section below chart (Min / Śr. / Akt. scoped to selected range); returns `{ data, tooFewDataPoints }` when < 7 data points.

UX-DR9: Email Alert Modal (`AlertSubscribeForm.tsx`): 3-state flow — State 1 (form with price threshold, slider, email input, Type B checkbox, age checkbox); State 2 (pending double opt-in, 48h notice, resend link placeholder, "Sprawdź SPAM" prompt); State 3 (success, green checkmark circle, summary card with AKTYWNY badge, related game suggestion chips). Width 368px, border-radius 16px. Focus trap: keyboard focus stays within modal. Escape key closes. `aria-modal="true"`, `role="dialog"`, `aria-labelledby` pointing to modal title. Backdrop: `rgba(44,31,20,0.5)` + `backdrop-filter: blur(3px)`.

UX-DR10: Flipper Mode page (`/flipper`, `FlipperTable.tsx` + `SparklineChart.tsx`): always-visible mode banner (green background, amber warning chip, "Wyjdź z Flipper Mode" button); table columns: Gra|Cena|Rabat|Śr. hist.|Margin Proxy|Trend|Akcja; default sorted by Margin Proxy descending; top-pick rows: `border-left: 3px solid #3D5C3A`; Margin Proxy color coding (>30% green, 10–30% amber, <10% red) with directional arrows — numeric value alongside arrow (not color alone); `SparklineChart` 62×26px inline SVG (green=falling price, red=rising, amber=flat); Margin Proxy explainer card (collapsible, formula, Allegro/OLX caveat).

UX-DR11: DLC Warning Banner (`DlcWarning.tsx`): amber gradient background (`linear-gradient(135deg, #F5E6C8, #EDD89C)`), `border: 1.5px solid #C07B18`, `border-left: 5px solid #C07B18`, border-radius 10px, padding 14px 20px, text `#3D2A08`; link button to Base Game's Game Passport.

UX-DR12: Accessibility floor: `lang="pl"` on `<html>`; `alt` = game title on all game cover images; semantic HTML: `<header>`, `<main>`, `<nav>`, `<section>`/`<article>` for deal cards; `aria-label="Szukaj gry"` on search input; focus ring `outline: 3px solid rgba(61,92,58,0.4)` at 3px offset on all interactive elements; price history chart `aria-label` with current price data + accessible table fallback; Flipper Margin Proxy: numeric value alongside directional arrow (never color alone); discount badges: text always shown (not color-only).

UX-DR13: Skeleton loading states: `#DDD0BC` base with `#EDE5D4` shimmer, matching card/row shapes with border-radius. Applied on card view (matching card dimensions) and list view (matching row dimensions).

UX-DR14: Polish-only UI strings. Price format: always "99 zł" or "99,90 zł" (suffix, never prefix, never "PLN"). Discount format: always "−38%" (minus + number + %, no space). CTA language: imperative Polish ("Zobacz ofertę →", "Ustaw alert", "Wróć do okazji", "Kup →"). Empty states: warm Polish copy, not clinical.

UX-DR15: Error/empty states: (a) amber staleness banner in feed when scraper data > 12h old (`Dane mogą być nieaktualne — ostatnia aktualizacja X temu`); (b) warm 404 on Game not found with link back to feed; (c) empty filter results with `Wyczyść filtry` button; (d) no price history yet message (`Dane historyczne pojawią się po pierwszym cyklu scrapowania`); (e) store unavailable row: grayed out + `Niedostępny` badge.

UX-DR16: Box-shadow system throughout: all shadows use `rgba(44,31,20,N)` warm brown base — never neutral grey. Key shadows: cards resting `0 2px 8px rgba(44,31,20,0.08)`, cards hover `0 8px 28px rgba(44,31,20,0.16)`, modal `0 24px 64px rgba(44,31,20,0.28)`.

UX-DR17: Sticky 64px header present on all surfaces: logo (left, flex-shrink 0) → search bar (centered, max-width 440px, border-radius 24px) → Flipper Mode button + hamburger button (right, flex-shrink 0); gap 32px; background `#EDE5D4`, border-bottom 1px `#D4C4AE`; header z-index 100.

UX-DR18: Breadcrumb bar on Game Passport only: below header, background `#EDE5D4`, border-bottom 1px `#D4C4AE`, padding 8px 40px; contains `← Wróć do okazji` link + separator + current game name.

UX-DR19: Best Price Box on Game Passport (`SchemaOrgOffer.tsx` provides structured data context): green background `#3D5C3A`, border-radius 12px, padding 18px 22px; Playfair Display 28px 800w price in white; store sub-label; CTA button with semi-transparent white background.

### FR Coverage Map

FR-1 → Epic 3 — Hot Deals Feed display (homepage feed, sorted by discount %)
FR-2 → Epic 3 — Deal entry content (thumbnail, price, discount, store, timestamp)
FR-3 → Epic 5 — Per-game price history chart (SVG, multi-store, time range selector)
FR-4 → Epic 5 — Price summary statistics (min/max/30-day avg below chart)
FR-5 → Epic 3 — Base Game / Expansion filter (URL param state)
FR-6 → Epic 3 — Player count filter (BGG minplayers/maxplayers)
FR-7 → Epic 4 — BGG metadata display (cover, designers, rank, mechanics, complexity)
FR-8 → Epic 4 — Cross-store price comparison table (sorted by price, out-of-stock last)
FR-9 → Epic 4 — DLC dependency warning (Expansion → Base Game link)
FR-10 → Epic 6 — Type A alert — user-defined price threshold subscription
FR-11 → Epic 6 — Type B alert — anomaly detection (50%/70%/80% drops)
FR-12 → Epic 6 — Double Opt-In confirmation flow (RODO/PKE 2024)
FR-13 → Epic 6 — Unsubscribe (single-click, suppression list)
FR-14 → Epic 8 — Upcoming section (preorder + last 30 days, per-store signal)
FR-15 → Epic 8 — Availability alert (Double Opt-In, fires once per availability event)
FR-16 → Epic 7 — Flipper Mode view (/flipper, Margin Proxy, sparklines, trend indicator)
FR-17 → Epic 7 — Flipper Mode Type B alert subscription (pre-selected Type B)
FR-18 → Epic 5 — Per-game SEO markup (title, meta description, schema.org AggregateOffer)
FR-19 → Epic 5 — Sitemap (/sitemap.xml, regenerated within 24h of new Games)
FR-20 → Epic 4 — ISR on-demand revalidation (POST /api/revalidate, fallback TTL 2h)
FR-21 → Epic 2 — Scheduled scraping (GitHub Actions cron, scrape_runs log, operator alert)
FR-22 → Epic 2 — Product deduplication to BGG ID (EAN→GameUPC, fuzzy match, operator queue)
FR-23 → Epic 2 — Price history recording (append-only, "not seen" on missing cycle)
FR-24 → Epic 2 — BGG data enrichment (background job, retry on 429, ≤1 req/s)

NFR-1 → Epic 3 — LCP < 2s (ISR + Server Components + Neon serverless)
NFR-2 → Epic 1+2 — Scrape Cycle < 15 min (timeout-minutes:14 + validate-workflows.yml)
NFR-3 → Epic 4 — ISR cache < 500ms (Drizzle direct, zero proxy)
NFR-4 → Epic 2 — ≥95% scrape reliability (scrape_runs + selector-health.yml)
NFR-5 → Epic 2 — Price data < 24h stale (30 min end-to-end pipeline)
NFR-6 → Epic 2 — Selector breakage < 24h (daily CI smoke test)
NFR-7 → Epic 2 — Structured scrape logs (scrape_runs table)
NFR-8 → Epic 2 — Operator alert at <80% baseline (db_health.py + GH Actions email)

## Epic List

### Epic 1: Project Foundation & Infrastructure (Sprint 0)

The development team has a fully initialized monorepo, connected external services, validated database schema, and all CI/CD workflows in place — with critical spike results (BGG token, GameUPC, preorder signal) that gate subsequent epics.

**FRs covered:** none directly — enables all subsequent epics
**Key deliverables:**

- Monorepo init (`create-next-app` + `uv` + Scrapy), public GitHub repo
- Neon PostgreSQL setup + Drizzle `schema.ts` (source of truth for both runtimes)
- GitHub Secrets + Vercel env vars
- GitHub Actions: `validate-workflows.yml`, `maintenance.yml`, `selector-health.yml` (skeleton)
- Tailwind 4.x CSS tokens from DESIGN.md, typography (`next/font/google`), global styles
- `CLAUDE.md` + `AGENTS.md`
- **Spike 1 (Day 1 gate):** BGG Bearer Token registration — hard blocker for Epic 2 dedup+enrichment and Epic 4
- **Spike 2:** GameUPC coverage test (20–30 Polish titles) — determines EAN dedup path viability
- **Spike 3:** Preorder signal audit per Store (3Trolle + AlePlanszowki HTML) — go/no-go gate for Epic 8

---

### Epic 2: Automated Price Data Collection

Price data flows automatically into the database: scrapers run daily, products are deduplicated to canonical games via BGG ID, BGG metadata is enriched, and operators are alerted to failures. No UI — data is queryable via DB.

**FRs covered:** FR-21, FR-22, FR-23, FR-24
**NFRs:** NFR-2, NFR-4, NFR-5, NFR-6, NFR-7, NFR-8
**Key deliverables:**

- `ThreeTrolleSpider` + `AlePlanszowkiSpider` (Scrapy)
- Pydantic validation pipeline + `parse_price()` utility
- Deduplication pipeline: EAN→GameUPC (if Spike 2 passes) + fuzzy name→BGG Search + operator queue
- BGG enrichment background job (`bgg_client.py` with retry/backoff, ≤1 req/s)
- `scraper.yml` GitHub Actions workflow (cron + alert check + Brevo + revalidate)
- `selector-health.yml` daily smoke test
- `scrape_runs` table observability + operator alert at <80% baseline
- **Risk note:** Polish title normalization for fuzzy matching (e.g. "Wsiąść do pociągu" vs "Ticket to Ride") must be handled explicitly in deduplication pipeline

---

### Epic 3: Hot Deals Feed — Core Discovery

Users can browse current board game deals from Polish stores on the homepage, filter by game type and player count, and switch between card and list views. This is the primary entry point and daily return habit driver.

**FRs covered:** FR-1, FR-2, FR-5, FR-6
**NFRs:** NFR-1
**UX-DRs:** UX-DR1 through UX-DR7, UX-DR13, UX-DR14, UX-DR15, UX-DR16, UX-DR17, UX-DR18
**Key deliverables:**

- `DealCard.tsx` (card view, 4-column grid, cardFadeIn animation, HOT sticker, discount badge)
- `FilterBar.tsx` (Client Component, URL params state, active tags, result count, view toggle)
- List row view (`fadeInUp` animation, hover lift)
- Filter system: Base Game/Expansion + player count (FR-5, FR-6)
- Sort dropdown (Rabat ↓, Cena rosnąco, Cena malejąco)
- Skeleton loading states (#DDD0BC + #EDE5D4 shimmer)
- Sticky 64px header + hamburger button
- Empty state (no filter results) + amber staleness banner (data > 12h)
- `hot-deals.ts` query
- **Dependency note:** Deal cards show game cover thumbnails from BGG (requires Epic 2 enrichment). Graceful degradation (colored gradient placeholder) required for games not yet enriched.

---

### Epic 4: Game Passport Core

Users can access a dedicated page for any game showing BGG metadata, cross-store price comparison table, DLC dependency warning, and a stable SEO-friendly URL — discoverable via Google through ISR-served pages.

**FRs covered:** FR-7, FR-8, FR-9, FR-20
**NFRs:** NFR-3
**UX-DRs:** UX-DR11, UX-DR12, UX-DR17, UX-DR18, UX-DR19
**Key deliverables:**

- `app/games/[slug]/page.tsx` (Server Component, ISR on-demand)
- `GamePassport.tsx` component (BGG metadata grid, hero layout 38%/62%)
- Price comparison table (`PriceTable`) — sorted by price, out-of-stock last, "Najtaniej" badge
- `DlcWarning.tsx` (amber gradient banner, 5px left border, Base Game link)
- Best Price Box (green background, Playfair Display 28px price)
- Breadcrumb bar (`← Wróć do okazji`)
- `/api/revalidate` route (POST, REVALIDATION_SECRET header)
- `game.ts` query (bgg_slug as canonical slug)
- `SchemaOrgOffer.tsx` data stub (structured data, populated in Epic 5)
- Accessibility: `aria-label` on search, semantic HTML, focus ring, alt text on covers
- `app/error.tsx` boundary + `notFound()` for missing games
- **ISR integration:** Scraper POSTs to `/api/revalidate` after each cycle (--retry 3, fallback TTL 2h)

---

### Epic 5: Price History Chart & SEO Architecture

Users can see the full price history for any game, validate that a deal is genuinely below market, and discover Game Passports via Google organic search. This completes the Game Passport experience.

**FRs covered:** FR-3, FR-4, FR-18, FR-19, FR-20 (SEO aspects)
**UX-DRs:** UX-DR8
**Key deliverables:**

- `PriceHistoryChart.tsx` — pure inline SVG (no library), ViewBox 0 0 860 280
  - Time range selector (1T/2T/1M/3M/6M) with unlock thresholds (7/14/30/90/180 days)
  - AlePlanszowki line `#3D5C3A` + 3Trolle line `#C4622D`
  - `stroke-dashoffset` draw animation 1.4s (0.3s + 0.5s delay per store)
  - Re-animates on range change; adaptive x-axis labels
  - Statistics section (Min / Śr. / Akt. scoped to selected range)
  - Empty state: `tooFewDataPoints: true` → "Dane historyczne pojawią się po pierwszym cyklu scrapowania"
  - Accessible table fallback (`aria-label` + visually-hidden `<table>`)
- `price-history.ts` query (returns `{ data, tooFewDataPoints }`)
- Per-game SEO: `<title>`, `<meta description>`, `SchemaOrgOffer` (AggregateOffer, PLN)
- `app/sitemap.ts` (regenerated within 24h of new Games, all Games with active Products)
- `app/robots.ts`
- **Risk note:** SVG chart is the most technically complex component in the project. Split into sub-tasks: (a) static chart render, (b) time range selector + re-animation, (c) accessible fallback.

---

### Epic 6: Email Price Alerts

Users can subscribe to price alerts for specific games using only their email address, receive RODO-compliant double opt-in confirmation, and unsubscribe with a single click. No account created at any point.

**FRs covered:** FR-10, FR-11, FR-12, FR-13
**UX-DRs:** UX-DR9
**Key deliverables:**

- `AlertSubscribeForm.tsx` (3-state modal: Form → Pending → Success)
  - Price threshold input + range slider (50 zł to current retail price)
  - Type B checkbox (default enabled), age checkbox (16+, not stored)
  - Focus trap, Escape key, `aria-modal="true"`, `role="dialog"`, `aria-labelledby`
  - Backdrop: `rgba(44,31,20,0.5)` + `backdrop-filter: blur(3px)`
- `/api/alerts/subscribe` (POST, Zod validation, ON CONFLICT upsert token)
- `/api/alerts/confirm/[token]` (POST, double opt-in)
- `/api/alerts/unsubscribe/[token]` (GET, email link)
- `app/alerty/potwierdz/[token]/page.tsx` (confirmation landing, shows Step 3 success state)
- `alert_engine.py` — Type A + B evaluation, Brevo send, runs after each scrape cycle
- `consent_log` + `email_suppressions` RODO tables (from schema.ts)
- `app/api/webhooks/brevo/route.ts` (HMAC-SHA256 verification, hard_bounce + complaint suppression)
- `tokens.ts` + `crypto.randomBytes(32)` opt-in tokens (48h expiry)
- **Type B alert thresholds: 50% / 70% / 80% below original price** — these values must be confirmed as acceptance criteria before story creation
- **Batch error handling:** infra errors abort batch (raise to GH Actions), per-item errors skip+log

---

### Epic 7: Flipper Mode

Resale-minded buyers can evaluate flip opportunities from a dedicated `/flipper` route showing Margin Proxy, 7-day sparklines, and trend indicators. Fully usable even without Allegro/OLX data — with an honest empty state when insufficient price history exists.

**FRs covered:** FR-16, FR-17
**UX-DRs:** UX-DR3 (soft badge variant), UX-DR10
**Key deliverables:**

- **Story 1 — Empty state & data guardrail first:** `FlipperTable.tsx` empty state when < 5 data points globally. Explicit message: "Dane historyczne zbierane od X dni. Margin Proxy dostępny za Y dni." Prevents bad first impression at launch.
- `app/flipper/page.tsx` (Server Component, sorted by Margin Proxy descending)
- `FlipperTable.tsx` — columns: Gra|Cena|Rabat|Śr. hist.|Margin Proxy|Trend|Akcja
  - Top-pick rows: `border-left: 3px solid #3D5C3A` (threshold: Margin Proxy > 30%)
  - Margin Proxy color coding: >30% green, 10–30% amber, <10% red; numeric + arrow (not color alone)
  - Soft badge variant for discount % (semi-transparent)
- `SparklineChart.tsx` — 62×26px inline SVG (green=falling, red=rising, amber=flat)
- Margin Proxy explainer card (collapsible, formula, Allegro/OLX caveat)
- `flipper.ts` query (Margin Proxy CTE)
- Flipper Mode button in header (outline → filled green when on /flipper)
- FR-17: Type B alert subscription from table row (pre-selects Type B, standard Double Opt-In)
- **Open decision (must resolve before story creation):** "top pick" threshold formalized as Margin Proxy > 30%

---

### Epic 8: Upcoming Releases & Availability Alerts

Users can discover games available for preorder and new releases, and subscribe to availability notifications. Gated by spike results from Epic 1.

**FRs covered:** FR-14, FR-15
**Key deliverables:**

- **Story 1 — Spike gate:** Evaluate preorder signal audit results from Epic 1 Spike 3. If signal reliable → proceed. If unreliable → redefine epic scope (e.g., "new releases last 30 days" without preorder signal) or defer to Phase 1.5.
- `app/upcoming/page.tsx` (Upcoming / Preorders section)
- `upcoming.ts` query (sorted by release date, unknown dates last)
- Availability alert subscription (reuses Double Opt-In mechanism from Epic 6: FR-15)
- **Assumption dependency:** A-4 (preorder signal reliability per Store) — if spike fails, epic scope changes significantly

---

## Epic 1: Project Foundation & Infrastructure (Sprint 0)

The development team has a fully initialized monorepo, connected external services, validated database schema, all CI/CD workflows in place, and critical spike results (BGG token, GameUPC, preorder signal) that gate subsequent epics.

**Parallel schedule:** After Story 1.1, Dev A and Dev B work in parallel with zero file conflicts.

| Story | Dev   | Zależność |
| ----- | ----- | --------- |
| 1.1   | Dev A | —         |
| 1.2   | Dev A | po 1.1    |
| 1.3   | Dev B | po 1.1    |
| 1.4   | Dev A | po 1.1    |
| 1.5   | Dev B | po 1.1    |
| 1.6   | Dev B | po 1.5    |
| 1.7   | Dev A | po 1.1    |
| 1.2b  | Dev B | po 1.2    |

---

### Story 1.1: Monorepo Initialization

**Dev: Dev A (Web)** _(Dev B reviewuje PR)_

As a **developer**,
I want the project monorepo initialized with Next.js web app, Python scraper directory, public GitHub repo, and project conventions documented,
So that both developers have a consistent, documented starting point and can branch off into parallel work immediately after.

**Acceptance Criteria:**

**Given** the root directory
**When** `npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir --no-import-alias` is run
**Then** `/web` contains a working Next.js 16 App Router project that passes `npm run build`
**And** `npm install drizzle-orm @neondatabase/serverless` and `npm install -D drizzle-kit` complete without error

**Given** the root directory
**When** `uv init scraper --python 3.11` and `uv add scrapy psycopg2-binary httpx python-dotenv` are run
**Then** `/scraper` contains a working Python 3.11 + Scrapy project with `uv.lock` committed

**Given** the GitHub repository
**When** created as public with `main` branch protection (requires PR + review)
**Then** GitHub Actions minutes are unlimited and the repo URL is recorded in `README.md`

**Given** `CLAUDE.md` and `AGENTS.md` in project root
**When** reviewed
**Then** they contain all naming conventions, anti-patterns, and enforcement rules from Architecture: `parse_price()`, `assertNever()`, `formatNull()`, `ApiResponse<T>`, domain-only component names, no inline DB queries, no-restricted-imports rule

**Given** `web/.eslintrc.json` configured with `no-restricted-imports` for `@/db/index`
**When** any file outside `db/queries/` attempts to import `db/index`
**Then** ESLint reports an error and CI fails

**Given** `.env.example` in both `/web` and `/scraper`
**When** reviewed
**Then** all required env vars are listed (`DATABASE_URL`, `BGG_API_TOKEN`, `BREVO_API_KEY`, `REVALIDATION_SECRET`, `BREVO_WEBHOOK_SECRET`) with placeholder values — no real secrets committed

---

### Story 1.2: Database Schema & Neon PostgreSQL Setup

**Dev: Dev A (Web)** — _pliki: `web/src/db/schema.ts`, `web/src/db/index.ts`, `db/migrations/`_

As a **developer**,
I want the complete Drizzle `schema.ts` created and Neon PostgreSQL connected with working migrations,
So that Dev B can immediately write matching Pydantic models and both devs share a typed data contract.

**Acceptance Criteria:**

**Given** `web/src/db/schema.ts`
**When** reviewed
**Then** it defines all tables: `stores`, `games`, `products`, `price_history`, `scrape_runs`, `price_alerts`, `email_suppressions`, `consent_log`, `data_retention_log` — all price columns use `NUMERIC(10,2)` (never `real`/`float`), all timestamps use `TIMESTAMPTZ`, `bgg_sync_status` uses `text.$type<'pending'|'synced'|'not_found'|'rate_limited'>().default('pending')`

**Given** `web/src/db/index.ts`
**When** reviewed
**Then** it uses `@neondatabase/serverless` per-request model with no persistent connection pool

**Given** `DATABASE_URL` in `.env.local`
**When** `npx drizzle-kit generate` then `npx drizzle-kit migrate` are run
**Then** all tables are created in Neon and `psql` inspection confirms correct column types and constraints

**Given** the `consent_log` table
**When** reviewed
**Then** `email_hash` is `text` (stores SHA-256, never raw email), `ip_hash` is nullable `text` (SHA-256 of IP, never raw IP; NULLed after 12 months), `action` supports exactly 6 values (`opt_in_requested`, `opt_in_confirmed`, `unsubscribed`, `suppressed`, `suppression_overridden`, `reactivated`), index exists on `(email_hash, created_at)`, table is marked append-only in `CLAUDE.md`

**Given** the `price_alerts` table
**When** reviewed
**Then** it has **both** `email` (`text`, raw — required to send the notification and for the suppression join in arch L-3) **and** `email_hash` (`text`, SHA-256(email) — used by the `(email_hash, game_id)` unique dedup index and by the consent_log 5-year retention guard in L-5); a unique constraint on `(email_hash, game_id)`; `status` is `text.$type<'pending_doi'|'active'|'cancelled'>()`; `confirmation_token` is UUID; `target_price` is `NUMERIC(10,2)`

**Given** the `email_suppressions` table
**When** reviewed
**Then** `email` is `text` stored **raw** (matched by the L-3 join; anonymized to SHA-256 only after 3 years per L-5), `reason` is `text.$type<'hard_bounce'|'complaint'|'user_request'|'global_optout'>()`, `is_anonymized` boolean defaults false

**Given** GitHub Secrets and Vercel env vars
**When** configured
**Then** `DATABASE_URL` exists in both with separate values (serverless driver for web, psycopg2 pool for scraper)

---

### Story 1.3: CI/CD Workflow Foundation

**Dev: Dev B (Scraper/Infra)** — _pliki: `.github/workflows/validate-workflows.yml`, `maintenance.yml`, `selector-health.yml`_

As a **developer**,
I want CI/CD workflows for YAML timeout linting, weekly data retention, and a selector health skeleton,
So that code quality and RODO data retention compliance are enforced automatically from day one.

**Acceptance Criteria:**

**Given** `.github/workflows/validate-workflows.yml`
**When** any PR is opened or pushed
**Then** it asserts `timeout-minutes ≤ 14` on all jobs in `scraper.yml` (NFR-2 enforcement); CI fails with descriptive error if violated
**And** the workflow itself completes in under 60 seconds with no external dependencies

**Given** `.github/workflows/maintenance.yml`
**When** triggered on `cron: '0 3 * * 0'` (Sunday 3am UTC)
**Then** it runs 4 ordered steps: (1) `SET ip_hash = NULL` in `consent_log` for records older than 12 months, (2) SHA-256 anonymization in `email_suppressions` for records older than 3 years, (3) `DELETE FROM scrape_runs` older than 90 days, (4) `DELETE FROM consent_log` older than 5 years **only where no `price_alerts` row with `status = 'active'` exists for that `email_hash`** (never delete proof of consent for an active subscriber)
**And** each step INSERTs a row into `data_retention_log` recording `run_at` and `rows_affected`
**And** workflow has `timeout-minutes: 10`

**Given** `.github/workflows/selector-health.yml`
**When** reviewed
**Then** it has `cron: '0 8 * * *'`, references `scraper/tests/test_live_selectors.py`, and contains a placeholder step — real test logic added in Epic 2

---

### Story 1.4: Design System Foundation

**Dev: Dev A (Web)** — _pliki: `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx`_
_(równolegle z 1.3)_

As a **developer**,
I want Tailwind CSS color tokens and typography configured from DESIGN.md,
So that all UI components can be built against a consistent visual language without local color or font decisions.

**Acceptance Criteria:**

**Given** `tailwind.config.ts`
**When** reviewed
**Then** all 16 color tokens from DESIGN.md are defined as CSS custom properties: `background` (#F2EAD8), `surface` (#DDD0BC), `surface-header` (#EDE5D4), `primary` (#3D5C3A), `primary-dark` (#2E4A2C), `text-primary` (#2C1F14), `text-secondary` (#6B5744), `text-muted` (#A89480), `border` (#D4C4AE), `border-strong` (#C5B49A), `badge-hot` (#C4622D), `badge-discount-low/mid/high`, `overlay`
**And** spacing (xs/sm/md/lg/xl/2xl), border-radius (sm/md/lg/xl/full), and warm-brown shadow helpers (`shadow-card`, `shadow-card-hover`, `shadow-modal`) are available as Tailwind utilities

**Given** `app/layout.tsx`
**When** configured
**Then** `next/font/google` loads Playfair Display (weights: 400, 700, 800) and DM Sans (weights: 400, 500, 700) as CSS variable fonts
**And** `<html lang="pl">` is set (UX-DR12 accessibility requirement)

**Given** `app/globals.css`
**When** reviewed
**Then** `body` has `background: var(--background)`, `color: var(--text-primary)`, `font-family: var(--font-dm-sans)`, `font-size: 15px`, `line-height: 1.5`
**And** `#FFFFFF` never appears as a background value

**Given** `localhost:3000` in browser
**When** the app opens
**Then** parchment (#F2EAD8) background and correct fonts are visible — no white background, no system fonts

---

### Story 1.5: BGG API Access Validation (Spike)

**Dev: Dev B (Scraper/Infra)** — _pliki: `scraper/utils/bgg_client.py`, `docs/spike-results/bgg-token.md`_
_(równolegle z 1.4)_

As a **developer**,
I want the BGG non-commercial Bearer Token registered and validated with real API requests,
So that Epic 2 deduplication/enrichment and Epic 4 Game Passport can proceed without the A-6 hard blocker.

**Acceptance Criteria:**

**Given** the BGG non-commercial API application
**When** submitted
**Then** it includes: project description, public GitHub URL, contact email, non-commercial statement — submission date recorded in `docs/spike-results/bgg-token.md`

**Given** Bearer Token received from BGG
**When** a test request hits BGG API (`/xmlapi2/thing?id=224517` — Brass Birmingham)
**Then** response contains `<name>`, `<minplayers>`, `<maxplayers>`, `<statistics>` without HTTP error

**Given** `scraper/utils/bgg_client.py` basic skeleton
**When** a single authenticated request is executed
**Then** result is returned without error, logged via `logging.getLogger(__name__)` — never `print()`

**Given** Bearer Token
**When** stored as `BGG_API_TOKEN`
**Then** it is present in GitHub Secrets and Vercel env vars — not committed to source code

**Given** spike results
**When** documented in `docs/spike-results/bgg-token.md`
**Then** it records: token obtained (yes/no), date, rate limit behavior observed, and explicit gate: "Epic 2 BGG stories: PROCEED / BLOCKED"

---

### Story 1.6: GameUPC Coverage Spike

**Dev: Dev B (Scraper/Infra)** — _pliki: `docs/spike-results/gameUPC-coverage.md`_
_(po 1.5)_

As a **developer**,
I want GameUPC API tested against 20–30 Polish board game EANs,
So that the deduplication pipeline in Epic 2 uses the correct primary path without building on an untested assumption.

**Acceptance Criteria:**

**Given** 20–30 Polish board game EANs collected from 3Trolle or AlePlanszowki product pages
**When** queried against GameUPC API
**Then** results show: total tested, matched count, not-found count, and 3+ example successful/failed lookups

**Given** coverage ≥ 50% of tested titles
**When** documented
**Then** decision recorded: "EAN→GameUPC path implemented as primary in Epic 2 Story 2.2"

**Given** coverage < 50%
**When** documented
**Then** decision recorded: "EAN path removed — fuzzy name→BGG Search is sole primary path in Epic 2 Story 2.2"

---

### Story 1.7: Store Preorder Signal Audit (Epic 8 Gate)

**Dev: Dev A (Web)** — _pliki: `docs/spike-results/preorder-signal-audit.md`_
_(równolegle z 1.5 i 1.6)_

As a **developer**,
I want both Store HTML structures audited for preorder and availability signals,
So that Epic 8 scope is confirmed or redefined before any implementation begins.

**Acceptance Criteria:**

**Given** 3Trolle and AlePlanszowki product listing pages (5+ products each, including known preorders)
**When** inspected in browser DevTools
**Then** `docs/spike-results/preorder-signal-audit.md` documents for each Store: HTML element/class/attribute for preorder status, HTML element for availability, and consistency rating across inspected pages

**Given** reliable signal on ≥ 1 Store
**When** documented
**Then** go/no-go: "GO — Epic 8 proceeds with preorder section for [Store], 'upcoming/last 30 days' for the other"

**Given** unreliable or absent signal on both Stores
**When** documented
**Then** go/no-go: "SCOPE CHANGE — Epic 8 = 'New Releases last 30 days only', no preorder subsection"
**And** scope change documented before Epic 8 story creation begins

---

### Story 1.2b: Pydantic Models Sync

**Dev: Dev B (Scraper)** — _pliki: `scraper/scraper/items.py`_
_(po Story 1.2)_

As a **developer**,
I want Pydantic models in the scraper to exactly match the Drizzle `schema.ts`,
So that the scraper can write to the database without type mismatches and the shared data contract is enforced.

**Acceptance Criteria:**

**Given** `schema.ts` completed in Story 1.2
**When** `scraper/scraper/items.py` is created
**Then** `ScrapedProduct` and `PriceRecord` Pydantic models match all field names, types, and nullability from `schema.ts` — every future `schema.ts` change requires a simultaneous update to this file in the same PR (L-1 sync rule)

**Given** `ScrapedProduct.price` and `ScrapedProduct.price_orig`
**When** typed
**Then** they use `Decimal` (from `decimal` module), never `float`

**Given** any timestamp field in `PriceRecord`
**When** set
**Then** it uses `datetime.now(timezone.utc)` — naive `datetime.now()` produces a Pydantic validation error

---

## Epic 2: Automated Price Data Collection

Price data flows automatically into the database: scrapers run daily, products are deduplicated to canonical games via BGG ID, BGG metadata is enriched, and operators are alerted to failures. No UI — data is queryable via DB.

**Dev B owns this entire epic. Dev A can start Epic 3 Stories 3.1–3.2 (static shell + DealCard with mock data) in parallel — zero file conflicts.**

| Story | Dev   | Zależność          | Pliki                                                                            |
| ----- | ----- | ------------------ | -------------------------------------------------------------------------------- |
| 2.1   | Dev B | po 1.2b            | `scraper/spiders/`, `utils/price_parser.py`, `pipelines/validation.py`           |
| 2.2   | Dev B | po 2.1 + 1.5 + 1.6 | `pipelines/deduplication.py`                                                     |
| 2.3   | Dev B | po 2.1             | `pipelines/database.py`                                                          |
| 2.4   | Dev B | po 2.2 + 1.5       | `utils/bgg_client.py` (kompletny)                                                |
| 2.5   | Dev B | po 2.3 + 2.4       | `.github/workflows/scraper.yml`, `utils/db_health.py`, `spiders/__manifest__.py` |
| 2.6   | Dev B | po 2.1             | `tests/test_live_selectors.py`, `selector-health.yml` (kompletny)                |

---

### Story 2.1: Scrapy Spiders — ThreeTrolleSpider & AlePlanszowkiSpider

**Dev: Dev B (Scraper)** — _pliki: `scraper/spiders/three_trolle.py`, `scraper/spiders/ale_planszowki.py`, `scraper/utils/price_parser.py`, `scraper/pipelines/validation.py`, `scraper/tests/test_three_trolle.py`, `scraper/tests/test_ale_planszowki.py`, `scraper/tests/test_price_parser.py`_

As a **developer**,
I want working Scrapy spiders for both v1 Stores that extract products and validate them with Pydantic,
So that the scraping pipeline has a reliable, tested data source before deduplication or enrichment is built.

**Acceptance Criteria:**

**Given** `ThreeTrolleSpider` and `AlePlanszowkiSpider`
**When** each spider runs against live Store pages
**Then** each scraped item contains: `store_sku`, `name`, `url`, `price` (Decimal or None), `price_orig` (Decimal or None), `in_stock` (bool), `ean` (str or None)
**And** items missing required fields are dropped with an `errback` log entry — no partial records written to DB

**Given** `scraper/utils/price_parser.py`
**When** `parse_price()` is called with: `"99,90 zł"`, `"99.90 zł"`, `"od 99 zł"`, `"0 zł"`, `""`, `None`
**Then** it returns correct `Decimal` values for valid inputs and `None` for empty/null inputs
**And** `test_price_parser.py` covers all these edge cases and passes

**Given** Scrapy settings in `settings.py`
**When** a spider runs
**Then** `DOWNLOAD_DELAY` respects the `Crawl-delay` from each Store's `robots.txt`, `USER_AGENT` contains a descriptive string naming the project (C-7), `ROBOTSTXT_OBEY = True`

**Given** the Pydantic validation pipeline (`validation.py`)
**When** a scraped item passes through
**Then** `price = None` results in `in_stock = False` on the item
**And** `price = Decimal("0.00")` is a valid value and is not filtered out

**Given** `test_three_trolle.py` and `test_ale_planszowki.py` run against fixture HTML
**When** executed
**Then** both pass, covering: price parsing, in_stock detection, EAN extraction, and missing-field handling

---

### Story 2.2: Product Deduplication Pipeline

**Dev: Dev B (Scraper)** — _pliki: `scraper/pipelines/deduplication.py`, `scraper/tests/test_deduplication.py`_
_(po 2.1, po wynikach Spike 1.5 i 1.6)_

As a **developer**,
I want scraped products automatically linked to canonical Games via BGG ID,
So that the same board game across multiple stores is recognised as one entity and BGG metadata can be fetched once.

**Acceptance Criteria:**

**Given** a scraped item with a valid EAN and GameUPC coverage = GO (from Spike 1.6)
**When** the deduplication pipeline runs
**Then** it queries GameUPC with the EAN and links the Product to the matching Game on success; on no-match it falls through to name fuzzy match

**Given** a scraped item going through name fuzzy match
**When** the deduplication pipeline normalises the Polish product name and queries BGG Search API
**Then** results with confidence ≥ 0.85 are auto-linked; results below threshold are queued (product stored with `bgg_id = NULL`, `bgg_sync_status = 'pending'`)
**And** Polish title normalization handles: edition suffixes, Polish/English title variants (e.g. "Wsiąść do pociągu" → "Ticket to Ride"), publisher prefixes

**Given** a product in the operator review queue
**When** deduplication completes
**Then** it is queryable via `SELECT * FROM products WHERE bgg_id IS NULL` — no hidden state

**Given** a BGG ID successfully assigned
**When** written to DB
**Then** `games` record is created/updated with `bgg_sync_status = 'pending'` and `bgg_slug` set from BGG canonical name

**Given** `test_deduplication.py` with fixture data
**When** run
**Then** covers: EAN match, name fuzzy match high confidence, name fuzzy match low confidence (→ queue), Polish-to-English title mapping

---

### Story 2.3: Price History Recording & Database Pipeline

**Dev: Dev B (Scraper)** — _pliki: `scraper/pipelines/database.py`, `scraper/tests/test_database_pipeline.py`_
_(po 2.1)_

As a **developer**,
I want each Scrape Cycle to append price records and log the cycle result,
So that Price History grows with every run and operators can monitor scraper health via `scrape_runs`.

**Acceptance Criteria:**

**Given** `pipelines/database.py` using psycopg2 connection pool
**When** configured
**Then** it uses a psycopg2 pool (limit: 5 connections), NOT the Neon serverless driver — separate from web's connection

**Given** a completed Scrape Cycle
**When** `database.py` writes results
**Then** one row is appended to `price_history` per product per cycle: `product_id`, `price`, `price_orig`, `in_stock`, `scraped_at` (UTC TIMESTAMPTZ via `datetime.now(timezone.utc)`)
**And** `price_history` is append-only — no UPDATE or DELETE on this table

**Given** a product absent in the current cycle but present in previous
**When** pipeline processes the current cycle
**Then** a `price_history` row is written with `in_stock = False` and `price = NULL` ("not seen" — FR-23)

**Given** a price change of 0.01 PLN
**When** compared to previous record
**Then** a new row is still written — no minimum change threshold

**Given** a completed Scrape Cycle
**When** `scrape_runs` is updated
**Then** row contains: `store_id`, `started_at`, `finished_at` (both UTC), `products_scraped` (int), `errors` (int), `status` ('success'/'partial'/'failed')

**Given** a DB insert error for a single product
**When** `database.py` handles it
**Then** it logs at ERROR level with `exc_info=True`, continues for remaining products, increments `scrape_runs.errors` — batch is not aborted

---

### Story 2.4: BGG Data Enrichment Background Job

**Dev: Dev B (Scraper)** — _pliki: `scraper/utils/bgg_client.py` (kompletny), `scraper/tests/test_bgg_client.py`_
_(po 2.2 + 1.5)_

As a **developer**,
I want a background BGG enrichment job that fetches and caches metadata for all matched games,
So that Game Passports have complete BGG data within 24 hours of a game being added.

**Acceptance Criteria:**

**Given** `bgg_client.py` processing games in sequence
**When** sending requests
**Then** requests are rate-limited to ≤ 1 request/second (FR-24)

**Given** a BGG API HTTP 429 or 202 response
**When** `bgg_client.py` handles it
**Then** it retries after 60s, 120s, 240s (exponential backoff); after 3 retries sets `bgg_sync_status = 'rate_limited'` and continues to next game

**Given** a BGG API HTTP 404
**When** handled
**Then** `bgg_sync_status = 'not_found'`, no retry, `name = "Nieznana gra"` (never NULL or empty string)

**Given** a successful BGG response
**When** the job processes it
**Then** all FR-7 fields are populated on the `games` record: `cover_image_url`, `name`, `designers`, `publishers`, `bgg_rank`, `bgg_category_rank`, `complexity`, `mechanics`, `min_players`, `max_players`, `min_playtime`, `max_playtime`, `min_age`, `rules_pdf_url` — missing fields stored as NULL
**And** `bgg_sync_status = 'synced'`, `bgg_synced_at` updated

**Given** a game with `bgg_synced_at` older than 30 days
**When** enrichment job runs
**Then** it re-fetches and updates the cached BGG data

**Given** `test_bgg_client.py` with mocked HTTP responses
**When** run
**Then** covers: successful fetch, HTTP 429 retry, HTTP 404 handling, rate limit enforcement, 30-day refresh trigger

---

### Story 2.5: Scraper GitHub Actions Workflow

**Dev: Dev B (Scraper/Infra)** — _pliki: `.github/workflows/scraper.yml`, `scraper/spiders/__manifest__.py`, `scraper/utils/db_health.py`_
_(po 2.3 + 2.4)_

As a **developer**,
I want the complete scraper GitHub Actions workflow running on a daily cron,
So that the full pipeline (scrape → enrich → health check → revalidate) runs automatically without intervention.

**Acceptance Criteria:**

**Given** `scraper.yml` triggered on `cron: '0 6 * * *'`
**When** it runs
**Then** it executes in order: (1) run all spiders from `__manifest__.py`, (2) BGG enrichment for pending games, (3) db_health check, (4) POST `/api/revalidate` with `--retry 3 --retry-delay 10 -f`, (5) placeholder step "alert engine: Epic 6"
**And** `timeout-minutes: 14` is set on the scraper job (validated by `validate-workflows.yml`)

**Given** `scraper/spiders/__manifest__.py` listing `['three_trolle', 'ale_planszowki']`
**When** the workflow iterates
**Then** it runs `scrapy crawl {spider}` for each entry — adding a new spider only requires adding its name to this file

**Given** POST to `/api/revalidate` when the ISR route doesn't yet exist (Epic 4 not shipped)
**When** the request fails
**Then** `|| echo "::warning::ISR revalidation failed"` logs a warning but does not fail the workflow

**Given** `db_health.py` called after each cycle
**When** `pg_database_size() > 400 MB`
**Then** it sends an operator alert email via Brevo and exits with non-zero code

**Given** a successful full workflow run
**When** inspected in GitHub Actions
**Then** it completes under 14 minutes for both stores combined (NFR-2)
**And** a `scrape_runs` row exists in Neon for each store

---

### Story 2.6: Operator Monitoring & Selector Health Tests

**Dev: Dev B (Scraper/Infra)** — _pliki: `scraper/tests/test_live_selectors.py`, `.github/workflows/selector-health.yml` (kompletny)_
_(po 2.1)_

As a **developer**,
I want daily live selector smoke tests and automated alerts for product count drops,
So that scraper breakage is caught within 24 hours and the operator is notified before users see stale data.

**Acceptance Criteria:**

**Given** `test_live_selectors.py` run in `selector-health.yml` (only scheduled CI, NOT per push)
**When** executed
**Then** it fetches 1 listing page per Store, runs spider CSS selectors against live HTML, asserts ≥ 1 product extracted with non-null `price`
**And** test failure → CI marks run as failed → GitHub Actions email to operator (NFR-6)

**Given** `selector-health.yml` completed
**When** running at `cron: '0 8 * * *'`
**Then** it only runs `test_live_selectors.py` (not full scraper) and completes under 3 minutes

**Given** a Scrape Cycle where a Store returns fewer products than 80% of its 7-day rolling average
**When** `db_health.py` computes the check
**Then** it sends an operator alert email: store name, current count, rolling average, percentage — within 1 hour (NFR-8)
**And** if fewer than 7 days of `scrape_runs` exist for a Store, the 80% check is skipped (insufficient baseline)

---

## Epic 3: Hot Deals Feed — Core Discovery

**Cel:** Użytkownicy mogą przeglądać aktualne okazje, filtrować po typie gry i liczbie graczy, przełączać widok kart/lista.
**FRs:** FR-1, FR-2, FR-5, FR-6 | **NFR:** NFR-1

**Podział:** Epic 3 to w całości Dev A. Dev B w tym czasie może zacząć fundament `alert_engine.py` (połączenie z Brevo, czytanie `price_alerts` z DB) jako przygotowanie do Epic 6 — zero konfliktu plików.

Stories 3.1 i 3.2 nie wymagają danych z Epic 2 — Dev A może je zacząć już w trakcie Epic 2 (mock data).

| Story | Dev   | Zależność | Mock data OK?    |
| ----- | ----- | --------- | ---------------- |
| 3.1   | Dev A | po 1.4    | ✅ tak           |
| 3.2   | Dev A | po 1.4    | ✅ tak           |
| 3.3   | Dev B | po Epic 2 | ❌ wymaga danych |
| 3.4   | Dev A | po 3.1    | ✅ tak           |
| 3.5   | Dev A | po 3.2    | ✅ tak           |
| 3.6   | Dev A | po 3.3    | ❌ wymaga danych |

---

### Story 3.1: Homepage Shell & Sticky Header

**Dev: Dev A (Web)** — _pliki: `app/page.tsx` (shell), `components/SiteHeader.tsx`, `components/SiteFooter.tsx`_
_(można zacząć podczas Epic 2)_

As a **user**,
I want to land on a page with a clear navigation header and consistent layout,
So that I can immediately orient myself and navigate to deals or Flipper Mode.

**Acceptance Criteria:**

**Given** `app/page.tsx` shell
**When** rendered
**Then** it shows the sticky 64px header with: logo (Playfair Display 20px 800w #3D5C3A left), centered search bar (max-width 440px, border-radius 24px, `aria-label="Szukaj gry"`), Flipper Mode button (outline style), hamburger button (38×38px, 3 lines)
**And** background is parchment `#F2EAD8` — never white

**Given** the sticky header
**When** user scrolls down
**Then** header remains fixed at top (`position: sticky; top: 0; z-index: 100`), background `#EDE5D4`, `border-bottom: 1px solid #D4C4AE`

**Given** the Flipper Mode button
**When** the current path is `/`
**Then** it renders in outline state: `border: 2px solid #3D5C3A`, transparent background, green text
**When** the current path is `/flipper`
**Then** it renders filled: `background: #3D5C3A`, white text

**Given** `app/layout.tsx`
**When** reviewed
**Then** it includes `<html lang="pl">`, loads Playfair Display + DM Sans via `next/font/google`, renders `<SiteHeader>` and `<SiteFooter>` wrapping `{children}`

**Given** `<SiteFooter>`
**When** rendered
**Then** it shows: logo mark, "Dane aktualizowane co 6h" freshness note, three tertiary links (O projekcie, API, Kontakt), copyright
**And** uses semantic `<nav>` for footer links, `<header>` for sticky header, `<main>` for page content

**Given** the search bar input in SiteHeader
**When** user types into it or submits
**Then** it is a non-functional placeholder in MVP — no search results, no navigation, no API call; the input renders with correct styling and `aria-label="Szukaj gry"` but does nothing on interaction (Gap #6 / Phase 2 feature)

**Given** the hamburger button (38×38px) in SiteHeader
**When** clicked on any viewport
**Then** it is a non-functional placeholder in MVP — renders correctly with 3 lines, but opens nothing; content and behavior are deferred to Phase 2 (UX-07)

---

### Story 3.2: DealCard Component — Card View

**Dev: Dev A (Web)** — _pliki: `components/DealCard.tsx`, `components/DealCard.test.tsx`, `lib/format.ts`, `lib/calc.ts`_
_(można zacząć podczas Epic 2, mock data OK)_

As a **user**,
I want each deal card to immediately show me the discount, price, and store at a glance,
So that I can decide at a glance whether a deal is worth clicking into.

**Acceptance Criteria:**

**Given** `DealCard` rendered with a game that has `price`, `price_orig`, `store_name`, `game_name`, `cover_image_url`
**When** displayed
**Then** it shows: 148px image area (gradient placeholder if no cover), HOT sticker (`rotate(-4deg)`, terracotta `#C4622D`) when discount > 40%, discount badge (value-driven color: <40% green, 40–70% amber, >70% red), game name (Playfair Display 16px 700w), current price, original price (muted strikethrough), store name (12px #6B5744), "Zobacz ofertę →" CTA button
**And** border-radius 12px, background `#DDD0BC`, warm brown shadow `0 2px 8px rgba(44,31,20,0.08)`

**Given** a card in the grid
**When** user hovers
**Then** card lifts `translateY(-3px)`, shadow deepens to `0 8px 28px rgba(44,31,20,0.16)` (220ms ease), HOT sticker enters `hotWiggle` keyframe animation (±1–2deg, 0.4s infinite alternate)

**Given** cards loading on page
**When** the feed renders
**Then** each card plays `cardFadeIn` (opacity 0→1, translateY 16px→0, 0.5s ease), staggered +70ms per card from 50ms base delay

**Given** a click anywhere on the card body
**When** fired
**Then** it navigates to `/gra/{slug}` — "Zobacz ofertę →" button click navigates to store URL in new tab and stops propagation

**Given** `lib/format.ts`
**When** `formatPrice(price)` is called
**Then** returns `"99 zł"` for whole numbers, `"99,90 zł"` for decimals — never "PLN", never prefix
**And** `formatNull(value)` returns `"—"` for null/undefined — never "N/A", never empty string

**Given** `lib/calc.ts`
**When** `calcDiscount(price, price_orig)` is called
**Then** returns rounded integer percentage matching `round((price_orig - price) / price_orig * 100)`

**Given** `DealCard.test.tsx`
**When** run
**Then** covers: correct discount badge color per value range, HOT sticker presence threshold, null price_orig → card excluded from feed (no render), formatPrice edge cases

---

### Story 3.3: Hot Deals Feed Query & Real Data Connection

**Dev: Dev B (Scraper/Infra)** — _pliki: `db/queries/hot-deals.ts`_
_(wymaga danych z Epic 2 — Dev A integruje wynik w `app/page.tsx` bez osobnej historyjki)_

As a **user**,
I want the homepage to show me real deals from Polish stores refreshed after each scrape cycle,
So that I always see current pricing and the page never feels stale.

**Acceptance Criteria:**

**Given** `db/queries/hot-deals.ts`
**When** `getHotDeals(limit = 40, filters?)` is called
**Then** it returns games where `(price_orig - price) / price_orig >= 0.15` from at least one active Store, sorted by discount percentage descending
**And** games with `price_orig = NULL` are excluded (cannot compute discount — FR-2)
**And** query is a Server Component direct Drizzle call — no inline query in `page.tsx` (ESLint enforces this)

**Given** the hot deals feed
**When** a Scrape Cycle completes and ISR revalidation fires
**Then** the page reflects updated data within 30 minutes (FR-1)
**And** fallback TTL is 2 hours (ADR-003)

**Given** `app/page.tsx` connected to real data
**When** rendered as Server Component
**Then** Lighthouse Performance score on `localhost` is ≥ 80, LCP < 2s on simulated 4G (NFR-1)

**Given** filter params `?type=base`, `?type=expansion`, `?players=2`
**When** `getHotDeals()` is called with filter args
**Then** `type=base` returns only games with `is_expansion = false`, `type=expansion` returns `is_expansion = true`, `players=2` returns games where `min_players ≤ 2 ≤ max_players`
**And** games with no BGG player count data are excluded from player filter results (FR-6)
**And** games with no BGG type data show with "typ nieznany" label when type filter is active (FR-5)

**Given** Dev A wires `getHotDeals()` into `app/page.tsx` (integration step — same story, no separate story)
**When** `page.tsx` is reviewed
**Then** it calls `getHotDeals(40, filtersFromSearchParams)` at the top of the Server Component, passes the resulting array to `DealGrid` / `DealList` (depending on `?view` param), and passes the count to `FilterBar` — no inline data transformation in `page.tsx` beyond passing props
**And** if `getHotDeals()` returns an empty array, `page.tsx` renders the empty state ("Brak okazji — wróć później") directly in `DealGrid` — not a separate error boundary

---

### Story 3.4: FilterBar, View Toggle & Sort

**Dev: Dev A (Web)** — _pliki: `components/FilterBar.tsx`, `components/FilterBar.test.tsx`_
_(po 3.1, można budować z mock data)_

As a **user**,
I want to filter deals by game type and player count, switch between card and list views, and sort results,
So that I can quickly narrow down to deals relevant to my situation.

**Acceptance Criteria:**

**Given** `FilterBar` as a Client Component
**When** rendered
**Then** it shows: "Filtry (n)" button (outline green, count bubble), active filter tags (removable with ×), result count `— N okazji`, view toggle (Karty / Lista), sort dropdown

**Given** an active filter (`?type=base&players=2` in URL)
**When** the page loads
**Then** FilterBar reads URL params and renders matching active filter tags — state lives entirely in URL, no localStorage (MVP)

**Given** user clicks × on an active filter tag
**When** fired
**Then** that specific filter is removed from URL params and the feed re-fetches with remaining filters applied

**Given** view toggle (Karty / Lista)
**When** user clicks "Lista"
**Then** URL updates to `?view=list`, active segment fills green (#3D5C3A), inactive segment transparent — no page reload, layout switches client-side

**Given** sort dropdown
**When** user selects "Cena rosnąco"
**Then** results re-order client-side without re-fetching — sort operates on already-loaded data

**Given** filter count bubble inside Filtry button
**When** 0 filters active
**Then** bubble is hidden; when ≥ 1 filter active, bubble shows count with green background

**Given** user clicks the "Filtry (n)" button in MVP
**When** no filter panel has been designed or mocked
**Then** the button is rendered but non-functional (no panel opens, no dropdown appears) — it visually indicates active filter count only; filter state in MVP is applied only by direct URL param manipulation or programmatic deep links; a functional panel is Phase 2 (UX-04)

**Given** `FilterBar.test.tsx`
**When** run
**Then** covers: URL param read/write on filter toggle, × remove behaviour, view toggle state, active count bubble display

---

### Story 3.5: List Row View & Stagger Animations

**Dev: Dev A (Web)** — _pliki: `components/ListRow.tsx`, `components/ListRow.test.tsx`, animacje w `app/globals.css`_
_(po 3.2)_

As a **user**,
I want a compact list view when I want to scan many deals quickly without the visual weight of cards,
So that I can efficiently browse and compare more deals per screen.

**Acceptance Criteria:**

**Given** `ListRow` rendered in list view (`?view=list`)
**When** displayed
**Then** it shows: 48×48px thumbnail (border-radius 8px), HOT pill (terracotta, `rotate(-2deg)`, 10px font, no shadow) when discount > 40%, game name (15px 700w), store chip (border-radius 20px), discount badge, price block (current + original), "Zobacz →" CTA button
**And** border-radius 10px on row, padding 12px 16px, gap 12px, background `#DDD0BC`, `border: 1px solid #D4C4AE`

**Given** the best-deal row (lowest price in list)
**When** rendered
**Then** it has `border-left: 3px solid #3D5C3A` — no other behavioural difference

**Given** user hovers a list row
**When** fired
**Then** row lifts `translateY(-1px)`, `box-shadow: 0 4px 16px rgba(44,31,20,0.13)` (150ms ease)

**Given** list rows loading
**When** the feed renders in list view
**Then** each row plays `fadeInUp` (opacity 0→1, translateY 10px→0, 0.35s ease), staggered +50ms per row

**Given** a click anywhere on the row except "Zobacz →" button
**When** fired
**Then** it navigates to `/gra/{slug}` — "Zobacz →" goes to store URL (new tab) and stops propagation

**Given** `globals.css`
**When** reviewed
**Then** it defines keyframes `cardFadeIn`, `fadeInUp`, `hotWiggle` — shared across all surfaces that need them

---

### Story 3.6: Skeleton Loading, Empty States & Staleness Banner

**Dev: Dev A (Web)** — _pliki: `components/DealCardSkeleton.tsx`, `components/ListRowSkeleton.tsx`, staleness logic w `app/page.tsx`_
_(po 3.3)_

As a **user**,
I want clear feedback when content is loading, filters return no results, or data might be stale,
So that I always understand the state of the page and what action I can take.

**Acceptance Criteria:**

**Given** the hot deals feed loading
**When** data is being fetched (streaming via React Suspense)
**Then** skeleton cards/rows appear: `#DDD0BC` base with `#EDE5D4` shimmer animation, matching card dimensions (148px image area, 12px border-radius) or row dimensions (48px thumbnail, 10px border-radius)

**Given** active filters that match zero games
**When** the feed renders
**Then** it shows the empty state: "Brak okazji spełniających filtry — spróbuj rozszerzyć kryteria" with a green "Wyczyść filtry" button
**And** clicking "Wyczyść filtry" removes all URL filter params and returns to full unfiltered feed

**Given** the last completed `scrape_runs` entry is older than 12 hours
**When** the homepage renders
**Then** an amber banner appears below the header: "Dane mogą być nieaktualne — ostatnia aktualizacja X temu"
**And** the banner uses amber `#C07B18` border, warm amber background, is dismissible (× button) and does not block feed content

**Given** a Server Component rendering
**When** a DB connection error occurs
**Then** `app/error.tsx` boundary catches it and renders a warm Polish error message with a "Spróbuj ponownie" link — not a generic Next.js error page

---

## Epic 4: Game Passport Core

**Cel:** Strona szczegółów gry pokazuje metadane z BGG, porównanie cen we wszystkich sklepach i najlepszą ofertę.
**FRs:** FR-7, FR-8, FR-9, FR-20 | **NFR:** NFR-3

**Podział:** Epic 4 to w całości Dev A. Dev B w tym czasie może zacząć budować `PriceHistoryCollector` — pipeline zapisujący `price_history` (needed for Epic 5) — zero konfliktu plików.

| Story | Dev   | Zależność             |
| ----- | ----- | --------------------- |
| 4.1   | Dev A | po 3.1                |
| 4.2   | Dev A | po 4.1                |
| 4.3   | Dev A | po 4.5                |
| 4.4   | Dev A | po 4.3                |
| 4.5   | Dev B | po Epic 2 (dane w DB) |
| 4.6   | Dev A | po 4.2 + 4.5          |

---

### Story 4.1: Game Passport Shell & Dynamic Routing

**Dev: Dev A (Web)** — _pliki: `app/gra/[slug]/page.tsx`, `app/gra/[slug]/loading.tsx`, `app/gra/[slug]/not-found.tsx`_

As a **user**,
I want clicking a game card or row to take me to a dedicated game page with a clear layout,
So that I can see all details about a specific game in one place.

**Acceptance Criteria:**

**Given** `app/gra/[slug]/page.tsx` as a Server Component
**When** user navigates to `/gra/catan`
**Then** Next.js resolves the slug via `params.slug`, fetches game data, and renders the Game Passport page
**And** the page title is `<game_name> — Ceny | Agregator Planszówek` (max 60 chars before pipe)

**Given** a slug that doesn't exist in the `games` table
**When** `getGameBySlug(slug)` returns null
**Then** Next.js renders `not-found.tsx`: warm 404 message "Nie znaleziono gry", "Wróć do okazji" link to `/`, no stack trace visible

**Given** `app/gra/[slug]/loading.tsx`
**When** page data is being fetched
**Then** skeleton of the Game Passport layout renders: 240×240px cover placeholder, two skeleton text lines (title + subtitle), 3 skeleton table rows — matching final layout dimensions

**Given** `generateStaticParams()` in `page.tsx`
**When** build runs
**Then** it pre-generates slugs for all games with at least one active product — avoids cold-start on popular game pages (NFR-3)

**Given** the page breadcrumb
**When** rendered
**Then** it shows: `Okazje > <game_name>` — "Okazje" links to `/`, semantic `<nav aria-label="Breadcrumb">` with `<ol>` and structured data

**Given** `app/api/revalidate/route.ts`
**When** `POST /api/revalidate` is called with `Authorization: Bearer <REVALIDATION_SECRET>` header
**Then** it calls `revalidatePath('/gra/[slug]')` and `revalidatePath('/')`, returns `200 { revalidated: true }`
**And** requests without matching secret return `401` — token validated with `timingSafeEqual` (no timing attack)
**And** scraper.yml calls this endpoint with `--retry 3` after each Scrape Cycle — fallback TTL remains 2h per ADR-003 (FR-20)

---

### Story 4.2: GameMeta Panel — BGG Metadata Display

**Dev: Dev A (Web)** — _pliki: `components/GameMeta.tsx`, `components/GameMeta.test.tsx`_

As a **user**,
I want to see key game information (publisher, players, playtime, BGG rating) alongside prices,
So that I can decide if a game is right for me without leaving the page.

**Acceptance Criteria:**

**Given** `GameMeta` with a game that has full BGG data
**When** rendered
**Then** it shows: cover image (240×240px desktop, 120×120px mobile, `object-fit: cover`, `border-radius: 12px`), game name (Playfair Display 24px 800w `#2C1F14`), publisher + year in muted row, player count range (e.g. "2–4 graczy"), playtime (e.g. "60–120 min"), BGG rating (amber star icon + value to 1 decimal, e.g. "7.8"), BGG complexity label if available
**And** all data uses `formatNull()` — any missing field shows "—", never blank

**Given** a game with `cover_image_url = null`
**When** rendered
**Then** a warm gradient placeholder fills the image area — same dimensions, `aria-hidden="true"`

**Given** the BGG rating value
**When** `bgg_avg_rating` is null
**Then** the entire rating row is replaced with "Brak oceny BGG" in muted text — no star icon, no "—/10"

**Given** `is_expansion = true` on the game
**When** rendered
**Then** an "DODATEK" badge appears under the game title (outline style, small, `#6B5744` color) — FR-5 surfacing at detail level

**Given** a game with full BGG data
**When** rendered
**Then** it also shows: designers list (comma-separated, `formatNull()` if empty), BGG Overall Rank (e.g. "#42"), BGG Category Rank if present (e.g. "Strategiczne #5"), mechanics tags (chips, max 5 visible + "i X więcej" overflow), minimum age (e.g. "od 12 lat"), rules PDF link ("Zasady PDF →", `target="_blank"`) if `rules_pdf_url` present
**And** all these fields use `formatNull()` — null or empty array renders "—"

**Given** `GameMeta.test.tsx`
**When** run
**Then** covers: null cover fallback, null rating display, expansion badge visibility, formatNull applied to all nullable fields, mechanics tag overflow at 5+, null designers renders "—"

---

### Story 4.3: PriceTable — Multi-Store Price Comparison

**Dev: Dev A (Web)** — _pliki: `components/PriceTable.tsx`, `components/PriceTable.test.tsx`_

As a **user**,
I want to see all stores offering this game with their current prices in one table,
So that I can compare prices and choose where to buy.

**Acceptance Criteria:**

**Given** `PriceTable` with products from multiple stores
**When** rendered
**Then** it shows a table with columns: Sklep (store name + logo 24px), Cena (current price), Cena oryginalna (strikethrough if present), Rabat (% badge), Dostępność (stock status), Akcja ("Kup →" button)
**And** rows sorted by current price ascending (cheapest first)

**Given** the cheapest row
**When** rendered
**Then** it has `border-left: 3px solid #3D5C3A` and a "NAJTANIEJ" chip in the Sklep cell — green outline chip, 10px font

**Given** a product with `in_stock = false`
**When** rendered
**Then** the row is visually dimmed (`opacity: 0.55`), "Kup →" button is replaced with "Niedostępny" in muted text, row sorted last regardless of price

**Given** a product with `discount_pct >= 40`
**When** rendered
**Then** the Rabat cell shows the badge in amber/red (same color thresholds as DealCard), not just plain text

**Given** the "Kup →" button
**When** clicked
**Then** it opens `product.affiliate_url ?? product.product_url` in a new tab — `rel="noopener noreferrer"`, `target="_blank"`

**Given** only one store has the game in stock and it's unavailable
**When** rendered
**Then** table still renders that row with "Niedostępny" state — table is never empty on a valid Game Passport page

**Given** `PriceTable.test.tsx`
**When** run
**Then** covers: cheapest-row highlight, out-of-stock dimming and sorting, single-row table (no crash), "NAJTANIEJ" chip visibility, external link attributes

---

### Story 4.4: Best Deal Banner

**Dev: Dev A (Web)** — _pliki: `components/BestDealBanner.tsx`_

As a **user**,
I want to immediately see the best available deal at the top of the game page,
So that I can click through to buy without scanning the entire price table.

**Acceptance Criteria:**

**Given** `BestDealBanner` with the best in-stock product
**When** rendered
**Then** it shows: store logo (32px), store name, current price (Playfair Display 28px 800w `#3D5C3A`), original price (muted strikethrough), discount badge, "Kup za <price> w <store> →" CTA button (full-width on mobile, inline on desktop)
**And** banner background `#DDD0BC`, border-radius 12px, green left accent bar 4px wide

**Given** all products for a game are `in_stock = false`
**When** rendered
**Then** banner shows the cheapest product in dimmed state with "Aktualnie niedostępne — sprawdź sklepy poniżej" label and no CTA button

**Given** the CTA button
**When** clicked
**Then** it opens `product.affiliate_url ?? product.product_url` in a new tab with `rel="noopener noreferrer"` — same logic as PriceTable

**Given** `BestDealBanner` on mobile (viewport ≤ 768px)
**When** rendered
**Then** it stacks vertically: price above store name, CTA button full-width below — no horizontal overflow

---

### Story 4.5: Game Passport DB Queries

**Dev: Dev B (Scraper/Infra)** — _pliki: `db/queries/game-passport.ts`_
_(wymaga danych z Epic 2)_

As a **developer**,
I want a single query module for the Game Passport page that fetches all needed data efficiently,
So that the page makes minimal round-trips to the database.

**Acceptance Criteria:**

**Given** `getGameBySlug(slug: string)`
**When** called
**Then** it returns a single object with: game row (all columns), all products with current price and store name, best in-stock product (pre-computed), and `null` if no game matches the slug

**Given** the query
**When** a game has products across 5 stores
**Then** it executes at most 2 DB round-trips (game + products join) — not N+1 per store

**Given** a game with no products (no active listings)
**When** `getGameBySlug` is called
**Then** it returns the game data with `products: []` — Game Passport renders with "Brak aktywnych ofert" notice rather than 404

**Given** `generateStaticParams()` in `app/gra/[slug]/page.tsx`
**When** build runs
**Then** it calls `getAllGameSlugs()` from this module — exported as a named function alongside `getGameBySlug`

**Given** all numeric prices from the query
**When** returned as JSON
**Then** they are strings (e.g. `"89.99"`) — never `float` — matching the architecture's Decimal→string→formatPrice() pipeline

---

### Story 4.6: DLC Dependency Warning

**Dev: Dev A (Web)** — _pliki: `components/DlcWarning.tsx`_
_(po 4.2 + 4.5 — wymaga `base_game` danych z query Dev B)_

As a **user**,
I want to see a clear warning when a game is an expansion that requires a base game,
So that I don't accidentally buy an expansion without knowing I need the base game first.

**Acceptance Criteria:**

**Given** a Game Passport page for a game with `is_expansion = true` and a resolvable BGG parent
**When** rendered
**Then** `DlcWarning` banner appears directly below the `GameMeta` panel: amber gradient background `linear-gradient(135deg, #F5E6C8, #EDD89C)`, `border: 1.5px solid #C07B18`, `border-left: 5px solid #C07B18`, border-radius 10px, padding 14px 20px, text `#3D2A08`
**And** banner text: "Ten dodatek wymaga: **[Base Game Name]**" with current lowest base game price ("Cena od X zł") and "Zobacz grę bazową →" link to `/gra/[base_game_slug]`

**Given** a Game Passport page for a game with `is_expansion = true` but no resolvable BGG parent (orphan expansion)
**When** rendered
**Then** `DlcWarning` is not rendered — no banner, no empty space (FR-9 specifies "resolvable BGG parent" only)

**Given** a Game Passport page for a game with `is_expansion = false`
**When** rendered
**Then** `DlcWarning` is not rendered at all

**Given** a Game Passport page for an expansion whose resolvable base game exists in BGG but has no scraped Products (`current_min_price = null`)
**When** rendered
**Then** `DlcWarning` banner is still shown with the base game name and "Zobacz grę bazową →" link, but the price line is replaced with: "Brak ofert w sklepach — sprawdź BGG →" linking to the base game's BGG page (FR-9: "shows name and BGG link with note")
**And** `DlcWarning` receives `base_game: { name, slug, current_min_price: null, bgg_id }` — component handles null price without crashing

**Given** `getGameBySlug()` query (Story 4.5, Dev B)
**When** game is an expansion with resolvable parent
**Then** query returns `base_game: { name, slug, current_min_price }` — `DlcWarning` receives this as props, no second round-trip

---

## Epic 5: Price History Chart & SEO

**Cel:** Wykres historii cen z selekcją zakresu czasu na stronie gry + kompletne SEO (OG, JSON-LD, canonical).
**FRs:** FR-3, FR-4, FR-18, FR-19

**Podział:** Epic 5 — Dev B dostaje warstwę danych (5.1: query + API route), Dev A dostaje warstwę prezentacji (5.2, 5.3, 5.4, 5.5). Dev B w tym czasie buduje też `alert_engine.py` + Brevo (Epic 6 prep).

Story 5.2 można zacząć z mock data równolegle z 5.1. Story 5.3 wymaga gotowego 5.1 (Dev B).

| Story | Dev   | Zależność    | Mock data OK?     |
| ----- | ----- | ------------ | ----------------- |
| 5.1   | Dev B | po 4.5       | ❌ potrzebne dane |
| 5.2   | Dev A | po 4.1       | ✅ tak            |
| 5.3   | Dev A | po 5.1 + 5.2 | ❌ wymaga danych  |
| 5.4   | Dev A | po 4.1       | ✅ tak            |
| 5.5   | Dev A | po 4.1       | ✅ tak            |
| 5.6   | Dev A | po 4.1       | ✅ tak            |

---

### Story 5.1: Price History DB Query

**Dev: Dev B (Scraper/Infra)** — _pliki: `db/queries/price-history.ts`, `app/api/price-history/route.ts`_
_(wymaga `price_history` wypełnionego przez Dev B podczas Epic 4)_

As a **developer**,
I want a query that returns price history data shaped for the chart component,
So that the chart renders cleanly without data-massaging logic scattered in components.

**Acceptance Criteria:**

**Given** `getPriceHistory(gameId: number, range: '1T' | '2T' | '1M' | '3M' | '6M')`
**When** called
**Then** it returns an array of `{ date: string, storeId: number, storeName: string, price: string }` rows for the given game, filtered to the selected time window
**And** rows are sorted by `scraped_at` ascending — oldest first, newest last
**And** each `price` is a string (e.g. `"89.99"`) — Decimal → string in query, never float

**Given** `range = '1T'`
**When** called
**Then** it filters `price_history.scraped_at >= NOW() - INTERVAL '7 days'`
**And** `'2T'` → 14 days, `'1M'` → 30 days, `'3M'` → 90 days, `'6M'` → 180 days

**Given** a game with no price history entries yet
**When** called
**Then** it returns `[]` — chart will render empty state, not crash

**Given** the query result
**When** a game has 3 stores each scraped daily for 30 days
**Then** query executes in a single round-trip — no N+1 per store

---

### Story 5.2: PriceChart Component — Visual Shell

**Dev: Dev A (Web)** — _pliki: `components/PriceChart.tsx`, `components/PriceChart.test.tsx`, `components/TimeRangeSelector.tsx`_
_(można zacząć podczas Story 5.1, mock data OK)_

As a **user**,
I want to see a clear line chart of price changes over time with a time range selector,
So that I can understand if now is a good time to buy or if I should wait.

**Acceptance Criteria:**

**Given** `PriceChart` rendered with mock data
**When** displayed
**Then** it shows a multi-line SVG chart: one line per store (distinct warm palette per line — `#3D5C3A`, `#C4622D`, `#C07B18`, `#6B5744`…), Y axis showing price range with `formatPrice()` labels, X axis showing dates, chart area background `#F2EAD8`, grid lines `#D4C4AE` at 20% opacity

**Given** the chart
**When** viewport ≤ 768px (mobile)
**Then** chart is 100% width, 220px height, X axis labels show only month abbreviations (e.g. "Sty", "Lut")
**When** viewport > 768px (desktop)
**Then** chart is 100% width, 280px height, X axis labels show full dates

**Given** a chart data point
**When** user hovers (desktop) or taps (mobile)
**Then** a tooltip appears showing: date, store name, price formatted as `formatPrice()` — tooltip background `#DDD0BC`, border-radius 8px, warm shadow
**And** tooltip never overflows viewport edges (clamped horizontally)

**Given** a store line in the legend
**When** user clicks it
**Then** that store's line toggles visibility — legend label dims when hidden, line disappears from chart
**And** at least one line always remains visible (last visible line click is no-op)

**Given** `TimeRangeSelector` component
**When** rendered
**Then** it shows five pill buttons: 1T | 2T | 1M | 3M | 6M — active pill fills `#3D5C3A` with white text, inactive transparent with border
**And** it is a Client Component (handles click state)

**Given** a range button whose unlock threshold has not been met
**When** rendered
**Then** the button is visually disabled: `color: #A89480`, `border: 1px solid #E0D5C5`, cursor `not-allowed`; on hover shows tooltip "Dostępne za X dni"
**And** unlock thresholds: 1T requires ≥ 7 days of data, 2T ≥ 14 days, 1M ≥ 30 days, 3M ≥ 90 days, 6M ≥ 180 days

**Given** the statistics section below the chart (FR-4)
**When** rendered
**Then** it shows three stat blocks scoped to the selected time range: "Najniższa" (historical min price + date), "Średnia 30d" (30-day average or "—" if < 7 data points in window), "Aktualna" (current lowest in-stock price)
**And** stat values use `formatPrice()`, dates use `formatTimestamp()` relative format (e.g. "12 cze 2025")
**And** "Średnia 30d" label is omitted (not shown as "—") when selected range is 1M and fewer than 7 data points exist in window (FR-4)

**Given** `PriceChart.test.tsx`
**When** run
**Then** covers: empty data → empty state renders (not crash), single data point → chart renders without error, legend toggle behaviour, formatPrice applied to all Y-axis labels

---

### Story 5.3: PriceChart Connected to Real Data

**Dev: Dev A (Web)** — _pliki: `app/gra/[slug]/page.tsx` (dodanie sekcji wykresu), `components/PriceChart.tsx` (integracja)_
_(wymaga 5.1 Dev B + 5.2 — `app/api/price-history/route.ts` jest gotowy z Story 5.1)_

As a **user**,
I want the price chart to show real historical prices that update after each scrape cycle,
So that the price trends I see are accurate and current.

**Acceptance Criteria:**

**Given** the Game Passport page
**When** rendered as Server Component
**Then** price history data is fetched server-side via `getPriceHistory(gameId, '3M')` (default range) and passed as props to `<PriceChart>`

**Given** user selects "6M" in `TimeRangeSelector`
**When** fired
**Then** `PriceChart` re-fetches data for the 6-month range — this is a Client Component interaction; data is fetched via `fetch('/api/price-history?gameId=X&range=6M')`
**And** `app/api/price-history/route.ts` handles the request, calls `getPriceHistory()`, returns JSON
**And** loading state shows a skeleton/spinner inside the chart area — not the full page skeleton

**Given** a game with `< 2` price history data points in the selected range
**When** rendered
**Then** the chart area shows: "Za mało danych dla wybranego zakresu — wybierz dłuższy okres" with `TimeRangeSelector` still active
**And** no broken/empty SVG is rendered

**Given** a Scrape Cycle completes and ISR revalidation fires
**When** user reloads the Game Passport page
**Then** chart reflects data up to the last scrape cycle — max staleness 2h (ADR-003 fallback TTL)

---

### Story 5.4: SEO Meta Tags — Open Graph & Canonical

**Dev: Dev A (Web)** — _pliki: `app/gra/[slug]/page.tsx` (metadata export), `app/page.tsx` (metadata export), `app/opengraph-image.tsx`_
_(po 4.1, można zacząć z danymi z 4.5)_

As a **product owner**,
I want game pages and the homepage to have correct Open Graph and canonical meta tags,
So that links shared on social media show rich previews and search engines index pages correctly.

**Acceptance Criteria:**

**Given** `generateMetadata()` in `app/gra/[slug]/page.tsx`
**When** called for a game with full data
**Then** it exports: `title: "<game_name> — najlepsza cena | Agregator Planszówek"`, `description: "<game_description_truncated_to_155_chars>"`, `openGraph.title`, `openGraph.description`, `openGraph.image` (cover URL or OG fallback), `openGraph.type: "website"`, `openGraph.locale: "pl_PL"`, `canonical` URL

**Given** `generateMetadata()` in `app/page.tsx`
**When** called
**Then** it exports homepage title, description, OG image (`/opengraph-image.png`), `robots: { index: true, follow: true }`

**Given** `app/opengraph-image.tsx` (Next.js Image Response)
**When** `/opengraph-image.png` is requested
**Then** it renders a 1200×630px image: parchment background `#F2EAD8`, logo text "Agregator Planszówek" (Playfair Display 48px `#3D5C3A`), tagline "Porównaj ceny planszówek" (DM Sans 24px `#6B5744`)

**Given** a game with `cover_image_url = null`
**When** `generateMetadata()` is called
**Then** `openGraph.image` falls back to `/opengraph-image.png` — never null, never missing

**Given** the canonical URL
**When** the page has no query params
**Then** canonical is `https://agregatorplanszowek.pl/gra/<slug>` — no trailing slash, no query params in canonical

---

### Story 5.5: JSON-LD Structured Data

**Dev: Dev A (Web)** — _pliki: `components/GameJsonLd.tsx`, `components/OfferJsonLd.tsx`_
_(po 4.1)_

As a **product owner**,
I want game pages to include structured data for search engines,
So that Google can show rich results (product prices, ratings) for our game pages.

**Acceptance Criteria:**

**Given** `GameJsonLd` rendered in `app/gra/[slug]/page.tsx`
**When** inspected in page source
**Then** it outputs a `<script type="application/ld+json">` block with `@type: "Product"` schema: `name`, `description`, `image`, `brand` (publisher), `aggregateRating` (from BGG rating if present)

**Given** `OfferJsonLd` rendered alongside `GameJsonLd`
**When** inspected
**Then** it outputs `offers` array: one `@type: "Offer"` per in-stock product with `price` (numeric string), `priceCurrency: "PLN"`, `availability: "https://schema.org/InStock"`, `seller.name` (store name), `url` (product URL)

**Given** a product with `in_stock = false`
**When** included in `OfferJsonLd`
**Then** its `availability` is `"https://schema.org/OutOfStock"` — still included in offers array, not omitted

**Given** `bgg_avg_rating = null`
**When** `GameJsonLd` renders
**Then** `aggregateRating` is omitted from the JSON-LD entirely — no null value, no "0" — invalid structured data is worse than no structured data

**Given** all JSON-LD components
**When** validated via Google's Rich Results Test
**Then** no errors, max 0 warnings for required fields

---

### Story 5.6: Sitemap & robots.txt

**Dev: Dev A (Web)** — _pliki: `app/sitemap.ts`, `app/robots.ts`_
_(po 4.1 — można zacząć z mock data)_

As a **product owner**,
I want all game pages indexed in /sitemap.xml and robots.txt to guide crawlers correctly,
So that Google can discover and index all Game Passports without configuration gaps.

**Acceptance Criteria:**

**Given** `app/sitemap.ts` (Next.js Metadata API)
**When** `/sitemap.xml` is requested
**Then** it returns a valid XML sitemap containing one `<url>` per game that has at least one active product
**And** each entry includes: `<loc>https://agregatorplanszowek.pl/gra/{slug}</loc>`, `<lastmod>` from last `scrape_runs` timestamp for that game, `<changefreq>daily</changefreq>`, `<priority>0.8</priority>`

**Given** a new game is added and its first product scraped
**When** the next ISR revalidation fires
**Then** the sitemap includes that game's URL within 24 hours — no manual rebuild required (FR-19)

**Given** `app/robots.ts`
**When** `/robots.txt` is requested
**Then** it returns: `User-agent: *`, `Allow: /`, `Disallow: /api/`, `Sitemap: https://agregatorplanszowek.pl/sitemap.xml`

**Given** the homepage at `/`
**When** it adds a link element
**Then** `<link rel="sitemap" type="application/xml" href="/sitemap.xml">` is present in `<head>` — auto-discovery for crawlers

---

## Epic 6: Email Price Alerts

**Cel:** Użytkownicy mogą ustawić powiadomienia cenowe per gra, system wysyła Double Opt-In i powiadomienia o spadku ceny przez Brevo — zgodnie z RODO/PKE 2024.
**FRs:** FR-10, FR-11, FR-12, FR-13

**Podział:** Epic 6 — dwa równoległe tory. Dev A: UI form (6.1 część) + confirmation flow (6.2, 6.3). Dev B: API/DB layer (6.1 część) + Brevo client + alert engine (6.4, 6.5, 6.6). Story 6.1 jest podzielona — oboje pracują jednocześnie na różnych plikach.

| Story | Dev           | Zależność                     |
| ----- | ------------- | ----------------------------- |
| 6.1   | Dev A + Dev B | po 4.4                        |
| 6.2   | Dev A         | po 6.1                        |
| 6.3   | Dev A         | po 6.1                        |
| 6.4   | Dev B         | (można zacząć podczas Epic 5) |
| 6.5   | Dev B         | po 6.4                        |
| 6.6   | Dev B         | po 6.5                        |
| 6.7   | Dev B         | po 6.5                        |
| 6.8   | Dev A         | po 6.3                        |
| 6.9   | Dev A         | przed pierwszą subskrypcją (gate launch) |

**Tor Dev A** (6.1 AlertForm → 6.2 → 6.3) i **Tor Dev B** (6.1 API+DB równolegle, potem 6.4 → 6.5 → 6.6) — łączą się w 6.5 (alert engine wywołuje Brevo client).

---

### Story 6.1: AlertForm & POST /api/alerts — Zapis Powiadomienia

**Dev: Dev A + Dev B (równolegle)** — _Dev A: `components/AlertForm.tsx` | Dev B: `app/api/alerts/route.ts`, `db/queries/alerts.ts`_

As a **user**,
I want to set up a price alert for a specific game by entering my email and target price,
So that I'll be notified when the price drops to a level I'm willing to pay.

**Acceptance Criteria:**

**Given** "Ustaw alert" button on the Game Passport page
**When** user clicks it
**Then** `AlertModal` opens as an overlay: width 368px, border-radius 16px, backdrop `rgba(44,31,20,0.5)` + `backdrop-filter: blur(3px)`, `aria-modal="true"`, `role="dialog"`, `aria-labelledby` pointing to modal title — implements UX-DR9
**And** keyboard focus is trapped within modal (Tab/Shift+Tab cycles through focusable elements only)
**And** pressing Escape closes the modal without submitting

**Given** `AlertModal` open (State 1 — Form)
**When** displayed
**Then** it shows: email input (`type="email"`, placeholder "twój@email.pl"), price threshold input (`type="number"`, suffix "zł", range slider 50 zł → current retail price), Type B checkbox ("Powiadamiaj też o przecenach > 50%" — default checked), age checkbox ("Mam ukończone 16 lat" — required; submission rejected if unchecked; attestation evidenced by the resulting `consent_log` opt_in_requested row — no separate flag stored), "Powiadom mnie" CTA button
**And** RODO consent checkbox: "Wyrażam zgodę na przetwarzanie adresu e-mail w celu wysyłki powiadomienia o cenie" — required, not pre-checked (PKE 2024)

**Given** user submits the form with valid email, price, and checked consent
**When** `POST /api/alerts` fires
**Then** the API: validates email format, validates price > 0, validates that both the consent checkbox and the 16+ age checkbox were checked (submission rejected with 400 if either is missing — the resulting `consent_log` row is the durable proof both attestations passed), checks `email_suppressions` for global opt-out (if present → return 200 with generic "sprawdź skrzynkę" message — no info leak), inserts `price_alerts` row with `status = 'pending_doi'`, inserts `consent_log` row with `SHA-256(email)`, `action = 'opt_in_requested'`, `ip_hash = SHA-256(ip)`, `timestamp`, then calls Brevo to send the DOI email **and awaits the result**; on send failure the row stays `status = 'pending_doi'`, an operator-visible error is logged (email never in plaintext — only `SHA-256(email)[:8]`), and the API still returns the same generic 200 (no enumeration)
**And** API returns `200 { message: "Sprawdź skrzynkę i potwierdź otrzymywanie powiadomień" }` — identical message regardless of email_suppressions hit

**Given** user submits with invalid email
**When** `POST /api/alerts` fires
**Then** API returns `400 { error: "Nieprawidłowy adres e-mail" }`, no DB writes, no Brevo call

**Given** a user who already has an active alert for the same game at a different threshold
**When** `POST /api/alerts` fires
**Then** API updates `target_price` on existing row and re-sends DOI email — no duplicate rows per (email_hash, game_id)

**Given** `AlertModal` after successful submit (State 2 — Pending DOI)
**When** API returns 200
**Then** modal transitions to State 2: "Sprawdź skrzynkę i potwierdź otrzymywanie powiadomień", 48h validity notice, "Sprawdź folder SPAM" prompt, resend link placeholder — form inputs hidden

**Given** `AlertModal` after DOI confirmed (State 3 — Success, optional redirect from `/alerts/confirmed`)
**When** user returns from confirmation link
**Then** modal shows State 3: green checkmark circle animation, "Powiadomienie aktywne!", summary card showing game name + "Twój cel: X zł" + "AKTYWNY" badge

---

### Story 6.2: Double Opt-In Confirmation — GET /api/alerts/confirm

**Dev: Dev A (Web)** — _pliki: `app/api/alerts/confirm/route.ts`, `app/alerts/confirmed/page.tsx`, `app/alerts/expired/page.tsx`_

As a **user**,
I want clicking the confirmation link in my email to activate my price alert,
So that I'm sure I'll receive notifications and no one can activate alerts using my email without my consent.

**Acceptance Criteria:**

**Given** `GET /api/alerts/confirm?token=<uuid>`
**When** called with a valid, unexpired token (48h window from creation)
**Then** it updates `price_alerts.status = 'active'`, writes `consent_log` row with `action = 'opt_in_confirmed'`, redirects to `/alerts/confirmed`

**Given** `GET /api/alerts/confirm?token=<uuid>`
**When** called with an expired token (> 48h) or token not found
**Then** it redirects to `/alerts/expired` — warm message "Link wygasł lub jest nieprawidłowy", "Wróć do strony gry i spróbuj ponownie" link — no error code exposed to user

**Given** `/alerts/confirmed` page
**When** rendered
**Then** it shows: green confirmation message "Gotowe! Powiadomimy Cię gdy cena spadnie.", game name and target price echoed back, "Wróć do gry →" link to `/gra/{slug}` and "Zarządzaj alertami →" link

**Given** the confirmation token
**When** stored in `price_alerts`
**Then** it is a UUID v4, stored in `confirmation_token` column, never exposed in URL beyond the DOI link — not reusable after confirmation

**Given** a token used a second time (already confirmed)
**When** `GET /api/alerts/confirm` fires
**Then** it redirects to `/alerts/confirmed` (idempotent) — not an error

---

### Story 6.3: Wyłączanie Powiadomień

**Dev: Dev A (Web)** — _pliki: `app/api/alerts/unsubscribe/route.ts`, `app/alerts/unsubscribed/page.tsx`_

As a **user**,
I want a one-click link in every alert email to turn off notifications,
So that I can stop receiving them at any time without needing to log in.

**Acceptance Criteria:**

**Given** `GET /api/alerts/unsubscribe?token=<uuid>`
**When** called with a valid unsubscribe token
**Then** it sets `price_alerts.status = 'cancelled'`, writes `consent_log` row with `action = 'unsubscribed'`, `SHA-256(email)`, timestamp, redirects to `/alerts/unsubscribed`

**Given** `/alerts/unsubscribed` page
**When** rendered
**Then** it shows: "Wyłączono powiadomienia. Nie będziesz już otrzymywał powiadomień dla tej gry." and a secondary option "Wyłącz wszystkie powiadomienia" button

**Given** user clicks "Wyłącz wszystkie powiadomienia"
**When** confirmed (single confirm dialog / inline expand — no modal)
**Then** `POST /api/alerts/unsubscribe-all` fires: sets all `price_alerts` for that email to `status = 'cancelled'`, inserts row in `email_suppressions` with the **raw email address** (not hashed — the alert-engine suppression join in arch L-3 matches on raw email; the row is anonymized after 3 years per L-5) and `reason = 'global_optout'`, and writes a `consent_log` row with `action = 'suppressed'`, `SHA-256(email)`, timestamp (L-4 rule: every `email_suppressions` write has a matching `consent_log` entry)
**And** future `POST /api/alerts` calls with this email return 200 with generic message but never insert to DB (email_suppressions check in Story 6.1)

**Given** an unsubscribe token that's expired or invalid
**When** `GET /api/alerts/unsubscribe` fires
**Then** still redirects to `/alerts/unsubscribed` with message "Ten link wygasł — jeśli chcesz wyłączyć powiadomienia, skontaktuj się z nami" — wyłączanie powiadomień musi zawsze skutkować, nigdy po cichu nie zawieść

**Given** RODO data retention
**When** `consent_log` is reviewed
**Then** all unsubscribe events are present with `action = 'unsubscribed'` (per-alert) or `action = 'suppressed'` (global opt-out) — append-only, no deletes — compliance audit trail intact

---

### Story 6.4: Brevo Client & Szablon Emaila DOI

**Dev: Dev B (Scraper/Infra)** — _pliki: `scraper/brevo_client.py`, `scraper/templates/doi_email.html`_
_(można zacząć podczas Epic 5)_

As a **developer**,
I want a Brevo API client and a Double Opt-In email template,
So that the API route can trigger transactional emails without coupling web code to email provider details.

**Acceptance Criteria:**

**Given** `brevo_client.py`
**When** `send_doi_email(to_email, confirmation_url, game_name, target_price)` is called
**Then** it sends a Brevo transactional email (POST to Brevo API v3) using the DOI template, returns `True` on 2xx, logs warning and returns `False` on non-2xx — never raises

**Given** the Brevo API call
**When** it returns 429 (rate limit)
**Then** client retries once after 2s, then logs and returns `False` — same pattern as BGG client

**Given** `doi_email.html`
**When** rendered by Brevo
**Then** it shows: "Potwierdź powiadomienia o cenie", game name, target price formatted as `"{price} zł"`, large "Potwierdź →" button linking to `confirmation_url`, footer with "Jeśli nie prosiłeś o to powiadomienie, zignoruj tę wiadomość", link do wyłączenia powiadomień
**And** design is consistent with app palette: parchment `#F2EAD8` background, primary green `#3D5C3A` CTA button — not Brevo default styling

**Given** `BREVO_API_KEY` env variable
**When** missing at startup
**Then** `brevo_client.py` raises `EnvironmentError` at import time — fail fast, not at send time

**Given** email address passed to `send_doi_email`
**When** called
**Then** the raw email address is never logged — only `SHA-256(email)[:8]` prefix in log lines (RODO compliance)

---

### Story 6.5: Alert Engine — Wykrywanie Spadku Ceny

**Dev: Dev B (Scraper/Infra)** — _pliki: `scraper/alert_engine.py`, `.github/workflows/alert_engine.yml`_

As a **user**,
I want to be notified automatically when a price drops to or below my target,
So that I don't have to check the site manually every day.

**Acceptance Criteria:**

**Given** `run_alert_engine()` in `alert_engine.py`
**When** called
**Then** it queries all `price_alerts WHERE status = 'active'`, for each alert fetches the current minimum price for that `game_id` from `products` table, and if `current_min_price <= target_price` calls `send_price_drop_email()` (Story 6.6) and sets `price_alerts.status = 'triggered'`

**Given** an alert where price dropped below threshold
**When** notification is sent
**Then** `status` is set to `'triggered'` before the Brevo call — not after — so a failed send doesn't re-trigger on next cycle

**Given** `alert_engine.yml` GitHub Actions workflow
**When** reviewing
**Then** it runs on `workflow_run` trigger after `scraper.yml` completes successfully (not on schedule independently) — alerty są sprawdzane po każdym nowym scrapie, nie osobnym cronie

**Given** `alert_engine.py`
**When** `NEON_DATABASE_URL` or `BREVO_API_KEY` is missing
**Then** the script exits with code 1 and a clear error message — GitHub Actions marks the workflow run as failed

**Given** the engine processing 100 active alerts
**When** run
**Then** it batches the `products` query — one query for all distinct `game_id`s in active alerts, not one query per alert (N+1 prevention)

**Given** a network error calling Brevo during alert processing
**When** `send_price_drop_email` returns `False`
**Then** that alert's `status` is reset to `'active'` (not left as `'triggered'`) and the error is logged — it will retry on the next scrape cycle

---

### Story 6.6: Email o Spadku Ceny

**Dev: Dev B (Scraper/Infra)** — _pliki: `scraper/templates/price_drop_email.html` + `send_price_drop_email()` w `brevo_client.py`_

As a **user**,
I want the price drop email to clearly show me the game, the new price, my target, and a direct buy link,
So that I can act immediately on the deal.

**Acceptance Criteria:**

**Given** `send_price_drop_email(to_email, game_name, game_slug, current_price, target_price, store_name, buy_url, unsubscribe_token)`
**When** called
**Then** it sends a Brevo transactional email using `price_drop_email.html` template — same retry logic as `send_doi_email`

**Given** `price_drop_email.html`
**When** rendered
**Then** it shows: "Cena spadła!" subject line, game name (Playfair Display style heading in email), current price formatted as `"{price} zł"` (large, green), target price (muted, "Twój cel: X zł"), store name, "Kup teraz →" button linking to `buy_url`, link "Wyłącz powiadomienia" at footer
**And** "Wyłącz powiadomienia" uses `unsubscribe_token` — `https://<domain>/api/alerts/unsubscribe?token=<token>`

**Given** a game where multiple stores dropped below the threshold
**When** `run_alert_engine()` processes this alert
**Then** the email shows only the cheapest in-stock store — one email per alert trigger, not one per store

**Given** the buy URL in the email
**When** constructed
**Then** it is `product.affiliate_url ?? product.product_url` — same priority as UI (Story 4.3)

**Given** the email footer
**When** reviewed for RODO compliance
**Then** it includes: link "Wyłącz powiadomienia", sender identity "Agregator Planszówek", reason for receiving ("Poprosiłeś o powiadomienie o cenie dla <game_name>") — required by PKE 2024

---

### Story 6.7: Type B Anomaly Detection

**Dev: Dev B (Scraper/Infra)** — _pliki: `scraper/alert_engine.py` (rozszerzenie)_
_(po 6.5)_

As a **user**,
I want to receive an alert when a game's price drops dramatically (50%/70%/80% below original),
So that I'm notified about exceptional deals even without setting a specific price threshold.

**Acceptance Criteria:**

**Given** `run_type_b_alerts()` added to `alert_engine.py`
**When** called after each Scrape Cycle
**Then** it queries all `price_alerts WHERE alert_type = 'price_drop' AND type_b_enabled = true AND status = 'active'`, for each checks if `(price_orig - price) / price_orig` exceeds any of the thresholds: 50%, 70%, 80%
**And** sends a Type B notification email (reuses `price_drop_email.html` template with "WYJĄTKOWA OKAZJA" header prefix) for each threshold crossed that hasn't been notified in the last 24h

**Given** a game that crossed the 50% threshold last Scrape Cycle and is still below it
**When** `run_type_b_alerts()` runs again
**Then** no duplicate email is sent — 24h cooldown per (email_hash, game_id, threshold_level) enforced via `last_type_b_notified_at` column

**Given** `price_alerts` schema
**When** reviewed
**Then** it has columns: `type_b_enabled BOOLEAN DEFAULT TRUE`, `last_type_b_notified_at TIMESTAMP NULL` — added via migration in this story
**And** the corresponding columns are added to `schema.ts` in the same PR (L-1 rule: schema.ts and scraper/items.py must stay in sync — never add DB columns in Python without updating schema.ts)

**Given** a game where `price_orig = NULL`
**When** `run_type_b_alerts()` processes
**Then** that game is skipped for Type B evaluation — cannot compute percentage without original price (same exclusion as FR-2)

**Given** `run_alert_engine()` orchestrator function
**When** reviewed
**Then** it calls both `run_type_a_alerts()` (Story 6.5) and `run_type_b_alerts()` sequentially — single entry point for GitHub Actions

---

### Story 6.8: Brevo Webhook — hard_bounce i complaint Suppression

**Dev: Dev A (Web/Next.js)** — _pliki: `app/api/webhooks/brevo/route.ts`_
_(po 6.3)_

As a **system**,
I want to automatically suppress emails that Brevo reports as hard bounces or spam complaints,
So that we stay RODO/PKE 2024 compliant and our sender reputation is protected.

**Acceptance Criteria:**

**Given** `POST /api/webhooks/brevo` with a valid HMAC-SHA256 signature in `X-Brevo-Signature` header
**When** event type is `hard_bounce`
**Then** route inserts a row into `email_suppressions` with the **raw email** (not hashed — alert-engine join in arch L-3 matches on raw email) and `reason = 'hard_bounce'` (if not already suppressed), **and** writes a `consent_log` row (`action = 'suppressed'`, `SHA-256(email)`, `source = 'brevo_webhook'`) in the same transaction (L-4 rule), returns `200 { ok: true }`

**Given** `POST /api/webhooks/brevo` with a valid signature
**When** event type is `complaint`
**Then** route inserts a row into `email_suppressions` with the **raw email** (not hashed — see L-3) and `reason = 'complaint'` (if not already suppressed), **and** writes a `consent_log` row (`action = 'suppressed'`, `SHA-256(email)`, `source = 'brevo_webhook'`) in the same transaction (L-4 rule), returns `200 { ok: true }`

**Given** `POST /api/webhooks/brevo`
**When** `X-Brevo-Signature` header is missing or does not match `HMAC-SHA256(body, BREVO_WEBHOOK_SECRET)` verified with `timingSafeEqual`
**Then** route returns `401` — no DB writes performed

**Given** `POST /api/webhooks/brevo` with a valid signature
**When** event type is anything other than `hard_bounce` or `complaint` (e.g. `click`, `open`, `delivered`)
**Then** route returns `200 { ok: true }` — no-op, no DB writes

**Given** `BREVO_WEBHOOK_SECRET` env variable
**When** missing at startup
**Then** the route returns `500` on any request — fail loudly rather than silently accepting unsigned webhooks

**Given** `app/api/webhooks/brevo/route.test.ts`
**When** run
**Then** covers: valid hard_bounce inserts suppression + consent_log 'suppressed' row, valid complaint inserts suppression + consent_log 'suppressed' row, bad signature returns 401, unknown event type returns 200 no-op, missing secret returns 500, duplicate suppression (already suppressed email) does not throw

---

### Story 6.9: Dokumenty Prawne — Privacy Policy, Regulamin, Cookie Policy, GDPR Procedure

**Dev: Dev A (Web)** — _pliki: `app/polityka-prywatnosci/page.tsx`, `app/regulamin/page.tsx`, `app/polityka-cookies/page.tsx`, `docs/GDPR_PROCEDURE.md`, `components/SiteFooter.tsx` (linki)_
_(blokuje launch — musi być Done zanim przyjmiemy pierwszą subskrypcję email; satysfakcjonuje PRD C-11–C-15)_

As a **data controller**,
I want published Privacy Policy, Regulamin, and Cookie Policy plus an internal GDPR runbook,
So that consent is informed and lawful and we can answer rights requests and breaches within statutory deadlines.

**Acceptance Criteria:**

**Given** `/polityka-prywatnosci` (Privacy Policy)
**When** rendered
**Then** it states: the named **data controller** (administrator danych) and contact `privacy@[domena]` (PRD C-11); categories of data processed (email, `ip_hash`) and legal basis (zgoda — art. 6 ust. 1 lit. a); retention periods matching arch L-5; the list of processors (Brevo, Neon, Vercel, GitHub) and that data stays in the EU (PRD C-12, arch L-15); the rights procedure and 30-day SLA (arch L-6); the 16+ age restriction (arch L-8); a "Cookies" section consistent with the Cookie Policy

**Given** the subscription consent text (Story 6.1) and the site footer
**When** rendered
**Then** both name the data controller and link to `/polityka-prywatnosci` — consent is informed (PRD C-11); footer also links `/regulamin` and `/polityka-cookies`

**Given** `/polityka-cookies` (Cookie Policy)
**When** rendered
**Then** it declares that MVP sets **only essential technical cookies** and uses **no identifying analytics** (arch L-16); states that any future non-essential cookie/analytics requires an opt-in consent banner before the script loads

**Given** `/regulamin` (Terms of Service)
**When** rendered
**Then** it covers: scope of the free service, no-account model, that prices are scraped/cached and may be stale (NFR-5), affiliate/redirect disclosure if applicable, limitation of liability, and BGG non-commercial data attribution

**Given** `docs/GDPR_PROCEDURE.md` (internal runbook — not public)
**When** reviewed
**Then** it contains: (1) rights-request handling (art. 15–22) with the manual erasure/anonymization steps and 30-day SLA (L-6); (2) the **art. 30** records-of-processing register (L-14); (3) links to each processor **DPA** (art. 28, L-14); (4) the **72-hour breach-notification** procedure to UODO with a breach register (art. 33/34, L-13)

**Given** the launch gate
**When** Epic 6 is marked ready to accept live subscriptions
**Then** Story 6.9 must be Done — no email subscription is accepted before the Privacy Policy and consent linkage are live (PRD C-15)

---

## Epic 7: Flipper Mode

**Cel:** Dedykowana trasa `/flipper` dla resellerów — zestawienie gier z proxy marży, ceną skupu i szacowanym zyskiem.
**FRs:** FR-16, FR-17

**Podział:** Epic 7 to prawie w całości Dev A. Story 7.1 to spike badawczy (oboje deweloperzy razem, brak nowych plików produkcyjnych). Dev B w tym czasie może zacząć spike dotyczący scrapowania "nadchodzących premier" (Epic 8 prep).

**Uwaga architektoniczna:** Na etapie Advanced Elicitation A-4 był oznaczony 🔴 — viability Flipper Mode zależy od dostępności proxy wartości rynkowej. Story 7.1 jest gate'em — dopiero po nim można budować 7.3/7.4.

| Story       | Dev           | Zależność                 |
| ----------- | ------------- | ------------------------- |
| 7.1 (spike) | Dev A + Dev B | po Epic 2                 |
| 7.2         | Dev A         | po 3.1                    |
| 7.3         | Dev A         | po 7.1 (decyzja) + 7.2    |
| 7.4         | Dev B         | po 7.1 (decyzja) + Epic 2 |
| 7.5         | Dev A         | po 7.3 + 7.4              |
| 7.6         | Dev A         | po 7.3 + 6.1              |

---

### Story 7.1: Spike — Walidacja Danych dla Flipper Mode

**Dev: Dev A + Dev B (spike — brak plików produkcyjnych)**
_(wymaga danych z Epic 2 — musi być co najmniej kilka produktów w DB)_

As a **team**,
I want to validate whether we have enough data to compute meaningful margin proxies before building the Flipper UI,
So that we don't build a page that shows "—" in every row at launch.

**Acceptance Criteria:**

**Given** the spike is complete
**When** team reviews results
**Then** the team has answered: (1) Czy `price_history` zawiera wystarczającą liczbę punktów danych (≥ 5 unikalnych dat per gra) by obliczyć historyczne maksimum jako proxy wartości rynkowej? (2) Czy `calcMarginProxy(current_price, historical_max)` daje sensowne wartości (>0%, ≤200%) dla ≥ 30% gier w DB? (3) Jaki % gier miałby widoczne dane w Flipper Mode przy aktualnym stanie DB?

**Given** the spike results
**When** ≥ 30% gier ma obliczalny margin proxy
**Then** kontynuuj budowanie Epic 7 zgodnie z planem — spike PASSED

**Given** the spike results
**When** < 30% gier ma obliczalny margin proxy
**Then** team podejmuje decyzję: (a) opóźnić Epic 7 do momentu zebrania większej historii cen, (b) zmienić definicję proxy (np. cena okładkowa z BGG zamiast historical max), (c) oznaczyć Epic 7 jako post-MVP — spike FAILED, decyzja wymagana przed kontynuacją

**Given** the spike output
**When** documented
**Then** wynik wpisany jako komentarz w `epics.md` przy Story 7.1 i jako ADR-005 jeśli decyzja techniczna zmienia architekturę

---

### Story 7.2: /flipper Route Shell & Empty State Guard

**Dev: Dev A (Web)** — _pliki: `app/flipper/page.tsx`, `app/flipper/loading.tsx`_
_(po 3.1 — można budować równolegle ze spike'iem 7.1)_

As a **user**,
I want the Flipper Mode page to have a clear layout that explains what it shows and handles the case when there's not enough data yet,
So that I'm never confused by a page full of dashes.

**Acceptance Criteria:**

**Given** `app/flipper/page.tsx` as a Server Component
**When** rendered
**Then** the page shows: sticky header with "FLIPPER MODE" badge (terracotta `#C4622D`, 10px caps), page title "Analiza marży — planszówki do flipa", subtitle explaining the margin proxy methodology in 1–2 sentences

**Given** the Flipper Mode page
**When** fewer than 5 games have a computable margin proxy in the DB
**Then** the page renders the empty state guard: illustration placeholder (SVG board game icon), "Za mało danych — wróć gdy zbierzemy więcej historii cen", estimated date copy ("Dane zbieramy od <first_scrape_date> — flipper stanie się użyteczny po X tygodniach historii cen"), "Wróć do okazji →" link
**And** this empty state is the primary UI — no broken table with "—" rows

**Given** `app/flipper/loading.tsx`
**When** data is being fetched
**Then** 6 skeleton rows render matching the FlipperRow dimensions — consistent with homepage skeleton pattern

**Given** the Flipper Mode button in SiteHeader (Story 3.1)
**When** user is on `/flipper`
**Then** button renders filled state `background: #3D5C3A`, white text — confirming active route

---

### Story 7.3: FlipperRow Component & Table Layout

**Dev: Dev A (Web)** — _pliki: `components/FlipperRow.tsx`, `components/FlipperRow.test.tsx`, `components/FlipperTable.tsx`_
_(po 7.1 PASSED + 7.2)_

As a **reseller**,
I want each row in Flipper Mode to show me buy price, market value proxy, margin %, and estimated profit at a glance,
So that I can quickly identify which games are worth buying for resale.

**Acceptance Criteria:**

**Given** `FlipperRow` with a game that has full flipper data
**When** rendered
**Then** it shows: rank number (#1, #2…), 40×40px thumbnail, game name (700w), "Kup za" lowest price (green), "Wartość proxy" historical max price (muted), margin % badge (color-coded: <10% red, 10–30% amber, >30% green), "Zysk ~X zł" estimate, "Kup →" button linking to cheapest store
**And** row background `#DDD0BC`, border-radius 10px, hover `translateY(-1px)` (150ms)

**Given** the margin % badge
**When** `margin > 30%`
**Then** badge background `#3D5C3A` (green), when `10–30%` background `#C07B18` (amber), when `< 10%` background `#C42B2B` (red)

**Given** a game where `historical_max = null` (insufficient history)
**When** rendered in FlipperTable
**Then** the row is excluded from the table entirely — rows with uncomputable margin are not shown (no "—" in margin column)

**Given** `FlipperTable`
**When** rendered with 0 rows after filtering
**Then** shows inline empty state: "Brak gier spełniających kryteria — rozszerz filtry" — not the full empty state guard from 7.2

**Given** `SparklineChart` embedded in each `FlipperRow`
**When** rendered
**Then** it shows a 62×26px inline SVG sparkline of the last 7 recorded prices for that game: line color `#3D5C3A` (falling trend), `#C42B2B` (rising trend), `#C07B18` (flat ≤5% variation) — no axes, no labels, purely visual (FR-16)
**And** `aria-hidden="true"` on the SVG — numeric trend indicator covers accessibility

**Given** the trend indicator column in `FlipperRow`
**When** rendered
**Then** it shows a directional arrow alongside a numeric value: "↑ +12%" (rising), "→ ±2%" (flat), "↓ −8%" (falling) — color matches sparkline color — text is always shown (never color-only, NFR accessibility, UX-DR12)

**Given** the Margin Proxy explainer card at the top of `FlipperTable`
**When** user clicks "Jak liczymy marżę?"
**Then** it expands (collapsible, no modal) showing: formula `(cena historyczna max − cena aktualna) / cena aktualna × 100%`, caveat "Wartość proxy — rzeczywista cena sprzedaży na Allegro/OLX może się różnić", "Ukryj" button to collapse

**Given** the always-visible Flipper Mode banner at top of `/flipper` page
**When** rendered
**Then** it shows: green background `#3D5C3A`, white text "FLIPPER MODE — analiza marży dla resellerów", amber chip "Dane orientacyjne", "Wyjdź z Flipper Mode" link to `/` — present on all viewport sizes, z-index below sticky header

**Given** `FlipperRow.test.tsx`
**When** run
**Then** covers: margin badge color thresholds, null historical_max exclusion, "Kup →" external link attributes, profit calculation: `round(historical_max - current_price, 2)`, sparkline color by trend, trend indicator text format

---

### Story 7.4: Flipper DB Query & calcMarginProxy()

**Dev: Dev B (Scraper/Infra)** — _pliki: `db/queries/flipper.ts`, `lib/calc.ts` (rozszerzenie o `calcMarginProxy`)_
_(po 7.1 PASSED + danych w DB)_

As a **developer**,
I want a query that returns flipper data sorted by margin descending and a pure function for margin calculation,
So that the Flipper Mode page always shows the most profitable opportunities first.

**Acceptance Criteria:**

**Given** `getFlipperDeals(filters?)` in `db/queries/flipper.ts`
**When** called
**Then** it returns games with: `current_min_price` (lowest in-stock product price), `historical_max_price` (max from `price_history`), `margin_pct` (computed), `profit_estimate` (computed), sorted by `margin_pct` descending
**And** games where `historical_max_price IS NULL` or `historical_max_price <= current_min_price` are excluded (margin ≤ 0% is not a flip opportunity)

**Given** `calcMarginProxy(currentPrice: string, historicalMax: string): number` in `lib/calc.ts`
**When** called
**Then** returns `round((parseFloat(historicalMax) - parseFloat(currentPrice)) / parseFloat(currentPrice) * 100, 1)` — margin on cost, not on price
**And** returns `null` if either argument is not a valid positive number — never throws, never returns NaN

**Given** `getFlipperDeals()` with filter `{ type: 'base' }`
**When** called
**Then** returns only games with `is_expansion = false` — same filter logic as hot-deals query

**Given** the query
**When** DB has 200 games but only 40 have sufficient price history
**Then** returns only the 40 — no padding with null rows

**Given** `calcMarginProxy` in `lib/calc.ts`
**When** unit-tested
**Then** covers: normal case, both null inputs, zero historicalMax, currentPrice > historicalMax → returns negative (valid — filtered out at query level, not calc level)

---

### Story 7.5: Flipper Filters & Sorting

**Dev: Dev A (Web)** — _pliki: `components/FlipperFilterBar.tsx`_
_(po 7.3 + 7.4)_

As a **reseller**,
I want to filter Flipper Mode by game type and minimum margin, and sort by different criteria,
So that I can focus on the opportunities that match my buying strategy.

**Acceptance Criteria:**

**Given** `FlipperFilterBar` as a Client Component
**When** rendered
**Then** it shows: game type filter (Podstawowe / Dodatki / Wszystkie — pill buttons), minimum margin slider or input ("Minimalna marża: X%", range 0–100%), sort dropdown (Marża malejąco / Zysk malejąco / Cena rosnąco)
**And** all filter state lives in URL params — no localStorage (MVP)

**Given** user sets "Minimalna marża: 30%"
**When** URL updates to `?min_margin=30`
**Then** `getFlipperDeals()` is called with `{ minMargin: 30 }` and rows with `margin_pct < 30` are excluded from results

**Given** sort "Zysk malejąco"
**When** URL updates to `?sort=profit_desc`
**Then** results re-sort by `profit_estimate` descending — client-side sort on already-loaded data (same pattern as Story 3.4)

**Given** 0 results after filtering
**When** rendered
**Then** FlipperTable inline empty state shows (Story 7.3) — not the full empty state guard from 7.2

**Given** user navigates to `/flipper` with `?min_margin=50`
**When** page loads
**Then** FilterBar reads URL params and renders matching active state — deep-linkable filter state

---

### Story 7.6: Type B Alert Subscription z Flipper Mode

**Dev: Dev A (Web)** — _pliki: `components/FlipperRow.tsx` (rozszerzenie), `components/AlertModal.tsx` (reuse z 6.1)_
_(po 7.3 + 6.1)_

As a **reseller**,
I want to subscribe to a Type B anomaly alert directly from a Flipper Mode row without leaving the page,
So that I'm automatically notified when a flip opportunity becomes exceptional.

**Acceptance Criteria:**

**Given** each `FlipperRow` in `FlipperTable`
**When** rendered
**Then** it shows a "Ustaw alert" button in the Akcja column alongside "Kup →" — outline style, smaller than CTA

**Given** user clicks "Ustaw alert" on a FlipperRow
**When** fired
**Then** `AlertModal` opens (reused from Story 6.1) pre-configured: `alert_type = 'price_drop'`, `type_b_enabled = true` pre-checked and disabled (cannot uncheck from Flipper Mode), `target_price` input hidden (Type B only — no threshold needed), game name pre-filled in modal title (FR-17)

**Given** user submits the pre-configured Flipper Mode alert form
**When** `POST /api/alerts` fires
**Then** same DOI flow as Story 6.1 — `price_alerts` row inserted with `alert_type = 'price_drop'`, `type_b_enabled = true`, `target_price = NULL`

**Given** `AlertModal` opened from Flipper Mode
**When** user presses Escape or clicks backdrop
**Then** modal closes, focus returns to the "Ustaw alert" button that triggered it — focus management identical to Story 6.1

---

## Epic 8: Upcoming Releases & Availability Alerts

**Cel:** Sekcja nadchodzących premier z możliwością ustawienia powiadomienia o dostępności.
**FRs:** FR-14, FR-15

**Podział:** Epic 8 celowo przesunięty w stronę Dev B dla wyrównania obciążenia — Dev B dostaje 3 historyjki (spike + spider + pipeline), Dev A 2 historyjki (UI). Tory mogą biec równolegle od Story 8.2/8.4.

| Story       | Dev   | Zależność                       |
| ----------- | ----- | ------------------------------- |
| 8.1 (spike) | Dev B | po Epic 2                       |
| 8.2         | Dev B | po 8.1 PASSED                   |
| 8.3         | Dev B | po 8.2                          |
| 8.4         | Dev A | po 3.1 (można równolegle z 8.1) |
| 8.5         | Dev A | po 8.4 + 8.2 (potrzebne dane)   |

---

### Story 8.1: Spike — Walidacja Źródła Danych dla Premier

**Dev: Dev B (Scraper/Infra)** — _spike — brak plików produkcyjnych_
_(po Epic 2)_

As a **team**,
I want to validate whether we can reliably scrape upcoming release data before building the UI,
So that the /nadchodzace page shows real games, not a placeholder.

**Acceptance Criteria:**

**Given** the spike is complete
**When** team reviews results
**Then** the team has answered: (1) Czy 3Trolle lub AlePlanszówki mają podstronę "zapowiedzi" lub "przedsprzedaż" z listą gier i datami premier? (2) Czy selektory CSS/XPath są stabilne (nie generowane dynamicznie JS)? (3) Ile gier jest dostępnych w danym momencie — czy sekcja nie będzie pusta?

**Given** spike results show viable data source
**When** ≥ 10 upcoming games are identifiable with names + estimated release dates
**Then** spike PASSED — kontynuuj 8.2

**Given** spike results show no viable source
**When** żaden sklep nie ma strukturalnie scrapywalnej listy premier
**Then** spike FAILED — Epic 8 odpada z MVP, team decyduje czy post-MVP lub ręczna kuracja — decyzja wpisana jako ADR-006

**Given** spike output
**When** source is identified
**Then** Dev B dokumentuje: URL źródła, przykładowy CSS selector, dostępne pola (nazwa, data premiery, okładka, cena pre-order), czy strona wymaga JS renderingu

---

### Story 8.2: UpcomingReleasesSpider & Pipeline

**Dev: Dev B (Scraper/Infra)** — _pliki: `scraper/spiders/upcoming_spider.py`, `scraper/pipelines/upcoming_pipeline.py`, `.github/workflows/upcoming.yml`_
_(po 8.1 PASSED)_

As a **user**,
I want the upcoming releases section to show real games with estimated release dates scraped from store websites,
So that I can discover games I'd want to pre-order or be notified about.

**Acceptance Criteria:**

**Given** `UpcomingSpider` crawling the source identified in 8.1
**When** run
**Then** it extracts per game: `name`, `expected_release_date` (or `NULL` if unknown), `cover_image_url`, `pre_order_url`, `store_id`, `pre_order_price` (or `NULL`)
**And** date parsing handles formats: "Q4 2026", "2026-09-15", "jesień 2026" → stored as `DATE` when exact, `TEXT` when approximate

**Given** `UpcomingPipeline`
**When** processing a scraped item
**Then** it upserts to `upcoming_games` table: `ON CONFLICT (store_id, name) DO UPDATE` — no duplicate rows on re-run
**And** games that appear in `games` table (by name match) get `game_id` FK populated — linking upcoming to existing game data

**Given** `upcoming.yml` GitHub Actions workflow
**When** reviewing
**Then** it runs on schedule `cron: '0 6 * * 1'` (raz w tygodniu, poniedziałek rano) — premiery nie zmieniają się codziennie
**And** workflow uses the same `uv run scrapy crawl upcoming` pattern as `scraper.yml`

**Given** a game that moves from "upcoming" to "available" (scraper finds it in products table)
**When** `UpcomingPipeline` processes it
**Then** it sets `upcoming_games.status = 'available'` and `available_since = NOW()` — trigger for alert engine (Story 8.3)

---

### Story 8.3: Availability Trigger w Alert Engine

**Dev: Dev B (Scraper/Infra)** — _pliki: `scraper/alert_engine.py` (rozszerzenie), `scraper/templates/available_email.html`_
_(po 8.2)_

As a **user**,
I want to receive an email when a game I signed up for becomes available in stores,
So that I can be among the first to buy it before it sells out.

**Acceptance Criteria:**

**Given** `run_availability_alerts()` dodany do `alert_engine.py`
**When** called after `upcoming.yml` completes
**Then** it queries `price_alerts JOIN upcoming_games WHERE upcoming_games.status = 'available' AND price_alerts.alert_type = 'availability' AND price_alerts.status = 'active'`, sends `available_email.html`, sets `price_alerts.status = 'triggered'`

**Given** `alert_engine.yml`
**When** reviewing
**Then** `run_availability_alerts()` is triggered also after `upcoming.yml` workflow_run — not only after `scraper.yml`

**Given** `available_email.html`
**When** rendered
**Then** it shows: "Jest dostępna!", game name, store name where it appeared, pre-order/buy price if known, "Sprawdź →" button, "Wyłącz powiadomienia" footer link
**And** RODO footer: "Poprosiłeś o powiadomienie gdy <game_name> stanie się dostępna"

**Given** the same game becomes available in 3 stores simultaneously
**When** `run_availability_alerts()` processes
**Then** one email is sent per user per game — not one per store — showing the cheapest available option

**Given** `price_alerts.alert_type` column
**When** reviewing schema
**Then** it supports values: `'price_drop'` (Epic 6) and `'availability'` (Epic 8) — same table, different `alert_type`

---

### Story 8.4: /nadchodzace Page Shell & UpcomingCard

**Dev: Dev A (Web)** — _pliki: `app/nadchodzace/page.tsx`, `app/nadchodzace/loading.tsx`, `components/UpcomingCard.tsx`_
_(po 3.1, można zacząć równolegle z 8.1)_

As a **user**,
I want a dedicated page listing upcoming game releases with clear visual hierarchy showing what's coming and when,
So that I can plan my wishlist and pre-orders.

**Acceptance Criteria:**

**Given** Story 8.1 spike (gate check)
**When** Story 8.4 is ready to be marked Done
**Then** Story 8.1 must already be marked Done with a recorded spike decision — if spike result is "no reliable preorder signal found", Story 8.4 ships with the empty state only and Stories 8.2, 8.3, 8.5 are deferred; the empty state on line below covers this case and is not an excuse to skip the spike gate

**Given** `app/nadchodzace/page.tsx` as a Server Component
**When** `upcoming_games` table has data
**Then** it shows a grid of `UpcomingCard` components, sorted by `expected_release_date` ascending (soonest first), with `NULL` dates at the end

**Given** `UpcomingCard` with an upcoming game
**When** rendered
**Then** it shows: cover image (148px, same placeholder as DealCard), game name (Playfair Display 700w), release date chip ("Q4 2026" or formatted date), store name, pre-order price if available (`formatPrice()`) or "Cena nieznana", "Powiadom mnie →" button (outline green)
**And** card uses same visual tokens as DealCard: `#DDD0BC` background, border-radius 12px, warm shadow

**Given** a game with `status = 'available'`
**When** rendered in the list
**Then** it shows a "DOSTĘPNA" badge (green, filled) and the card links to `/gra/{slug}` if `game_id` is set — no longer an upcoming card

**Given** `upcoming_games` table is empty (spike failed or no data yet)
**When** page renders
**Then** empty state: "Brak danych o nadchodzących premierach — wróć wkrótce", "Wróć do okazji →" link — not a broken page

**Given** `app/nadchodzace/loading.tsx`
**When** fetching
**Then** 6 skeleton cards render matching UpcomingCard dimensions

---

### Story 8.5: "Powiadom gdy dostępna" — Formularz & API

**Dev: Dev A (Web)** — _pliki: `components/AvailabilityAlertForm.tsx`, `app/api/alerts/route.ts` (rozszerzenie o `alert_type`)_
_(po 8.4 + 8.2)_

As a **user**,
I want to click "Powiadom mnie" on an upcoming game and enter my email to get notified when it becomes available,
So that I don't have to check the page manually.

**Acceptance Criteria:**

**Given** `AvailabilityAlertForm` on UpcomingCard
**When** user clicks "Powiadom mnie →"
**Then** an inline form expands below the button: email input, RODO consent checkbox ("Wyrażam zgodę na przetwarzanie adresu e-mail w celu wysyłki powiadomienia o dostępności gry"), "Powiadom mnie" submit button — no page navigation, no modal

**Given** user submits the form with valid email and checked consent
**When** `POST /api/alerts` fires with `{ alert_type: 'availability', game_id, upcoming_game_id }`
**Then** same flow as Story 6.1: DOI email sent via Brevo, `price_alerts` row inserted with `alert_type = 'availability'`, `status = 'pending_doi'`, `target_price = NULL`
**And** DOI email subject: "Potwierdź powiadomienie o dostępności gry <game_name>"

**Given** `POST /api/alerts` API route
**When** `alert_type = 'availability'`
**Then** `target_price` field is ignored/nullable — availability alerts have no price threshold
**And** existing `POST /api/alerts` handler is extended with a condition on `alert_type`, not duplicated into a new route

**Given** `AvailabilityAlertForm` after successful submit
**When** API returns 200
**Then** form collapses, "Powiadom mnie →" button replaced with "Powiadomienie ustawione ✓" (muted, non-clickable) — same success pattern as AlertForm (Story 6.1)
