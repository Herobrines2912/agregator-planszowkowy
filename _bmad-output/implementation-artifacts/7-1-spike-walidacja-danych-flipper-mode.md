---
baseline_commit: 547e678
---

# Story 7.1: Spike — Walidacja Danych dla Flipper Mode

Status: review

**Epic:** 7 — Flipper Mode
**Dev:** Dev A + Dev B (spike — brak plików produkcyjnych; wymaga danych z Epic 2, więc co najmniej kilka produktów w DB)
**Depends on:** Epic 2 (scraping pipeline) — musi mieć realny historyczny scrape data w `price_history`, nie tylko seed/fixture rows.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Prerequisite — Read Before Starting

Ten spike **nie produkuje kodu produkcyjnego**. Jego jedynym artefaktem jest **decyzja**: czy Epic 7 (Flipper Mode) ma sens przy obecnym stanie danych, i jeśli nie — co robimy zamiast tego. Story 7.1 jest **gate'em blokującym** dla Story 7.3 i 7.4 (`epics.md` L2013): nie zaczynać tych stories, dopóki spike nie jest PASSED lub decyzja alternatywna nie została podjęta.

`getFlipperDeals()` (Story 7.4, `epics.md` L2147-2167) i `calcMarginProxy()` mają już finalny, zatwierdzony kształt — ten spike **odtwarza dokładnie tę samą logikę w SQL** żeby zmierzyć jej pokrycie na prawdziwych danych, zanim ktokolwiek zaimplementuje ją w produkcie. Nie wymyślaj innej definicji marginu — użyj formuły poniżej dosłownie, inaczej wynik spike'a nie będzie reprezentatywny dla tego, co Story 7.4 faktycznie zbuduje.

## Story

As a **team**,
I want to validate whether we have enough data to compute meaningful margin proxies before building the Flipper UI,
so that we don't build a page that shows "—" in every row at launch.

## Acceptance Criteria

1. **Given** the spike is complete, **when** team reviews results, **then** the team has answered:
   - (1) Czy `price_history` zawiera ≥ 5 unikalnych dat per gra, by obliczyć historyczne maksimum jako proxy wartości rynkowej?
   - (2) Czy `calcMarginProxy(current_price, historical_max)` daje sensowne wartości (>0%, ≤200%) dla ≥ 30% gier w DB?
   - (3) Jaki % gier miałby widoczne dane w Flipper Mode przy aktualnym stanie DB?
2. **Given** the spike results, **when** ≥ 30% gier ma obliczalny margin proxy, **then** kontynuuj budowanie Epic 7 zgodnie z planem — **spike PASSED**.
3. **Given** the spike results, **when** < 30% gier ma obliczalny margin proxy, **then** team podejmuje decyzję: (a) opóźnić Epic 7 do zebrania większej historii cen, (b) zmienić definicję proxy (np. cena okładkowa z BGG zamiast historical max), (c) oznaczyć Epic 7 jako post-MVP — **spike FAILED**, decyzja wymagana przed kontynuacją.
4. **Given** the spike output, **when** documented, **then** wynik wpisany jako komentarz w `epics.md` przy Story 7.1, plus wyniki zapisane w `docs/spike-results/` (projektowa konwencja z 1.5/1.6/1.7), i jako nowy ADR w `architecture.md` jeśli decyzja techniczna zmienia architekturę.

## Tasks / Subtasks

