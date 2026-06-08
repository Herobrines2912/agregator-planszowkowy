---
title: Agregator Cen Planszówek
status: final
created: 2026-06-06
updated: 2026-06-08
---

# PRD: Agregator Cen Planszówek

*Working title — confirm or replace with desired brand name before domain registration and downstream assets.*

---

## 0. Document Purpose

This PRD defines requirements for a Polish board game price and promotion aggregator: a web application that collects pricing data from Polish online board game stores, presents deals, tracks price history, and surfaces domain-specific intelligence (BGG metadata, DLC warnings, Flipper Mode). Primary audience is the builder (Kacper) and any future collaborators; downstream inputs for architecture and epics-and-stories workflows. Technical implementation decisions are deferred to `addendum.md`; this document captures *what* the product does, not *how* it is built. Glossary terms are used verbatim throughout; introducing a synonym is a discipline violation.

---

## 1. Vision

Polish board game enthusiasts have no good tool for tracking prices across online stores. i-szop.pl exists but treats board games as generic products — no BGG data, no expansion warnings, no domain understanding. Ceneo covers electronics well; board games are an afterthought. The result: buyers visit 3–5 stores manually to compare prices, miss flash sales, and occasionally buy expansions without realizing they need the base game first.

Agregator Cen Planszówek is a deals-first aggregator that understands board games. It scrapes pricing data daily from Polish stores, enriches each Game with BGG metadata, and presents deals through lenses built for the community: a Hot Deals Feed refreshed after every Scrape Cycle, per-game Price History charts, domain-specific filters (Base Game / Expansion, player count), and Flipper Mode for resale-minded buyers. The Game Passport replaces a multi-site research session with one screen.

The product is open-source and hobby-operated. Success is not monetization — it is personal utility, organic search visibility, and being the tool the Polish planszówka community reaches for first when a sale drops. A key differentiator no existing Polish aggregator offers: Flipper Mode — a dedicated view for users buying discounted games to resell, treating them as the distinct segment they are rather than generic shoppers.

**Why now:** The Polish board game market is growing; flash promotions at stores like 3Trolle and AlePlanszowki go unnoticed outside enthusiast groups. BGG's 2025 formalization of non-commercial API access creates a stable integration path. PrestaShop adoption across multiple stores means one scraper configuration covers multiple retailers with minimal marginal cost per new store.

---

## 2. Target Users

### 2.1 Jobs To Be Done

- Find current board game deals across multiple stores without visiting each one manually.
- Know if this price is actually good by seeing the Game's Price History before buying.
- Understand a game's profile (mechanics, difficulty, player count, expansion dependencies) without leaving the app.
- Get notified when a specific game drops below a target price, without creating an account.
- Evaluate resale potential of a deeply discounted game before buying for flipping.
- Discover upcoming releases and preorders from a single screen.

### 2.2 Non-Users (v1)

- Users who expect social features (reviews, ratings, personal collections) — no accounts in v1.
- Users outside Poland — Polish-language stores and PLN pricing only in v1.
- Business buyers or stores — not a B2B tool.

### 2.3 Key User Journeys

**UJ-1. Marta spots a deal on a game she's been watching.**
Marta, a casual board gamer who follows deal groups on Facebook but dislikes the noise, visits the homepage. She sees the Hot Deals Feed and immediately identifies two games discounted above 40%. She filters by "2 players" and finds Catan at 38% off. She clicks through to the Game Passport, checks the Price History chart — this is the lowest price in 6 months — and sets a Type A email alert for Brass Birmingham at a threshold of 120 zł. She leaves with one action taken, zero accounts created.

**UJ-2. Paweł evaluates a flip opportunity.**
Paweł, a Flipper who buys deeply discounted games and resells on Allegro, activates Flipper Mode from the navigation. He scans the transactional feed: current price, historical average, Margin Proxy, trend indicator. He spots a game at 75% off with a positive Margin Proxy and a falling trend — the market price likely has not corrected yet. He opens the Game Passport for the full Price History chart, confirms the thesis, and follows the store link to place an order. Realizes the Price History feature (FR-3, FR-4) and the Flipper Mode view (FR-16).

