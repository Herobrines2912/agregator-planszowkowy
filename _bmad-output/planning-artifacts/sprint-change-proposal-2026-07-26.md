# Sprint Change Proposal — 2026-07-26

**Trigger:** Party-mode decisioning session 2026-07-24 (Winston, Sally, John, Amelia, Mary) — documented in `docs/solutions/architecture/rodo-consent-integrity.md`, section "ROZSTRZYGNIĘTE (party-mode 2026-07-24): skanery linków a wiarygodność zgody".

**Scope classification:** Minor — single story reopened, zero epic/PRD/schema impact, all Dev A (Web).

---

## 1. Issue Summary

Story 6.2 (done, merged in `993c139`... — actually merged earlier, prior to the RODO session) implemented double opt-in confirmation as `GET /api/alerts/confirm?token=` — the request that mutates `price_alerts.status` and writes a `consent_log` row is a plain `GET`.

This was independently flagged by 4 reviewer personas (security, correctness, adversarial, api-contract) in the story's own 2026-07-22 code review, then escalated to a dedicated decision session on 2026-07-24. Root cause: email security scanners (Outlook SafeLinks, Proofpoint, antivirus link-preview) issue a `GET` against every URL in an email **before** a human opens it. Because this endpoint mutates state on `GET`, a scanner can silently activate a price alert — and the resulting `consent_log` row records `source='user'` with the scanner's `ip_hash`, i.e. fabricated legal evidence of consent in a table that is append-only and therefore uncorrectable. This is a semantic-HTTP violation (RFC 7231 — GET must be safe), not an attacker exploit, but it directly undermines the accountability guarantee (RODO art. 7) that `consent_log` exists to provide.

**Decision (2026-07-24):** Option (b) — introduce a side-effect-free intermediate page with an explicit "Potwierdzam" button; the button's click, not the page load, triggers the state change via `POST`. Options (a) accept-risk and (c) user-agent heuristic-as-gate were rejected (the latter is retained only as audit metadata, never as a security boundary).

This is a **correct-course**, not a new story, because it reshapes an already-shipped story's AC/file surface without adding new product capability.

---

## 2. Impact Analysis

### Epic Impact

- **Epic 6 (RODO/Alerts)** — on track, no re-scoping. Only Story 6.2 reopens.
- **Story 6.3 (unsubscribe, backlog)** — unaffected by this correction; it will be built from scratch as a "greenfield mirror" of the pattern this correction establishes (`cancelAlert()` CTE + POST + `ApiResponse<T>`). Not touched here.
- **Story 6.10 (rate limiting, not yet created)** — unaffected, stays sequenced last in the epic per the existing decision.
- **Stories 6.5, 6.8, 6.9** — no immediate impact; `rodo-consent-integrity.md` §"Gdzie to uderzy dalej" already tracks where the paired-write/idempotency pattern recurs.
- No epic reordering beyond what was already decided 2026-07-24.

### Story Impact

Only **Story 6-2** (`_bmad-output/implementation-artifacts/6-2-double-opt-in-confirmation-get-api-alerts-confirm.md`) is reopened: `done` → `in-progress`.

### Artifact Conflicts

