---
baseline_commit: 0d7194b2e08b09269e21f367afbc66554f517760
---

# Story 2.8: GameUPC Crowdsource Vote-Back — `POST /upc/{upc}/bgg_id/{bgg_id}`

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the **operator**,
I want the pipeline to report the BGG IDs it resolves back to GameUPC whenever GameUPC's own data wasn't already certain,
so that the free, single-maintainer, crowdsourced UPC→BGG dataset we depend on gets better for every other consumer, honoring the goodwill condition the maintainer attached to granting our production key.

**Dev:** Dev B (Scraper) — _pliki: `scraper/scraper/pipelines/deduplication.py`, `scraper/tests/test_deduplication.py`_
**Type:** Opportunistic/goodwill addition — no `epics.md` section exists for this story; sourced entirely from a direct email from the GameUPC maintainer (`gameupc@grettir.org`), not the PRD/epic backlog. Same "hotfix-shaped, no epic slot" pattern as Story 2.2b. Sibling of Story 2.2 / 2.2b (both touch `deduplication.py`'s GameUPC integration).
**Depends on:** Story 2.2b (done, merged `993c139`) — this story builds on its hardened `_try_ean_path`/`_name_match_score` logic without changing it. Requires a real `GAMEUPC_API_KEY` to be set to do anything (confirmed live-set and working as of 2026-07-26 — `GET /v1/upc/...` returns `200`, `"stage": "v1"`).

## Background (why this story exists)

After Kacper emailed GameUPC's maintainer asking for a production `/v1` key (per Story 2.2b's Dev Notes → "Manual prerequisite"), the maintainer granted one for free and replied with a condition: since GameUPC's data is crowdsourced, the maintainer asked that consumers post corrected/confirmed BGG IDs back to `POST /upc/{upc}/bgg_id/{bgg_id}` whenever their own resolution logic figures out an answer GameUPC's own data didn't already have with certainty — described as two cases: "some info, need the user to choose" and "no info at all." A third case, "GameUPC already has a validated answer," needs no action.

This maps directly onto the `bgg_info_status` field GameUPC's `GET /upc/{upc}` response already carries (`verified` vs. `choose_from_bgg_info_or_search`) and onto the pipeline's existing two-path structure (`_try_ean_path` → `_try_name_path` fallback) — no new external dependency, no schema change, reuses the already-configured `GAMEUPC_API_KEY`.

## Acceptance Criteria