**UJ-3. Agnieszka researches a game as a birthday gift.**
Agnieszka, buying a gift, searches Google for "Wingspan BGG cena" and lands on the Wingspan Game Passport. She reads the BGG metadata (weight 2.9, 1–5 players, 40–70 min), checks the price comparison table (three stores, cheapest: 3Trolle 139 zł), and notices a DLC warning: "Wingspan: European Expansion requires the base game." She had been looking at the expansion — she clicks through to the base game page and bookmarks both. She did not visit BGG, did not visit any store homepage.

---

## 3. Glossary

- **Store** — A Polish online board game retailer integrated into the aggregator. v1 Stores: 3Trolle, AlePlanszowki. Each Store has its own Products.
- **Product** — A store-specific listing of a Game. One Game may have many Products across Stores. Carries store SKU, URL, current price, and availability.
- **Game** — The canonical entity representing a single board game title, shared across Stores. Linked to a BGG ID.
- **BGG ID** — The unique identifier for a Game on BoardGameGeek.com. Primary key for cross-store Product deduplication.
- **EAN** — The barcode (European Article Number) on a Product's physical box. Supplementary field; may differ between Polish and foreign editions of the same Game.
- **Base Game (Podstawka)** — A Game that can be played standalone.
- **Expansion (Dodatek)** — A Game requiring a Base Game to play. BGG expansion relationship links an Expansion to its required Base Game.
- **Hot Deals Feed** — The public, login-free homepage feed of currently discounted Games sorted by discount percentage, refreshed after each Scrape Cycle.
- **Price History** — An append-only log of a Product's prices over time, recorded at each Scrape Cycle.
- **Game Passport** — The per-Game page combining BGG metadata, Price History chart, and current Product listings from all integrated Stores.
- **Scrape Cycle** — One complete automated run of all configured Store scrapers, ending with a database update.
- **Email Alert** — A subscription linking an email address to a Game and a notification condition. Type A: user-defined price threshold. Type B: automatic anomaly detection for large drops.
- **Double Opt-In** — The two-step email confirmation flow required before any notification is sent: (1) user submits email, (2) user confirms via link in a confirmation email.
- **Flipper** — A user who buys deeply discounted Games with intent to resell at a profit.
- **Flipper Mode** — A UI view optimized for Flippers: transactional layout with current price, Price History sparkline, Margin Proxy, and trend indicator.
- **Margin Proxy** — Estimated resale potential in MVP, calculated as `(historical average price − current price) / current price × 100%`. `[ASSUMPTION: A-1 — Allegro/OLX live resale data is Phase 3.]`

---

## 4. Features

### 4.1 Hot Deals Feed

**Description:** The homepage is a public, login-free feed of currently discounted Games sorted descending by discount percentage. It refreshes after each Scrape Cycle. Each entry shows: Game thumbnail, name, current lowest price, original price, discount percentage, Store name(s), and staleness indicator. The Feed is designed to build a daily return habit — it must be useful enough on its own that a user bookmarks the homepage rather than searching for deals elsewhere. It is the primary entry point for casual deal-hunters. Realizes UJ-1.

**Functional Requirements:**

#### FR-1: Hot Deals Feed display
The system renders a publicly accessible homepage feed of Games whose current price is below their original price at any integrated Store, sorted by discount percentage (descending).

**Consequences (testable):**
- Feed shows all Games with ≥ 15% discount from at least one integrated Store.
- Feed refreshes within 30 minutes of a completed Scrape Cycle.
- Page is accessible without authentication.

#### FR-2: Deal entry content
Each Feed entry displays: game cover thumbnail, game name, current lowest price across Stores, original price, discount percentage, Store name(s) offering the discount, and elapsed time since last price update.

