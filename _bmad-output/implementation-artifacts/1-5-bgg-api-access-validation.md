---
story_id: "1.5"
story_key: "1-5-bgg-api-access-validation"
epic: 1
epic_title: "Project Foundation & Infrastructure (Sprint 0)"
status: "in-progress"
dev: "Dev B (Scraper/Infra)"
depends_on: "Story 1.1 (done)"
baseline_commit: a5c46e2aba171ee7c7f43cfaecdf196105680099
---

# Story 1.5: BGG API Access Validation (Spike)

Status: ready-for-dev

## Story

As a **developer**,
I want the BGG non-commercial Bearer Token registered and validated with real API requests,
so that Epic 2 deduplication/enrichment and Epic 4 Game Passport can proceed without the A-6 hard blocker.

## Acceptance Criteria

### AC-1 — BGG application submission documented

**Given** the BGG non-commercial API application
**When** submitted
**Then** `docs/spike-results/bgg-token.md` records: submission date, public GitHub URL submitted, contact email used, non-commercial statement included (yes/no)
**And** the file exists even if token has not yet been received (tracks submission state)

### AC-2 — Bearer Token validated against live BGG API

**Given** Bearer Token received from BGG
**When** a test request is sent to `https://boardgamegeek.com/xmlapi2/thing?id=224517` (Brass Birmingham) with `Authorization: Bearer {BGG_API_TOKEN}` header
**Then** response HTTP status is 200
**And** response XML contains `<name>`, `<minplayers>`, `<maxplayers>`, and `<statistics>` elements without error
**And** the test result is logged via `logging.getLogger(__name__)` — never `print()`

### AC-3 — `scraper/utils/bgg_client.py` skeleton created

**Given** `scraper/utils/bgg_client.py`
**When** reviewed
**Then** it contains a `BggClient` class with:
- `__init__(self, token: str)` — reads `BGG_API_TOKEN` from env or accepts explicit token
- `get_thing(self, bgg_id: int) -> dict | None` — makes a single authenticated GET to `/xmlapi2/thing?id={bgg_id}`, parses XML response, returns dict with keys matching FR-7 fields or `None` on 404
- Rate limiting: enforces ≤ 1 request/second via `time.sleep()` between calls (FR-24)
- Retry stub: raises `BggRateLimitError` on HTTP 429/202 (full backoff logic added in Story 2.4)
- Logger: `logger = logging.getLogger(__name__)` at module level — no `print()` anywhere

**And** `scraper/utils/__init__.py` exists (empty, makes it a package)

**And** `httpx` is the HTTP client used (already in `uv` dependencies from Story 1.1)

### AC-4 — `BGG_API_TOKEN` stored in secrets, not code

**Given** the Bearer Token
**When** stored
**Then** it is present in GitHub Secrets as `BGG_API_TOKEN`
**And** it is listed in `scraper/.env.example` as a placeholder (`BGG_API_TOKEN=your_bgg_token_here`) — never the real value
**And** `scraper/.env` (if created locally for testing) is listed in `.gitignore`
**And** no real token appears anywhere in committed code or docs

### AC-5 — Spike results gate documented in `docs/spike-results/bgg-token.md`

**Given** token validation completed (or blocked)
**When** documented
**Then** `docs/spike-results/bgg-token.md` contains all of:
- Token status: obtained (yes/no)
- Date token received (or "pending — applied YYYY-MM-DD")
- Rate limit behavior observed (e.g. "No 429 seen on single request; throttle rule ≤1 req/s to be enforced in client")
- Explicit gate line: `Epic 2 BGG stories: PROCEED` or `Epic 2 BGG stories: BLOCKED — reason: ...`

---

## Tasks / Subtasks

- [x] Task 1 — Apply for BGG non-commercial Bearer Token (AC-1)
  - [ ] Go to https://boardgamegeek.com/wiki/page/BGG_XML_API2 → locate non-commercial token registration link
  - [ ] Submit application with: public GitHub repo URL, contact email, project description ("Open-source Polish board game price aggregator — non-commercial, hobby project"), non-commercial statement
  - [x] Create `docs/spike-results/bgg-token.md` and record submission date immediately (even before token arrives)