| Artifact | Conflict | Action |
|---|---|---|
| PRD | None — no MVP/scope impact. | No change. |
| `architecture.md` | None — L-4 (append-only `consent_log`) invariant untouched; the CTE-based paired write in `confirmAlert()` is preserved verbatim. | No change. |
| `rodo-consent-integrity.md` | Already carries the 2026-07-24 decision. One stale bullet remains under "Pozostałe obserwacje RODO": *"Route'y token-driven nie zwracają `ApiResponse<T>`"* — now only true for the mail-clicked `GET`, not for the page-fetched `POST`. | Add a retraction note (same convention the doc already uses for the `?slug=` oracle reversal). |
| `epics.md` (Story 6.2 section, lines ~1719–1749) | AC text still describes a GET-mutates flow — stale after this correction; a future reader following `epics.md` alone would reintroduce the bug. | Update AC text to match the POST-confirm shape. *(Pre-existing, unrelated drift also present here — AC calls the token a "UUID v4"; it has been 32 random bytes/hex since Story 6.1b. Not part of this correction's scope — flagging only.)* |
| `AGENTS.md` (canonical route table, line 29) | `GET  /api/alerts/confirm?token=     ← double opt-in (GET bo email link; 302 redirect, nie ApiResponse<T>)` — now inaccurate. | Replace with two lines: the new GET page route and the new POST route. |
| Story 6-2 file — Dev Notes §"Why this route does not return `ApiResponse<T>`" | Documents the *old* exception as a durable pattern for "Story 6.3 will be the same kind of exception." That statement is now wrong for 6.2's POST and must not mislead 6.3's future implementer. | Rewrite: GET (page, mail-clicked) stays the redirect/no-`ApiResponse<T>` exception; POST (fetch()-ed from our own page) follows the normal rule. |
| Tests | `route.test.ts` currently tests `GET` → redirect. That behavior moves to a server component page (no route test applies) and a new `POST` handler needs its own `ApiResponse<T>`-shaped tests. | Rewrite, see §4.4. |
| UI/UX | New page needed (`/alerts/confirm`), no existing spec artifact to update (project has no separate UX-spec doc; conventions live inline in components) — visual spec given in §4.1 below. | New component/page only. |

### Technical Impact

One **design gap** in the user-provided correction spec, surfaced during codebase verification and closed below rather than left for the story implementer to invent (that gap-left-to-invent pattern is exactly what caused the original AC ambiguity in 6.2 — see the story's own Dev Notes on the confirm-flow decision table): `getAlertSummaryByToken()` (`web/src/db/queries/alerts.ts:256`) is scoped to `WHERE status = 'active'`. The new pre-confirm page needs to show game name + target price for a `pending_doi` row (not yet active) — the existing function returns `null` for that case and cannot be reused as-is. §4.2 specifies the new read-only query needed. `confirmAlert()` itself is untouched, per the correction's own constraint.

---

## 3. Recommended Approach

**Direct Adjustment (Path 1)** — modify the existing story's AC/tasks in place, implement via the normal dev-story flow. No rollback, no MVP re-review; this is a compliance hardening of an already-correct data model, not a redesign.

- Effort: **Low** — the transactional core (`confirmAlert`'s CTE) is explicitly preserved; this is a thin HTTP-layer split (one GET page + one POST route + one new read query + one client button component) plus test rewrites.
- Risk: **Low** — no schema migration, no change to the append-only invariant, idempotency already exists in the query layer.

---

## 4. Detailed Change Proposals

### 4.1 Story 6-2 — Acceptance Criteria (old → new)

**AC-1 (old):** *GET confirms + redirects (302) to `/alerts/confirmed`.*
**AC-1 (new):**
> **Given** `GET /alerts/confirm?token=<value>` (page, not API route) **When** the token's row exists with `status = 'pending_doi'` (regardless of TTL) or `status = 'active'` **Then** it renders a side-effect-free confirmation page — no DB write, no `consent_log` write — showing the game name, target price (via `formatPrice`), a large primary "Potwierdzam" button (`AlertConfirmButton`, `'use client'`), and a small secondary line "nie zapisywałeś się? zignoruj maila".

**AC-2 (old):** *GET with missing/expired/cancelled token → redirect to `/alerts/expired`.*
**AC-2 (new):**
> **Given** `GET /alerts/confirm?token=<value>` **When** the token is missing, not found, belongs to a `cancelled` alert, or belongs to a `pending_doi` alert whose `token_issued_at` is past the 48h TTL **Then** it redirects (still zero DB writes) to `/alerts/expired`, with `?slug=<gameSlug>` appended only when the token *was* found (cancelled/expired-pending cases) — never for a genuinely unknown token. Identical rule to the current implementation's oracle-acceptance decision (rodo-consent-integrity.md, "the `?slug=` presence oracle is accepted, not a defect") — do not re-derive or relax it.

**AC-3 (new, replaces old AC-1's mutation half + old AC-3's idempotency):**
> **Given** `POST /api/alerts/confirm` with JSON body `{ token: string }` **When** `confirmAlert(token, ipHash)` (unchanged) returns `'confirmed'` or `'already_confirmed'` **Then** it returns `200 { success: true, data: { outcome } }` (`ApiResponse<{ outcome: 'confirmed' | 'already_confirmed' }>`) — writes exactly one `consent_log` row for a fresh `'confirmed'`, zero for `'already_confirmed'` (idempotency preserved verbatim from the existing query layer).

**AC-4 (new):**
> **Given** `POST /api/alerts/confirm` **When** `confirmAlert()` returns `'expired'` (a rare race — token expired or was cancelled in the window between page render and button click) or throws **Then** it returns a non-2xx `ApiResponse<never>` (`{ success: false, error: '...' }`, no DB error text exposed) and `AlertConfirmButton` renders a warm inline error state on the same page (no navigation) — this path does **not** need a `gameSlug`, since the common expired/cancelled case is already intercepted at GET-time by AC-2 before the button ever renders.

**AC-5 (was AC-4, unchanged):** `/alerts/confirmed` page rendering — no code change, already correct.
**AC-6 (was AC-5, unchanged):** `/alerts/confirmed` with missing/invalid token — no code change.
**AC-7 (was AC-6, unchanged):** `/alerts/expired` page — no code change, gains one more caller (the new GET page's redirect).
**AC-8 (was AC-7, unchanged):** confirmation token is consumed, never generated, by this story.
**AC-9 (was AC-8, unchanged):** `consent_log` append-only invariant, now also covering the new query.

**New AC-10 (UX, explicit per correction spec item 6):**
> **Given** `/alerts/confirm` page **When** rendered **Then** the visual tone is warm/inviting but **not** celebratory (no green checkmark — that is reserved for the post-confirm `/alerts/confirmed` state) — same design tokens (`var(--color-primary)`, `var(--font-playfair)`, etc.), large primary CTA, target price shown for trust, small "nie zapisywałeś się? zignoruj maila" as secondary/muted text.

### 4.2 Code Changes

| File | Action | Notes |
|---|---|---|
| `web/src/db/queries/alerts.ts` | MODIFY | Add `getAlertPreviewByToken(token): Promise<{ status: 'pending_doi' \| 'active' \| 'cancelled'; gameName: string; gameSlug: string; targetPrice: string \| null; tokenIssuedAt: Date } \| null>` — same `SELECT … WHERE confirmation_token = token` shape `confirmAlert()` already does, read-only, no new write path. Reuse the exported `CONFIRMATION_TOKEN_TTL_MS` for the page's display-only TTL check so it cannot drift from `confirmAlert`'s enforcement. **`confirmAlert()` itself: zero changes.** |
| `web/src/app/alerts/confirm/page.tsx` | CREATE | Server component (async, `searchParams: Promise<{ token?: string }>`, same pattern as `alerts/confirmed/page.tsx`). Calls `getAlertPreviewByToken`; branches per AC-1/AC-2 above using `redirect()` from `next/navigation` for the dead-link cases (a redirect is not a mutation — GET stays pure). |
| `web/src/components/AlertConfirmButton.tsx` | CREATE | `'use client'`. Props: `{ token: string }`. `onClick` → `fetch('/api/alerts/confirm', { method: 'POST', body: JSON.stringify({ token }) })`, parses `ApiResponse<{outcome}>`, on success `router.push('/alerts/confirmed?token=' + token)`, on failure sets local error state (AC-4). Mirrors the fetch/error-state pattern already used in `AlertSubscribeForm.tsx`. |
| `web/src/app/api/alerts/confirm/route.ts` | MODIFY | Remove `GET` handler entirely (moves to the page). Add `POST` handler: parse JSON body, validate `token` is a non-empty string, derive `ipHash` exactly as the old `GET` did (`x-forwarded-for` → `sha256Hex`, unchanged), call `confirmAlert(token, ipHash)` (unchanged), map outcome to `ApiResponse<T>` per AC-3/AC-4. |
| `web/src/app/api/alerts/confirm/route.test.ts` | MODIFY | Rewrite from `GET(...)` / `Location` header assertions to `POST(...)` / `ApiResponse<T>` body assertions, per AC-3/AC-4. |
| `web/src/app/alerts/confirm/page.test.tsx` | CREATE | RTL, same mocking pattern as `alerts/confirmed/page.test.tsx` (mock `next/link`, `next/navigation` `redirect`, `@/db/queries/alerts`). Cover: pending_doi-valid renders button, active renders button, cancelled/expired/missing/unknown redirect to `/alerts/expired` with correct `?slug=` presence. |
| `web/src/components/AlertConfirmButton.test.tsx` | CREATE | RTL + mocked `fetch`. Cover: success → `router.push` called with correct URL; failure → inline error rendered, no navigation. |
| `web/src/db/queries/alerts.test.ts` | MODIFY | Add coverage for `getAlertPreviewByToken` — found (pending_doi), found (active), found (cancelled), not found. |

### 4.3 Documentation Sync

| File | Change |
|---|---|
| `AGENTS.md:29` | Replace `GET  /api/alerts/confirm?token=     ← double opt-in (GET bo email link; 302 redirect, nie ApiResponse<T>)` with two lines: `GET  /alerts/confirm?token=          ← strona pośrednia, side-effect-free (renderuje przycisk "Potwierdzam")` and `POST /api/alerts/confirm             ← double opt-in, ApiResponse<T> (fetch()-owany z własnej strony)`. |
| Story 6-2 file, Dev Notes §"Why this route does not return `ApiResponse<T>`" | Rewrite: the exception now applies only to the mail-clicked `GET` *page* (which isn't a route at all — nothing to except). The `POST /api/alerts/confirm` route **does** return `ApiResponse<T>`, because it is `fetch()`-ed from our own page. Correct the forward-reference to Story 6.3: 6.3's `POST /api/alerts/unsubscribe` will also return `ApiResponse<T>` for the same reason — it is *not* a redirect-exception. |
| `docs/solutions/architecture/rodo-consent-integrity.md`, §"Pozostałe obserwacje RODO" | Add a retraction to the *"Route'y token-driven nie zwracają `ApiResponse<T>`"* bullet, same convention the doc already uses (strikethrough + dated note): now only true for `GET` routes clicked from an email client; a route `fetch()`-ed from our own page follows the normal `ApiResponse<T>` rule regardless of what triggered the flow it belongs to. |
| `_bmad-output/planning-artifacts/epics.md`, Story 6.2 section (~lines 1719–1749) | Update AC text to describe the POST-confirm shape (mirroring §4.1 above), so a future reader of `epics.md` alone doesn't reconstruct the GET-mutates bug. |

### 4.4 Sprint Status

`_bmad-output/implementation-artifacts/sprint-status.yaml`: `6-2-double-opt-in-confirmation-get-api-alerts-confirm`: `done` → `in-progress` (flip back to `done` once implemented, reviewed, and merged). `last_updated` → date of that flip.

---

## 5. Implementation Handoff

**Scope: Minor.** Route directly to **Developer agent** (`bmad-dev-story` on the updated 6-2 story file) — all Dev A (Web), no Dev B involvement, no PO/PM/Architect re-planning needed.

**Success criteria:**
- `GET /alerts/confirm?token=` performs zero DB writes under any input (verified by test, not just by inspection — this is the exact property that was violated).
- `POST /api/alerts/confirm` reuses `confirmAlert()` unmodified — a diff on `alerts.ts` touching that function's body should be treated as a red flag in code review.
- `npx tsc --noEmit`, `npx eslint`, `npm run test:run` clean, matching the original story's own verification bar.
- `AGENTS.md`, the story file's Dev Notes, and `epics.md`'s Story 6.2 AC text no longer describe a GET-mutates flow anywhere.