**Consequences (testable):**
- Discount percentage = `round((original_price − current_price) / original_price × 100)`.
- Games with no original price data (discount cannot be computed) are excluded from the Feed.
- Entries link to the Game Passport, not directly to the Store.

---

### 4.2 Price History

**Description:** Each Game Passport includes a Price History chart covering all integrated Stores. The chart visualizes the full recorded price timeline and surfaces: current price, historical minimum, historical maximum, and a 30-day rolling average. This feature validates that a deal is genuinely below market. Supports UJ-1 (informed buying) and UJ-2 (Flipper thesis validation).

**Functional Requirements:**

#### FR-3: Per-game price history chart
The Game Passport displays a price history chart for the Game, with separate data series per Store, covering the full recorded history.

**Consequences (testable):**
- Chart labels the historical minimum and maximum price points with dates.
- Chart is suppressed and replaced with a message if fewer than 7 days of data exist for the Game.
- Chart renders for each Store independently; partial data (one Store without history) does not suppress the other Store's series.

#### FR-4: Price summary statistics
Alongside the chart, the Game Passport displays: current lowest price (across all Stores), historical minimum price with date, and 30-day average price.

**Consequences (testable):**
- Statistics update within 30 minutes of a completed Scrape Cycle.
- "30-day average" is omitted if fewer than 7 data points exist in the 30-day window.

---

### 4.3 Board Game Filters

**Description:** Game listings support two domain-specific filters absent from generic aggregators: game type (Base Game / Expansion) and player count. Both require domain-enriched data from BGG. Realizes UJ-3 (gift research) and UJ-1 (targeted deal browsing).

**Functional Requirements:**

#### FR-5: Base Game / Expansion filter
User can filter any Game listing to show only Base Games, only Expansions, or both (default: both).

**Consequences (testable):**
- Filter state persists within the session (URL parameter).
- Games not yet matched to a BGG ID are shown in the "both" state and labeled "typ nieznany". `[NOTE FOR PM: decide whether unmatched Games should be hidden from filtered views or shown with a caveat — current assumption is show-with-caveat.]`

#### FR-6: Player count filter
User can filter any Game listing by player count (min and/or max), showing only Games that support the specified count.

**Consequences (testable):**
- Filter uses BGG `minplayers` / `maxplayers` fields.
- A filter of "2 players" returns Games where `minplayers ≤ 2 ≤ maxplayers`.
- Games with no BGG player count data are excluded from player count filtering results.

---

### 4.4 Game Passport

**Description:** Each Game has a dedicated page at a stable, SEO-friendly URL (e.g., `/gra/brass-birmingham`). The Game Passport combines BGG metadata with live price data from all integrated Stores, replacing a BGG visit plus multi-store browsing with one screen. When the Game is an Expansion, a prominent warning links to the required Base Game. Realizes UJ-3. Primary SEO landing page (see §4.8).

**Functional Requirements:**

#### FR-7: BGG metadata display
The Game Passport displays BGG metadata: cover image, name, designers, publishers, BGG overall rank, BGG category rank (where available), complexity (weight), mechanics tags, player count range, play time range, minimum age, and rules PDF link (if BGG provides one).

**Consequences (testable):**
- All BGG fields are populated within 24 hours of a Game being added to the database.
- Missing BGG fields render as "N/A" rather than blank or absent.

#### FR-8: Cross-store price comparison table
The Game Passport displays a table of current Product listings across all integrated Stores: store name, current price, original price, discount percentage (if applicable), availability, and a direct link to the Store product page.

**Consequences (testable):**
- Table is sorted by current price ascending.
- Out-of-stock Products are shown at the bottom of the table, labeled as unavailable.
- Table updates within 30 minutes of a Scrape Cycle.

