---
baseline_commit: 0d7194b2e08b09269e21f367afbc66554f517760
---

# Story 2.8: GameUPC Crowdsource Vote-Back — `POST /upc/{upc}/bgg_id/{bgg_id}`

Status: ready-for-dev

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

- [ ] **Task 1 — Vote-back on a confident EAN-path match** (AC: 1, 2, 6, 7) — `scraper/scraper/pipelines/deduplication.py` (MODIFY)
  - [ ] 1.1 Add module constant near `GAMEUPC_BASE_TEST`/`GAMEUPC_BASE_PROD`: `GAMEUPC_VOTER_ID = "agregator-planszowek-pl"` (or equivalent — must be ≥8 chars per the maintainer's stated constraint; the OpenAPI spec itself documents `user_id` as a required string with no explicit length limit, so this is a courtesy minimum, not an enforced one). Comment: stable, non-secret identifier for *this app*, not per-request — GameUPC's spec describes it as "should be persistent on the device/consumer using it."
  - [ ] 1.2 Add private method `_vote_back(self, ean: str, bgg_id: int) -> None`:
    - Guard: `if not self._gameupc_key: return` (no key → no vote, same reasoning as the EAN-lookup guard).
    - `POST f"{self._gameupc_base}/{ean}/bgg_id/{bgg_id}"`, JSON body `{"user_id": GAMEUPC_VOTER_ID}`, header `{"x-api-key": self._gameupc_key}`.
    - Wrap the request + `response.raise_for_status()` in `try/except Exception`, `logger.warning("GameUPC vote-back failed for EAN %s -> bgg_id=%d: %s", ean, bgg_id, exc)` on failure, never re-raise. This one method covers AC 5 (key guard) and AC 6 (failure isolation).
  - [ ] 1.3 In `_try_ean_path`, immediately before the existing `return best_bgg_id` (i.e. after the `best_score < FUZZY_THRESHOLD` rejection branch has already returned `None`): if `data.get("bgg_info_status") != "verified"`, call `self._vote_back(ean, best_bgg_id)`. **Do not** touch the existing scoring/acceptance logic — this is a read of an already-available field (`data`, already parsed) purely to decide whether to vote, not whether to trust.
  - [ ] 1.4 `test_deduplication.py`: give `_gameupc_response()` and `_gameupc_multi()` an optional `status: str = "choose_from_bgg_info_or_search"` kwarg (the default preserves every existing call site unmodified). Add:
    - a case with `status="verified"` → confident match still accepted, but `mock_http.post.assert_not_called()`.
    - the default-status confident-match case → `mock_http.post` called once; assert the URL ends in `.../{ean}/bgg_id/{bgg_id}` and the JSON body contains `"user_id"`.
    - vote-back `POST` raises (`mock_http.post.side_effect = httpx.ConnectError(...)`) → item's `bgg_id`/`game_id` still resolve normally, no exception propagates.

- [ ] **Task 2 — Vote-back on the name-path fallback for an EAN GameUPC couldn't confidently resolve** (AC: 3, 4, 5, 6, 7) — `scraper/scraper/pipelines/deduplication.py` (MODIFY)
  - [ ] 2.1 In `process_item`, the only change: after the existing `if bgg_id is None: bgg_id = self._try_name_path(...)` line, add `if bgg_id is not None and ean: self._vote_back(ean, bgg_id)`. Current shape (`ean = item.get("ean"); bgg_id = None; if ean: bgg_id = self._try_ean_path(...); if bgg_id is None: bgg_id = self._try_name_path(...)`) is otherwise unchanged.
  - [ ] 2.2 Tests:
    - empty `bgg_info` (`_gameupc_response`-shaped but `"bgg_info": []`, or reuse the existing 404-style fixture) → falls through to name-path → name-path resolves → assert `_vote_back` fires (via `mock_http.post` assertion) for that `ean`.
    - extend `test_no_gameupc_key_ean_path_skipped_falls_through_to_name_path`: assert `mock_http.post` is never called (no key → `_vote_back`'s own guard short-circuits even though `ean` is present and name-path succeeds).
    - no `ean` on the item at all, name-path resolves → `mock_http.post` never called.
    - extend `test_ean_path_candidate_name_mismatch_falls_through_to_name_path` (GameUPC suggests a wrong candidate, name-path recovers the correct one): assert vote-back fires with the *name-path's* `bgg_id` (31260), not GameUPC's rejected one (999999).

- [ ] **Task 3 — verify** (AC: 7) — `cd scraper && uv run pytest` full suite green. Compare against the Story 2.2b baseline (172 passed / 6 failed, all pre-existing local-`.env`-only flakes, documented in 2-2b's Debug Log) — the delta should be exactly this story's new tests; do not chase the 6 pre-existing failures, they are unrelated and environment-only (real `scraper/.env` on this machine defeats `clear=True` env-patch tests via `load_dotenv()`).

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

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