- [x] Task 2 — Create `scraper/utils/` package and `bgg_client.py` skeleton (AC-3)
  - [x] Create `scraper/utils/__init__.py` (empty)
  - [x] Create `scraper/utils/bgg_client.py` with `BggClient` class per AC-3 spec
  - [x] Implement `get_thing()` with `httpx.get()`, `Authorization: Bearer` header, XML parsing via `xml.etree.ElementTree`
  - [x] Add `BggRateLimitError` exception class (raised on 429/202 — full retry in Story 2.4)
  - [x] Enforce 1 req/s rate limit via `time.sleep(1)` between calls
  - [x] Verify: `logger = logging.getLogger(__name__)` at top, zero `print()` calls

- [ ] Task 3 — Validate token against live BGG API (AC-2) ⚠️ REQUIRES HUMAN ACTION — BGG token not yet received
  - [ ] Once token received, set `BGG_API_TOKEN` in local `scraper/.env`
  - [ ] Run a quick test script (`scraper/main.py` or inline) calling `BggClient.get_thing(224517)`
  - [ ] Confirm: HTTP 200, XML contains `<name>`, `<minplayers>`, `<maxplayers>`, `<statistics>`
  - [ ] Log the response snippet via logger (not print)

- [x] Task 4 — Store token in secrets, update .env.example (AC-4)
  - [x] Add `BGG_API_TOKEN=your_bgg_token_here` to `scraper/.env.example` (not the real value) — already present from Story 1.1
  - [ ] Add `BGG_API_TOKEN` to GitHub Secrets via GitHub UI (Settings → Secrets → Actions → New) ⚠️ REQUIRES HUMAN ACTION
  - [x] Confirm `scraper/.env` is in `.gitignore` — confirmed present

- [ ] Task 5 — Complete spike results doc and write gate decision (AC-5) ⚠️ REQUIRES TOKEN FIRST
  - [ ] Fill remaining fields in `docs/spike-results/bgg-token.md` (rate limit observations, gate decision)
  - [ ] Write explicit gate: `Epic 2 BGG stories: PROCEED` if token works, `BLOCKED` with reason if not

---

## Dev Notes

### BGG API — Key Facts

**Base URL:** `https://boardgamegeek.com/xmlapi2/`

**Authentication:** HTTP header — `Authorization: Bearer {BGG_API_TOKEN}`

**Endpoint used in spike:**
```
GET https://boardgamegeek.com/xmlapi2/thing?id=224517&stats=1
```
Use `&stats=1` to include the `<statistics>` element (required by AC-2 and FR-7).

**Response format:** XML (not JSON). Parse with `xml.etree.ElementTree` — already in Python stdlib, no additional dependency needed.

**Known BGG API behavior:**
- HTTP 200: success, XML body contains game data
- HTTP 202: request queued (BGG may return this for first-time or cold requests) — treat as rate-limit/retry in the client
- HTTP 429: rate limited — back off
- HTTP 404: game ID not found (rare for valid IDs)
- BGG does NOT always enforce rate limits aggressively on single requests, but the ≤1 req/s rule is **required** in `bgg_client.py` regardless (FR-24 / architecture ADR)

**Fields to extract** (for Story 2.4 full implementation, but map them now in `get_thing()`):

| BGG XML path | Python key | `games` column |
|---|---|---|
| `//name[@type='primary']/@value` | `name` | `name` |
| `//minplayers/@value` | `min_players` | `min_players` |
| `//maxplayers/@value` | `max_players` | `max_players` |
| `//minplaytime/@value` | `min_playtime` | `min_playtime` |
| `//maxplaytime/@value` | `max_playtime` | `max_playtime` |
| `//minage/@value` | `min_age` | `min_age` |
| `//statistics/ratings/average/@value` | `bgg_avg_rating` | `bgg_avg_rating` |
| `//statistics/ratings/ranks/rank[@type='subtype']/@value` | `bgg_rank` | `bgg_rank` |
| `//link[@type='boardgamemechanic']/@value` (list) | `mechanics` | `mechanics` |
| `//link[@type='boardgamedesigner']/@value` (list) | `designers` | `designers` |
| `//link[@type='boardgamepublisher']/@value` (list) | `publishers` | `publishers` |
| `//yearpublished/@value` | `year_published` | `year_published` |
| `image` text | `cover_image_url` | `cover_image_url` |