#### FR-9: DLC dependency warning
When the Game is an Expansion (per BGG expansion relationship), the page prominently displays: "Ten dodatek wymaga [Base Game name]" with the Base Game's current lowest price and a link to the Base Game's Game Passport. Realizes UJ-3.

**Consequences (testable):**
- Warning appears on every Expansion page with a resolvable BGG parent Game.
- Warning links to the Base Game's Game Passport, not directly to a Store.
- If the Base Game has no scraped Products, the warning shows the name and BGG link with a note that price data is unavailable.

---

### 4.5 Email Price Alerts

**Description:** Users subscribe to price notifications for specific Games using only an email address — no account required. Two alert types: Type A (user-defined threshold) and Type B (automatic anomaly detection for large drops). RODO/PKE 2024 requires Double Opt-In before any notification is sent. Realizes UJ-1.

**Functional Requirements:**

#### FR-10: Type A alert — user-defined threshold
User can subscribe to a price alert by providing their email and a target price for a specific Game. When the Game's lowest price drops to or below the threshold at any integrated Store, the system sends a notification email.

**Consequences (testable):**
- Subscription requires Double Opt-In; alert is inactive until confirmed.
- Notification fires within 2 hours of the Scrape Cycle that triggers the condition.
- If the current price is already below the threshold at subscription time, no immediate alert fires — alert fires only on future price events.
- The same subscriber is not notified again for the same price condition within 24 hours.

#### FR-11: Type B alert — anomaly detection
The system automatically detects price drops exceeding configured thresholds (50%, 70%, 80% below original price) and notifies all confirmed subscribers for that Game.

**Consequences (testable):**
- Type B alerts fire for any Game matching the anomaly condition, regardless of whether a Type A alert exists.
- Subscriber opts into Type B notifications at subscription time; default is enabled.

#### FR-12: Double Opt-In confirmation flow
Subscription requires email confirmation before any notification is sent. A confirmation email is sent immediately after subscription; it contains a unique, time-limited token link. `[ASSUMPTION: A-2 — token expires after 48 hours; resend flow is out of scope for MVP.]`

**Consequences (testable):**
- No notification of any type is sent before the subscription is confirmed.
- Subscribing with the same email + game_id combination before confirming resends the confirmation email rather than creating a duplicate record.

#### FR-13: Unsubscribe
Each notification email contains a single-click unsubscribe link. Following it cancels that specific alert subscription. `[ASSUMPTION: A-3 — "unsubscribe all" is out of scope for MVP; each alert is managed individually.]`

**Consequences (testable):**
- Unsubscribed email is retained on a per-game suppression list (not deleted — RODO suppression requirement; Art. 17 erasure is a separate explicit request).
- Following the unsubscribe link confirms success without requiring login.

---

### 4.6 Upcoming / Preorders

**Description:** A dedicated section surfaces games available for preorder and new releases (within the last 30 days) from integrated Stores. Users can subscribe to a "notify me when available" alert via email, Double Opt-In required, no account needed. `[ASSUMPTION: A-4 — preorder data is inferred from Store product page signals; signal reliability must be verified per-Store during implementation.]`

**Functional Requirements:**

#### FR-14: Upcoming section
The application provides an Upcoming section listing Games available for preorder or released in the last 30 days from integrated Stores: game name, thumbnail, Store, price (or preorder price), and expected release date where available.

**Consequences (testable):**
- Section is accessible without authentication.
- Items are sorted by expected release date ascending; unknown dates appear last.
- Section updates within 30 minutes of a Scrape Cycle.

#### FR-15: Availability alert
User can subscribe to a "notify me when available" alert for a specific Game via email (Double Opt-In required, same mechanism as §4.5).

**Consequences (testable):**
- Alert fires within 2 hours of a Scrape Cycle that first records the Game as in-stock.
- Alert fires once per availability event; does not repeat if the Game goes out of stock and returns.

---

### 4.7 Flipper Mode

