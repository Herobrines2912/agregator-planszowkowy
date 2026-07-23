# Investigation: GameUPC sandbox key returns canned demo answers, cross-contaminating unrelated products into shared `games` rows

## Hand-off Brief

1. **What happened.** `GAMEUPC_API_KEY` was never configured anywhere in this repo (not in `.github/workflows/scraper.yml` secrets, not even in `scraper/.env.example`), so `DeduplicationPipeline` has silently used GameUPC's public demo/sandbox key (`test_test_test_test_test`) in every production scraper run since 2026-06-22 — that key does not do a real per-EAN lookup and instead returns a small rotating set of canned demo answers, so every product whose EAN happens to draw one of those canned answers gets merged into the wrong `games` row via `ON CONFLICT (bgg_id) DO UPDATE`. **Confirmed** by direct reproduction against the live GameUPC API and by DB evidence of at least two contaminated clusters.
2. **Where the case stands.** Root cause is Confirmed at High confidence — no further diagnostics needed. Full scope (how many of the 24k+ scraped rows are affected) is not yet measured — only 2 of what are likely several canned-answer clusters have been enumerated.
3. **What's needed next.** Set a real `GAMEUPC_API_KEY` (or gate the EAN path off when absent) to stop new contamination, then run a cleanup/re-match job against existing poisoned rows. See Recommended Next Steps.

## Case Info

| Field            | Value                                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| Ticket           | N/A — reported by user from live site browsing                             |
| Date opened      | 2026-07-21                                                                  |
| Status           | Concluded                                                                   |
| System           | Production Neon DB (project `late-bar-42218248`, "Agregator Planszówek"); scraper runs via GitHub Actions daily cron |
| Evidence sources | Neon DB (live query), scraper source (`scraper/scraper/pipelines/deduplication.py`), `.github/workflows/scraper.yml`, live GameUPC API (direct reproduction), Story 1.6 spike results |

## Problem Statement

User-reported (verbatim intent, translated): the game passport page for "Gier" shows a crossed-out price of 330 zł and current price 30,21 zł, but clicking through redirects to a completely different product — "Alkoprzeprawa" (a party-game set) at 3Trolle for 30,21 zł. User separately flagged "Zamiast Nas" (180→30 zł, correct Lucrum Games link) as a possible false positive / real promo, not necessarily a bug.

## Evidence Inventory

| Source                                                    | Status    | Notes                                                                 |
| ----------------------------------------------------------- | --------- | ---------------------------------------------------------------------- |
| Neon DB — `games`/`products`/`stores` tables                | Available | Queried directly; primary evidence source                             |
| `scraper/scraper/pipelines/deduplication.py`                 | Available | Full pipeline logic read                                              |
| `.github/workflows/scraper.yml`                               | Available | Confirmed no `GAMEUPC_API_KEY` secret configured                      |
| `scraper/.env.example`, `scraper/.env`                        | Available | Confirmed `GAMEUPC_API_KEY` absent from both — not even documented    |
| Live GameUPC API (`api.gameupc.com/test/upc/{ean}`)           | Available | Directly queried with prod demo key + 2 real prod EANs — reproduced   |
| `_bmad-output/implementation-artifacts/1-6-gameUPC-coverage-spike.md`, `docs/spike-results/gameUPC-coverage.md` | Available | Spike's own 22/22 test used the same demo key and got correct, varied results — this refuted an early "demo key is globally broken" hypothesis and pointed at a narrower "canned-answer" mechanism instead |
| GitHub Actions run logs (`logger.warning` for missing key)   | Missing   | Not fetched — would show exactly how many runs hit the fallback path, but DB evidence already confirms the effect |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --------------- | -------- | ------ | ----- |
| 1 | Enumerate all canned-answer clusters (beyond `232420`/"Gier" and `178255`/"Pizza Wars PL") to size total contamination | High | Open | Needs a heuristic pass — e.g. flag `bgg_id` groups where `bgg_sync_status='synced'` product names have low fuzzy-similarity to each other |
| 2 | Fetch GitHub Actions `scraper.yml` run logs for the `GAMEUPC_API_KEY not set` warning frequency | Low | Open | Confirms exact onset date/frequency; not required to act on the fix |
| 3 | Check whether `_try_name_path` (BGG fuzzy search fallback) has its own failure modes now that `BGG_API_TOKEN` **is** configured | Low | Open | Out of scope for this incident — token is set (`scraper/.env` has a real value), this path isn't implicated in the reported symptom |

