---
baseline_commit: a940cb1
---

# Story 2.2c: game_id Dedup Contamination — Detection & Cleanup

Status: in-progress

> **Note:** Task 5 (live `--execute` cleanup run + spike re-verification against real production data) is deliberately left for the operator — resetting 200+ games' FKs is an irreversible, high-blast-radius write to shared infra (same category of decision as Story 8.2's Task 8.4). See Task 5 and Dev Agent Record for exact commands. Do not treat this story as complete until Task 5 is done.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **operator**,
I want products that were incorrectly merged under the wrong `games.id` to be detected and reset,
so that Flipper Mode (Epic 7) and any other feature that aggregates by `game_id` (price history, margin proxy, PriceTable) doesn't silently mix unrelated games' prices.

**Dev:** Dev B (Scraper/DB) — likely files: `scraper/scripts/detect_gameid_contamination.py`, `scraper/scripts/cleanup_gameid_contamination.py`
**Type:** Hotfix — no `epics.md` section for this story; sourced from Story 7.1's spike, not the PRD/epic backlog. Sibling of Story 2.2 / 2.2b (product deduplication pipeline), which this hardens further.
**Source:** Discovered during Story 7.1's spike (`docs/spike-results/flipper-margin-proxy.md`, "Caveat — game_id contamination" section) while sanity-checking margin-proxy outliers.

## Background (why this story exists)

Story 7.1's spike (2026-08-22) found that 208 of 4159 `games` (5%) have `products` rows with ≥4 wildly different, unrelated product names sharing one `game_id`. Example: `game_id=760` (`games.name = "Civilization: A New Dawn"`, `bgg_id=233247`) has products for "Wojna o Pierścień", "Horror w Arkham LCG: Poszukiwania Kadath", "X-Wing: Zestaw dodatkowy Slave I", and "EXIT: Gra Tajemnic" all attached to it. This is not a price-parsing bug — it's the same class of issue Story 2.2b already hardened against for the GameUPC EAN path (wrong `bgg_id` → `ON CONFLICT (bgg_id) DO UPDATE` silently merges unrelated products), but here it's showing up on a larger scale (208 clusters vs. 2.2b's confirmed 2) and 2.2b's fix (EAN-path name cross-validation) may not cover every path that can produce this — needs investigation to confirm whether this is residual pre-2.2b contamination, a gap in the name-path (`_try_name_path`) matching, or something else.

Measured impact: 89 of 830 "sensible" margin-proxy rows (11%) and 13 of the top 20 highest-margin rows in Story 7.1's spike come from a contaminated `game_id` — a naive "sort by margin desc" Flipper Mode UI would show impossible deals at the top at launch. `PriceTable`/price-history features on the affected games' passport pages are also silently wrong today (mixing price history from unrelated games), independent of Flipper Mode.

## Acceptance Criteria

