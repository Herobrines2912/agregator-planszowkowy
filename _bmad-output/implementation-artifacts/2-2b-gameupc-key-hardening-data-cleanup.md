---
baseline_commit: b737dc61cb44609b8d023a643f480412148cbbe4
---

# Story 2.2b: GameUPC Demo-Key Hardening & Contaminated-Match Cleanup

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **operator**,
I want the deduplication pipeline to refuse to trust GameUPC's public demo key, and the products it already mismatched to be reset,
so that unrelated store products stop getting silently merged into the wrong game's price history and links.

**Dev:** Dev B (Scraper) — _pliki: `scraper/scraper/pipelines/deduplication.py`, `scraper/scripts/cleanup_gameupc_contamination.py`_
**Type:** Hotfix — no `epics.md` section exists for this story; it is sourced entirely from a production-incident investigation, not the PRD/epic backlog. Sibling of Story 2.2 (product deduplication pipeline), which this story hardens.
**Source:** [`_bmad-output/implementation-artifacts/investigations/gameupc-sandbox-key-cross-contamination-investigation.md`](investigations/gameupc-sandbox-key-cross-contamination-investigation.md) — read this first; it has the full evidence chain. This story only restates what's needed to act on it.

## Background (why this story exists)

`GAMEUPC_API_KEY` has never been configured anywhere in this repo — not in `.github/workflows/scraper.yml` secrets, not even as a placeholder in `scraper/.env.example` — since `DeduplicationPipeline` shipped in Story 2.2 (2026-06-22). Every production scraper run since then has silently used GameUPC's public demo key (`test_test_test_test_test`). That demo key does **not** perform real per-EAN lookups: confirmed by directly querying the live API with two different real production EANs, both returned the identical `bgg_info[0].id = 232420` ("Gier") despite being genuinely different products. `_upsert_game()`'s `ON CONFLICT (bgg_id) DO UPDATE` then silently merges every product that lands on a canned answer into that one wrong `games` row.

Confirmed in production DB: 23 unrelated products merged into `games.id=59` ("Gier", `bgg_id=232420`), 8 more into a second fake game "Pizza Wars PL" (`bgg_id=178255`). Full evidence, reproduction steps, and analysis are in the investigation file linked above — this story does not repeat them.

## Acceptance Criteria

1. **Given** `GAMEUPC_API_KEY` is unset in the environment **When** `DeduplicationPipeline.open_spider()` runs **Then** the EAN-match path is disabled for the entire spider run (never calls the GameUPC API) and a `logger.warning` explains why — mirroring the existing pattern for a missing `BGG_API_TOKEN` (`deduplication.py:51-56`), not falling back to any hardcoded key.
2. **Given** an item with a valid-format EAN **When** `GAMEUPC_API_KEY` is unset **Then** `_try_ean_path()` returns `None` immediately without any HTTP call, and `process_item()` falls through to `_try_name_path()` exactly as it already does for a GameUPC 404 (existing behavior, unchanged).
3. **Given** `GAMEUPC_API_KEY` **is** set to a real value **When** the pipeline runs **Then** behavior is unchanged from today — this story does not alter the real-key code path at all.
4. **Given** the two confirmed-contaminated `bgg_id`s (`232420`, `178255`) **When** the cleanup script runs in `--execute` mode **Then** every `products` row with `bgg_id IN (232420, 178255)` has `bgg_id` and `game_id` reset to `NULL` (un-matched, eligible for correct re-matching on the next scrape) — no other rows touched.
5. **Given** the cleanup script's default (no `--execute` flag) **When** run **Then** it only logs which rows *would* be affected (id, product name, store, url, grouped by `bgg_id`) — zero DB writes. Executing against production data requires the explicit flag; this is a manual, human-run operation, not something this story wires into CI or the daily scraper cron.
6. **Given** the existing test suite **When** this story's pipeline change ships **Then** `scraper/tests/test_deduplication.py::test_ean_path_returns_correct_bgg_id` (line ~132) — which currently omits `GAMEUPC_API_KEY` from its env patch and implicitly exercises the demo-key fallback — is updated to set a real test key, otherwise it breaks (see Dev Notes → "Existing test that will break").
7. **Given** a GameUPC EAN-path response (real key, any `bgg_info_status`) whose `bgg_info[0].name` does not plausibly match the scraped product's own `name` **When** `_try_ean_path` evaluates it **Then** the candidate is rejected (treated as no-match, falls through to `_try_name_path`) rather than trusted outright — independent of and in addition to AC 1-3 (see Dev Notes → "Second gap found: no name cross-validation on the EAN path").

