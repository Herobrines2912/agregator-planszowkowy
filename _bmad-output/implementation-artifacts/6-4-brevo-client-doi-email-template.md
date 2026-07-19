---
baseline_commit: ddf0554
---

# Story 6.4: Brevo Client & Szablon Emaila DOI (Double Opt-In)

Status: review

**Epic:** 6 — Email Price Alerts
**Dev:** Dev B (Scraper/Infra)
**Depends on:** nothing blocking — can start now, in parallel with Epic 5/7 work (epics.md: "można zacząć podczas Epic 5")
**Followed by:** Story 6.5 (Alert Engine) imports and calls this module; Story 6.6 (price-drop email) reuses the same Brevo-send helper with a different template

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

---

## Story

As a **developer**,
I want a Brevo transactional-email client and a Double Opt-In (DOI) email template,
so that later stories (6.5 alert engine, 6.2 confirmation flow) can trigger the DOI email without any code coupling to Brevo's API details, and without ever calling Brevo from `web/`.

---

## Acceptance Criteria

### AC-1 — `send_doi_email()` contract

- Given `scraper/utils/brevo_client.py` (see Dev Notes for the file-location decision)
- When `send_doi_email(to_email: str, confirmation_url: str, game_name: str, target_price: str) -> bool` is called
- Then it POSTs to Brevo transactional email API v3 (`https://api.brevo.com/v3/smtp/email`) using the rendered DOI HTML template, returns `True` on any 2xx response, logs a warning and returns `False` on any non-2xx response — **never raises** for HTTP-level failures (network/DNS errors are the one exception: let them propagate, do not swallow — matches BGG client's `response.raise_for_status()` pattern for non-rate-limit errors)

### AC-2 — Rate-limit retry

- Given the Brevo API call returns HTTP 429
- When `send_doi_email()` is running
- Then the client retries **once** after a 2-second sleep, then (if the retry also fails) logs and returns `False` — this is a simpler single-retry variant of the BGG client's `get_thing_with_retry()` backoff pattern (`scraper/utils/bgg_client.py`), not the same 3-attempt/60-120-240s schedule — do not copy BGG's `_RETRY_DELAYS` list

### AC-3 — `doi_email.html` template content

- Given `scraper/templates/doi_email.html`
- When rendered with `game_name` and `target_price`
- Then it shows: heading "Potwierdź powiadomienia o cenie", the game name, target price formatted as `"{price} zł"`, a large "Potwierdź →" button/link pointing to `confirmation_url`, and a footer with "Jeśli nie prosiłeś o to powiadomienie, zignoruj tę wiadomość" plus an unsubscribe link
- And styling matches the app palette: parchment background `#F2EAD8`, primary green `#3D5C3A` for the CTA button — **not** Brevo's default template styling
- Note: no unsubscribe token exists yet at DOI stage (unsubscribe is Story 6.3, confirmed alerts only) — render the footer unsubscribe link as a static placeholder href (e.g. `#`) or omit the link entirely and keep only the ignore-this-email sentence; do not fabricate a token. Flag this as a decision in Dev Notes since epics.md's AC text assumes a working unsubscribe link that doesn't exist yet.

### AC-4 — Fail-fast on missing API key

- Given `BREVO_API_KEY` env var
- When `scraper/utils/brevo_client.py` is imported and the var is missing/empty
- Then the module raises `EnvironmentError` **at import time** (module top-level, not inside `send_doi_email()`) — fail fast, not at send time
- This deliberately diverges from `bgg_enrichment.py`'s pattern (which calls `load_dotenv()` + reads `BGG_API_TOKEN` inside a function, not at import) — epics.md is explicit for this story: import-time fail-fast. See Dev Notes for how to make this testable.

### AC-5 — No raw email in logs

- Given any log line in `brevo_client.py` that references the recipient
- When `send_doi_email()` runs (success, failure, or retry path)
- Then the raw email address is never logged — only `SHA-256(email)[:8]` (matches `consent_log` hashing convention already used in `web/src/db/queries/alerts.ts`)

### AC-6 — Sender identity (gap not covered by epics.md — required for the Brevo API call to work)

- Brevo's `POST /v3/smtp/email` requires a `sender: { email, name }` field; no such env var currently exists in `scraper/.env.example` (only `BREVO_API_KEY` is defined there)
- Add `BREVO_SENDER_EMAIL` and `BREVO_SENDER_NAME` to `scraper/.env.example`, read them the same way as `BREVO_API_KEY` (import-time fail-fast, same reasoning as AC-4 — a missing sender makes every send fail identically to a missing API key)

---

## Tasks / Subtasks

- [x] T1: Add `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` to `scraper/.env.example` (AC-6)
- [x] T2: Create `scraper/templates/doi_email.html` (AC-3) — static HTML, `{{game_name}}` / `{{target_price}}` / `{{confirmation_url}}` placeholders (pick one substitution style and use it consistently — see Dev Notes)
- [x] T3: Create `scraper/utils/brevo_client.py` (AC-1, AC-2, AC-4, AC-5, AC-6)
  - [x] Module-level fail-fast checks for `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` (AC-4, AC-6)
  - [x] `_load_template(name: str) -> str` — reads a file from `scraper/templates/`
  - [x] `_render(template: str, **kwargs) -> str` — substitutes placeholders
  - [x] `send_doi_email(to_email, confirmation_url, game_name, target_price) -> bool`
  - [x] SHA-256(email)[:8] in all log lines that reference the recipient (AC-5)
- [x] T4: Create `scraper/tests/test_brevo_client.py` (mirror `test_bgg_client.py` structure — mocked HTTP, no real API key needed at test-run time; see Dev Notes for the import-time-raise testing approach)

---

## Dev Notes

### File placement — resolves a real conflict between epics.md and architecture.md

- **epics.md** (Story 6.4 file list) says: `scraper/brevo_client.py`, `scraper/templates/doi_email.html` (client at the `scraper/` root).
- **architecture.md**'s full directory tree (line ~578-583) lists `scraper/scraper/utils/` containing only `price_parser.py`, `bgg_client.py`, `alert_engine.py`, `db_health.py` — no `brevo_client.py` anywhere, and no `templates/` folder at all.
- **Decision for this story:** put the client at **`scraper/utils/brevo_client.py`** (not `scraper/brevo_client.py`) — matches the existing `bgg_client.py` sibling in the same directory and the "one client module per external API, all under `utils/`" convention already established. The architecture boundary rule "Brevo API | Tylko przez `alert_engine.py` — nigdy bezpośrednio z web/" is about *not calling Brevo from `web/`*, not about forbidding a helper module that `alert_engine.py` (Story 6.5) imports — same relationship `bgg_enrichment.py` already has with `bgg_client.py`.
- `scraper/templates/` does not exist yet — create it as a new top-level folder under `scraper/` (sibling to `utils/`, `tests/`, `scraper/`), since email templates are not Scrapy spider/pipeline code and don't belong under `scraper/scraper/`.
- If a future story or reviewer prefers the literal `scraper/brevo_client.py` path from epics.md, that's a one-file move — flagging the reasoning here so it's a conscious choice either way, not an oversight.

### Reuse `bgg_client.py` conventions, don't reinvent

- `httpx` is already a dependency (`scraper/pyproject.toml`) — use `httpx.post`, not `requests` (not in dependencies) and not stdlib `urllib`.
- `logging.getLogger(__name__)` — **never `print()`** (CLAUDE.md, enforced by a dedicated test in `test_bgg_client.py::test_no_print_calls_used` — mirror that test here).
- Constructor-injectable design like `BggClient(token=...)` is testable but conflicts with AC-4's import-time fail-fast requirement. Resolve by keeping both: module-level constants (`BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`) computed once at import (satisfies AC-4/AC-6), and a plain module-level function `send_doi_email(...)` (not a class) that reads those constants — no client object needed since there's only one operation in this story.

### Testing the import-time `EnvironmentError` (AC-4) — the tricky part

- Once `brevo_client` is imported successfully in one test, Python caches the module — a later test can't re-trigger the import-time raise just by `monkeypatch.delenv`.
- Use `importlib.reload(brevo_client)` after `monkeypatch.delenv("BREVO_API_KEY", raising=False)` (or `setenv` to `""`) to force re-execution of module-level code, then assert `pytest.raises(EnvironmentError)` around the `reload()` call itself. Reload back with a valid env afterward (or accept that subsequent tests in the file re-import via fixture) so later tests in the same file aren't left with a broken module state — use a fixture with `yield` + reload-restore in teardown.
- `scraper/tests/test_db_health.py` shows the project's existing `monkeypatch.setenv(...)` + `patch(".load_dotenv")` pattern for env-dependent modules — follow that style for the *valid*-key test cases; the reload trick above is only needed for the missing-key test case.

### Brevo API v3 request shape (for `send_doi_email`)

```python
POST https://api.brevo.com/v3/smtp/email
headers: {"api-key": BREVO_API_KEY, "Content-Type": "application/json"}
json: {
  "sender": {"email": BREVO_SENDER_EMAIL, "name": BREVO_SENDER_NAME},
  "to": [{"email": to_email}],
  "subject": "Potwierdź powiadomienia o cenie",
  "htmlContent": <rendered doi_email.html>,
}
```
Brevo's auth header is `api-key` (not `Authorization: Bearer`, unlike BGG) — do not copy BGG's header pattern here.

### Template substitution — no new templating dependency

- No Jinja2 or similar is in `scraper/pyproject.toml` — don't add one for three placeholders. Use plain `str.replace()` or `.format()` on the loaded HTML file content. Pick `.replace("{{game_name}}", ...)`-style tokens (Jinja-looking but not Jinja) so the `.html` file stays readable as a static preview in a browser, and so Task 3's `_render()` is a one-liner, not a new dependency.

### CLAUDE.md rules that apply directly

- `logging.getLogger(__name__)` only, never `print()`.
- No naive `datetime.now()` anywhere this module touches timestamps (it doesn't directly — no timestamp fields in this story's scope).
- This module does not touch price parsing or `NUMERIC(10,2)` — `target_price` arrives pre-formatted as a string (`"89.99"`) from the caller (Story 6.1b's `price_alerts.target_price`, already `NUMERIC(10,2)` in the DB) — do not re-parse or re-round it here, just interpolate into the string `f"{target_price} zł"`.

### Previous Story Intelligence (Story 6.1b)

- 6.1b (Dev B, this same track) confirmed and enforced: **no Brevo import or call from any `web/` file** — this story is exactly the piece that fills that intentional gap, on the Python side only.
- 6.1b's `price_alerts.status` sits at `'pending_doi'` with nothing sending the DOI email yet — that gap is *not* closed by this story either (this story only builds the client + template; nothing yet calls `send_doi_email()` for pending rows). Story 6.5 (alert engine) is the first story that will need to decide who calls this for *new* pending-DOI rows vs. price-drop triggers — flag as an open question for whoever picks up 6.5, same as 6.1b flagged it forward.
- 6.1b's `email_hash` is SHA-256 of the *lowercased* email (`SHA-256(email.toLowerCase())`) — if this story's own SHA-256(email)[:8] log-hashing needs to ever compare against `consent_log` values, lowercase first for consistency; not required for this story's scope (logging only, not lookups), but worth matching so hashes look the same across the codebase.

### Git Intelligence Summary

- Recent commits (`ddf0554`, `39630a0`, `70cd93f`) are scraper-infra fixes (timeouts, migrations) — no bearing on this story's implementation, but confirm the scraper side of the monorepo is the active area of recent work, consistent with this being a Dev B (scraper) story.
- Two-commit-per-story pattern continues (`feat:` then `fix: ... code review`) — expect the same review cycle.

---

### Project Structure Notes

- New files: `scraper/utils/brevo_client.py`, `scraper/templates/doi_email.html`, `scraper/tests/test_brevo_client.py` — all new, no existing files modified.
- `scraper/.env.example` — MODIFY (add 2 new vars, do not remove/reorder existing ones).
- Do not touch `web/` at all in this story (AC-1 in Story 6.1b already locked "no Brevo from web/" — this story is Python-only).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.4] — original AC text, file list (lines 1706–1737)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 6 podział] — Dev B track ordering: 6.4 → 6.5 → 6.6 (lines 1579–1593)
- [Source: _bmad-output/planning-artifacts/architecture.md] — directory tree omitting brevo_client.py (lines ~560-602), Brevo boundary rule (line ~613), credentials table (line ~681), Brevo EU-region RODO note (line ~957)
- [Source: scraper/utils/bgg_client.py] — retry/backoff pattern, logging conventions, no-print test pattern
- [Source: scraper/utils/bgg_enrichment.py] — contrasting (function-level, not import-time) env-var pattern
- [Source: scraper/tests/test_bgg_client.py] — test structure/mocking conventions to mirror
- [Source: scraper/tests/test_db_health.py] — `monkeypatch.setenv` + `load_dotenv` patch pattern for env-dependent modules
- [Source: scraper/.env.example] — confirms `BREVO_API_KEY` already documented; `BREVO_SENDER_EMAIL`/`BREVO_SENDER_NAME` are not (gap, AC-6)
- [Source: _bmad-output/implementation-artifacts/6-1b-alert-subscribe-api-db.md] — confirms Brevo-from-web is out of scope, confirms `price_alerts.status='pending_doi'` gap this story doesn't close
- [Source: CLAUDE.md] — logging rule (no print), price handling rule (no re-parsing already-formatted NUMERIC values)

