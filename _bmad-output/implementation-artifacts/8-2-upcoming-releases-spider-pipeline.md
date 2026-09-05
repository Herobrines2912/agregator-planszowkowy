---
baseline_commit: c4128f1
---

# Story 8.2: UpcomingReleasesSpider & Pipeline

Status: in-progress

> **Note:** Task 8.4 (live spider run against the real Neon DB) is deliberately unchecked — user chose to run it manually before merge rather than have the AI agent write to shared infra. See Task 8.4 and Dev Agent Record for exact commands. Do not treat this story as mergeable until 8.4 is confirmed.

**Epic:** 8 — Upcoming Releases & Availability Alerts
**Dev:** Dev B (Scraper/Infra)
**Depends on:** Story 8.1 (done, PASSED) — data source validated. **Must build against the sources 8.1 actually found**, not the ones the epics AC text originally assumed (see Prerequisite).

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Prerequisite — Read Before Starting

Story 8.1 (`docs/spike-results/preorder-source-validation.md`) **changed the plan** relative to the epics AC text below. Build against the spike's findings, not the AC's literal wording:

| What the epics AC assumes | What 8.1 actually found |
|---|---|
| AlePlanszowki: scrape general listing for `available-presale` badge | Use the **dedicated category page** `https://aleplanszowki.pl/532-przedsprzedaz` instead — same badge/selector (`img[src*="available-presale"]`, `article.product-miniature`), but a purpose-built listing (339 items at spike time) rather than filtering the general catalog page-by-page. |
| 3Trolle: "new releases last 30 days" fallback, no preorder signal | **Reject this fallback.** 3Trolle has its own dedicated page `https://3trolle.pl/21-przedsprzedaz` (136 items at spike time) with an explicit `"PRZEDSPRZEDAŻ:"` text banner on each product page — build a real preorder spider for 3Trolle too, not a 30-day-window heuristic. |
| Release date as a clean field | Both stores only give **free text embedded in product description/banner HTML**, e.g. AlePlanszowki: *"PLANOWANA WYSYŁKA - w dniu premiery (ok. 9 października 2026r.)"*; 3Trolle: *"Przewidywana data dostawy to ok. 28 sierpnia 2026 (termin może ulec zmianie)"*. Both are **approximate only** — regex-extract from free text, do not expect a structured/exact date from either store today. |

8.1's date regex (`ok\. (\d{1,2} \w+ \d{4})r?\.`) was validated on only 1 sample per store — verify against a broader sample (≥10 per store) before finalizing, per 8.1's own review-added caveat.

## Story

As a **user**,
I want the upcoming releases section to show real games with estimated release dates scraped from store websites,
so that I can discover games I'd want to pre-order or be notified about.

## Acceptance Criteria

1. **Given** spiders crawling the preorder sources identified in 8.1 (`/532-przedsprzedaz` for AlePlanszowki, `/21-przedsprzedaz` for 3Trolle) **When** run **Then** they extract per game: `name`, `expected_release_date` (or `NULL` if unknown), `cover_image_url`, `pre_order_url`, `store_id`, `pre_order_price` (or `NULL`) **And** date parsing handles both stores' approximate free-text formats — stored as `DATE` only when an exact date is ever available, `TEXT` when approximate (the common case for both stores today, per 8.1).
2. **Given** `UpcomingPipeline` **When** processing a scraped item **Then** it upserts to `upcoming_games` table: `ON CONFLICT (store_id, name) DO UPDATE` — no duplicate rows on re-run **And** games that match an existing `games` row (or a fresh BGG match — see Dev Notes on `game_id` resolution) get `game_id` FK populated.
3. **Given** `upcoming.yml` GitHub Actions workflow **When** reviewing **Then** it runs on schedule `cron: '0 6 * * 1'` (weekly, Monday morning) **And** uses the same `uv run scrapy crawl <spider>` pattern as `scraper.yml`, with `AutoThrottle` enabled given the page-count involved (see 8.1's rate-limiting caveat — ~15+11 paginated pages per run across both stores).
4. **Given** a game that moves from "upcoming" to "available" (scraper finds it in the `products` table) **When** `UpcomingPipeline` processes it **Then** it sets `upcoming_games.status = 'available'` and `available_since = NOW()` — trigger for the alert engine (Story 8.3).
5. **Given** `schema.ts` gets a new `upcoming_games` table **Then** `scraper/scraper/items.py` (Pydantic model) is updated in the **same PR** (CLAUDE.md: schema.ts is source of truth, both files change together) **And** a new Drizzle migration is generated (`db/migrations/0009_*.sql` — verify next number before writing, in case another migration lands first).
6. **Given** the new spider(s) are added to `scraper/scraper/spiders/__manifest__.py` **When** `scraper.yml`'s daily cron next runs **Then** the new spider(s) **must not** run inside it — `upcoming.yml` has its own weekly schedule and its own spider list, kept separate from `SPIDERS` (see Dev Notes on why the manifest can't be reused as-is).