## Timeline of Events

| Time                  | Event                                                                                     | Source                                              | Confidence |
| ---------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ---------- |
| 2026-06-22             | `DeduplicationPipeline` (with the `GAMEUPC_API_KEY` fallback-to-demo-key logic) merged      | `git log`, commit `03c07f0`, Story 2.2                | Confirmed  |
| 2026-06-22 → present   | Daily 06:00 UTC scraper cron runs `DeduplicationPipeline` against every scraped product; `GAMEUPC_API_KEY` unset in every run → demo key used every time | `.github/workflows/scraper.yml:4-5`, absence of the secret | Confirmed  |
| ongoing                | Every EAN-bearing product whose GameUPC demo response lands on a canned `bgg_info[0]` gets silently merged (`ON CONFLICT (bgg_id) DO UPDATE`) into that canned game's row | `deduplication.py:186-207`, DB query results          | Confirmed  |
| 2026-07-21             | User observes wrong price/link on "Gier" game passport; investigation opened                | User report                                         | Confirmed  |

## Confirmed Findings

### Finding 1: `GAMEUPC_API_KEY` is not configured anywhere in the repo

**Evidence:** `grep -n "GAMEUPC" .github/workflows/scraper.yml scraper/.env.example scraper/.env` → zero matches in all three files. `.github/workflows/scraper.yml:51` shows `BGG_API_TOKEN: ${{ secrets.BGG_API_TOKEN }}` is wired as a GH Actions secret, but there is no equivalent line for `GAMEUPC_API_KEY`.

**Detail:** `scraper/scraper/pipelines/deduplication.py:48-50` reads `os.getenv("GAMEUPC_API_KEY", _GAMEUPC_DEMO_KEY)` and logs only a `logger.warning` when it falls back — no hard failure, no operator-visible alert beyond scraper logs. Every scraper run in production has silently used the public demo key `test_test_test_test_test` since this pipeline was merged.

### Finding 2: The GameUPC demo key does not do a real per-EAN lookup — it returns a small set of canned demo answers

**Evidence:** Direct reproduction, 2026-07-21. Queried `https://api.gameupc.com/test/upc/{ean}` with header `x-api-key: test_test_test_test_test` for two different real production EANs:
- `5904305400945` (belongs to "Laserowa eskadra", a real AlePlanszowki product) → `"searched_for": "Pizza Wars PL"`, `"bgg_info": [{"id": 232420, "name": "Gier", "published": "2017", ...}]`
- `5906684674009` (belongs to "Laserowa eskadra: Czarna dziura", a different real product) → `"searched_for": "Undaunted: North Africa"`, `"bgg_info": [{"id": 232420, "name": "Gier", ...}]` — same `bgg_info[0].id` despite a different `searched_for` value and a genuinely different input EAN.

**Detail:** Both real, distinct EANs resolved to the identical `bgg_id = 232420` ("Gier"). The `searched_for` field varying while `bgg_info[0].id` stays fixed indicates the demo key ignores the actual UPC and serves from a small rotating pool of canned example responses — not a live per-product lookup. This directly refutes Story 1.6's spike result of "22/22 matched, all distinct" (`docs/spike-results/gameUPC-coverage.md`) as evidence the demo key is generally reliable — spot-checking two more EANs today shows collisions the spike's 22-item sample didn't happen to hit (see Hypothesis 1 below for how this was reasoned through).

### Finding 3: Two confirmed contamination clusters in production DB, sharing the canned demo `bgg_id`s

**Evidence (cluster A — `bgg_id = 232420`, `games.id = 59`, `games.name = 'Gier'`):** SQL query against Neon project `late-bar-42218248` returned 23 products under this single game, spanning wildly unrelated titles — "Laserowa eskadra", "Skytear Horde Deluxe", "Wroth", "Barrage: Zamorskie Spółki", "TUG!", "Alkoprzeprawa - zestaw 5 gier imprezowych" (product_id 8693, price 30.21, price_orig 329.99 — **this is exactly the product+price the user reported** under the "Gier" game passport), across both AlePlanszowki and 3Trolle.

**Evidence (cluster B — `bgg_id = 178255`, `games.name = 'Pizza Wars PL'`):** 8 unrelated products — "A Song of Ice & Fire - Bohaterowie Baratheonów IV", "Dzieci kontra Rodzice. Sport", "Kunszt" (×2, one per store), "Pieczątki motywujące", "Tuletorn (edycja polska)", "Zagadkopis I. (Albi)", "Zagadkopis dla Dziadka (Albi)" — none related to a game called "Pizza Wars".