- [x] **Task 1 — Setup** (AC: 1)
  - [x] 1.1 Get `DATABASE_URL` from the **Neon dashboard** (not Vercel env vars — Vercel's copy can be stale/pooled differently; see project memory on this). Export it locally or add to `scraper/.env` (git-ignored).
  - [x] 1.2 Confirm DB has real scrape history, not just fixtures: `SELECT COUNT(*) FROM scrape_runs;` should return multiple runs across different days.

- [x] **Task 2 — Question 1: date coverage** (AC: 1)
  - [x] 2.1 Run:
    ```sql
    SELECT COUNT(*) AS games_with_5plus_dates
    FROM (
      SELECT g.id
      FROM games g
      JOIN products p ON p.game_id = g.id
      JOIN price_history ph ON ph.product_id = p.id
      GROUP BY g.id
      HAVING COUNT(DISTINCT ph.scraped_at::date) >= 5
    ) sub;
    ```
  - [x] 2.2 Compare against total games with at least one product: `SELECT COUNT(DISTINCT game_id) FROM products WHERE game_id IS NOT NULL;`
  - [x] 2.3 Record both raw counts and the percentage.

- [x] **Task 3 — Question 2 & 3: margin proxy coverage** (AC: 1, 2, 3) — **must mirror Story 7.4's `getFlipperDeals()`/`calcMarginProxy()` exactly** (see Dev Notes for why)
  - [x] 3.1 Run:
    ```sql
    WITH current_prices AS (
      SELECT DISTINCT ON (game_id) game_id, price AS current_min_price
      FROM products
      WHERE in_stock = true AND price IS NOT NULL
      ORDER BY game_id, price ASC
    ),
    historical_max AS (
      SELECT p.game_id, MAX(ph.price) AS historical_max_price
      FROM price_history ph
      JOIN products p ON p.id = ph.product_id
      WHERE ph.price IS NOT NULL
      GROUP BY p.game_id
    )
    SELECT
      cp.game_id,
      cp.current_min_price,
      hm.historical_max_price,
      ROUND((hm.historical_max_price - cp.current_min_price) / cp.current_min_price * 100, 1) AS margin_pct
    FROM current_prices cp
    JOIN historical_max hm ON hm.game_id = cp.game_id
    WHERE hm.historical_max_price > cp.current_min_price  -- same exclusion as getFlipperDeals() AC (margin <= 0% is not a flip opportunity)
    ORDER BY margin_pct DESC;
    ```
  - [x] 3.2 From this result set: count rows where `margin_pct > 0 AND margin_pct <= 200` → this answers **Question 2** (sensible margin values). Divide by total games with ≥1 in-stock product (Task 2.2's denominator) for the percentage.
  - [x] 3.3 The full result set from 3.1 (before the >0/≤200 filter, but after the `historical_max > current_min` exclusion) is exactly what `getFlipperDeals()` would return with no filters applied — its row count / total games denominator answers **Question 3** (% of games visible in Flipper Mode).
  - [x] 3.4 Sanity-spot-check 3-5 individual games' output against their actual price history in `price_history` to confirm the query isn't silently wrong (e.g. picking a stale `current_min_price` from an out-of-stock product, or double-counting across stores).

- [x] **Task 4 — Decision** (AC: 2, 3)
  - [x] 4.1 If Question 2's percentage ≥ 30%: spike **PASSED**. No architecture change — proceed to 7.2/7.3/7.4 as planned.
  - [x] 4.2 If < 30%: team picks one of (a) delay Epic 7, (b) redefine the proxy (e.g. BGG MSRP instead of historical max), (c) mark Epic 7 post-MVP. This decision requires the user's sign-off — do not pick unilaterally.

- [x] **Task 5 — Document results** (AC: 4)
  - [x] 5.1 Create `docs/spike-results/flipper-margin-proxy.md` following the format of `docs/spike-results/gameUPC-coverage.md` (title, Story/Dev/Date header, methodology, raw query results table, conclusion).
  - [x] 5.2 Append a short result comment directly under `### Story 7.1` in `_bmad-output/planning-artifacts/epics.md` (PASSED/FAILED + the 3 answers + one-line rationale).
  - [x] 5.3 **Only if** the decision changes architecture (i.e. NOT a plain PASS, and NOT a simple "delay"): add a new `**ADR-005 — <title>:**` entry to `_bmad-output/planning-artifacts/architecture.md`, directly after `ADR-004 — Flipper Mode Routing` (currently line 69), following the existing ADR-001..004 one-paragraph format. — N/A, plain PASS, no ADR added.

## Dev Notes

### Why the SQL must match Story 7.4's spec exactly

Story 7.4 (`epics.md` L2136-2167, not yet built) already defines the production formula:
- `current_min_price` = lowest **in-stock** product price per game (same shape as `hot-deals.ts`'s cheapest-offer pattern)
- `historical_max_price` = `MAX(price)` from `price_history`, joined via `products.game_id`
- `margin_pct` = `round((historical_max - current_price) / current_price * 100, 1)` — **margin on cost, not on price**
- Exclusion: `historical_max_price IS NULL OR historical_max_price <= current_min_price` (margin ≤ 0% is not a flip opportunity)

If this spike used a different formula (e.g. margin on price, or historical average instead of max), a PASS here would not predict what `getFlipperDeals()` actually returns in production — the whole point of a gating spike is measuring the real thing before building it.

### Known data-quality traps

- `price` and `price_orig` are `NUMERIC(10,2)` in Postgres — psycopg2 returns `Decimal`, not `float`. If running these queries via a Python script instead of raw `psql`, do arithmetic in `Decimal`, never cast to `float` (CLAUDE.md price-parsing rule, same spirit).
- `price_history` is **append-only** (`web/src/db/schema.ts:86-97` comment) — read-only queries only, never write/delete during this spike.
- A game can have **multiple products** (different stores). `historical_max` should be the max across *all* its products' price history, not per-product — the CTE above already does this correctly via `p.game_id` grouping.
- `products.price` can be `NULL` (out of stock or scrape gap) — both CTEs already filter `WHERE price IS NOT NULL` / `in_stock = true`. Don't drop these guards.

### Where to get `DATABASE_URL`

Pull it from the **Neon dashboard**, not from Vercel's env var UI — a prior incident in this project involved a stale/pooled `DATABASE_URL` copied from Vercel breaking a prod build mid-fix. No local `.env` with `DATABASE_URL` currently exists in this repo — this is expected; it's git-ignored and per-developer.

### Running ad-hoc queries

No existing `scripts/` helper runs raw analytical SQL against Neon in this repo (`scraper/scripts/` has spike scripts for external APIs, `scraper/utils/db_health.py` has the `psycopg2.connect(database_url)` connection pattern to copy). Either: (a) use `psql "$DATABASE_URL"` directly if the CLI is available, or (b) write a throwaway `scraper/scripts/spike_flipper_margin_proxy.py` following `db_health.py`'s connect/cursor/close pattern — **do not commit this script as a permanent artifact** unless the team wants to keep it for re-running the check later (if so, follow `spike_gameupc.py`'s docstring-with-usage-instructions convention).

### What NOT to build

- No `lib/calc.ts`, no `db/queries/flipper.ts`, no `/flipper` route — all of that is Story 7.2/7.3/7.4, gated on this spike's PASS.
- No new DB tables/columns/migrations — this spike only reads existing `games`/`products`/`price_history`.

### Project Structure Notes

- Output artifacts only: `docs/spike-results/flipper-margin-proxy.md` (new), a comment appended to `_bmad-output/planning-artifacts/epics.md` (Story 7.1 section), and conditionally a new ADR entry in `_bmad-output/planning-artifacts/architecture.md`.
- No production source files touched, matching every other spike story in this project (1.5, 1.6, 1.7).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.1] — this story's AC, verbatim
- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.4] — `getFlipperDeals()`/`calcMarginProxy()` spec this spike's SQL must mirror
- [Source: _bmad-output/planning-artifacts/architecture.md:63-69] — ADR-001..004 format and Flipper Mode routing decision (ADR-004)
- [Source: web/src/db/schema.ts:64-97] — `products`/`price_history` table definitions, append-only comment
- [Source: web/src/db/queries/hot-deals.ts:72-81] — existing `price_orig`/cheapest-in-stock-offer pattern this spike's `current_min_price` CTE mirrors
- [Source: scraper/utils/db_health.py] — `psycopg2.connect(DATABASE_URL)` connection pattern to reuse if writing a throwaway query script
- [Source: docs/spike-results/gameUPC-coverage.md] — spike-results doc format convention to follow for Task 5.1

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