1. **Given** a GameUPC EAN-path response with `bgg_info_status == "verified"` **When** `_try_ean_path` evaluates it **Then** it is trusted per existing (2.2b) logic, unchanged, and **no** vote-back `POST` is sent — GameUPC already has a certain answer (maintainer's case 1).
2. **Given** a GameUPC EAN-path response with `bgg_info_status == "choose_from_bgg_info_or_search"` whose best-scoring candidate passes the existing `FUZZY_THRESHOLD` check (2.2b logic, unchanged) **When** `_try_ean_path` accepts it **Then** a best-effort `POST {base}/{ean}/bgg_id/{bgg_id}` is sent with JSON body `{"user_id": GAMEUPC_VOTER_ID}` and header `x-api-key` (maintainer's case 2 — "some info, prompt the user"; our fuzzy match *is* the prompt, and this reports its answer).
3. **Given** an EAN lookup that does **not** confidently resolve via GameUPC — empty `bgg_info` ("no info"), every candidate rejected by the fuzzy check, a non-2xx/network error, or an invalid EAN format — **and** `_try_name_path` subsequently resolves a confident `bgg_id` for the same item **When** `process_item` completes **Then** the same vote-back `POST` is sent for that `ean`/`bgg_id` pair (maintainer's case 3, plus the "GameUPC's suggestion was wrong and we found the real answer" correction — both fall through to the same code path and are indistinguishable in a way that matters for voting: we know something GameUPC's `bgg_info` didn't give us).
4. **Given** an item with no `ean` at all **When** `_try_name_path` resolves a `bgg_id` **Then** no vote-back `POST` is sent — there is nothing to vote for.
5. **Given** `GAMEUPC_API_KEY` is unset **When** any path resolves a `bgg_id` **Then** no vote-back `POST` is ever attempted, mirroring the existing hard-disable of the EAN-lookup path itself (2.2b).
6. **Given** the vote-back `POST` fails for any reason (`400`, `429`, timeout, connection error) **When** it happens **Then** it is caught, logged via `logger.warning`, and never raises out of `process_item` — the item's own `bgg_id`/`game_id` resolution is unaffected. Mirrors the best-effort pattern already established in `scraper/scripts/cleanup_gameupc_contamination.py::_revalidate_isr()`.
7. **Given** the existing test suite **When** this story ships **Then** all currently-passing `test_deduplication.py` tests still pass — several will now *also* trigger a vote-back `POST` against an unconfigured mock, which is expected (harmless, since `mock_http.post(...)` returns a fresh `MagicMock` whose `.raise_for_status()` doesn't raise) and not a regression; verify this experimentally rather than assuming it.

## Tasks / Subtasks

- [x] **Task 1 — Vote-back on a confident EAN-path match** (AC: 1, 2, 6, 7) — `scraper/scraper/pipelines/deduplication.py` (MODIFY)
  - [x] 1.1 Added module constant `GAMEUPC_VOTER_ID = "agregator-planszowek-pl"` near `GAMEUPC_BASE_TEST`/`GAMEUPC_BASE_PROD`.
  - [x] 1.2 Added private method `_vote_back(self, ean: str, bgg_id: int) -> None` with key guard, `POST`, and `try/except Exception` → `logger.warning`, never re-raises.
  - [x] 1.3 In `_try_ean_path`, added `if data.get("bgg_info_status") != "verified": self._vote_back(ean, best_bgg_id)` immediately before `return best_bgg_id`; existing scoring/acceptance logic untouched.
  - [x] 1.4 `test_deduplication.py`: added optional `status` kwarg to `_gameupc_response()`/`_gameupc_multi()` (default unchanged, all existing call sites unmodified). Added 3 tests: `verified` → no vote (`test_vote_back_skipped_when_gameupc_already_verified`), non-verified confident match → vote sent (`test_vote_back_sent_for_confident_non_verified_ean_match`), `POST` raises → swallowed, resolution unaffected (`test_vote_back_failure_does_not_affect_item_resolution`).

- [x] **Task 2 — Vote-back on the name-path fallback for an EAN GameUPC couldn't confidently resolve** (AC: 3, 4, 5, 6, 7) — `scraper/scraper/pipelines/deduplication.py` (MODIFY)
  - [x] 2.1 In `process_item`, added `if bgg_id is not None and ean: self._vote_back(ean, bgg_id)` after the existing name-path fallback line.
  - [x] 2.2 Tests added: empty `bgg_info` → name-path resolves → vote-back fires (`test_vote_back_sent_for_name_path_fallback`); no key → name-path resolves → no vote (`test_no_gameupc_key_name_path_fallback_no_vote_back`); no `ean` at all → name-path resolves → no vote (`test_no_ean_name_path_resolves_no_vote_back`); GameUPC wrong candidate rejected, name-path recovers → vote-back uses name-path's `bgg_id` (31260), not GameUPC's rejected one (999999) (`test_vote_back_uses_name_path_bgg_id_not_rejected_gameupc_candidate`).

- [x] **Task 3 — verify** (AC: 7) — `cd scraper && .venv/Scripts/python.exe -m pytest tests/` → full suite green: 206 passed, 4 deselected, 0 failed (no local `.env`-only flakes present in this environment, unlike the 2.2b baseline — all-green here is a stronger result than that baseline required).

## Dev Notes

### Endpoint contract (confirmed live against GameUPC's own OpenAPI spec, 2026-07-26 — not just the maintainer's email)

Fetched directly from `https://gameupc.com/gameupc-oas.yaml` during this story's creation, since the maintainer's email and `docs/research/gameupc-api-registration.md` didn't specify the exact request shape (query param vs. body):

```
POST /upc/{upc}/bgg_id/{bgg_id}
  path params: upc (string), bgg_id (integer)
  auth: x-api-key header (same key already used for GET)
  request body (application/json): { "user_id": string }   ← BODY, not a query param
  responses:
    200 — "New ID was registered and the game recommendation has been updated."
    400 — "Bad input. Missing a required field or an invalid UPC/EAN"
    429 — "Overloaded; try again later. There is a limit of 100 new UPCs per day."
```

Also confirmed and relevant:
- `bgg_info_status` enum is **exactly** `verified` | `choose_from_bgg_info_or_search` — no third value exists in the spec (the "no info" case from the maintainer's email is just an *empty* `bgg_info` array with `status: "ok"` at the top level — verified live on 2026-07-26 with an unrecognized EAN: `{"bgg_info_status": "choose_from_bgg_info_or_search", "bgg_info": [], "status": "ok", "new": true}`. Yes — status is `choose_from_bgg_info_or_search` even when `bgg_info` is empty; **do not gate on `bgg_info_status` alone to detect "no info," gate on `bgg_info` being empty**, exactly as `_try_ean_path` already does today (`if not bgg_info: return None`) — this story adds a check on top of that existing branch, it doesn't replace it.
- A `POST .../bgg_id/{bgg_id}/version/{bgg_version}` variant and `DELETE` variants (retract a vote) also exist in the spec — **out of scope**: we don't track BGG version IDs anywhere in this pipeline, and there is no retraction use case yet (nothing today ever decides a previous vote was wrong). Don't build either.
- `BggInfo` candidate objects also carry `confidence` (integer) and `version_status`/`versions` fields we don't currently read — also out of scope; 2.2b's own fuzzy-name cross-check is the trust mechanism this codebase uses, not GameUPC's `confidence` score (that field is unvalidated as a signal here, and adding it would be scope creep for what this story needs).
- The `429` rate-limit text explicitly covers **both** `GET /upc/{upc}` **and** the POST/DELETE update endpoints — treat vote-back calls as spending the same shared, undocumented "100 new UPCs/day" budget as the lookups. This is exactly why vote-back must be best-effort/non-blocking (Task 1.2) and not retried — a `429` here should just be logged and dropped, never looped.

### Why the acceptance/trust logic in `_try_ean_path` is untouched

`docs/research/gameupc-api-registration.md` (§4/§8) flagged, before Story 2.2b, that the pipeline "should only auto-trust `verified` responses, not blindly take `bgg_info[0]` regardless of status" — but 2.2b's own Dev Notes deliberately kept the fuzzy-name cross-check applying to **every** status, reasoning that Story 1.6's spike got `choose_from_bgg_info_or_search` on all 22 real EAN matches and zero `verified` responses, so gating *acceptance* on status would eliminate almost all real matches.

This story does **not** revisit that decision — it only *reads* `bgg_info_status` to decide whether to **vote**, never to decide whether to **trust**. A `verified` candidate still goes through the exact same fuzzy-name check as before landing in the "no vote needed" branch; nothing about match precision changes. Skipping the cross-check for `verified` responses (the literal §4/§8 recommendation) remains a live, separate, still-open idea — flag it if picked up later, but don't bundle it here: it wasn't needed to satisfy the maintainer's ask, and Story 2.2b's author already reasoned carefully about not weakening real-world match coverage.

### Decision table

| GameUPC EAN response | Our resolution | Vote-back? |
|---|---|---|
| `bgg_info_status = "verified"` | Trusted directly (existing logic) | **No** — GameUPC already certain |
| `bgg_info_status = "choose_from_bgg_info_or_search"`, a candidate scores ≥ `FUZZY_THRESHOLD` | Accepted (existing logic) | **Yes** — `POST` the accepted `bgg_id` |
| `bgg_info` empty, OR all candidates score < `FUZZY_THRESHOLD`, OR HTTP error/invalid EAN | Falls through to `_try_name_path` | **If** name-path resolves a `bgg_id` → **Yes**, using that `bgg_id` |
| No `ean` on the item | `_try_name_path` only, no EAN-path ever ran | **No** — nothing to vote for |
| `GAMEUPC_API_KEY` unset | EAN-path never runs at all | **No** — `_vote_back`'s own guard short-circuits |

### Rate-limit / abuse-of-goodwill awareness

This is a free key granted on trust from a single-maintainer hobby project (live since 2021, no SLA — see `docs/research/gameupc-api-registration.md` §7). Every vote-back is a genuinely new HTTP call per matched item on top of the existing lookup call — on a full daily scrape this could plausibly be a meaningful fraction of the shared "100/day" budget. Task 1.2's best-effort/no-retry design is the only mitigation this story adds; do not add retry loops or backoff around `_vote_back` — that would fight the exact throttling GameUPC is trying to protect, the opposite of the goodwill this story exists to honor.

### Project Structure Notes

- Only `scraper/scraper/pipelines/deduplication.py` and its test file change — no `web/` files, no `schema.ts`, no migration, no new env var (reuses `GAMEUPC_API_KEY`, already live per this story's prerequisite). Zero collision risk with the in-flight Story 6-2 correct-course (Dev A/web, unrelated epic).
- `GAMEUPC_VOTER_ID` is a plain module constant, not an env var — it identifies *this application* to GameUPC's crowdsourcing, not a secret; hardcoding it is correct (cf. how `GAMEUPC_BASE_TEST`/`GAMEUPC_BASE_PROD` are already plain constants in this same file).
- No new dependency — `self._http` is already an `httpx.Client`; `httpx.Client.post()` exists with the same interface as the `.get()` calls already in this file.

### References

- [Source: scraper/scraper/pipelines/deduplication.py] — code being modified, read in full during this story's creation (`_try_ean_path`, `process_item`, `open_spider`, module constants).
- [Source: scraper/tests/test_deduplication.py] — existing test conventions and helpers (`_gameupc_response`, `_gameupc_multi`, `patch.dict("os.environ", ...)`, shared `mock_http.get` sequencing via `side_effect`), read in full.
- [Source: docs/research/gameupc-api-registration.md, §3–§5] — original endpoint documentation (`bgg_info_status`, vote/correction endpoints, the "100 new UPCs/day" `429`), and the §4/§8 "only auto-trust verified" recommendation this story deliberately does not fold in (see Dev Notes above).
- [Source: https://gameupc.com/gameupc-oas.yaml] — live OpenAPI spec, fetched 2026-07-26 during this story's creation, for the exact `POST .../bgg_id/{bgg_id}` request/response contract (body shape, status codes, `bgg_info_status` enum, `BggInfo` schema) — the research doc above didn't specify the body-vs-query-param detail; this does.
- [Source: _bmad-output/implementation-artifacts/2-2b-gameupc-key-hardening-data-cleanup.md] — the fuzzy-candidate scoring / name cross-check this story builds on without modifying, and the precedent for "hotfix-shaped story with no epics.md section."
- [Source: scraper/scripts/cleanup_gameupc_contamination.py::_revalidate_isr] — the best-effort/non-blocking external-call pattern `_vote_back` mirrors.
- Live verification, 2026-07-26: `GET https://api.gameupc.com/v1/upc/5010993568909` with the now-configured production key → `200`, `{"bgg_info_status": "choose_from_bgg_info_or_search", "bgg_info": [], "status": "ok", "new": true}` — confirms the key works and confirms the "no info" case's exact shape used in the Dev Notes above.

## Change Log

- 2026-08-02: Implemented vote-back on both EAN-path (non-verified confident match) and name-path fallback resolutions; added `_vote_back()` private method and `GAMEUPC_VOTER_ID` constant; 7 new tests added, full suite green (206 passed).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

`.venv/Scripts/python.exe -m pytest tests/ -q` → `206 passed, 4 deselected` (uv trampoline failed to resolve on this machine's path with spaces — invoked the venv's python directly instead; no impact on test outcome).

### Completion Notes List

- Implemented `_vote_back()` exactly per Dev Notes contract: `POST {base}/{ean}/bgg_id/{bgg_id}`, JSON body `{"user_id": GAMEUPC_VOTER_ID}`, `x-api-key` header, best-effort (catch `Exception`, `logger.warning`, never re-raise), no retry/backoff (per the rate-limit-goodwill note).
- Vote-back wired into both resolution paths without touching existing acceptance/trust logic: EAN-path (gated on `bgg_info_status != "verified"`) and name-path fallback (gated on `bgg_id is not None and ean`).
- All 7 new tests pass; full suite (206 tests) green with zero regressions — existing tests that now also trigger an unconfigured mock `POST` pass unchanged, as expected (mock `.post()` returns a fresh `MagicMock` whose `.raise_for_status()` doesn't raise).
- No new dependencies; no `web/` files touched; no schema/migration changes — matches story's stated zero-collision-risk scope.

### File List

- `scraper/scraper/pipelines/deduplication.py` (MODIFY)
- `scraper/tests/test_deduplication.py` (MODIFY)