---

## Tests

Framework: pytest (matches `test_bgg_client.py`).

**`test_brevo_client.py` — required cases:**
1. `send_doi_email()` returns `True` on 2xx response
2. `send_doi_email()` returns `False` (does not raise) on a non-2xx, non-429 response (e.g. 400/500), and logs a warning
3. On 429: retries exactly once after a 2s sleep (mock `time.sleep`), returns `True` if the retry succeeds, `False` if it also fails
4. Request payload contains `sender.email`/`sender.name` from `BREVO_SENDER_EMAIL`/`BREVO_SENDER_NAME`, `to=[{"email": to_email}]`, and `htmlContent` containing the rendered game name + price
5. Auth header is `api-key: <BREVO_API_KEY>` (not `Authorization: Bearer`)
6. No raw `to_email` appears in any log record — only an 8-char SHA-256 prefix (mirror `test_no_print_calls_used`'s spy pattern, adapted to inspect log records instead of `print`)
7. Missing `BREVO_API_KEY` (or sender vars) at import → `EnvironmentError` via the `importlib.reload()` technique described in Dev Notes
8. `_render()` / template substitution correctly interpolates `game_name`, `target_price` (as `"{price} zł"`), and `confirmation_url` into the loaded `doi_email.html` content

---

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

None — no failing runs requiring debug capture. Full `scraper/` test suite (`pytest`, 171 tests + 15 new) passes with no regressions. No linter is configured for `scraper/` (no ruff/flake8 in `pyproject.toml`), so no lint step was run — consistent with the rest of the Python codebase.

### Completion Notes List

- `send_doi_email()` implemented as a plain module-level function (not a class) reading module-level constants computed at import — resolves the tension between AC-4's import-time fail-fast requirement and BGG client's constructor-injectable design (documented in Dev Notes).
- Module-level fail-fast: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` each raise `EnvironmentError` at import time if missing/empty (AC-4, AC-6). `.env.example` updated with the two new sender vars.
- Placed at `scraper/utils/brevo_client.py` (not `scraper/brevo_client.py` per epics.md's literal text) — matches the existing `bgg_client.py` sibling convention; reasoning recorded in Dev Notes for future reviewers.
- `doi_email.html` created at new `scraper/templates/` folder with parchment/green palette per AC-3; footer unsubscribe link rendered as a static `#` placeholder since no unsubscribe token exists at the DOI stage yet (Story 6.3 scope) — documented as a conscious decision, not an oversight.
- Single 429 retry after `time.sleep(2)` implemented (AC-2) — deliberately not reusing BGG client's 60/120/240s `_RETRY_DELAYS` schedule.
- Auth uses `api-key` header (Brevo convention), not `Authorization: Bearer` (BGG convention) — verified by a dedicated test.
- No raw email ever logged — only `SHA-256(email)[:8]` via `_hash_email()` helper; verified with `caplog` on both the success and failure logging paths, plus a `print()`-spy test mirroring `test_bgg_client.py`.
- Template substitution uses plain `str.replace()` on `{{key}}` tokens — no new templating dependency added (no Jinja2 in `pyproject.toml`).
- Import-time `EnvironmentError` tested via `importlib.reload()` + `monkeypatch.delenv/setenv`, restoring valid env and reloading in a `finally` block so later tests in the file aren't left with a broken module — per the technique documented in Dev Notes.
- 15 new tests added (`test_brevo_client.py`). Full scraper suite: 171 passed, 4 deselected (pre-existing `live`-marked tests, unrelated to this story), zero regressions.

### File List

- `scraper/.env.example` — MODIFIED (added `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`)
- `scraper/templates/doi_email.html` — CREATED
- `scraper/utils/brevo_client.py` — CREATED
- `scraper/tests/test_brevo_client.py` — CREATED

---

## Change Log

- 2026-07-19: Story 6.4 implemented — `brevo_client.py` (send_doi_email, template render, single 429 retry, import-time fail-fast on missing Brevo env vars), `doi_email.html` template, `.env.example` sender vars, 15 new tests (171 total scraper tests passing, no regressions).
