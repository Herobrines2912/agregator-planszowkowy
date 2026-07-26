---
story_id: "2.7"
story_key: "2-7-bgg-corpus-title-matching"
epic: 2
epic_title: "Automated Price Data Collection"
status: "ready-for-dev"
dev: "Dev B (Scraper/BGG)"
depends_on: "Story 1.5 (done — BGG_API_TOKEN, BggClient), Story 2.2b (done — cross-contamination hardening)"
baseline_commit: "28b9048"
---

# Story 2.7: BGG Alternate-Names Coverage Spike (Part 1 of the "BGG-corpus title matching" initiative)

Status: ready-for-dev

> **Scope note (read before starting):** this story is **only Part 1 — SPIKE** of the two-part
> plan in `_bmad-output/implementation-artifacts/2-7-bgg-corpus-title-matching-DRAFT.md`. It
> produces a coverage measurement and a go/no-go recommendation — nothing else. **Part 2**
> (persisting a `game_aliases`-style corpus, `schema.ts` changes, changing the matching
> pipeline, `DlcWarning` UI wiring) is explicitly **out of scope** and will be created as its
> own future story (next available Epic 2 number — likely `2-9`, since `2-8` is already taken)
> only after a human reviews this spike's results and evaluates the gate below. Do not build
> Part 2 under cover of this story, even if the spike result is an obvious GO.
>
> This mirrors the established pattern in this project: Story 1.5/1.6 were spikes whose gate
> decisions shaped Story 2.1/2.2 — this spike plays the same role for the not-yet-created
> corpus-matching story.

## Story