**Description:** A toggle-activated view for Flippers. Replaces standard deal cards with a transactional layout: current price, original price, Price History sparkline, Margin Proxy percentage, and trend indicator (price direction over the last 7 days). Type B alerts (FR-11) are the primary retention tool for this segment. Realizes UJ-2.

**Functional Requirements:**

#### FR-16: Flipper Mode view
User activates Flipper Mode from the main navigation. All active filters (FR-5, FR-6) remain applied. Each Game entry displays: name, current price, original price, 7-day price sparkline, Margin Proxy percentage, trend indicator (↑ rising / → stable / ↓ falling).

**Consequences (testable):**
- Flipper Mode is a view toggle, not a separate URL — filter state is preserved.
- Trend indicator is calculated from the last 7 recorded prices: rising if last price > first price, falling if last price < first price, stable otherwise.
- Margin Proxy is suppressed (shown as "—") if fewer than 5 price data points exist for the Game.

#### FR-17: Flipper Mode Type B alert subscription
From Flipper Mode, user can subscribe to a Type B anomaly alert for a specific Game with a single action, following the standard Double Opt-In flow (FR-12).

**Consequences (testable):**
- Subscription form from Flipper Mode pre-selects Type B only; user confirms email and submits.

---

### 4.8 SEO Architecture

**Description:** Organic search is the primary acquisition channel. Each Game Passport is a server-rendered landing page targeting queries like "Brass Birmingham promocja" or "Wingspan cena historia cen". The SEO layer is not optional — it is the distribution strategy. Game pages at stable slugs, schema.org markup, and a generated sitemap together produce thousands of organic entry points. Realizes UJ-3 acquisition.

**Functional Requirements:**

#### FR-18: Per-game SEO markup
Each Game Passport includes: a unique `<title>` tag (`{Game name} — najtańsza cena, historia cen | {site name}`), a meta description incorporating the current lowest price, and schema.org `Product` structured data with `AggregateOffer` (lowPrice, highPrice, offerCount, priceCurrency: PLN).

**Consequences (testable):**
- Google Rich Results Test validates schema.org markup on a sample of 10 Game Passport pages without errors.
- `<title>` contains the game name and a price indicator for every Game with at least one active Product.
- Each game page has a unique meta description.

#### FR-19: Sitemap
The application generates and serves `/sitemap.xml` indexing all Game Passport URLs.

**Consequences (testable):**
- Sitemap is regenerated within 24 hours of new Games being added to the database.
- All Games with at least one active Product listing appear in the sitemap.

#### FR-20: Incremental Static Regeneration for Game Passports
Game Passport pages are rendered with ISR; pages are statically served and revalidated on a schedule aligned to the Scrape Cycle frequency (max staleness: 2× Scrape Cycle duration). `[ASSUMPTION: A-5 — Next.js 16 App Router ISR; revalidation period defaults to 1 hour.]`

**Consequences (testable):**
- Game Passport page for a cached game returns a response in < 500 ms.
- Price data on a cached Game Passport is no more than 2 hours stale under normal Scrape Cycle operation.

---

### 4.9 Price Data Collection

**Description:** The underlying data capability that makes all user-facing features possible. The system automatically scrapes product listings and prices from integrated Stores on a schedule, deduplicates Products to canonical Games via BGG ID, enriches Games with BGG metadata, and maintains append-only Price History. This section defines scraper behavior as requirements; implementation details (stack, schema, deployment) are in `addendum.md`. `[ASSUMPTION: A-6 — BGG API non-commercial Bearer Token registered before Sprint 1.] [ASSUMPTION: A-7 — 3Trolle and AlePlanszowki PrestaShop HTML is compatible with a shared scraper module with per-store CSS selector configuration.]`

**Functional Requirements:**

#### FR-21: Scheduled scraping
The system executes a full Scrape Cycle for all integrated Stores at least once per 24 hours, automatically, without manual intervention.