**Note:** Missing fields → store as `None`. Never raise on a missing optional field. `name` missing → use `"Nieznana gra"` (architecture error-handling matrix).

### `bgg_client.py` Skeleton Structure

```python
import httpx
import logging
import time
import xml.etree.ElementTree as ET
from typing import Optional

logger = logging.getLogger(__name__)

BGG_API_BASE = "https://boardgamegeek.com/xmlapi2"


class BggRateLimitError(Exception):
    """Raised on HTTP 429 or 202 — caller should retry with backoff."""
    pass


class BggClient:
    def __init__(self, token: str):
        self._token = token
        self._last_request_at: float = 0.0

    def _throttle(self) -> None:
        """Enforce ≤ 1 request/second."""
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < 1.0:
            time.sleep(1.0 - elapsed)
        self._last_request_at = time.monotonic()

    def get_thing(self, bgg_id: int) -> Optional[dict]:
        """
        Fetch BGG game metadata for a single bgg_id.
        Returns dict of FR-7 fields, or None on 404.
        Raises BggRateLimitError on 429/202.
        """
        self._throttle()
        url = f"{BGG_API_BASE}/thing"
        headers = {"Authorization": f"Bearer {self._token}"}
        params = {"id": bgg_id, "stats": 1}

        logger.info("BGG API request: thing?id=%d", bgg_id)
        response = httpx.get(url, headers=headers, params=params, timeout=15)

        if response.status_code == 404:
            logger.warning("BGG ID %d not found (404)", bgg_id)
            return None

        if response.status_code in (429, 202):
            logger.warning("BGG rate limit / queue response %d for ID %d",
                           response.status_code, bgg_id)
            raise BggRateLimitError(f"HTTP {response.status_code}")

        response.raise_for_status()

        return self._parse_thing(response.text, bgg_id)

    def _parse_thing(self, xml_text: str, bgg_id: int) -> dict:
        root = ET.fromstring(xml_text)
        item = root.find("item")
        if item is None:
            logger.error("BGG response for ID %d has no <item>", bgg_id)
            return {"name": "Nieznana gra"}

        def get_attr(xpath: str, attr: str = "value") -> Optional[str]:
            el = item.find(xpath)
            return el.get(attr) if el is not None else None

        def get_list(xpath: str, attr: str = "value") -> list[str]:
            return [el.get(attr) for el in item.findall(xpath) if el.get(attr)]

        name_el = item.find("name[@type='primary']")
        name = name_el.get("value") if name_el is not None else "Nieznana gra"

        return {
            "name": name,
            "min_players": get_attr("minplayers"),
            "max_players": get_attr("maxplayers"),
            "min_playtime": get_attr("minplaytime"),
            "max_playtime": get_attr("maxplaytime"),
            "min_age": get_attr("minage"),
            "year_published": get_attr("yearpublished"),
            "cover_image_url": (item.findtext("image") or "").strip() or None,
            "bgg_rank": get_attr("statistics/ratings/ranks/rank[@type='subtype']"),
            "bgg_avg_rating": get_attr("statistics/ratings/average"),
            "mechanics": get_list("link[@type='boardgamemechanic']"),
            "designers": get_list("link[@type='boardgamedesigner']"),
            "publishers": get_list("link[@type='boardgamepublisher']"),
        }
```

### `docs/spike-results/bgg-token.md` Template

Create the file immediately on applying (even before token received):

```markdown
# Spike: BGG API Access Validation

**Story:** 1.5
**Dev:** Dev B
**Applied:** YYYY-MM-DD

## Application Submission

- Submitted: yes
- Date: YYYY-MM-DD
- GitHub URL submitted: https://github.com/...
- Contact email: wojtekkaminski507@gmail.com
- Non-commercial statement: included

## Token Status

- Received: yes / no / pending
- Date received: YYYY-MM-DD

## Validation Results

- Test endpoint: `GET /xmlapi2/thing?id=224517&stats=1`
- HTTP status: 200
- `<name>` present: yes
- `<minplayers>` present: yes
- `<maxplayers>` present: yes
- `<statistics>` present: yes
- Rate limit observed: [description or "none on single request"]

## Gate Decision

Epic 2 BGG stories: PROCEED / BLOCKED — [reason if blocked]
```