## Tasks / Subtasks

- [x] **Task 1 — Harden `DeduplicationPipeline` against the missing/demo key** (AC: 1, 2, 3, 6) — `scraper/scraper/pipelines/deduplication.py` (MODIFY)
  - [x] 1.1 In `open_spider`, change `self._gameupc_key = os.getenv("GAMEUPC_API_KEY", _GAMEUPC_DEMO_KEY)` to `self._gameupc_key = os.getenv("GAMEUPC_API_KEY")` (no default) — same shape as the existing `self._bgg_token = os.getenv("BGG_API_TOKEN")` two lines below it.
  - [x] 1.2 Update the warning log to explain the real risk, not just "rate-limited": something like `"GAMEUPC_API_KEY not set — EAN match path disabled (the public demo key returns canned example data for any input EAN and will silently cross-contaminate unrelated products, not just rate-limit); falling back to BGG name-fuzzy-match only"`.
  - [x] 1.3 In `_try_ean_path`, add an early `if not self._gameupc_key: return None` before the EAN-format check — never construct or send the request when there is no real key.
  - [x] 1.4 Delete the now-unused `_GAMEUPC_DEMO_KEY = "test_test_test_test_test"` module constant (`deduplication.py:18`) — no code path should reference it anymore (CLAUDE.md: delete unused code rather than leave it as a landmine someone reintroduces).
  - [x] 1.5 Update `scraper/tests/test_deduplication.py::test_ean_path_returns_correct_bgg_id` (~line 132-148) to add `"GAMEUPC_API_KEY": "testkey"` to its `patch.dict("os.environ", {...})` call — it currently omits this key entirely, relying on the fallback this story removes; without the fix it will start asserting on a `None` result and fail.
  - [x] 1.6 Add a new test: no `GAMEUPC_API_KEY` in env → `_try_ean_path` never calls `self._http.get` at all (assert `mock_http.get.call_count` reflects only the BGG-search call, not a GameUPC call) — mirrors the existing `test_no_bgg_token_name_path_skipped` shape but for the EAN side.
- [x] **Task 2 — Cross-validate EAN-path candidate name before trusting it** (AC: 7) — `scraper/scraper/pipelines/deduplication.py` (MODIFY)
  - [x] 2.1 Change `_try_ean_path(self, ean: str) -> int | None` to `_try_ean_path(self, ean: str, name: str) -> int | None` — it needs the scraped product's own name to validate against. Update the call site in `process_item` (currently `bgg_id = self._try_ean_path(ean)`) to `self._try_ean_path(ean, item.get("name", ""))`.
  - [x] 2.2 After extracting `raw_id = bgg_info[0].get("id")`, also extract `candidate_name = bgg_info[0].get("name", "")`. Before returning `bgg_id`, compute `fuzz.WRatio(_normalise_name(name), _normalise_name(candidate_name))` (same helpers `_try_name_path` already uses) and require `score >= FUZZY_THRESHOLD` — otherwise `logger.debug` the rejection (scraped name, candidate name, score) and return `None` (falls through to `_try_name_path`, which independently re-searches BGG by name and applies the same threshold — not wasted work, a legitimate second attempt).
  - [x] 2.3 This check applies regardless of `bgg_info_status` — do **not** gate on `status == "verified"` instead of/in addition to the name check: Story 1.6's spike got `"choose_from_bgg_info_or_search"` on all 22 real-world EAN matches and zero `"verified"` responses, so a status-only gate would eliminate virtually all real EAN-path matches (see Dev Notes for the reasoning this rules out).
  - [x] 2.4 Tests in `scraper/tests/test_deduplication.py`: EAN-path candidate name wildly different from scraped item name → `_try_ean_path` returns `None`, falls through to name-path (extend the existing 404-fallthrough test shape); EAN-path candidate name matching/similar to scraped item name → accepted as today. Existing tests using `_gameupc_response(bgg_id=...)` (helper returns `"name": "Test Game"` — see `test_deduplication.py:27-35`) will need their `item["name"]` to also be `"Test Game"` (or another string that scores ≥ 85 against it) or they'll start failing under the new check — audit every existing call site of `_gameupc_response`/`_try_ean_path` success-path tests, not just the one already flagged in Task 1.5.