**Consequences (testable):**
- Each Scrape Cycle logs: store, start time, end time, products scraped count, error count.
- If a Store scraper produces fewer products than a configured minimum threshold (default: 80% of 7-day rolling average), an operator alert is sent.

#### FR-22: Product deduplication to BGG ID
Scraped Store Products are linked to canonical Games via BGG ID. The deduplication pipeline attempts in order: (1) EAN → GameUPC API → BGG ID; (2) name fuzzy match → BGG Search API → BGG ID; (3) operator review queue for low-confidence matches.

**Consequences (testable):**
- A Product successfully matched to a BGG ID has BGG metadata populated on its Game Passport within 24 hours of match.
- Products below the confidence threshold do not auto-link; they appear in an operator review queue and are listed as Games without BGG data in the meantime.

#### FR-23: Price history recording
Each Scrape Cycle appends the current price, original price, and availability for each scraped Product to the Price History.

**Consequences (testable):**
- Price History is append-only; no historical records are modified or deleted.
- Price changes as small as 0.01 PLN are recorded.
- Products not returned by the scraper in a given cycle are recorded as "not seen" rather than deleted.

#### FR-24: BGG data enrichment
When a Game is first linked to a BGG ID, the system fetches and caches BGG metadata (fields per FR-7). Cached BGG data is refreshed at minimum every 30 days.

**Consequences (testable):**
- BGG enrichment runs as a background job; it does not block or delay the Scrape Cycle.
- If BGG API returns an error (including HTTP 429), the Game is queued for retry; the Product remains listed with partial data.
- BGG API requests are rate-limited to ≤ 1 request/second.

---

## 5. Non-Goals (Explicit)

- **User accounts or authentication** — all personalization via email tokens in v1; accounts are Phase 2.
- **Saved wishlists or personal game collections** — Phase 2.
- **BGG user integration** (syncing personal collection or wishlist from BGG) — Phase 2.
- **Rebel.pl integration** — Phase 2; `/promocje/` blocked in robots.txt; requires negotiation or product-page-only scraping strategy.
- **Mepel.pl integration** — Phase 1.5; requires successful Playwright anti-bot test before sprint commitment.
- **Social features** — no user reviews, ratings, community lists, or user-generated content in v1.
- **Allegro / OLX live resale data** for Flipper Mode — Phase 3; MVP uses Margin Proxy from historical price averages.
- **Mobile app (iOS / Android)** — Phase 3 via React Native and GitHub Releases distribution.
- **Weekly newsletter** — Phase 2; automated digest requires a subscriber base to be worth the automation investment.
- **Kickstarter / Gamefound integration** for Upcoming section — Phase 3.
- **Additional board game filters** (mechanics, age range, play time, designer) — Phase 2.
- **Monetization or affiliate programs** — Phase 3, after the product reaches maturity.
- **International stores or non-PLN pricing** — not in scope.

---

## 6. MVP Scope

### 6.1 In Scope

- Hot Deals Feed — public homepage, sorted by discount %, refreshed after each Scrape Cycle
- Price History chart per Game Passport
- Base Game / Expansion filter + Player count filter
- Game Passport — BGG metadata, cross-store price comparison table, DLC dependency warning
- Email Price Alerts — Type A (user threshold) and Type B (anomaly detection), Double Opt-In
- Upcoming / Preorders section with availability alerts
- Flipper Mode toggle view with Margin Proxy and trend indicator
- SEO architecture — ISR, schema.org AggregateOffer, sitemap.xml, SEO-friendly URLs
- Price Data Collection — Scrapy scraper for 3Trolle and AlePlanszowki (PrestaShop), BGG ID deduplication pipeline
- BGG API enrichment with registered Bearer Token
- RODO-compliant Double Opt-In for all email subscriptions
- Operator scraper health alerts
- GitHub Actions + Neon free + Vercel Hobby deployment (€0/month)

### 6.2 Out of Scope for MVP