1. **Given** the `products` table **when** a detection query runs **then** it reports every `game_id` where attached products have low mutual name-similarity (start from the story 7.1 heuristic — `COUNT(DISTINCT name) >= 4` — but investigate whether a fuzzy-similarity heuristic gives a more precise/complete list; note from 2.2b's Dev Notes that a naive similarity threshold risks false-positive-flagging legitimately large clusters like "Catan" or "Warhammer: The Old World" with many real SKU/expansion names — any heuristic used here must be evaluated against those known-good large clusters before being trusted).
2. **Given** a confirmed-contaminated `game_id` **when** the cleanup runs in dry-run mode (default) **then** it only logs which `products` rows would be reset (id, name, store, url, grouped by `game_id`) — zero DB writes, mirroring `cleanup_gameupc_contamination.py`'s `--execute` gate pattern (Story 2.2b).
3. **Given** a confirmed-contaminated `game_id` **when** the cleanup runs with `--execute` **then** the affected `products` rows have `game_id` (and `bgg_id`, if that's the field driving the bad match) reset to `NULL`, making them eligible for correct re-matching on the next scrape — no other rows touched, same transactional/rowcount-logging shape as `cleanup_gameupc_contamination.py`.
4. **Given** this story's root-cause investigation **when** complete **then** it states explicitly whether the dedup pipeline (`scraper/scraper/pipelines/deduplication.py`) itself needs a further fix (e.g. `_try_name_path`'s fuzzy threshold or `ON CONFLICT (bgg_id) DO UPDATE` upsert) to stop producing new contamination going forward, or whether this is fully explained as residual pre-2.2b data — if the former, that fix may need to be split into its own follow-up story rather than scope-creeping this one.
5. **Given** the cleanup has run **when** Story 7.1's spike query is re-run **then** the "contaminated" caveat numbers in `docs/spike-results/flipper-margin-proxy.md` should shrink toward zero (tracked as a manual verification step, not an automated test).

## Tasks / Subtasks

- [x] **Task 1 — Root-cause investigation** (AC: 4)
  - [x] 1.1 Pulled the full 208-cluster candidate set (query reproduces Story 7.1's spike exactly) and checked `products.created_at` against the 2.2b ship date (2026-07-21/23, commit `993c139`). **206 of 208 clusters have every member product's `created_at` before that date.** The 2 exceptions (`game_id=714` "Star Wars: Legion — Clone Wars Core Set", `game_id=46` "Sylaby: Nauka czytania") were manually inspected product-by-product: `714`'s later-added product is a genuine same-family Legion expansion (not contamination — a false positive of the count heuristic, see Task 2); `46`'s later-added product ("Sylaby. Nauka czytania") is a legitimate re-listing of the same literacy game already in the cluster, not a new bad merge (the one genuinely bad entry in that cluster, "Mnożenie dzielenie: Nauka liczenia", predates 2.2b). **No cluster shows a NEW wrong merge created after 2.2b shipped.**
  - [x] 1.2 **Conclusion: fully explained as residual pre-2.2b data — the pipeline is not still producing this.** Root cause matches 2.2b's own diagnosis exactly (GameUPC demo-key + zero name cross-validation on the EAN path, active before 2.2b's fix): e.g. `game_id=736` ("Smart", `bgg_id=3215`) has 66 completely unrelated "Smart Games - <puzzle name>" products merged onto one bgg_id — the demo key's canned/limited answer pool being accepted without any name check. 2.2b's fix (name cross-validation + `token_sort_ratio` + 8-char minimum) already prevents this going forward; 2.2b's own cleanup script just only manually confirmed 2 of the many affected `bgg_id`s at the time. **Task 4 is therefore N/A — no further pipeline fix needed.**
- [x] **Task 2 — Detection script** (AC: 1)
  - [x] 2.1 Built `scraper/scripts/detect_gameid_contamination.py` — same `COUNT(DISTINCT name) >= 4` heuristic as the spike, verified to reproduce 208/4159 exactly against production. **Investigated a fuzzy-similarity refinement per AC-1 and rejected it**: manually verified two large legitimate clusters — `game_id=12` "Warhammer: The Old World" (35 real miniature-line SKUs) and `game_id=714` "Star Wars: Legion — Clone Wars Core Set" (4 real expansion SKUs) — both show mutual product-name similarity just as low as genuinely contaminated clusters (a Warhammer battalion name shares no tokens with another Warhammer battalion name, same as two unrelated contaminated products). No automated similarity metric tried discriminated the two classes; see Dev Notes. The two verified clusters are hardcoded as `KNOWN_LEGITIMATE_CLUSTERS` and pre-excluded from the script's output; the remaining 206 are surfaced for operator review via `--detail GAME_ID`.
- [x] **Task 3 — Cleanup script** (AC: 2, 3)
  - [x] 3.1 Built `scraper/scripts/cleanup_gameid_contamination.py` mirroring `cleanup_gameupc_contamination.py`'s shape (psycopg2, `logging.getLogger(__name__)`, dry-run default, transactional `--execute`, pre-state CSV backup, `data_retention_log` audit row, in-flight-scrape guard, rowcount-divergence rollback, ISR revalidation). Takes an explicit `--game-ids` list rather than a hardcoded constant (208 candidates is too many to hand-verify one-by-one within this story, unlike 2.2b's 2) — mirrors 2.2b's "curated, human-confirmed list, not an automatic sweep" precedent, generalized to a variable-length operator-supplied list. Dry-run verified against production for `game_id=736` (confirmed 66 affected rows, zero writes).
  - [x] 3.2 `scraper/tests/test_detect_gameid_contamination.py` (7 tests) + `scraper/tests/test_cleanup_gameid_contamination.py` (10 tests), mirroring `test_cleanup_gameupc_contamination.py`'s mock style. All pass.