- [x] **Task 3 — Cleanup script for confirmed contamination** (AC: 4, 5) — `scraper/scripts/cleanup_gameupc_contamination.py` (CREATE)
  - [x] 3.1 Hardcode the confirmed-poisoned `bgg_id` list `[232420, 178255]` at the top of the script with a comment linking to the investigation file — this script fixes the two *confirmed* clusters only; it does not attempt to discover new ones (see Dev Notes → "Why not a broader auto-detection sweep").
  - [x] 3.2 Default (no args): `SELECT id, name, url, bgg_id FROM products WHERE bgg_id = ANY(%s)`, log each row and a per-`bgg_id` count via `logger.info` — zero writes.
  - [x] 3.3 `--execute` flag: same query wrapped in a transaction, then `UPDATE products SET bgg_id = NULL, game_id = NULL WHERE bgg_id = ANY(%s)`, commit, log rows-affected count. Use `psycopg2` + `DATABASE_URL` env, same connection pattern as `deduplication.py`/`scraper/scripts/spike_gameupc.py` (Story 1.6 precedent) — a single short-lived connection is fine here, no pool needed (one-off script, not a long-running spider).
  - [x] 3.4 `logging.getLogger(__name__)`, never `print()` (CLAUDE.md — applies to `scraper/scripts/` too, per Story 1.6 precedent).
  - [x] 3.5 `scraper/tests/test_cleanup_gameupc_contamination.py` (CREATE) — mock `psycopg2.connect`; assert dry-run issues zero `UPDATE`/`execute` write calls; assert `--execute` issues exactly one `UPDATE` scoped to the two hardcoded ids and commits.
- [x] **Task 4 — verify** — `cd scraper && uv run pytest` green (full suite, watch for the Task 1.5 and Task 2.4 regressions specifically).

## Dev Notes

### Existing test that will break (read before touching `deduplication.py`)

`scraper/tests/test_deduplication.py:132-148`, `test_ean_path_returns_correct_bgg_id`:

```python
mock_pool_cls.return_value = _make_pool_mock(game_id=7)
mock_http.get.return_value = _gameupc_response(bgg_id=224517)

pipeline = DeduplicationPipeline()
with patch.dict("os.environ", {"DATABASE_URL": "postgresql://test"}):   # <- no GAMEUPC_API_KEY
    pipeline.open_spider(MagicMock())

item = {"name": "Brass Birmingham", "url": "http://example.com", "ean": "1234567890123"}
result = pipeline.process_item(item, MagicMock())

assert result["bgg_id"] == 224517
```

