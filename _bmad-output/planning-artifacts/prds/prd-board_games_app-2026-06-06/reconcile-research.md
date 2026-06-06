# Reconciliation: Research Report vs PRD + Addendum

**Source input:** `technical-web-scraping-polish-board-game-stores-research-2026-06-06.md`
**PRD:** `prd.md` (2026-06-06)
**Addendum:** `addendum.md` (2026-06-06)
**Date of reconciliation:** 2026-06-06

---

## Methodology

Each technical finding, risk, constraint, integration pattern, and recommendation from the research was checked against the PRD (constraints, NFRs, assumptions, features) and addendum (architecture, implementation guidance). Items present in research but absent from both documents are flagged as gaps.

---

## 1. Fully Covered — Research Findings Reflected in PRD/Addendum

The following research findings are adequately captured:

| Research Finding | Where Covered |
|---|---|
| BGG API requires Bearer Token since Oct 2025 | PRD §4.9 A-6; Addendum F; PRD OQ-2 |
| BGG API does NOT return EAN | PRD §3 Glossary (EAN as supplementary); Addendum D ("EAN-first deduplicacja: Odrzucone") |
| Deduplication strategy: BGG ID as primary key, EAN supplementary | PRD FR-22; Addendum D (full pipeline) |
| GameUPC API as EAN→BGG ID bridge (partial coverage warning) | PRD FR-22; Addendum D (with caveat on rate limits) |
| 3Trolle and AlePlanszowki on PrestaShop, no crawl-delay | PRD A-7; Addendum A (Scrapy) |
| Mepel blocked by Cloudflare (HTTP 403), not PrestaShop | PRD §5 Non-Goals (Phase 1.5); Addendum E |
| Mepel requires Playwright + stealth bypass | PRD §5; Addendum E (strategy table) |
| Rebel.pl: crawl-delay 5s, /promocje/ blocked | PRD §5, C-6, C-8; Addendum L |
| AlePlanszowki sitemap-first option | Addendum (implicitly via Scrapy spider design) |
| Python 3.11 + Scrapy 2.14 stack | Addendum A |
| FastAPI + PostgreSQL 16 + Next.js 14 App Router | Addendum A, C |
| APScheduler for cron (vs Celery trade-off) | Addendum A, L |
| Docker Compose + Hetzner CX21 deployment | PRD §6.1; Addendum C, I |
| Modular monolith over microservices | Addendum A, L (with justification) |
| RODO/PKE 2024 double opt-in requirements | PRD C-1 through C-4, FR-12; Addendum G |
| PostgreSQL schema (products, price_history, bgg_data, price_alerts, scrape_runs) | Addendum B |
| Materialized View for Hot Deals | Addendum B |
| BGG data cache: 30-day refresh, lazy load | PRD FR-24; Addendum F |
| BGG rate limit: ≤1 req/s, exponential backoff on 429 | PRD FR-24 consequences; Addendum F |
| Fuzzy matching for BGG ID (with confidence threshold) | Addendum D (rapidfuzz, thresholds 0.85/0.7) |
| CI/CD: GitHub Actions → SSH → docker compose | Addendum J |
| Scraper health CI workflow (daily selector check) | PRD NFR-6, FR-21 consequences; Addendum J |
| Infrastructure cost target ~€5–6/month | PRD C-9, C-10; Addendum I |
| Email providers: Brevo / Resend free tiers | Addendum H |
| Implementation sprint timeline ~8–12 weeks | Addendum K |
| Operator alert if scraper product count < threshold | PRD FR-21, NFR-8 |

---

## 2. Gaps — Research Findings Missing or Underspecified in PRD and Addendum

### GAP-1: Mepel platform identification (IdoSell/IAI) not documented

**Research finding (§3):** Mepel is likely on IdoSell/IAI-Shop (not PrestaShop), evidenced by robots.txt URL patterns (`/*/basket`, `/*/reg`), Cloudflare Managed Bots usage, and a distinct non-PrestaShop HTML structure. The IdoSell URL pattern is `/[kategoria]/[id],[slug],p,[numer].html`.

**PRD/Addendum status:** Both documents mention Mepel requires Playwright and separate handling, but neither records the platform identification (IdoSell) or its URL structure implications. This is relevant for Phase 1.5 architecture: a Mepel scraper will need IdoSell-specific selectors, not PrestaShop defaults.

**Risk:** Developer starting Phase 1.5 without this note may waste time trying to apply PrestaShop patterns.

**Recommended action:** Add to Addendum E (Mepel strategy section): "Mepel platforma: prawdopodobnie IdoSell/IAI — struktura URL `/[kategoria]/[id],[slug],p,[numer].html`. Selektory CSS będą inne niż PrestaShop."

---

### GAP-2: Cloudflare AI Labyrinth behavior threshold not reflected in NFRs or constraints