**Detail:** `"Pizza Wars PL"` is not a coincidence — it is the literal `searched_for` value returned in Finding 2's first API response, confirming cluster B is contamination from the same demo-key mechanism, not a real popular title with many legitimate SKUs (contrast with genuinely large legitimate clusters in the same aggregate query — e.g. `bgg_id=13` "Catan" with 21 products, `bgg_id=822` "Carcassonne" with 9 products — those are real base-game+expansion families and are not implicated by this investigation).

### Finding 4: "Zamiast Nas" is NOT part of this bug — user's own caveat is correct

**Evidence:** `games.id = 1233`, `slug = 'bgg-369548'`, `name = 'After Us'`, with exactly 2 products: `"Zamiast nas"` at AlePlanszowki (35.00 zł, was 199.99 zł) and `"Zamiast Nas"` at 3Trolle (126.43 zł, was 209.99 zł) — both genuinely the same real game, correctly matched, two independent legitimate prices at two stores.

**Detail:** No cross-contamination here. The 180→30 zł figure the user recalled is a rounded paraphrase of the AlePlanszowki row (199.99→35.00); this is a real markdown, not a data bug.

## Deduced Conclusions

### Deduction 1: The `ON CONFLICT (bgg_id) DO UPDATE` upsert has no validation gate, so a wrong `bgg_id` is sufficient — on its own — to merge arbitrarily unrelated products

**Based on:** Finding 1 (wrong key in use), Finding 2 (wrong key returns a wrong but syntactically valid `bgg_id`), Finding 3 (DB shows the merge actually happening).

**Reasoning:** `_upsert_game()` (`deduplication.py:186-207`) trusts whatever `bgg_id` `_try_ean_path`/`_try_name_path` returns and upserts on it unconditionally. There is no secondary check (e.g. comparing the scraped product name against the BGG title before accepting the match) gating the EAN path the way `_try_name_path` gates on `FUZZY_THRESHOLD = 85`. The EAN path is trusted absolutely once a `bgg_info` entry exists in the response.

**Conclusion:** Even after `GAMEUPC_API_KEY` is fixed, the pipeline has no defense-in-depth against a bad EAN-path answer (whether from API error, EAN data-entry mistakes at the stores, or barcode reuse across unrelated products in the wild) merging unrelated games. This is a secondary hardening opportunity, not required to fix the reported incident, but worth a backlog item.

## Hypothesized Paths

### Hypothesis 1: Demo key intermittently returns correct answers, exceeding rate limits after N requests

**Status:** Refuted