- [x] **Task 4 — Pipeline fix** (AC: 4) — **N/A, per Task 1.2's finding.** No pipeline code change made; 2.2b's existing hardening already prevents new contamination.
- [ ] **Task 5 — Verify against Story 7.1's spike** (AC: 5) — **Blocked on an operator decision, not yet done.** Requires: (a) operator reviews the 206 candidates (`detect_gameid_contamination.py`, optionally `--detail GAME_ID` per candidate), (b) operator runs `cleanup_gameid_contamination.py --game-ids <confirmed list> --execute`, (c) re-run `scraper/scripts/spike_flipper_margin_proxy.py` to confirm the contamination caveat numbers shrink toward zero. Not run by this session — resetting 200+ production games' FKs is an irreversible, high-blast-radius write to shared infra; the same category of decision Story 8.2's Task 8.4 left to the operator rather than an AI agent's unilateral judgment call on a candidate list this large.

## Dev Notes

### Relationship to Story 2.2b

2.2b (done) fixed a *specific, confirmed* 2-cluster contamination caused by the GameUPC demo-key silently returning canned answers, plus added EAN-path name cross-validation to prevent recurrence on that path. This story is a **different, larger-scale finding** (208 clusters) discovered independently via Story 7.1's spike — it is not yet confirmed whether it's the same root cause, a gap 2.2b didn't cover (e.g. the name-path, not the EAN-path), or older pre-2.2b residue. Task 1 exists specifically to answer that before committing to a fix shape.

### Relationship to Story 2.7 (BGG corpus title matching)

Story 2.7 (in-progress, spike-only) is about improving PL↔EN fuzzy-match *precision* for future matches (alternate-names corpus). It is related in spirit — both are about `_try_name_path` matching quality — but distinct in scope: 2.7 is forward-looking (better matches for products not yet matched), this story is backward-looking (find and reset already-wrong matches). Do not conflate the two; if Task 1 finds the root cause is the same weak fuzzy threshold 2.7 is trying to improve, note the connection but keep this story scoped to detection+cleanup of existing bad data, per AC 4's "may need to be split into its own follow-up story" language.

### Why not build detection as a blind similarity-threshold sweep (learned from 2.2b)

2.2b's Dev Notes explicitly rejected a broad auto-detection heuristic sweep because several legitimately large, correctly-matched clusters exist (Catan with 21 products, Warhammer: The Old World with 35) where real SKU/expansion names can look just as dissimilar as a poisoned cluster's names. AC 1 inherits this caution — whatever heuristic Task 2 lands on must be validated against those known-good clusters, not just tuned to catch the known-bad ones.

### Current state of the code you'll touch (verified @ a940cb1)