### File Locations (no overlap with Dev A)

All files are in `scraper/` — zero conflict with Dev A's web work:

```
scraper/
  utils/
    __init__.py          ← NEW (empty)
    bgg_client.py        ← NEW
  .env.example           ← UPDATE: add BGG_API_TOKEN placeholder
docs/
  spike-results/
    bgg-token.md         ← NEW (directory already exists)
```

**DO NOT touch:**
- `web/` — Dev A's territory
- `scraper/scraper/items.py` — Story 1.2b (separate story)
- `.github/workflows/` — already done in Story 1.3

### Python Dependencies

`httpx` is already installed via `uv add httpx` in Story 1.1.
`xml.etree.ElementTree` is Python stdlib — no additional install.

No new `uv add` commands needed for this story.

### Logging Standard (CLAUDE.md enforcement)

```python
# ✅ ALWAYS at module level
logger = logging.getLogger(__name__)

# ✅ correct usage
logger.info("BGG API request: thing?id=%d", bgg_id)
logger.warning("BGG ID %d not found (404)", bgg_id)
logger.error("Parse failed for ID %d: %s", bgg_id, exc, exc_info=True)

# ❌ NEVER
print(f"Got response: {response.status_code}")
```

### Security: Token Handling

```python
import os

# Read from env — never hardcode
token = os.environ["BGG_API_TOKEN"]
client = BggClient(token=token)
```

The token must **never** appear in:
- Any committed file
- Logs (don't log the token itself)
- Error messages

### What This Story Does NOT Include

- Full retry logic with exponential backoff → Story 2.4
- 30-day refresh scheduling → Story 2.4
- Enrichment of all games in DB → Story 2.4
- BGG Search API (deduplication) → Story 2.2
- Integration with scraper pipeline → Story 2.2+

The skeleton created here is intentionally minimal — just enough to validate the token and establish the pattern. Story 2.4 builds the production-grade client on top of this.

### Project Structure Reference

```
# Architecture: Frontend Architecture section
# CLAUDE.md: "Logging (Python)" section — never print()
# Architecture: "Authentication & Security" — secrets in env vars only
# Epic 2 Story 2.4 — builds on bgg_client.py created here
```

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Import path fix: `utils.bgg_client` (not `scraper.utils.bgg_client`) — `utils/` is at scraper project root level, not inside the inner `scraper/` package. Added `pythonpath = ["."]` to `[tool.pytest.ini_options]` in `pyproject.toml`.
- `[tool.uv.dev-dependencies]` is invalid TOML for uv — correct format is `[dependency-groups]`.

### Completion Notes List

- **Task 2 (AC-3) COMPLETE:** `scraper/utils/bgg_client.py` created with `BggClient` class — rate limiting (≤1 req/s), `BggRateLimitError` on 429/202, full XML parsing for all FR-7 fields, `logging.getLogger(__name__)` at module level, zero `print()`.
- **Task 1 partial:** `docs/spike-results/bgg-token.md` created with submission instructions. BGG application must be submitted manually by the developer (external website form).
- **Task 4 partial:** `.env.example` already had `BGG_API_TOKEN` placeholder (Story 1.1). `.gitignore` already covers `scraper/.env`. GitHub Secrets requires manual setup via GitHub UI.
- **Tasks 3 & 5 BLOCKED:** Require BGG Bearer Token — external dependency. Once token received, run `BggClient("token").get_thing(224517)` and update `docs/spike-results/bgg-token.md` with gate decision.
- **Tests:** 13/13 pass (`scraper/tests/test_bgg_client.py`) — covers success, 404, 429, 202, auth header, stats param, malformed XML, missing fields, rate limiting, no-print enforcement.

### File List

- `scraper/utils/__init__.py` — NEW (empty, makes utils a Python package)
- `scraper/utils/bgg_client.py` — NEW (BggClient class, BggRateLimitError, XML parsing)
- `scraper/tests/__init__.py` — NEW (empty, makes tests a package)
- `scraper/tests/test_bgg_client.py` — NEW (13 unit tests, all mocked)
- `scraper/pyproject.toml` — MODIFIED (added `[dependency-groups]` with pytest, added `[tool.pytest.ini_options]`)
- `docs/spike-results/bgg-token.md` — NEW (spike results template, pending token)