**Theory:** Maybe the demo key generally does real per-EAN lookups but starts serving canned answers only after a request-volume threshold within a time window (explaining why the Story 1.6 spike's 22 sequential calls all matched correctly).

**Supporting indicators:** Story 1.6 spike got 22/22 correct, varied results with the same key.

**Would confirm:** Canned answers only appearing after N calls in a burst; correct answers on isolated/first calls.

**Would refute:** A canned answer on essentially the first call of a fresh session, or two isolated calls minutes apart both landing on canned answers.

**Resolution:** Refuted — the two reproduction calls in Finding 2 were made cold, minutes apart, no burst, and both landed on `bgg_id=232420`. The mechanism is more consistent with the sandbox key being scoped to a small demo/example catalog by design (independent of request volume), though the exact selection logic (hash of EAN? random? small fixed pool cycling by time?) was not further reverse-engineered — not needed to confirm the practical effect.

## Missing Evidence

| Gap                                                             | Impact                                                     | How to Obtain                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Full list of all canned-answer clusters (beyond the 2 found)        | Needed to scope the cleanup migration precisely               | Run a script cross-checking each `bgg_id`'s grouped product names for fuzzy-similarity outliers, or simply re-run every EAN-path match with a real `GAMEUPC_API_KEY` and diff |
| GitHub Actions historical run logs                                  | Would give an exact first-occurrence date and daily contamination rate | `gh run list --workflow=scraper.yml` + log fetch, if precise dating is wanted (not required to act) |

## Source Code Trace

| Element       | Detail                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------- |
| Error origin  | `scraper/scraper/pipelines/deduplication.py:48` — `os.getenv("GAMEUPC_API_KEY", _GAMEUPC_DEMO_KEY)` falls back silently |
| Trigger       | Every scraped product with an 8-14 digit EAN, on every daily `scraper.yml` cron run (`0 6 * * *`) |
| Condition     | `GAMEUPC_API_KEY` env var absent in the scraper's runtime (true for every environment in this repo — dev `.env`, `.env.example`, and CI secrets all lack it) |
| Related files | `scraper/scraper/pipelines/deduplication.py` (`_try_ean_path` L109-133, `_upsert_game` L186-207), `.github/workflows/scraper.yml` (secrets block, no `GAMEUPC_API_KEY`), `web/src/db/schema.ts` (`games.bgg_id` unique constraint that makes the merge possible) |

## Conclusion

**Confidence:** High

Root cause is Confirmed end-to-end: (1) `GAMEUPC_API_KEY` was never provisioned anywhere in this repo, so the scraper has run on GameUPC's public demo key since Story 2.2 shipped (2026-06-22); (2) that demo key, confirmed via live reproduction with two distinct real production EANs, returns a small set of canned/example `bgg_info` answers rather than doing genuine per-UPC lookups; (3) the dedup pipeline's `ON CONFLICT (bgg_id) DO UPDATE` upsert has no plausibility check, so any product landing on a canned answer gets silently merged into that canned game's `games` row; (4) production DB evidence shows at least two such contaminated clusters (23 products under "Gier"/232420, 8 under "Pizza Wars PL"/178255), with the exact product+price the user reported ("Alkoprzeprawa", 30.21 zł) confirmed inside cluster A. "Zamiast Nas" is confirmed clean — a real promotional price, not a bug.

## Recommended Next Steps

### Fix direction

Two independent mechanisms combine here and both need addressing:

1. **Stop new contamination (config fix).** Obtain a real GameUPC API key (or confirm the free/demo tier genuinely can't do real per-UPC lookups and decide whether GameUPC's EAN path is viable for this product at all) and wire it as a GitHub Actions secret (`GAMEUPC_API_KEY`) the same way `BGG_API_TOKEN` already is (`.github/workflows/scraper.yml:51`). Until then, `_try_ean_path` should refuse to trust a match when running on the known demo key (`_GAMEUPC_DEMO_KEY`) — e.g. skip the EAN path entirely rather than silently accepting a canned answer, mirroring how the missing-`BGG_API_TOKEN` case already disables its own path (`deduplication.py:52-56`).
2. **Clean up existing contamination (data fix).** For both confirmed clusters (`bgg_id 232420`, `bgg_id 178255`) — and any others found via the Investigation Backlog #1 pass — the mis-merged `products` rows need their `bgg_id`/`game_id` reset and re-matched (once a real key is in place), or manually reassigned to correct/new `games` rows. This is a data-repair task, likely a one-off operator script rather than a code change, given the append-only/audit posture the rest of this codebase follows for user data (RODO tables) — though `games`/`products` aren't RODO-scoped so a direct fix is fine here.

### Diagnostic

None needed — root cause is Confirmed, not Hypothesized. Optional: Investigation Backlog #1 (full contamination scope) before deciding cleanup script complexity.

## Reproduction Plan

1. Ensure no `GAMEUPC_API_KEY` env var is set (matches every current environment).
2. `curl -H "x-api-key: test_test_test_test_test" "https://api.gameupc.com/test/upc/<any real 13-digit EAN>"` — observe `bgg_info[0].id` lands on one of the small set of canned demo IDs (`232420` and `178255` both confirmed) rather than a title-appropriate match.
3. Cross-reference against `SELECT * FROM products WHERE bgg_id IN (232420, 178255)` in the production Neon DB (project `late-bar-42218248`) to see the resulting cross-contaminated `games` rows.

## Side Findings

- The EAN-path/name-path split (`process_item`, `deduplication.py:66-95`) has no telemetry distinguishing "matched via real key" from "matched via demo key" — worth adding a log field or metric so a recurrence would surface faster than "a user noticed it browsing."
- `_upsert_game`'s `ON CONFLICT (bgg_id) DO UPDATE SET updated_at = now()` never updates `name` after first insert (by design, presumably to avoid title drift) — this is why the poisoned game's display name stayed frozen at "Gier" instead of updating to whichever product was scraped most recently; noted for context, not a bug in itself.

## Follow-up: 2026-07-21

### New Evidence

Dispatched external research into GameUPC itself (registration path, pricing, ToS, credibility) — full report: `docs/research/gameupc-api-registration.md`. Two results bear directly on this case:

1. **A real production tier (`/v1`) does exist** and is confirmed (live `403` on `/v1` with the demo key, `200` on `/test` with the same key) to require a distinct, individually-issued key — obtainable only via a manual email request to the maintainer (no self-serve signup, no published pricing/ToS). This doesn't change the root cause, but it changes the fix options available (Story 2.2b's "Manual Prerequisite" section previously said only "check gameupc.com for a registration path" — now concrete: email `gameupc@grettir.org`, ask about cost/quota/commercial terms explicitly since none are published).
2. **A second, independent contamination vector was found by inspecting the OpenAPI spec**, unrelated to the demo-key issue: the GameUPC response schema carries `bgg_info_status`, either `"verified"` (human-confirmed) or `"choose_from_bgg_info_or_search"` (unconfirmed candidate, with a per-candidate `confidence` score) — see `docs/spike-results/gameUPC-coverage.md`'s own Story 1.6 notes, which already flagged this distinction and stated "the pipeline should ... rely on the existing BGG title-match logic for final validation." Confirmed by re-reading `deduplication.py:66-95`/`109-133`: **that validation was never actually wired up.** `_try_ean_path` reads `bgg_info[0].get("id")` unconditionally — it never inspects `bgg_info_status`, and `_try_name_path` (the "existing BGG title-match logic" the spike's notes referred to) is only invoked as a fallback when the EAN path returns `None`, never as a cross-check on an EAN-path hit. So even with a genuine, correctly-functioning production key, an unconfirmed low-confidence GameUPC candidate would still be trusted blindly today.