**`scraper/scraper/pipelines/deduplication.py`** — two match paths feed `_upsert_game`:
- `_try_ean_path` — hardened by 2.2b: evaluates every `bgg_info` candidate, keeps best `_name_match_score` (`token_sort_ratio`, not `WRatio`), rejects `< FUZZY_THRESHOLD` (85) and candidates `< 8` normalised chars. Disabled entirely when `GAMEUPC_API_KEY` unset.
- `_try_name_path` — BGG Search + same `_name_match_score` / threshold 85. **This path has no name cross-validation beyond the fuzzy score** and carries an explicit `TODO(korpus BGG)` noting PL↔EN string similarity is weak. Prime suspect for Task 1 if contamination is still being produced.
- `_upsert_game` — `INSERT ... ON CONFLICT (bgg_id) DO UPDATE SET updated_at = now() RETURNING id`. A wrong `bgg_id` from either path merges the product onto an existing unrelated `games` row. No `created_at` on `games` in this insert — Task 1.1's "predate 2.2b" check will need `products.created_at` / `price_history.scraped_at`, not a `games` timestamp.

**`scraper/scripts/cleanup_gameupc_contamination.py`** — the exact pattern to mirror for Task 3. Reusable pieces: `--execute`/`--force` argparse, `_log_target(conn)` (logs host+dbname), `find_affected_rows` → `log_affected_rows` → `write_backup` (timestamped CSV) → `reset_affected_rows` (single txn, `conn.rollback()` + `RuntimeError` if `cur.rowcount != expected_rows`, then `INSERT INTO data_retention_log (step, rows_affected)`), `unfinished_scrape_count` in-flight-scrape guard, best-effort `_revalidate_isr()` (`VERCEL_URL` + `REVALIDATION_SECRET`). 2.2c's version resets `game_id` (and `bgg_id` only if Task 1 shows it's the driver) to `NULL`; the `step` value should be a new one, e.g. `reset_gameid_contamination`.

### Schema / items.py

This story NULLs FK columns only — no `schema.ts` / `items.py` change, so the CLAUDE.md "schema.ts is source of truth, sync items.py in same PR" rule does not apply here. Confirm no migration is needed.

### Where to get `DATABASE_URL`

Pull it from the **Neon dashboard**, not from Vercel's env var UI — a prior incident in this project involved a stale/pooled `DATABASE_URL` copied from Vercel breaking a prod build mid-fix.

### Project Structure Notes

- New scripts go in `scraper/scripts/` (siblings of `cleanup_gameupc_contamination.py`, `spike_flipper_margin_proxy.py`), run as `cd scraper && python -m scripts.<name>`. Tests in `scraper/tests/` (`test_cleanup_gameid_contamination.py`, mirroring `test_cleanup_gameupc_contamination.py`).
- Python-side rules (CLAUDE.md): `logging.getLogger(__name__)` never `print()`; `datetime.now(timezone.utc)` never naive; prices are `NUMERIC` — not relevant here (no price parsing), but the detection query reads `price_history` for the verify step.
- `consent_log` is append-only — not touched by this story, but a reminder that `data_retention_log` is the correct audit sink for the reset (as the 2.2b script already does).
- No web/ files. No `epics.md` update (hotfix, not a planned epic story) — record the outcome in `docs/spike-results/flipper-margin-proxy.md`'s caveat section per AC 5.

### References

- [Source: docs/spike-results/flipper-margin-proxy.md] — "Caveat — game_id contamination" section, origin of this story
- [Source: _bmad-output/implementation-artifacts/2-2b-gameupc-key-hardening-data-cleanup.md] — sibling hotfix story, cleanup script pattern (`cleanup_gameupc_contamination.py`) and "why not a broad auto-detection sweep" reasoning to build on, not repeat
- [Source: scraper/scraper/pipelines/deduplication.py] — dedup pipeline, likely root-cause location for Task 1
- [Source: scraper/scripts/cleanup_gameupc_contamination.py] — script pattern to mirror for Task 3

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