As a **developer**,
I want to measure what fraction of our known-correct Polish product↔BGG-game mappings have the Polish store title present as a BGG `<name type="alternate">` entry,
so that the decision to build a BGG-alternate-names corpus for PL↔EN title matching (deferred from Story 2.2b's code review) is based on a real coverage number, not a guess.

## Why this exists (background)

Story 2.2b's code review flagged that the current matching approach (`_try_name_path` in `scraper/scraper/pipelines/deduplication.py`) is structurally weak for two cases: Polish↔English title mismatch, and expansion-vs-base-game confusion (an expansion's name contains the base game's name, so naive string similarity over-matches it onto the base game). The draft's key insight: **BGG already holds the Polish title on the game's own record** — the BGG `thing` endpoint returns `<name type="alternate">` entries, which commonly include international/localized editions. If a Polish store title is already present as one of those alternate names, matching PL↔PL (store title vs. BGG alternate name) instead of PL↔EN (store title vs. BGG primary name) turns an "inherently weak" fuzzy match into a much stronger one — no machine translation needed. This spike measures whether that's actually true often enough to be worth building on.

Full background, the expansion-vs-base insight, and why MT is rejected as a primary mechanism: see the DRAFT file referenced above (read it — it's short).

## Acceptance Criteria

1. **Given** the 22 known-correct (EAN, Polish store title, BGG ID) triples already recorded in `docs/spike-results/gameUPC-coverage.md` (each one a real product this codebase has already confirmed matches that `bgg_id`, per Story 1.6's spike) **When** each BGG ID's full `thing` record is fetched **Then** every fetched record's `<name type="alternate">` list is checked (fuzzy match, PL-normalized) against that row's Polish store title.
2. **Given** the sample size available (22 — see Dev Notes → "Sample size honesty") **When** reporting the result **Then** the coverage percentage is reported alongside the raw counts (e.g. "14/22 = 64%"), not just the percentage — a bare "64%" from n=22 overstates precision.
3. **Given** a Polish title that does **not** fuzzy-match any alternate name **When** cataloguing misses **Then** the miss is recorded with its store title, its BGG primary name, and (if discoverable within the same `thing` response) its publisher/distributor link — to check whether misses cluster by publisher (small/self-published titles are more likely to lack a curated alternate name than titles from majors already active on BGG).
4. **Given** the coverage result **When** the spike concludes **Then** `docs/spike-results/bgg-alternate-names-coverage.md` is created recording: the exact method, the full per-title table (title, BGG ID, alternate names found, matched Y/N), the coverage %, the miss examples from AC-3, and an explicit gate line: `"BGG-corpus title matching (Story 2.9+): GO"` if coverage ≥ 80%, or `"... : NO-GO, needs a supplementary alias source"` if below — mirroring the exact gate language style of `docs/spike-results/gameUPC-coverage.md`'s own "Gate Decision" section.
5. **Given** the spike script used **When** reviewed **Then** it exists at `scraper/scripts/spike_bgg_alternate_names.py`, is committed, uses `logging.getLogger(__name__)` (never `print()`), and reuses `BggClient` from `scraper/utils/bgg_client.py` for the BGG HTTP calls (rate limiting/backoff/token handling) rather than reinventing them.
6. **Given** `BggClient._parse_thing()` (`scraper/utils/bgg_client.py`) **When** extended for this story **Then** its returned dict gains one new key, `alternate_names: list[str]` (populated the same way `mechanics`/`designers`/`publishers` already are — `get_list("name[@type='alternate']")`), purely additive — no existing key removed or renamed, no existing caller (`scraper/utils/bgg_enrichment.py`, Story 2.4) breaks, and `scraper/tests/test_bgg_client.py` gains coverage for the new field without any existing test needing to change.

## Tasks / Subtasks

- [ ] **Task 1 — Extend `BggClient` to expose alternate names** (AC: 6) — `scraper/utils/bgg_client.py` (MODIFY)
  - [ ] 1.1 In `_parse_thing()`, add `"alternate_names": get_list("name[@type='alternate']")` to the returned dict — same `get_list(xpath, attr="value")` helper already used for `mechanics`/`designers`/`publishers` two lines above, just a different xpath. `<name type="alternate">` elements carry the localized/international titles as a `value` attribute, same shape as `<name type="primary">`.
  - [ ] 1.2 `scraper/tests/test_bgg_client.py` (MODIFY): add one test fixture/assertion covering a `thing` response with 2+ `<name type="alternate">` elements, asserting `alternate_names` is a list of their `value`s in document order. Run the full existing suite for this file to confirm zero regressions (the new key is additive; no existing test should need changes).
  - [ ] 1.3 Sanity-check `scraper/utils/bgg_enrichment.py` (Story 2.4's caller of `BggClient.get_thing_with_retry`) doesn't destructure the returned dict in a way an extra key would break (e.g. `**kwargs` fan-out into a strict-arity function) — read it before assuming; if it does, adjust only the enrichment call site, not `_parse_thing`.

- [ ] **Task 2 — Build the known-correct sample** (AC: 1, 2) — no file yet, feeds Task 3's script
  - [ ] 2.1 Extract the 22 (Polish store title, BGG ID) pairs from `docs/spike-results/gameUPC-coverage.md`'s results table (ignore the EAN column and the `bgg_info_status` column — not needed here).
  - [ ] 2.2 Optional, only if time allows and it's cheap: grow the sample past 22 by querying the production DB for `products` rows with a non-`NULL` `bgg_id` that were matched via the name-path (not the two now-reset poisoned clusters — `232420`, `178255`, confirmed empty as of 2026-07-26) — more samples narrow the confidence interval in AC-2's honesty note. Not required; 22 is an acceptable, already-available floor. Do not spend more than a few minutes on this before falling back to the 22.

- [ ] **Task 3 — Spike script** (AC: 1, 3, 5) — `scraper/scripts/spike_bgg_alternate_names.py` (CREATE)
  - [ ] 3.1 For each (title, bgg_id) pair: `BggClient(token).get_thing_with_retry(bgg_id)` (reuses existing 1s throttle + 60/120/240s backoff on 429/202 — do not add a second sleep/retry loop around it).
  - [ ] 3.2 Normalize the store title using `_normalise_name` imported from `scraper.pipelines.deduplication` (Polish diacritic transliteration + edition-suffix stripping — same normalization the real matching pipeline already applies, so this spike measures the same comparison Part 2 would actually make, not an idealized one).
  - [ ] 3.3 Fuzzy-match the normalized store title against each of `result["alternate_names"]` (also normalize each candidate the same way — comparing PL-normalized text against PL-normalized text, not PL vs raw BGG-formatted text) using `rapidfuzz.fuzz.token_sort_ratio` (already a dependency, used in `deduplication.py`). Record the best score and which alternate name produced it. Suggest starting threshold 85 (same constant already used elsewhere as `FUZZY_THRESHOLD`) — this is a spike, so also log the actual best score for every title (matched or not) in the output table, so a human can sanity-check whether 85 is the right cutoff before Part 2 hard-codes it.
  - [ ] 3.4 On a miss (no alternate name clears the threshold), also record the BGG primary name and, if present in the `thing` response, the publisher link(s) (`get_list("link[@type='boardgamepublisher']")` — already returned as `result["publishers"]`) for the clustering check in AC-3.
  - [ ] 3.5 `logging.getLogger(__name__)` throughout, never `print()`. Run via `cd scraper && uv run python -m scripts.spike_bgg_alternate_names` (matches the existing `scripts/` package convention — see `scraper/scripts/__init__.py`, already present from Story 1.6).

- [ ] **Task 4 — Document results and write the gate decision** (AC: 2, 3, 4) — `docs/spike-results/bgg-alternate-names-coverage.md` (CREATE)
  - [ ] 4.1 Full per-title table: store title, BGG ID, best-matching alternate name (or "—"), best score, matched Y/N.
  - [ ] 4.2 Coverage line in the "N/total = XX%" form (AC-2), not a bare percentage.
  - [ ] 4.3 Miss examples with publisher, and an explicit note on whether misses cluster by publisher or look scattered.
  - [ ] 4.4 Explicit gate line per AC-4's exact wording pattern. **Do not** create the Part-2 story file yourself even on a clear GO — that is a separate, later `create-story` invocation, after the human (Kacper) reviews this report.

- [ ] **Task 5 — verify** — `cd scraper && uv run pytest` full suite green (watch for the same pre-existing local-`.env`-only flakes documented in Story 2.2b's Debug Log — unrelated, do not chase).

## Dev Notes

### Sample size honesty

The draft stub suggested "N (e.g. 100–200)" — this codebase currently has exactly **22** confirmed-correct (title, bgg_id) pairs readily available (Story 1.6's spike corpus), and Task 2.2 makes growing that a nice-to-have, not a requirement. Report the coverage number with its raw counts and don't imply more statistical confidence than n=22 supports — a swing of even 2–3 titles moves the percentage by ~10 points. If the result lands near the 80% gate line (say, 70–90%), say so explicitly in the report rather than letting a single-number gate decision hide how close/uncertain it is — that nuance is exactly what the human reviewing the gate needs to make a good call, and it's cheap to include.

### Why extend `BggClient` rather than parse XML again in the spike script

`_parse_thing()` already walks the exact same `<item>` tree this spike needs `<name type="alternate">` from — re-parsing the raw XML separately in the spike script would duplicate work and risk drifting from the production parser's conventions (e.g. its existing `get_list` helper already handles missing/malformed elements safely). The one-line addition in Task 1 is purely additive (a new dict key), so it's safe to land in shared production code even though this story's own use of it is a one-off script — and it means Part 2 (if it happens) already has `alternate_names` available on every `BggClient.get_thing_with_retry()` call without having to revisit this file again.

### Reuse `_normalise_name`, not a fresh normalizer

`scraper/scraper/pipelines/deduplication.py::_normalise_name` already strips edition suffixes (`"(edycja polska)"`, `"Deluxe"`, `"Base Game"`, etc.) and transliterates Polish diacritics — exactly the normalization Part 2 would apply to both sides of the comparison if it ever gets built. Importing it here (rather than writing a second, spike-only normalizer) means this spike's coverage number is measuring what Part 2 would actually see, not an optimistic idealized version. `scraper/scripts/` importing from `scraper/scraper/pipelines/` is fine — Python path-wise this is just another package import, no circular dependency (the pipeline module doesn't import from `scripts/`).

### What this story does NOT include (repeat, deliberately, from the scope note above)

- No `schema.ts` change, no new table (`game_aliases` or otherwise) — that's Part 2.
- No change to `deduplication.py`'s actual matching behavior — this spike only *measures*, it doesn't wire alternate-name matching into the live pipeline.
- No `DlcWarning` / UI work — Dev A territory, and Part 2's problem regardless.
- No new story file for Part 2 — see Task 4.4.

### File Locations

```
scraper/
  utils/
    bgg_client.py                      ← MODIFY (Task 1)
  scripts/
    spike_bgg_alternate_names.py       ← NEW (Task 3)
  tests/
    test_bgg_client.py                 ← MODIFY (Task 1.2)
docs/
  spike-results/
    bgg-alternate-names-coverage.md    ← NEW (Task 4)
```

**DO NOT touch:** `web/` (Dev A), `scraper/scraper/pipelines/deduplication.py` beyond *importing* `_normalise_name` from it (read-only reuse, no edits to that file), `schema.ts`, any migration.

### Previous story learnings (from Story 2.2b / 2.8 Dev Agent Records)

- Import path convention in `scraper/`: `utils.bgg_client`, not `scraper.utils.bgg_client` — `utils/` and `scripts/` both live at the `scraper/` root, sibling to the inner `scraper/` Scrapy package, not inside it (confirmed again in Story 1.6's own Dev Notes).
- Run scripts from the `scraper/` directory: `cd scraper && uv run python -m scripts.<name>` — this project uses `uv`, not bare `python`, for anything touching the managed venv (confirmed necessary in this session: `python -m scripts.cleanup_gameupc_contamination` failed with `ModuleNotFoundError: No module named 'psycopg2'`; `uv run python -m scripts...` worked).
- `rapidfuzz` is already a dependency (used throughout `deduplication.py`) — no new `uv add` needed.
- A handful of pre-existing tests in this codebase fail locally-only because `load_dotenv()` silently repopulates env vars a test tried to `clear=True` — documented at length in Story 2.2b's Debug Log. Not this story's concern; don't try to fix it here.

### References

- [Source: _bmad-output/implementation-artifacts/2-7-bgg-corpus-title-matching-DRAFT.md] — the full two-part plan this story's Part 1 implements; read in full before starting.
- [Source: docs/spike-results/gameUPC-coverage.md] — source of the 22-item known-correct sample (Task 2.1); also the stylistic precedent for the gate-decision report format this story's own output (Task 4) should match.
- [Source: _bmad-output/implementation-artifacts/1-6-gameUPC-coverage-spike.md] — structural precedent for this story: a spike with its own gate, script, and results doc, deliberately not building the thing it's gating.
- [Source: scraper/utils/bgg_client.py] — `BggClient`, read in full; `_parse_thing()` is what Task 1 extends.
- [Source: scraper/scraper/pipelines/deduplication.py] — `_normalise_name`, `_name_match_score`, `FUZZY_THRESHOLD` (85) — reused, not reinvented, per Task 3.
- [Source: _bmad-output/implementation-artifacts/2-2b-gameupc-key-hardening-data-cleanup.md, Dev Notes → "Second gap found"] — origin of the "rely on existing BGG title-match logic" recommendation this whole initiative traces back to.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change |
|---|---|
| 2026-07-26 | Story created via `create-story`, scoped to Part 1 (spike) only per explicit instruction — Part 2 deferred to a future story pending this spike's gate result. |