### Additional Findings

### Finding 5: Missing cross-validation between EAN-path and name-path is a real, independently-exploitable gap

**Evidence:** `scraper/scraper/pipelines/deduplication.py:66-95` (`process_item`) and `:109-133` (`_try_ean_path`) — confirmed by direct re-read. `_try_ean_path` extracts `raw_id = bgg_info[0].get("id")` and returns it as soon as it's non-null; `bgg_info_status` is never read anywhere in the file. `docs/spike-results/gameUPC-coverage.md` (Story 1.6, written before `deduplication.py` existed) explicitly anticipated this needing a validation step and said the dedup pipeline "should rely on the existing BGG title-match logic for final validation" — that intent did not make it into the Story 2.2 implementation.

**Detail:** All 22 real-world EANs in the Story 1.6 spike returned `bgg_info_status: "choose_from_bgg_info_or_search"` (zero `"verified"`), so gating strictly on `status == "verified"` would gut real-world EAN-path match rate to near zero — not a viable fix on its own. The correct fix is cross-validating the *name* GameUPC returns (`bgg_info[0].name`) against the scraped product's own name using the fuzzy-match machinery `_try_name_path` already has (`_normalise_name` + `fuzz.WRatio` + `FUZZY_THRESHOLD = 85`), regardless of `bgg_info_status` — reject and fall through to `_try_name_path` if the EAN-path candidate's name doesn't plausibly match what was scraped.

### Updated Hypotheses

None of the original hypotheses change — the demo-key mechanism remains the Confirmed, primary, sole explanation for the two contaminated clusters already found (both demo-key canned answers would have been rejected by this same name cross-validation, incidentally — "Gier"/"Pizza Wars PL" bear zero resemblance to any of the ~31 real product names merged into them, so this fix would have caught the incident even without the `GAMEUPC_API_KEY` config fix). This is a compounding second layer of defense, not an alternative explanation.

### Backlog Changes

Added to Story 2.2b (`_bmad-output/implementation-artifacts/2-2b-gameupc-key-hardening-data-cleanup.md`): a new task to cross-validate `_try_ean_path`'s candidate name before trusting it, alongside the original demo-key hardening. Investigation Backlog #1 (finding more contaminated clusters beyond the 2 confirmed) is unchanged/still open.

### Updated Conclusion

**Confidence:** High (unchanged for the original root cause; the new cross-validation gap is separately Confirmed via direct code re-read, not just hypothesized).

Original conclusion stands. Additionally: the pipeline's EAN-path had no defense-in-depth even independent of the demo-key issue — Deduction 1 (original case) predicted exactly this ("no validation gate... sufficient on its own to merge arbitrarily unrelated products") and this follow-up confirms a concrete, fixable instance of it. Story 2.2b now addresses both the demo-key trigger and this structural gap in the same pass.