- `./.venv/Scripts/python.exe -m pytest` used directly (same environment quirk noted in Story 8.2 — `uv run` fails on this machine's space-containing path).
- Live read queries run directly against the production Neon DB (`DATABASE_URL` from `scraper/.env`, user-confirmed as the correct Neon dashboard value) to reproduce and investigate the spike's 208-cluster finding — see Task 1 notes for the queries and findings. No writes were made to the database during this session.
- `detect_gameid_contamination.py` and `cleanup_gameid_contamination.py --game-ids 736` (dry-run only) were both run against production to verify they work against real data — see Task 2/3 notes for output.

### Completion Notes List

- **Root cause fully identified (Task 1):** contamination is residual pre-2.2b data, not an active bug. 206/208 candidate clusters have every member product created before 2.2b shipped; the 2 exceptions were manually verified to be legitimate same-family additions, not new bad merges. Mechanism matches 2.2b's own diagnosis (GameUPC demo-key + no name cross-validation), just discovered at a larger scale (208 affected `bgg_id`s vs. 2.2b's 2 manually-confirmed ones). No pipeline code was changed — Task 4 is N/A.
- **AC-1's fuzzy-similarity investigation had a negative but useful result:** manually verified that two large legitimate clusters (Warhammer: The Old World id=12, Star Wars: Legion — Clone Wars Core Set id=714) have product-name mutual similarity just as low as genuinely contaminated clusters. No similarity-based heuristic tried during this investigation could discriminate the two classes — this validates 2.2b's own caution against a blind auto-detection sweep, now confirmed empirically rather than just by analogy. The two verified-legitimate clusters are hardcoded as exclusions in the detection script; the remaining 206 need human review, same as 2.2b's approach, just at a larger scale.
- **Cleanup script design deviates from 2.2b's exact shape in one place, deliberately:** takes an operator-supplied `--game-ids` list instead of a hardcoded constant, because 208 candidates is too many to individually hand-verify within this story's scope (2.2b's 2 were both manually confirmed before the script was written). The script itself (dry-run default, `--execute` gate, backup, audit log, rollback-on-divergence) otherwise mirrors `cleanup_gameupc_contamination.py` exactly.
- **AC-5 (verify against the spike) is intentionally left incomplete.** Actually resetting 200+ production games' FKs is an irreversible, high-blast-radius write to shared infra. Following this project's own established pattern (Story 8.2's Task 8.4 — a live write against real Neon DB left for the operator, not run unilaterally by the AI agent), Task 5 requires the operator to: review candidates via `detect_gameid_contamination.py --detail <game_id>`, decide the confirmed list, run `cleanup_gameid_contamination.py --game-ids <list> --execute`, then re-run `spike_flipper_margin_proxy.py` to confirm the caveat numbers shrink. Status is kept `in-progress` (not `review`) until that's done — see this story's own Prerequisite-style note below, mirroring the status-consistency fix just applied to Story 8.2's own code review.
- Full scraper suite: 331 passed, 2 pre-existing unrelated failures (same local `.env`-leak issue noted in Story 8.2, files untouched by this story).

### File List

- `scraper/scripts/detect_gameid_contamination.py` (CREATE)
- `scraper/scripts/cleanup_gameid_contamination.py` (CREATE)
- `scraper/tests/test_detect_gameid_contamination.py` (CREATE, 7 tests)
- `scraper/tests/test_cleanup_gameid_contamination.py` (CREATE, 10 tests)

## Change Log

- 2026-08-22 — Story raised as a follow-up from Story 7.1's spike findings. Not yet started.
- 2026-08-30 — bmad-create-story context pass: verified all referenced files exist @ a940cb1, added "Current state of the code you'll touch" / "Project Structure Notes" / schema-sync note, refreshed `baseline_commit`. Status backlog → ready-for-dev.
- 2026-09-05 — bmad-dev-story: DATABASE_URL confirmed available, dev-story started. Task 1 (root-cause investigation) complete: contamination confirmed as residual pre-2.2b data, no active pipeline bug — Task 4 marked N/A. Task 2 (detection script) and Task 3 (cleanup script + tests) complete and verified against real production data (read-only / dry-run only, zero writes). Task 5 (live `--execute` + spike re-verification) intentionally left for the operator — same pattern as Story 8.2's Task 8.4. Status stays `in-progress`, not `review`, until Task 5 is done.