**Research finding (§15.3):** Cloudflare introduced AI Labyrinth in March 2025, which fingerprints and blocks bots that navigate more than 4 levels of pages without human-like behavior signals. This is a specific behavioral constraint on how the Mepel scraper must navigate (random delays, mouse movement simulation, realistic viewport). Standard stealth plugins alone may be insufficient.

**PRD/Addendum status:** Addendum E mentions AI Labyrinth parenthetically ("Playwright + stealth musi imitować ludzkie wzorce (random delays, mouse movement, realistic viewport)") but this is only in the Mepel section. The PRD has no constraint or assumption covering the navigational depth limit or the behavioral requirements for anti-bot bypass.

**Risk:** Phase 1.5 Playwright test may be underscoped — testing basic access without testing multi-page navigation depth will give a false positive on Mepel feasibility.

**Recommended action:** Add to OQ-3 (Mepel validation timeline): note that the Playwright test must include multi-page navigation (>4 levels) to validate against AI Labyrinth, not just a single page load.

---

### GAP-3: GameUPC API — rate limits and coverage are explicitly unknown (unresolved risk)

**Research finding (§6.2, §13.6):** GameUPC has undocumented rate limits and unknown coverage for Polish game editions specifically. The research flags this twice and states: "GameUPC API endpoint i rate limits wymagają weryfikacji na etapie implementacji." Coverage for Polish editions may be low.

**PRD/Addendum status:** The PRD (FR-22) references GameUPC as step 1 of deduplication without flagging the unknown rate limit as a constraint or open question. The Addendum A mentions "rate limits niezudokumentowane — weryfikacja w Sprint 0" in the stack comment, but this is buried in a code block comment. There is no open question (OQ) or explicit assumption (A-x) that marks GameUPC rate limits as an unresolved risk requiring Sprint 0 validation before it is used in the pipeline.

**Risk:** If GameUPC has aggressive rate limits (e.g., 1 req/10s), the EAN→BGG ID fast path in the deduplication pipeline may be non-viable at scale. The fallback (fuzzy matching) is available but this would reduce match quality for the subset of products where EAN would have given a high-confidence BGG ID.

**Recommended action:** Add OQ-7: "GameUPC API rate limits and Polish edition coverage are unknown. Sprint 0 must include a discovery spike: verify API endpoint, rate limit, and a sample of Polish board game EANs. If rate limits are prohibitive, EAN→GameUPC path is deprioritized in favor of fuzzy match as primary."

---

### GAP-4: 3Trolle uses internal SKUs (not EAN) in listing HTML — EAN only on product detail page

**Research finding (§4.1, §7.4):** 3Trolle displays internal SKUs (e.g., `3T35971`) in listing HTML, not EAN. EAN can only be obtained by visiting individual product detail pages. This adds ~634 additional requests on first scrape (for 3Trolle alone), but can be optimized by doing EAN scraping only for new products.

**PRD/Addendum status:** The PRD (FR-22 consequence) states "EAN → GameUPC" as fast path but does not specify that EAN requires a separate product-detail-page request (it is not present in the listing). The addendum D mentions "EAN (ze strony produktu, nie listingu)" as a note but does not document the request volume implication or the optimization (EAN scraping only on new products, not on every cycle).

**Risk:** If not architecturally separated, each Scrape Cycle could attempt EAN lookups for all products (not just new ones), significantly increasing request volume and duration — potentially violating NFR-2 (< 15 min Scrape Cycle).

**Recommended action:** Add to Addendum D (EAN scraping note): "EAN scraping jest jednorazowe przy pierwszym dodaniu produktu (nie przy każdym cyklu). Dla 3Trolle to ~634 dodatkowych requestów przy inicjalnym załadowaniu bazy. Implementować jako osobny background job oddzielony od głównego Scrape Cycle."

---

### GAP-5: Success metrics from research not fully mirrored in PRD success metrics

**Research finding (§15.7):** The research defines a two-phase success metrics table:

| Metric | MVP Target | Phase 2 Target |
|---|---|---|
| Integrated stores | 2–3 | 5+ |
| Products in DB | >1,000 | >5,000 |
| Scraping reliability | >95% success | >99% |
| Scrape time | <15 min | <5 min |
| Email subscriptions | >50 | >500 |
| Organic Google traffic | >100 sessions/week | >1,000/week |

**PRD/Addendum status:** The PRD SM section (§10) covers: SM-1 (95% scraping reliability), SM-2 (100 organic sessions/week within 3 months), SM-3 (50 confirmed subscriptions within 2 months), SM-4 (personal utility), SM-5 (1,000 Games with BGG data within 1 month). Scrape cycle time target (<15 min) is NFR-2.

