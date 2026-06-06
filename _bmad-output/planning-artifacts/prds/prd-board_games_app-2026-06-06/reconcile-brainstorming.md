# Reconciliation: Brainstorming → PRD + Addendum

**Input:** `brainstorming-session-2026-06-05-233722.md`
**PRD:** `prd.md` (2026-06-06)
**Addendum:** `addendum.md` (2026-06-06)
**Reconciled by:** Claude Code (automated pass)
**Date:** 2026-06-06

---

## 1. Coverage Map — All 14 Brainstorming Ideas

| # | Idea | Captured in PRD | Captured in Addendum | Status |
|---|---|---|---|---|
| Funkcja #1 | Flipper Mode | §4.7 FR-16, FR-17, UJ-2 | — | COVERED |
| Funkcja #2 | Historia cen | §4.2 FR-3, FR-4 | Materialized view §B | COVERED |
| Funkcja #3 | Alerty cenowe (Typ A + B) | §4.5 FR-10–FR-13 | §G RODO model | COVERED |
| Funkcja #4 | Feed "Gorące okazje dziś" | §4.1 FR-1, FR-2 | §B hot_deals view | COVERED |
| Funkcja #5 | Filtry planszówkowe MVP | §4.3 FR-5, FR-6 | — | COVERED |
| Funkcja #6 | Paszport planszówki | §4.4 FR-7, FR-8 | §F BGG client | COVERED |
| Funkcja #7 | Ostrzeżenie o wymaganiach DLC | §4.4 FR-9 | schema bgg_data.expansion_of | COVERED |
| Funkcja #8 | Podstrona "Nadchodzi" / preordery | §4.6 FR-14, FR-15 | — | COVERED |
| Funkcja #9 | Newsletter tygodniowy | §5 Non-Goals (Phase 2) | — | COVERED — deferred |
| Funkcja #10 | SEO-first architektura | §4.8 FR-18–FR-20 | — | COVERED |
| Tech #1 | Wyzwanie scrapingu — robots.txt, Rebel | §5, §8.2 C-5–C-8, §6.2 | §E Mepel, §L Rebel | COVERED |
| Tech #2 | Scraper per platforma (PrestaShop) | §4.9 FR-21, A-7 | §A stack, §C arch | COVERED |
| Tech #3 | Stack mobilny — React Native, GitHub | §5 Non-Goals Phase 3, §9 | — | COVERED — deferred |
| Tech #4 | Deduplicacja EAN → BGG ID → Fuzzy | §4.9 FR-22 | §D deduplication (revised order) | COVERED — with revision |

---

## 2. Genuine Gaps — Present in Brainstorming, Missing or Underdefined in PRD + Addendum

### GAP-1: Optymalizacja czasu scrapingu — stop-when-price-returns (paginacja)