- Mepel.pl — `[NOTE FOR PM: Mepel deferred to Phase 1.5; requires Playwright bypass test before sprint planning. Go/no-go decision needed before Phase 1.5 sprint.]`
- Rebel.pl
- User accounts, authentication, personal collections
- Weekly newsletter
- Allegro/OLX resale price integration for Flipper Mode
- Mobile app
- Additional filters (mechanics, age, play time)
- Admin dashboard (operator monitoring is via email alerts and raw DB access in v1)

---

## 7. Cross-Cutting NFRs

**Performance**

- **NFR-1:** Hot Deals Feed LCP < 2 seconds on a standard 4G connection (Lighthouse score ≥ 80 for Performance).
- **NFR-2:** Full Scrape Cycle for v1 Stores (3Trolle + AlePlanszowki) completes in < 15 minutes.
- **NFR-3:** Game Passport pages served from ISR cache respond in < 500 ms.

**Reliability**

- **NFR-4:** Scheduled Scrape Cycle executes without operator intervention in ≥ 95% of scheduled runs over any 30-day window.
- **NFR-5:** Price data for each Store is no more than 24 hours stale under normal operation.
- **NFR-6:** Scraper selector breakage is detected within 24 hours via automated CI checks against live Store HTML.

**Observability**

- **NFR-7:** Each Scrape Cycle writes a structured log entry: store name, start time, end time, products scraped, error count.
- **NFR-8:** If a Store's scraped product count falls below 80% of its 7-day rolling average, an operator alert fires within 1 hour.

---

## 8. Constraints and Guardrails

### 8.1 Compliance (RODO / PKE 2024)

- **C-1:** All email subscriptions require Double Opt-In before the first notification is sent. Consent checkbox at subscription form is unchecked by default.
- **C-2:** Unsubscribed emails are retained on a per-subscription-type suppression list; they are not deleted on unsubscribe. Deletion is a separate RODO Art. 17 erasure request.
- **C-3:** Stored data per subscription is minimized to: email address, game_id, alert type, price threshold (Type A only), unsubscribe token, confirmed flag, and timestamps. No other personal data is collected or stored.
- **C-4:** Unconfirmed subscriptions expire after 48 hours. Confirmed subscriptions are retained until unsubscribed or explicitly erased.

### 8.2 Scraping Ethics

- **C-5:** Scrapers respect the `Crawl-delay` directive in each Store's robots.txt.
- **C-6:** The `/promocje/` path on any Store where robots.txt disallows it (currently: Rebel.pl) is not scraped.
- **C-7:** The scraper identifies itself with a descriptive User-Agent string that names the project.
- **C-8:** Rebel.pl robots.txt restrictions are not circumvented in v1.

### 8.3 Cost

- **C-9:** Infrastructure operating cost target for MVP €0 / month (GitHub Actions + Neon free + Vercel Hobby free + Brevo free tier).
- **C-10:** No external paid services (residential proxies, managed databases, commercial anti-bot tools) are used in MVP.

---

## 9. Platform & Information Architecture

**Platform:** Web-first. Responsive design; desktop-primary for v1. Mobile Phase 3 (React Native, GitHub Releases distribution, no App Store in early phase).

**Top-level surfaces:**

| Surface | Path pattern | Login required |
|---|---|---|
| Hot Deals Feed | `/` | No |
| Game Passport | `/gra/{slug}` | No |
| Upcoming / Preorders | `/nadchodzi` | No |
| Flipper Mode | Toggle on `/` and `/gra/` surfaces | No |
| Alert subscription | Inline on Game Passport | No |
| Opt-in confirmation | `/alerty/potwierdz/{token}` | No |
| Unsubscribe | `/alerty/wypisz/{token}` | No |

No authenticated surfaces in v1.

---

## 10. Success Metrics

**Primary**

- **SM-1:** Scraping reliability — ≥ 95% of scheduled Scrape Cycles complete without operator intervention, measured over any 30-day window. Validates FR-21.
- **SM-2:** Organic search — ≥ 100 organic sessions/week via Google Search Console within 3 months of launch. Validates FR-18, FR-19, FR-20.