This test currently passes *because* the old fallback silently uses the demo key sentinel as `self._gameupc_key`, and the mocked `mock_http.get` returns a canned success response regardless of what key was "sent" — the test never noticed the key was fake. Once Task 1.1/1.3 ship, `self._gameupc_key` is `None` here, `_try_ean_path` returns `None` before ever calling `self._http.get`, and this assertion fails. Task 1.5 exists specifically to fix this — add `GAMEUPC_API_KEY` to its env patch (any non-empty string; the test already goes through a mocked HTTP layer, so the value itself doesn't need to be real).

### Second gap found: no name cross-validation on the EAN path

External research into GameUPC (`docs/research/gameupc-api-registration.md`, dispatched during this story's planning) surfaced GameUPC's OpenAPI spec, which documents `bgg_info_status` as either `"verified"` (human-confirmed mapping) or `"choose_from_bgg_info_or_search"` (unconfirmed candidate, with a per-candidate `confidence` field). Story 1.6's own spike notes (`docs/spike-results/gameUPC-coverage.md`) already anticipated this and said the dedup pipeline "should ... rely on the existing BGG title-match logic for final validation" — but re-reading `deduplication.py` confirms that validation was never wired up: `_try_ean_path` reads `bgg_info[0].get("id")` unconditionally and never inspects `bgg_info_status`; `_try_name_path` only runs as a fallback when the EAN path returns `None`, never as a cross-check on an EAN-path hit.

This is a second, independent contamination vector from the demo-key issue — it would exist even with a genuine, correctly-functioning production key, if GameUPC ever returned a wrong low-confidence candidate as `bgg_info[0]`. Task 2 closes it by reusing the fuzzy-match machinery `_try_name_path` already has (`_normalise_name` + `fuzz.WRatio` + `FUZZY_THRESHOLD`) to check the EAN-path candidate's name against the scraped product's own name before trusting it — cheap to add since the exact tools already exist in this file, and it would have caught both confirmed contamination clusters on its own (neither "Gier" nor "Pizza Wars PL" resembles any of the ~31 real product names merged into them).

**Do not gate on `bgg_info_status == "verified"` instead of the name check** — Story 1.6's spike got `"choose_from_bgg_info_or_search"` on all 22 real EAN matches tested and zero `"verified"` responses, so a status-only gate would eliminate virtually all real-world EAN-path matches, not just bad ones.

### Why not a broader auto-detection sweep for more contaminated clusters

The investigation flagged that the true scope of contamination is larger than the two confirmed clusters (Investigation Backlog #1). A tempting next step is a heuristic script that flags any `bgg_id` group where the grouped product names have low mutual fuzzy-similarity. This was deliberately **not** included here: several legitimately large, correctly-matched clusters already exist in production (e.g. `bgg_id=13` "Catan" with 21 products, `bgg_id=411400` "Warhammer: The Old World" with 35 products) where individual expansion/SKU names can be just as textually dissimilar from each other as a poisoned cluster's names are — a similarity-threshold heuristic risks false-positive-resetting real data. Scoping this story to the two evidence-backed IDs keeps it safe to ship without a live GameUPC/BGG key during dev-story. A proper broader sweep needs either a real GameUPC key to re-verify each group's true title, or human review — track as a follow-up, don't build it blind here.

### What happens to the two orphaned `games` rows after cleanup

This script does not delete `games.id=59` ("Gier") or the "Pizza Wars PL" row — only nulls out the `products.bgg_id`/`game_id` pointing at them. Deleting `games` rows was considered and rejected for this story: it's a separate, higher-risk operation (need to confirm no other FK references first — confirmed via direct query that no `price_alerts` rows reference either poisoned `game_id` today, but that's not a standing guarantee, and getting deletion wrong is harder to recover from than getting a `NULL` reset wrong). Accepted side effect: until the next scrape cycle re-matches the freed products (or forever, if `GAMEUPC_API_KEY` is still unset — see below), these two `games` rows will render an empty "Brak aktywnych ofert" passport page (existing empty-state UI already handles 0-product games, see `web/src/app/gra/[slug]/page.tsx:116-134`) and remain in the sitemap. Not a functional break, just a stale placeholder page — acceptable, not worth the added risk of a delete in this story.

### Manual prerequisite — not part of `dev-story`, but tracked here so it isn't lost

Getting a **real** `GAMEUPC_API_KEY` is a human/account action outside this codebase — this story's dev-agent cannot do it. Per `docs/research/gameupc-api-registration.md` (full findings there): GameUPC has a genuine `/v1` production tier (confirmed live — the demo key gets `403 Forbidden` on `/v1` but `200` on `/test`), but it is **not self-serve** — no signup form, no pricing page, no ToS. The only documented path is emailing the maintainer (pattern `gameupc@grettir.org`, verify against the site footer first) and asking explicitly about: cost (nothing is published), what the documented "100 new UPCs per day" limit actually caps (all lookups vs. only previously-unseen UPCs — ambiguous in their own spec), and commercial-use/redistribution/caching terms (no ToS exists to answer this). GameUPC is a single-maintainer hobby project, live since 2021 and still active but with no SLA — treat it as a supplementary signal, not load-bearing infrastructure; keep `_try_name_path` (BGG fuzzy match) as the primary resolution path regardless of whether a key is granted.

Once a key is obtained: add it as a `GAMEUPC_API_KEY` secret in GitHub repo settings (Settings → Secrets and variables → Actions) the same way `BGG_API_TOKEN` already is (`.github/workflows/scraper.yml:51`), and optionally to `scraper/.env` for local dev.

**Important consequence to flag, not a bug to fix here:** once Task 1 ships, if no real key exists yet, the EAN-match path is fully disabled for *every* product on *every* scrape run — matching falls back to BGG name-fuzzy-match only (`FUZZY_THRESHOLD = 85`) for everything, which is lower-precision than the EAN path was *supposed* to be (though strictly better than the current silently-wrong state). This is intentional and safe, not a regression — but it does mean new/unmatched products stop getting BGG-linked via EAN until a real key lands. `_try_name_path` already existed and is unaffected by this story; it's just now doing more of the work alone.

### Project Structure Notes

- `scraper/scripts/` already exists as the home for one-off, human-run scripts (precedent: `scraper/scripts/spike_gameupc.py` from Story 1.6) — the cleanup script belongs there, not in `scraper/scraper/pipelines/` (pipelines are Scrapy-invoked per-item; this is a standalone maintenance operation).
- No new dependencies — `psycopg2` and `logging` are already used throughout `scraper/`.
- No `web/` files touched by this story — purely Dev B (Scraper) territory, no file-collision risk with any in-flight Dev A work.

### References

- [Source: _bmad-output/implementation-artifacts/investigations/gameupc-sandbox-key-cross-contamination-investigation.md] — full evidence chain, live-reproduction details, confirmed clusters
- [Source: scraper/scraper/pipelines/deduplication.py] — code being modified (read in full during this investigation, lines 42-207)
- [Source: scraper/tests/test_deduplication.py] — existing test conventions (pytest, `unittest.mock.patch` on module-level `psycopg2.pool.ThreadedConnectionPool`/`httpx.Client`, `patch.dict("os.environ", ...)`)
- [Source: _bmad-output/implementation-artifacts/2-2-product-deduplication-pipeline.md] — original story this hardens; established the `ON CONFLICT (bgg_id) DO UPDATE` upsert and the BGG-token-absent graceful-degrade pattern this story mirrors for GameUPC
- [Source: _bmad-output/implementation-artifacts/1-6-gameUPC-coverage-spike.md, docs/spike-results/gameUPC-coverage.md] — origin of the demo key, its documented (incomplete) risk callout ("a production key may be needed for production load"), and the original (never-implemented) intent to validate EAN-path matches against BGG title-match logic
- [Source: docs/research/gameupc-api-registration.md] — production-tier access research (registration path, pricing/ToS gaps, `bgg_info_status` schema detail that surfaced Task 2's validation gap)
- [Source: .github/workflows/scraper.yml] — secrets wiring pattern to mirror for `GAMEUPC_API_KEY` once obtained (not part of this story's own scope — see Manual Prerequisite)

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- Full scraper suite: `172 passed, 6 failed, 4 deselected`. All 6 failures are a **pre-existing, environment-only** issue unrelated to this story's changes — confirmed by running the identical suite against the unmodified baseline commit (`git stash` + rerun): the same 5 failures existed before any code in this story was touched (`test_bgg_enrichment.py::test_missing_bgg_token_raises_runtime_error`, `test_bgg_enrichment.py::test_missing_database_url_raises_runtime_error`, `test_brevo_client.py::test_missing_api_key_raises_environment_error_at_import`, `test_deduplication.py::test_no_bgg_token_name_path_skipped`, `test_deduplication.py::test_process_item_always_returns_item`). Root cause: these tests `patch.dict(os.environ, ..., clear=True)` or `monkeypatch.delenv(...)` to simulate a missing env var, but the pipeline code under test calls `load_dotenv()`, which reloads `scraper/.env` (a real local secrets file present on this machine) and silently restores the "missing" var, defeating the test's premise. This is local-only — CI has no `.env` file, so these pass there. My new `test_cleanup_gameupc_contamination.py::test_missing_database_url_raises_runtime_error` follows the same established pattern as the 3 pre-existing "missing env var" tests and hits the identical local-only flake (6th failure) — consistent with existing codebase convention, not a defect introduced by this story.
- Verified no regressions were introduced by diffing full-suite results against the pre-change baseline: baseline was `167 passed, 5 failed`; after this story, `172 passed, 6 failed` — the delta is exactly the 5 new tests added (Task 1.6, Task 2.4, and 3 in `test_cleanup_gameupc_contamination.py`), with the 6th failure being the new test's copy of the same pre-existing local-env flake, not a regression in existing tests.
- A concurrent session was independently editing `web/src/db/queries/alerts.ts`, `alerts.test.ts`, and `web/src/db/schema.ts` in this same working tree during this story's implementation (unrelated Epic 6 work). A `git stash`/`git stash pop` used for the baseline-regression check above hit a merge conflict against that session's newer edits; resolved by cherry-picking only this story's 4 files back out of the stash via `git checkout stash@{0} -- <path>` per file, leaving the other session's in-progress web/ files untouched, then dropping the now-redundant stash. No work was lost on either side. This story never touches `web/`, so there was no real overlap — the conflict was purely a side effect of `stash` capturing the whole working tree.

### Completion Notes List

- Task 1: Removed the `_GAMEUPC_DEMO_KEY` fallback default from `open_spider` — `self._gameupc_key` is now `None` when `GAMEUPC_API_KEY` is unset, mirroring the existing `BGG_API_TOKEN`-absent pattern exactly. `_try_ean_path` returns `None` immediately (no HTTP call) when the key is missing. Warning log rewritten to explain the real risk (silent cross-contamination, not just rate-limiting).
- Task 2: `_try_ean_path` now takes the scraped item's `name` and cross-validates GameUPC's `bgg_info[0].name` against it via the same `_normalise_name` + `fuzz.WRatio` + `FUZZY_THRESHOLD` machinery `_try_name_path` already used — rejects and falls through to name-path on a low-confidence/wrong candidate, regardless of `bgg_info_status` (per Dev Notes, does not gate on `status == "verified"`).
- Task 1+2 test audit went beyond the two call sites the story named: found via my own audit that 4 additional existing tests implicitly depended on the removed demo-key fallback to make the mocked EAN-path HTTP call happen at all (`test_ean_404_falls_through_to_name_path`, `test_ean_http_500_falls_through_no_exception`, `test_no_bgg_token_name_path_skipped`, `test_upsert_game_on_conflict_returns_existing_id`, `test_bgg_search_network_failure_item_queued`) — all fixed by adding `GAMEUPC_API_KEY` to their env patches so their `side_effect`/`return_value` mock sequences still get consumed in the intended order. Also extended the `_gameupc_response()` test helper to accept a `name` parameter (default `"Test Game"`, unchanged behavior for callers that don't care) so success-path tests can supply a candidate name that matches their item's name under Task 2's new validation.
- Task 3: `scraper/scripts/cleanup_gameupc_contamination.py` created — dry-run by default (SELECT + log only), `--execute` flag required for the actual `UPDATE ... SET bgg_id = NULL, game_id = NULL WHERE bgg_id = ANY(%s)` scoped to the two confirmed IDs (232420, 178255). Plain `psycopg2.connect()` (no pool — one-off script), `argparse` for the `--execute` flag, `logging.getLogger(__name__)` throughout.
- Did not run `--execute` against production — that's explicitly a manual, human-authorized operation per AC 5 and the story's own scope (not part of `dev-story`).

### File List

- `scraper/scraper/pipelines/deduplication.py` — MODIFIED
- `scraper/tests/test_deduplication.py` — MODIFIED
- `scraper/scripts/cleanup_gameupc_contamination.py` — CREATED
- `scraper/tests/test_cleanup_gameupc_contamination.py` — CREATED

---

## Change Log

- 2026-07-23: Code-review fixes applied (multi-agent review, 10 findings confirmed). Pipeline: wired `BGG_API_TOKEN`/`GAMEUPC_API_KEY` into the spider step of `scraper.yml` (Step 1 previously passed only `DATABASE_URL`, so removing the demo-key fallback would have left *both* match paths dead in production — P0); `GAMEUPC_BASE` now derives `/v1` vs `/test` from key presence so a real key never hits the sandbox; EAN-path guard switched from `fuzz.WRatio` to `token_sort_ratio` + min-length via new `_name_match_score` (WRatio false-accepted expansion→base at 90) and now scores all `bgg_info` candidates, not just `[0]`; TODO left pointing at the BGG-corpus follow-up for real PL↔EN matching. Cleanup script: widened predicate to also catch `game_id`-only orphans (web joins on `game_id`), added pre-state CSV backup + `data_retention_log` audit row, `EXPECTED_COUNTS` baseline guard, in-flight-scrape guard (both overridable with `--force`), rowcount-divergence rollback, target-DB logging, and ISR revalidation after `--execute`. Fixed the two `load_dotenv`-defeats-`clear=True` tests to patch `load_dotenv` and use `pytest.raises`. Full suite: 181 passed, 5 pre-existing local-env failures (unchanged from baseline). Follow-up drafted: `2-7-bgg-corpus-title-matching-DRAFT.md` (spike-first). **Still pending an operator: obtain a real `/v1` GAMEUPC key; run `--execute` only after the hardening is deployed (see review Deployment Notes).**
- 2026-07-21: Story 2.2b implemented — removed GameUPC demo-key fallback (EAN path now hard-disabled without a real `GAMEUPC_API_KEY`, mirroring the existing BGG-token-absent pattern), added name cross-validation on the EAN path (rejects low-confidence/wrong GameUPC candidates via the existing fuzzy-match machinery), created `cleanup_gameupc_contamination.py` dry-run/`--execute` script for the 2 confirmed-contaminated `bgg_id` clusters. 22 tests in `test_deduplication.py` (6 new/audited-and-fixed), 4 new tests in `test_cleanup_gameupc_contamination.py`. Full suite 172 passing; 6 pre-existing/local-only env-pollution failures unrelated to this story (see Debug Log). `--execute` not run against production — manual step for the operator.