**Gap:** Two research success metrics are missing from the PRD:
1. **Phase 2 targets** — the PRD has no Phase 2 success metric column. Phase 2 targets from research (99% reliability, <5 min scrape, >500 subscriptions, >1,000 sessions/week, >5,000 products) are not recorded anywhere. Without them, Phase 2 readiness criteria are undefined.
2. **Store count as a metric** — "stores integrated" is a delivery metric in the research but absent from PRD SM. PRD §10 counter-metrics say "do not add stores before SM-1 is stable" — which implies stores are a metric but they are never defined as SM-x.

**Recommended action:** Add SM-6 to PRD §10: "Store coverage — 2 stores live at launch; Mepel integration (Phase 1.5) constitutes 3." Consider adding a Phase 2 targets table or a note in §10 that Phase 2 success thresholds are defined in the research report.

---

### GAP-6: Rebel.pl product pages are scrapeable (not blocked) — Phase 2 strategy underspecified

**Research finding (§2.4):** Rebel.pl blocks `/promocje/` for all bots except Googlebot and imposes a 5s crawl-delay. However, the research explicitly notes: "Strony produktów NIE są zablokowane (tylko /promocje/, /api/ itp.)". The Phase 2 strategy for Rebel is therefore "either negotiate with Rebel.pl OR scrape product pages only (not /promocje/)."

**PRD/Addendum status:** PRD §5 Non-Goals says "Rebel.pl integration — Phase 2; /promocje/ blocked in robots.txt; requires negotiation or product-page-only scraping strategy." Addendum L notes rejection: "/promocje/ zablokowane... Faza 2 po negocjacjach lub strategii product-page-only." Both documents mention this correctly but neither records the key technical finding that product pages ARE accessible, nor the 5s crawl-delay implication for Phase 2 planning (full catalog at 5s/page would take hours).

**Risk:** Phase 2 Rebel planning starts from scratch without the key architectural constraint: product-page-only scraping at 5s crawl-delay means Rebel data will never be included in the Hot Deals Feed in real-time — it can only be scraped incrementally over days, which changes the product requirement for Rebel integration significantly.

**Recommended action:** Add to Addendum L (Rebel rejection note): "Rebel strony produktów są dostępne (nie zablokowane). Phase 2 opcja: scraping per-product z 5s crawl-delay — przy ~5000 produktach to ~7h pełnego scrape. Rebel w Fazie 2 wymagałby inkrementalnej strategii (np. scraping tylko nowych/zmienionych URL-i przez sitemap diff), nie pełnego re-scrape cyklu."

---

## 3. Minor Inconsistencies (Not Gaps, But Worth Noting)

### M-1: Scrape cycle time target — research vs PRD
Research §8.1 estimates 2–4 minutes for 3Trolle + AlePlanszowki combined. PRD NFR-2 sets target at <15 minutes. This is conservative and safe — no action needed, but the implementation team should know the real estimate is far lower than the NFR ceiling.

### M-2: BGG rate limit — research says "historycznie 2 req/s", PRD says ≤1 req/s
Research §13.4 notes "historycznie: 2 req/s max, bezpieczne: 1 req/s". PRD FR-24 and Addendum F both use ≤1 req/s as the binding constraint. This is correctly conservative — no gap, just a note that 1 req/s is the safe floor, not a technical ceiling.

### M-3: Preorder signal reliability flagged in research but PRD assumption A-4 already flags it
Research §4 does not address preorder signals specifically. PRD A-4 already marks this as an assumption requiring per-Store verification. Covered.

---

## 4. Summary of True Gaps (Action Required)

| Gap | Severity | Recommended Fix Location |
|---|---|---|
| GAP-1: Mepel platform = IdoSell (not documented) | Medium | Addendum E |
| GAP-2: Cloudflare AI Labyrinth 4-level navigation constraint not in Mepel go/no-go test scope | Medium | PRD OQ-3 |
| GAP-3: GameUPC rate limits unknown — no OQ or Sprint 0 task | High | PRD OQ (add OQ-7) |
| GAP-4: EAN only on product detail page (not listing) — Scrape Cycle volume implication | High | Addendum D |
| GAP-5: Phase 2 success metrics undefined; store count not a named metric | Low | PRD §10 |
| GAP-6: Rebel product pages accessible at 5s delay — Phase 2 architectural constraint not recorded | Low | Addendum L |

---

## 5. Conclusion

The PRD and addendum are well-aligned with the research report. The vast majority of critical findings — BGG auth change, EAN deduplication strategy pivot, Mepel Cloudflare risk, RODO/PKE 2024 requirements, technology stack, schema, cost model, and CI/CD — are faithfully captured. The six gaps are real but targeted: two (GAP-3 and GAP-4) carry meaningful implementation risk and should be addressed before sprint planning. The remaining four are Phase 2 planning concerns or minor documentation completeness issues.

**No fundamental architectural disagreements exist between the research and the PRD/addendum.**