**Brainstorming (Tech #1):** Explicitly describes an early-stop pattern: "sortowanie po cenie rosnąco + stop gdy cena wraca do poziomu regularnego — potencjalne skrócenie czasu scrape'a z 15 min do 2 min."

**PRD/Addendum status:** NFR-2 sets a 15-minute SLA for the Scrape Cycle but says nothing about this optimization. The addendum describes Scrapy setup (§A, §C) without mentioning the early-stop pattern.

**Risk if not captured:** Implementation defaults to full-catalog scraping, missing the stated 2-min optimization. NFR-2's 15-min limit is generous enough that no one is forced to discover this.

**Recommendation:** Add a scraper implementation note to addendum §A or §C: "PrestaShop spiders should sort results by price ascending and stop pagination when current_price >= price_orig (discount_pct returns to 0%), avoiding non-discounted tail pages."

---

### GAP-2: Allegro/OLX — brak placeholdera architektonicznego dla Fazy 3

**Brainstorming (Faza 3):** "Allegro/OLX integracja dla flipperów (marża rynkowa)" — live resale data to replace Margin Proxy.

**PRD/Addendum status:** PRD §5 lists Allegro/OLX as Phase 3 Non-Goal; A-1 acknowledges the MVP Margin Proxy formula. However, the addendum has no placeholder, schema note, or design consideration for how Allegro/OLX data would integrate in Phase 3 (API availability, data model impact on bgg_data or price_alerts).

**Risk if not captured:** Phase 3 arrives with no schema pre-thinking; adding market_avg_price to bgg_data or a separate resale_prices table becomes a migration problem.

**Recommendation:** Add a `[FUTURE Phase 3: Allegro/OLX integration for Margin Proxy — bgg_data schema may need market_avg_price column or separate resale_prices table; Allegro REST API requires seller account]` note in addendum §D (deduplication/Margin Proxy context).

---

### GAP-3: Mepel — zmiana scope względem brainstormingu niewyjaśniona w PRD

**Brainstorming (Priorytety):** Mepel is unambiguously in the MVP Phase 1 list: "MVP (Faza 1) — Sklepy: 3Trolle, AlePlanszowki, Mepel".

**PRD/Addendum status:** PRD §3 Glossary defines v1 Stores as only "3Trolle, AlePlanszowki". Mepel is Phase 1.5 in §5 and §6.2. The addendum §E explains the Cloudflare/HTTP 403 problem technically, but the PRD never explains that this is a scope correction from the original brainstorming assumption.

**Risk if not captured:** A future collaborator reading only the PRD sees "Phase 1.5" with no explanation that this was originally Phase 1. The rationale (Cloudflare, not a product decision) is invisible.

**Recommendation:** Add one sentence to §6.2 or OQ-3: "Note: Mepel was originally scoped for MVP in the brainstorming session; deferred to Phase 1.5 after discovery of Cloudflare/HTTP 403 protection (post-brainstorming finding)."

---

## 3. Qualitative Gaps — Tone, Voice, Intent Lost in FR Structure

### Q-1: Flipper Mode jako "kluczowy przełom" — nie jako równorzędna sekcja

**Brainstorming summary:** Explicitly calls Flipper Mode "kluczowy przełom" — a unique segment unserved by any Polish aggregator. This is a strategic differentiator signal, not just a feature.

**In PRD:** Flipper Mode is §4.7 — a peer section to Hot Deals Feed with no signal that this is *the* differentiator. A first-time reader doesn't know this was the brainstorming breakthrough.

**Brakujący element:** One sentence in §1 Vision or §2 Target Users naming Flippers as an underserved niche and Flipper Mode as the primary competitive differentiator vs. ceneo/i-szop.

---

### Q-2: "Nawyk codziennego odwiedzania" — intent for Hot Deals Feed

**Brainstorming (Funkcja #4):** "Strona główna która sama w sobie jest użyteczna bez rejestracji — redukuje barierę wejścia i buduje nawyk codziennego odwiedzania."

**In PRD:** §4.1 describes the Feed mechanically (what it renders, sort order). No design intent that the Feed should be compelling enough to visit daily without an active purchase intent.

**Brakujący element:** A design note or SM: "Hot Deals Feed should be compelling as a daily habit loop, not only as a search destination — returning visitors with no specific game in mind should still find value."

---

### Q-3: "Ratowanie niedoświadczonych graczy" — emocja w DLC Warning

**Brainstorming (Funkcja #7):** "Ratuje niedoświadczonych graczy przed zakupem dodatku bez podstawki — żaden sklep tego nie robi."

**In PRD:** FR-9 describes the warning technically ("prominently displays"). The emotional intent — protecting someone from a frustrating mistake — is absent, which affects UX decisions: high contrast, plain language, warning-level visibility vs. informational footnote.

**Brakujący element:** One sentence in §4.4 description: "DLC Warning is designed for players who do not yet know that expansions require the base game — this implies high-contrast placement and plain-language copy, not a technical footnote."

---

### Q-4: SEO jako moat konkurencyjny — nie tylko kanał dystrybucji

**Brainstorming (Funkcja #10):** "Ceneo jej nie zrywa bo nie rozumie domeny" — SEO advantage is rooted in domain knowledge that generalist aggregators lack.

**In PRD:** §4.8 opens with "Organic search is the primary acquisition channel" — correct, but the competitive moat argument ("Ceneo doesn't understand the domain") is absent. Developers implementing SEO know what to build, not why it's a defensible position.

**Brakujący element:** One sentence in §4.8 description: "Ceneo and i-szop index board games as generic products — long-tail queries like 'Brass Birmingham historia cen' are uncontested. Game Passports exploit this gap."

---

### Q-5: Zasada prostoty — brak jako explicit constraint

**Brainstorming summary:** "Projekt: Open-source, hobbistyczny — monetyzacja gdy produkt osiągnie dojrzałość."

**In PRD:** §1 mentions "hobby-operated", §8.3 has a cost target. But no explicit constraint that in any tradeoff between complexity and simplicity, simplicity wins. The addendum realizes this through choices (monolith, APScheduler, no Redis) but the principle isn't stated in the PRD itself.

**Brakujący element:** One constraint in §8: "C-11: Complexity budget — project is solo hobby-operated; when a technical decision can go either way, prefer the option requiring less operational overhead, even if it's less scale-ready."

---

## 4. Summary

| Category | Count |
|---|---|
| Ideas fully covered | 12 / 14 |
| Ideas covered with documented revision (EAN order change) | 1 |
| Ideas deferred to Phase 2/3 and listed in Non-Goals | 5 |
| Genuine functional gaps (GAP-1, GAP-2, GAP-3) | 3 |
| Qualitative/tone gaps (Q-1 through Q-5) | 5 |

**Overall verdict:** PRD and Addendum provide strong coverage. No critical feature is missing or misrepresented. The three functional gaps are optimizations and future-proofing notes, not omissions that would cause incorrect implementation. The most impactful unaddressed gaps are qualitative: the Flipper Mode differentiation signal (Q-1) and the daily-habit intent for the Feed (Q-2) could be recovered in a single editorial pass on §1 Vision and §4.1 description. GAP-1 (scraper stop optimization) is worth adding to the addendum before Sprint 1 to prevent a 15-min vs. 2-min scrape runtime difference going unnoticed.

---

*End of reconciliation.*