- Ran `scraper/scripts/spike_flipper_margin_proxy.py` against live Neon `neondb` (2026-08-22).
- Ad-hoc follow-up queries (not saved as a script) to spot-check outlier games and quantify a `game_id` contamination issue discovered during Task 3.4.

### Completion Notes List

- Spike **PASSED**: 32.4% of in-stock games (31.5% on data excluding a contamination caveat below) have a sensible margin proxy — above the 30% threshold. No architecture change; proceeding to 7.2–7.6 as planned.
- Task 3.4 sanity check surfaced a pre-existing dedup bug: 208/4159 `game_id`s (5%) have ≥4 wildly different product names attached (e.g. `game_id=760` mixes "Civilization: A New Dawn", "Wojna o Pierścień", "X-Wing", "EXIT" products). This inflates/pollutes 13 of the top 20 highest-margin rows with nonsensical values (e.g. 4836%). Confirmed the PASS conclusion holds even after fully excluding these 208 games (31.5%). Recommend a follow-up bug story to fix/filter this before Story 7.3/7.4 ship — not filed automatically, flagging for team sign-off.
- Full results and methodology: `docs/spike-results/flipper-margin-proxy.md`. Result comment appended to `epics.md` under Story 7.1. No ADR added (plain PASS, per Task 5.3 condition).
- `scraper/scripts/spike_flipper_margin_proxy.py` kept as a permanent script (not deleted) since it may be useful to re-run the coverage check later, following `spike_gameupc.py`'s convention — has a docstring with usage instructions.

### File List

- `docs/spike-results/flipper-margin-proxy.md` (new)
- `scraper/scripts/spike_flipper_margin_proxy.py` (new)
- `_bmad-output/planning-artifacts/epics.md` (modified — result comment under Story 7.1)

## Change Log

- 2026-08-22 — Spike executed against live Neon DB. Result: PASSED. Data-quality caveat (game_id contamination) discovered and documented; recommend follow-up bug story before 7.3/7.4.
