# Spike: Flipper Mode Margin Proxy Data Coverage

**Story:** 7.1
**Dev:** Dev A + Dev B
**Date:** 2026-08-22

## Methodology

SQL mirrors Story 7.4's `getFlipperDeals()` / `calcMarginProxy()` spec exactly (per Story 7.1 Dev Notes), so a PASS here predicts what production would actually show:

- `current_min_price` = lowest **in-stock** product price per game
- `historical_max_price` = `MAX(price)` from `price_history`, joined via `products.game_id`
- `margin_pct` = `round((historical_max - current_price) / current_price * 100, 1)`
- Exclusion: rows where `historical_max_price <= current_min_price` are dropped (margin ≤ 0% is not a flip opportunity)

Run against live Neon `neondb` (pooled connection), 2026-08-22, via `scraper/scripts/spike_flipper_margin_proxy.py`.

## Results

### Question 1 — date coverage

| Metric | Value |
|---|---|
| `scrape_runs` total / distinct days | 101 / 51 |
| Games with ≥5 distinct `price_history` dates | 4155 / 4159 (**99.9%**) |

Date coverage is not a limiting factor — nearly every game with a product has ample price history.

### Question 2 — margin proxy sensibility (>0%, ≤200%)

| Metric | Value |
|---|---|
| Raw (unfiltered `game_id`) | 830 / 2558 in-stock games (**32.4%**) |
| Excluding contaminated `game_id`s (see caveat below) | 741 / 2350 (**31.5%**) |

Both above the 30% PASS threshold.

### Question 3 — % of games visible in Flipper Mode (getFlipperDeals() shape, no margin filter)

| Metric | Value |
|---|---|
| Rows returned | 1017 / 2558 in-stock games (**39.8%**) |

## Caveat — game_id contamination (Task 3.4 sanity check)

Spot-checking the top-margin rows surfaced a **pre-existing dedup/game-mapping bug**, not a price-parsing issue: 208 of 4159 games (5%) have `products` rows with ≥4 wildly different product names sharing one `game_id`. Example — `game_id=760` (`games.name = "Civilization: A New Dawn"`, BGG 233247) has products attached for "Wojna o Pierścień", "Horror w Arkham LCG", "X-Wing: Zestaw dodatkowy Slave I", and "EXIT: Gra Tajemnic" — five unrelated games merged under one `game_id`. This produces nonsensical `margin_pct` values (e.g. 4836%, comparing a 3.99 zł unrelated product against a 196.95 zł unrelated product's historical max).

Impact measured:
- 89 of the 830 "sensible" (0–200%) rows come from a contaminated `game_id` (~11%)
- **13 of the top 20** highest-`margin_pct` rows are contaminated — a naive "sort by margin desc" UI would surface garbage at the top of Flipper Mode at launch
- Excluding all 208 contaminated `game_id`s entirely from both numerator and denominator still yields 31.5% — the PASS conclusion holds either way

This is a data-quality bug in the existing product→game mapping (Epic 2 dedup pipeline), independent of this spike's methodology. **Not a blocker for Story 7.1's PASS gate**, but Story 7.3/7.4 (or a follow-up bug story) should filter or fix these before Flipper Mode ships, or the top rows of the table will visibly show impossible "deals."

## Conclusion

**Spike PASSED.** 32.4% (31.5% on clean data) of in-stock games have a computable, sensible margin proxy — above the 30% threshold. Proceed with Epic 7 (Stories 7.2–7.6) as planned.

**Recommendation:** file a follow-up bug story to fix/filter the `game_id` contamination (208 affected games) before Story 7.3/7.4 ship, so Flipper Mode doesn't launch with visibly broken top rows.