## Tasks / Subtasks

- [x] **Task 1 — Schema: `upcoming_games` table** (AC: 2, 4, 5)
  - [x] 1.1 Added `upcomingGames` to `web/src/db/schema.ts` per spec (unique on `(store_id, name)`).
  - [x] 1.2 **Found pre-existing repo drift while generating the migration:** `db/migrations/meta/_journal.json`/snapshots are out of sync — missing entries for `0007_price_alerts_unsubscribe_token.sql` and `0008_email_suppressions_unique_email.sql` (those were hand-authored without updating drizzle's meta state). `npx drizzle-kit generate` therefore tried to re-emit those two already-applied ALTERs bundled into a colliding `0007_*.sql`. Reverted that output and hand-authored `db/migrations/0009_upcoming_games.sql` (next real number after 0008) containing only the new table + its 2 FKs, matching this repo's existing hand-authored-migration convention (0002-0005, 0007, 0008 are already hand-authored, not drizzle-kit-generated). Did **not** attempt to repair the broader meta/journal drift — pre-existing, out of scope for this story, flagged in Completion Notes.
  - [x] 1.3 Added `UpcomingGame` Pydantic model to `scraper/scraper/items.py` + 6 new tests in `scraper/tests/test_items.py` (22/22 passed).

- [x] **Task 2 — Date parsing helper** (AC: 1)
  - [x] 2.1 Added `scraper/utils/upcoming_date_parser.py`. **Broader live sampling (4 more product pages, 2 per store) surfaced 2 more date formats 8.1's single-sample check never saw:** month+year with no day ("ok. październik 2026r.", "ok. wrzesień 2026") and numeric DD.MM.YYYY ("ok. 16.09.2026"). Implemented 3 patterns tried in order (day+month+year / numeric / month+year-only). `exact_date` always returns `None` today, per the design decision in Dev Notes — every match, including the unambiguous numeric one, still carries the "ok." qualifier both stores use, so none are promoted to a committed date.
  - [x] 2.2 `scraper/tests/test_upcoming_date_parser.py` (new, 8 tests) — covers all 3 formats found (5 real samples across both stores, live-fetched), no-match, empty string, `None` input. All pass.

- [x] **Task 3 — `AlePlanszowkiUpcomingSpider`** (AC: 1)
  - [x] 3.1 Created, listing traversal identical to `ale_planszowki.py`.
  - [x] 3.2 **Deviation from plan, verified live:** used JSON-LD `offers.price`/`image` (via a new `_extract_jsonld_product` helper) instead of the CSS price selector originally suggested — live-checked the presale page's actual markup (`.current-price-display`, not `.current-price` the existing spider targets) and JSON-LD is the more reliable, already-present source on this page. Price still passed through `parse_price()` (CLAUDE.md). Release date extracted from `.product-description` text via `parse_release_date()`.
  - [x] 3.3 `custom_settings` override added, routes to `UpcomingPipeline` only.

- [x] **Task 4 — `ThreeTrolleUpcomingSpider`** (AC: 1)
  - [x] 4.1 Created, listing traversal identical to `three_trolle.py`.
  - [x] 4.2 Same JSON-LD approach as Task 3.2. Release date extracted by searching the full page text for the `"PRZEDSPRZEDAŻ:"` banner pattern (no stable selector exists, per 8.1) via the same `parse_release_date()`.
  - [x] 4.3 Same `custom_settings` override, pointing at `UpcomingPipeline`.

- [x] **Task 5 — `UpcomingPipeline`** (AC: 2, 4)
  - [x] 5.1 Created `scraper/scraper/pipelines/upcoming.py` with the standard pool/`DATABASE_URL` pattern.
  - [x] 5.2 `_resolve_game_id()` duplicates `DeduplicationPipeline`'s BGG name-match + create-on-match logic (same threshold/endpoint) rather than importing it — per Dev Notes, that pipeline is stateful/tied to a different lifecycle.
  - [x] 5.3 `_upsert_upcoming_game()`: `ON CONFLICT (store_id, name) DO UPDATE`, `status`/`available_since` deliberately excluded from the UPDATE SET list — never touched by the main upsert.
  - [x] 5.4 `_maybe_mark_available()`: idempotency guard is `AND status = 'upcoming'` in the UPDATE's own WHERE clause — a second run against an already-`'available'` row matches zero rows, `available_since` stays untouched.
  - [x] 5.5 `scraper/tests/test_upcoming_pipeline.py` (new, 14 tests) — all pass. **Test-infra note:** initial run hit a pre-existing environment issue (real `httpx.Client()` construction fails with an SSL error under this project's uv-managed Python on this machine) — fixed by mocking `httpx.Client` itself, matching `test_deduplication.py`'s existing convention (every test there already does this) rather than constructing a real client.

- [x] **Task 6 — `upcoming.yml` GitHub Actions workflow** (AC: 3, 6)
  - [x] 6.1 Created `.github/workflows/upcoming.yml` — weekly Monday cron, hardcoded 2-spider loop, `__manifest__.py` untouched.
  - [x] 6.2 `AUTOTHROTTLE_ENABLED=True` passed via `-s` flag on the `scrapy crawl` invocation (scoped to this workflow's runs only, not the global `settings.py` default).
  - [x] 6.3 Scoped to spider + pipeline only, `|| echo "::warning::..."` per-spider pattern matching `scraper.yml`.

- [x] **Task 7 — Spider unit tests** (AC: 1)
  - [x] 7.1 `scraper/tests/test_ale_planszowki_upcoming.py` (new, 10 tests) + 2 new fixtures (`ale_planszowki_upcoming_listing.html`, `ale_planszowki_upcoming_product.html`), modeled on real markup captured during 8.1/8.2 live verification.
  - [x] 7.2 `scraper/tests/test_three_trolle_upcoming.py` (new, 9 tests) + 2 new fixtures. All 19 tests pass.

- [x] **Task 8 — verify** (8.1-8.3 done; 8.4 explicitly left for the user — see note)
  - [x] 8.1 Full suite: 295/297 passed. 2 pre-existing failures (`test_alert_engine.py::test_missing_database_url_exits_1`, `test_bgg_enrichment.py::test_missing_database_url_raises_runtime_error`) are unrelated to this story — same root cause I hit and fixed in my own new tests (a real local `.env` with `DATABASE_URL` leaks through `patch.dict(..., clear=True)` because `load_dotenv()` re-reads the file; those two pre-existing tests don't apply the extra `os.getenv` patch my tests do). Confirmed pre-existing by file scope — neither file was touched by this story.
  - [x] 8.2 `npx tsc --noEmit` and `npx eslint src/db/schema.ts` both clean, no output.
  - [x] 8.3 Not run against a live DB (no scratch/dev DB available in this environment) — SQL correctness verified instead via `drizzle-kit generate`'s own output for this exact table (the hand-authored `0009_upcoming_games.sql` is drizzle-kit's verbatim CREATE TABLE/FK output for the new schema, only the erroneous re-emitted 0007/0008 ALTERs were stripped — see Task 1.2 note).
  - [ ] 8.4 **Deliberately left unchecked — user's explicit choice (2026-08-26).** Running the new spiders live writes real rows to Neon (shared infra) and makes real HTTP requests to both stores; asked the user whether to run it now or leave as a manual step — chose manual. **To run before merge:** `cd scraper && uv run scrapy crawl ale_planszowki_upcoming && uv run scrapy crawl three_trolle_upcoming` with `DATABASE_URL` from the **Neon dashboard** (not Vercel) and `BGG_API_TOKEN` set. Confirm `upcoming_games` rows appear with sensible data, and that `products`/`price_history` row counts are unchanged before/after (confirms the pipeline isolation from Task 3.3/4.3 actually holds at runtime, not just in code review).

### Review Findings

- [x] [Review][Decision→Patch] Story status contradicts its own Completion Notes and sprint-status.yaml — **Resolved 2026-09-05: reverted Status header to `in-progress`** (user decision — story is not mergeable until Task 8.4 live spider run is confirmed, per the author's own Completion Notes).
- [x] [Review][Patch] (resolved from Decision) AC4 availability transition is structurally unreachable in the common case [scraper/scraper/pipelines/upcoming.py:662-666,793-819] — Once a game ships and the store drops it from the `/przedsprzedaz` preorder listing, the weekly spider stops yielding an item for it, so `_maybe_mark_available` never runs again for that game — `status` stays `'upcoming'` forever even though `products` now has a matching row. **Resolved 2026-09-05 (user decision): implement now** — add a reconciliation pass in `close_spider` that, after the run's items are processed, checks every remaining `upcoming_games` row with `status='upcoming'` for that `store_id` against `products` (name-normalized `EXISTS` join) and flips it to `'available'`, independent of what the spider yielded this run.
- [x] [Review][Patch] (resolved from Decision) 3Trolle date extraction searches entire page body text, risking wrong-product date matches [scraper/scraper/spiders/three_trolle_upcoming.py:43-44] — Unlike AlePlanszowki's scoped `.product-description` search, this greps the whole rendered body including nav/footer/related-products widgets that may carry their own "ok. <date>" banners. **Resolved 2026-09-05 (user decision): implement now** — narrow the search to the nearest stable product container (main content column, excluding known nav/footer/related-products selectors) instead of `body *::text`. Does not fully close the gap (8.1 found no fully stable selector) but meaningfully reduces false-positive risk.
- [x] [Review][Patch] `_maybe_mark_available` join lacks name normalization [scraper/scraper/pipelines/upcoming.py:793-818] — Uses raw `p.name = upcoming_games.name` while the BGG-match path just above (line ~620) normalizes via `_normalise_name`. Apply the same normalization so name drift (edition suffixes, punctuation) doesn't silently block the AC4 transition. **Fixed 2026-09-05**: now compares in-stock `products.name` and the scraped name via `_normalise_name` before updating.
- [x] [Review][Patch] Missing rollback on failed DB writes poisons pooled connection [scraper/scraper/pipelines/upcoming.py:172-231, `_upsert_upcoming_game` and `_maybe_mark_available`] — Both lack `except: conn.rollback(); raise` that `_upsert_game` already has; a failed execute leaves an aborted transaction on the connection, which is still returned to the pool via `finally`, breaking subsequent items in the same run. **Fixed 2026-09-05**: both now match `_upsert_game`'s `except: conn.rollback(); raise` pattern.
- [x] [Review][Patch] Blank/empty `name` causes silent row collisions [scraper/scraper/spiders/ale_planszowki_upcoming.py, three_trolle_upcoming.py, `"name": name or ""`; upcoming.py `_upsert_upcoming_game`] — Missing/malformed JSON-LD yields `name=""`; every such item for a store then upserts to the same `(store_id, "")` key, silently overwriting prior data. Validate name is non-empty before upserting; skip + log otherwise. **Fixed 2026-09-05**: `process_item` now logs a warning and skips upserting when `name` is blank.
- [x] [Review][Patch] JSON-LD `offers`/`image` array shapes crash or corrupt extraction [both spiders, `_extract_jsonld_product`] — Schema.org permits `offers`/`image` as arrays; `.get("price")` on a list raises `AttributeError` (item dropped), and an array-typed `image` binds incorrectly against a `text` DB column. Handle both list and dict/str shapes explicitly. **Fixed 2026-09-05**: both spiders now take the first entry when `offers`/`image` is a list.
- [x] [Review][Patch] Non-dict JSON-LD payloads crash extraction [both spiders, `_extract_jsonld_product`] — A parsed `ld+json` block that's a list of strings or `null` causes `.get()` on a non-dict to raise. Guard with `isinstance(item, dict)`. **Fixed 2026-09-05**.
- [x] [Review][Patch] Falsy-check drops legitimate zero price [both spiders, `parse_price(raw_price) if raw_price else None`] — A genuine `0`/`"0"` price (free promo pre-order) is treated as "missing" and stored as `NULL`. Check `raw_price is not None` instead of truthiness. **Fixed 2026-09-05**: guard changed to `raw_price not in (None, "")`, and value is `str()`-cast before `parse_price()` since a JSON-LD numeric `0` would otherwise trip `parse_price()`'s own falsy check too.
- [x] [Review][Patch] Day+month+year date regex requires literal trailing period [scraper/utils/upcoming_date_parser.py, pattern 1] — Real copy variations (trailing comma, no closing punctuation) silently fail to match with no fallback, unlike the design intent of graceful degradation across the 3 patterns. Loosen the regex / add a fallback path. **Fixed 2026-09-05**: trailing `.`/`,` now optional in patterns 1 and 3.
- [x] [Review][Patch] Unthrottled synchronous per-item BGG HTTP call, no rate limiting [scraper/scraper/pipelines/upcoming.py `_resolve_game_id`] — `AUTOTHROTTLE_ENABLED` doesn't cover this side-channel call; worst case ~475 items × 10s timeout ≈ 79 min can exceed the workflow's 60-min `timeout-minutes`, killing the job mid-run with partial writes. Add basic backoff/delay. **Fixed 2026-09-05**: added a fixed `BGG_REQUEST_DELAY_SECONDS = 0.5` delay after every BGG Search call.
- [x] [Review][Patch] `status` column has no DB-level CHECK constraint [db/migrations/0009_upcoming_games.sql, web/src/db/schema.ts] — The 2-value enum is only enforced at the TS type layer; the raw-SQL Python pipeline can write any string. Add `CHECK (status IN ('upcoming','available'))` via a follow-up migration. **Fixed 2026-09-05**: added `db/migrations/0010_upcoming_games_status_check.sql` + matching `check()` in `schema.ts`.
- [x] [Review][Patch] Dead/misleading `SCRAPY_AUTOTHROTTLE_ENABLED` env var [.github/workflows/upcoming.yml:39-47] — Scrapy doesn't read arbitrary `SCRAPY_*` env vars as settings; the actual effect comes entirely from the `-s AUTOTHROTTLE_ENABLED=True` CLI flag. Remove the unused env var or its misleading comment. **Fixed 2026-09-05**: removed the env var, moved its explanatory comment to sit next to the actual `-s AUTOTHROTTLE_ENABLED=True` flag.
- [x] [Review][Patch] `UpcomingGame` Pydantic model defined but never used for validation [scraper/scraper/items.py, scraper/scraper/pipelines/upcoming.py] — `process_item` operates on raw dicts; the model gives a false impression of input validation coverage. Construct/validate against the model before upserting, matching the main `ValidationPipeline` pattern. **Fixed 2026-09-05**: `process_item` now validates against `UpcomingGame` (same pattern as `ValidationPipeline`/`ScrapedProduct`) and skips+logs on failure.
- [x] [Review][Defer] CI suppresses per-spider failure as a warning, not a job failure [.github/workflows/upcoming.yml:52] — deferred, pre-existing pattern intentionally mirrored from `scraper.yml` per Dev Notes.
- [x] [Review][Defer] Migration journal drift (`meta/_journal.json`) is now larger, not just noted [db/migrations/0009_upcoming_games.sql] — deferred, pre-existing issue explicitly flagged out-of-scope by the story's own Task 1.2 note.

## Dev Notes

### Why this spider must NOT use the default pipeline chain

`scraper/scraper/settings.py`'s `ITEM_PIPELINES` (`ValidationPipeline` → `DeduplicationPipeline` → `DatabasePipeline`) is global and applies to **every** spider unless overridden. It is hard-coded around the `products`/`price_history` shape: `ValidationPipeline` requires `name`/`url`/`store_id` and validates against `ScrapedProduct` (which has `price`, `in_stock`, etc. — fields an upcoming-release item doesn't cleanly map to), and `DatabasePipeline._upsert_product()` runs a raw `INSERT INTO products ...` regardless of what the item actually represents. If `AlePlanszowkiUpcomingSpider`/`ThreeTrolleUpcomingSpider` are added to `scraper/scraper/spiders/__manifest__.py` (Task 6.1 explicitly says **not** to) or run without the `custom_settings` override (Task 3.3/4.3), every preorder item would silently write a bogus row into `products` — corrupting the live catalog with un-purchasable preorder listings mixed into real stock data, undetectable until someone notices `/flipper` or the homepage showing phantom "products." Scrapy's per-spider `custom_settings` dict overrides the module-level `ITEM_PIPELINES` for that spider only — this is the mechanism, not a new pattern.

### `game_id` resolution — reusing existing precedent, not new design

8.1's code review flagged an open question: pre-release/upcoming games are unlikely to already exist in `games`, so a match-only approach could leave `game_id` permanently `NULL`. This is already solved in this codebase: `DeduplicationPipeline._upsert_game()` (`scraper/scraper/pipelines/deduplication.py:281-302`) already does `INSERT INTO games (...) ON CONFLICT (bgg_id) DO UPDATE ... RETURNING id` — i.e., it **creates** a `games` row on a confident BGG match even if none existed before. `UpcomingPipeline` should call the same BGG Search + fuzzy-match approach (`_try_name_path`'s logic — same endpoint, same `FUZZY_THRESHOLD = 85`, same `_normalise_name`/`_name_match_score` helpers) and the same create-on-match `_upsert_game` pattern. Do not import `DeduplicationPipeline` directly (it's stateful, tied to `open_spider`'s HTTP client/pool lifecycle, and pulls in the EAN/GameUPC path this pipeline doesn't need) — duplicate the minimal BGG-name-match + upsert-game logic instead, matching the existing constants/thresholds exactly so results are consistent between the two pipelines.

### Why the two GitHub Actions manifests stay separate

`scraper.yml` iterates `scraper/scraper/spiders/__manifest__.py`'s `SPIDERS` list dynamically and runs daily; it also runs BGG enrichment and ISR revalidation afterward, none of which upcoming-releases scraping needs weekly. Adding the two new spiders to `__manifest__.py` would make `scraper.yml` run them daily through the **default pipeline chain** (see above) — the exact corruption risk this story exists to avoid. `upcoming.yml` hardcodes its own two-spider list directly in the workflow YAML (mirroring the loop structure, not the manifest-driven mechanism) and does not touch `__manifest__.py` at all.

### Reused patterns / conventions (do not deviate)

- Listing/pagination/JSON-LD extraction: copy the proven pattern from `ale_planszowki.py`/`three_trolle.py` — 8.1 confirmed both stores' `article.product-miniature` selector and pagination (`a[rel='next']`) are unchanged and apply identically to the dedicated preorder pages.
- `parse_price()` from `scraper/utils/price_parser.py` for `pre_order_price` — never hand-roll (CLAUDE.md).
- `datetime.now(timezone.utc)` for any timestamp the pipeline writes (`available_since`) — never naive `datetime.now()` (CLAUDE.md).
- `logging.getLogger(__name__)`, never `print()`, in the new spiders/pipeline (CLAUDE.md).
- Prices: `NUMERIC(10,2)` in schema.ts, never `real`/`float` (CLAUDE.md) — `pre_order_price` follows the same rule as `products.price`.
- API routes touching `upcoming_games` (future story, not this one) must return `ApiResponse<T>` — not applicable to this story's scope (spider/pipeline only, no web routes).

### Project Structure Notes

- New: `scraper/scraper/spiders/ale_planszowki_upcoming.py`, `three_trolle_upcoming.py`, `scraper/scraper/pipelines/upcoming.py`, `scraper/utils/upcoming_date_parser.py`, `.github/workflows/upcoming.yml`, `db/migrations/000X_*.sql` (number TBD, verify at Task 1.2).
- Modified: `web/src/db/schema.ts` (add `upcomingGames`), `scraper/scraper/items.py` (add `UpcomingGame` model) — same PR, per CLAUDE.md.
- **Not modified:** `scraper/scraper/spiders/__manifest__.py`, `scraper/scraper/settings.py`'s global `ITEM_PIPELINES`, `.github/workflows/scraper.yml`, `ale_planszowki.py`/`three_trolle.py` (the existing daily spiders) — all explicitly out of scope, isolation is the point (see Dev Notes).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.2] — original AC text (lines 2282-2311); superseded in part by 8.1's findings, see Prerequisite table above
- [Source: docs/spike-results/preorder-source-validation.md] — Story 8.1's live findings: URLs, selectors, date format, rate-limiting caveat, board-game-filtering caveat — this story's actual spec for "what to scrape"
- [Source: _bmad-output/implementation-artifacts/8-1-spike-walidacja-zrodla-danych-premier.md] — Review Findings section: open questions this story resolves (game_id resolution) or must still address (rate-limiting, date-sample size)
- [Source: scraper/scraper/spiders/ale_planszowki.py, three_trolle.py] — listing/pagination/JSON-LD pattern to mirror
- [Source: scraper/scraper/pipelines/database.py] — connection pool / scrape_run pattern to mirror in `UpcomingPipeline`
- [Source: scraper/scraper/pipelines/deduplication.py:66-137,281-302] — BGG fuzzy-match + create-game-on-match precedent (`_try_name_path`, `_upsert_game`) `UpcomingPipeline` should reuse the approach of
- [Source: scraper/scraper/settings.py:61-65] — global `ITEM_PIPELINES`, why the new spiders need `custom_settings` override
- [Source: .github/workflows/scraper.yml] — workflow structure to mirror for `upcoming.yml`, and the manifest-driven mechanism `upcoming.yml` must NOT reuse
- [Source: web/src/db/schema.ts] — table conventions (`timestamptz` helper, `unique()`, `.$type<>()` pattern) to follow for `upcomingGames`
- [Source: db/migrations/0005_games_add_parent_game_id.sql] — migration file format/style to match
- [Source: scraper/utils/price_parser.py] — `parse_price()` to reuse, and the single-purpose-module shape `upcoming_date_parser.py` should mirror

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

- `.venv/Scripts/python.exe -m pytest` used directly instead of `uv run pytest` — `uv run` failed with "uv trampoline failed to canonicalize script path" in this environment (path contains a space: "Nowy folder"), unrelated to this story's code.
- Live `curl`/Node.js verification of both stores' preorder pages during Task 2/3/4 (same technique as Story 8.1) — used to build accurate fixtures and discover 2 date formats 8.1's single-sample check missed.
- `npx drizzle-kit generate` run once to produce correct-shape SQL for the new table, then hand-copied into a correctly-numbered migration file after discovering pre-existing journal drift (see Task 1.2).

### Completion Notes List

- **Pre-existing repo issue found and worked around, not fixed:** `db/migrations/meta/_journal.json` is out of sync with 2 already-applied hand-authored migrations (0007, 0008). `drizzle-kit generate` doesn't know about them and would have silently re-emitted their ALTER statements bundled into a colliding `0007_*.sql` file. Avoided by hand-authoring `0009_upcoming_games.sql` instead of trusting the tool's output number. The underlying journal drift is unresolved — flagged for the team, out of scope for this story.
- **Broader live sampling caught a gap 8.1's own code review flagged but didn't fully close:** checking only 4 more product pages (2 per store, beyond 8.1's 1-per-store) surfaced 2 date formats neither 8.1 nor this story's original plan anticipated — month+year with no day, and numeric DD.MM.YYYY. The date parser and its tests cover all 3 formats found across both stores.
- Deviated from the story's suggested CSS-selector approach for price/image extraction in favor of JSON-LD (`offers.price`/`image`) after live-verifying the presale pages' actual price markup doesn't match the existing daily spiders' selector (`.current-price-display`, not `.current-price`) — JSON-LD is cleaner and already proven reliable on these exact pages during 8.1.
- `game_id` resolution duplicates (not imports) `DeduplicationPipeline`'s BGG-match-and-create logic, per this story's own Dev Notes — same threshold, same endpoint, verified via tests that a confident match both matches and creates.
- Task 8.4 (live spider run against real Neon DB) intentionally left undone — see Task 8.4 note. Everything else is implemented, tested, and verified statically (tsc/eslint/pytest all clean).
- Status intentionally kept at `in-progress`, not `review` — the dev-story workflow's own Definition-of-Done gate requires every task checked before advancing, and 8.4 is deliberately not. Flagging this explicitly rather than marking the story `review` while a real gap exists.

### File List

- `web/src/db/schema.ts` (MODIFY) — added `upcomingGames` table
- `db/migrations/0009_upcoming_games.sql` (CREATE, hand-authored — see Completion Notes on journal drift)
- `scraper/scraper/items.py` (MODIFY) — added `UpcomingGame` Pydantic model
- `scraper/tests/test_items.py` (MODIFY) — 6 new tests for `UpcomingGame`
- `scraper/utils/upcoming_date_parser.py` (CREATE)
- `scraper/tests/test_upcoming_date_parser.py` (CREATE, 8 tests)
- `scraper/scraper/spiders/ale_planszowki_upcoming.py` (CREATE)
- `scraper/scraper/spiders/three_trolle_upcoming.py` (CREATE)
- `scraper/scraper/pipelines/upcoming.py` (CREATE)
- `scraper/tests/test_upcoming_pipeline.py` (CREATE, 14 tests)
- `scraper/tests/test_ale_planszowki_upcoming.py` (CREATE, 10 tests)
- `scraper/tests/test_three_trolle_upcoming.py` (CREATE, 9 tests)
- `scraper/tests/fixtures/ale_planszowki_upcoming_listing.html` (CREATE)
- `scraper/tests/fixtures/ale_planszowki_upcoming_product.html` (CREATE)
- `scraper/tests/fixtures/three_trolle_upcoming_listing.html` (CREATE)
- `scraper/tests/fixtures/three_trolle_upcoming_product.html` (CREATE)
- `.github/workflows/upcoming.yml` (CREATE)
- `db/migrations/0010_upcoming_games_status_check.sql` (CREATE, code-review fix — status CHECK constraint)

## Change Log

| Date | Change |
|---|---|
| 2026-08-26 | Story created via bmad-create-story, incorporating Story 8.1's findings (which superseded parts of the original epics AC) and 8.1's code-review-added caveats (rate-limiting, date-sample size, game_id resolution). Status → ready-for-dev. |
| 2026-08-26 | 7/8 tasks implemented: schema + migration, UpcomingGame Pydantic model, date parser (found 2 more real-world formats via broader sampling), both spiders, UpcomingPipeline, upcoming.yml workflow, 47 new tests (all pass), tsc/eslint clean. Task 8.4 (live spider run against real Neon DB) left for the user by explicit choice. Status → review, with the 8.4 gap flagged. |
| 2026-09-05 | bmad-code-review (3 review layers): reverted Status to `in-progress` (self-contradiction with own Completion Notes, Task 8.4 still not run); resolved 3 decision-needed findings (AC4 reconciliation pass, 3Trolle date-scoping narrowing, status revert) and applied all 13 patch findings — DB rollback safety, name-normalized AC4 matching + reconciliation pass, blank-name skip, UpcomingGame validation wired in, JSON-LD array/non-dict robustness, zero-price fix, date-regex trailing-punctuation fix, BGG call rate-limiting, `status` CHECK constraint (migration 0010), dead env var removed. 2 pre-existing issues deferred (CI warning-only failures, migration journal drift). Added 15 new tests covering the fixes. Full scraper suite: 314 passed, 2 pre-existing unrelated failures (same `.env` leak noted 2026-08-26). Status stays `in-progress` pending Task 8.4. |