**Secondary**

- **SM-3:** Email alert confirmed subscriptions — ≥ 50 confirmed subscriptions within 2 months of launch. Validates FR-10, FR-12.
- **SM-4:** Personal utility — Kacper uses the product at least once/week for deal discovery and does not reach for i-szop.pl for the same task within 1 month of launch. Validates FR-1, FR-3.
- **SM-5:** Game catalog coverage — ≥ 1,000 unique Games with BGG data in the database within 1 month of launch. Validates FR-22, FR-24.

**Counter-metrics (do not optimize)**

- **SM-C1:** Do not optimize for raw pageview count at the expense of UX clarity — adding intrusive elements to inflate session numbers defeats SM-4.
- **SM-C2:** Do not add new Stores before Scrape Cycle reliability (SM-1) is stable for existing Stores.

---

## 11. Open Questions

1. **OQ-1 — Product name / domain:** Working title "Agregator Cen Planszówek" is a placeholder. Desired brand name and domain needed before downstream architecture and SEO work.
2. **OQ-2 — BGG API registration:** Has the BGG non-commercial Bearer Token application been submitted? This is a hard pre-requisite for Game Passport and deduplication (FR-7, FR-22, FR-24); it blocks Sprint 1 if outstanding.
3. **OQ-3 — Mepel validation timeline:** Phase 1.5 requires a Playwright anti-bot test against Mepel before the sprint is planned. The test must cover multi-page navigation depth (>4 URL levels traversed sequentially), not just a single page load — Cloudflare AI Labyrinth triggers after >4 navigation levels without human-like behavior. When will this test run?
4. **OQ-4 — Flipper Mode Margin Proxy acceptability:** MVP Margin Proxy uses historical average vs. current price as a resale estimate. Is this acceptable for v1, or should Phase 1.5 include a lightweight Allegro price signal?
5. **OQ-5 — Upcoming section preorder signal:** Does each Store mark preorder products consistently in HTML (e.g., a specific label or availability status)? Requires per-Store verification before FR-14 can be implemented. `[NOTE FOR PM: may shift to Phase 1.5 if signal is unreliable in initial Store audit.]`
6. **OQ-6 — Operator alerting channel:** NFR-8 requires an operator alert for broken scrapers. Email (same Resend/Brevo setup) or separate channel (e.g., Telegram bot)?
7. **OQ-7 — GameUPC API viability:** GameUPC rate limits and pricing are not publicly documented; coverage of Polish game editions is unknown. A Sprint 0 spike (lookup test for 20–30 Polish titles) is required before building the EAN fast path of the deduplication pipeline. If coverage is insufficient, fuzzy name matching against BGG Search API becomes the primary deduplication path.

---

## 12. Assumptions Index

- **A-1** (§3, Margin Proxy): MVP Margin Proxy = `(historical average price − current price) / current price × 100%`. Live Allegro/OLX resale data is Phase 3.
- **A-2** (§4.5 FR-12): Double Opt-In confirmation token expires after 48 hours. Resend flow is out of scope for MVP.
- **A-3** (§4.5 FR-13): "Unsubscribe all" is out of scope for MVP; each alert is managed individually.
- **A-4** (§4.6): Preorder data is inferred from Store product page signals (e.g., "preorder" label or specific availability status in HTML). Signal reliability must be verified per-Store before FR-14 implementation.
- **A-5** (§4.8 FR-20): Next.js 16 App Router ISR is used; revalidation period defaults to 1 hour.
- **A-6** (§4.9): BGG API non-commercial Bearer Token is registered and available before Sprint 1 implementation begins.
- **A-7** (§4.9): 3Trolle and AlePlanszowki PrestaShop HTML is compatible with a shared scraper module; per-store CSS selector configuration is required but no structural rewrite.
