---
date: 2026-08-24
trigger: Story 6.3 code review (retroactive, discovered during branch-divergence reconciliation)
status: approved
---

# Sprint Change Proposal — 2026-08-24: Extend 6.2 correct-course to Story 6.3 (unsubscribe)

## 1. Issue Summary

`GET /api/alerts/unsubscribe` (`web/src/app/api/alerts/unsubscribe/route.ts`) still mutates
state directly on `GET` — it calls `unsubscribeAlert(token)`, which cancels the alert **and**
writes a `consent_log` row (`action='unsubscribed', source='user'`) as a side effect, with zero
user-confirmation step. This is the exact RFC 7231 / mail-scanner-prefetch vulnerability
(SafeLinks, Proofpoint, antivirus link-preview) that the 2026-07-24 RODO party-mode session
already identified and decided to fix for both Story 6.2 **and** Story 6.3
(`docs/solutions/architecture/rodo-consent-integrity.md`, "ROZSTRZYGNIĘTE: skanery linków",
line 168: *"to samo dotyczy Story 6.3: skaner może wypisać użytkownika z powiadomień"*, and line
189: *"6.3 (unsubscribe) jest jeszcze ważniejszy — wypis aktywowany przez skaner to cichy
sabotaż retencji"*).

**Discovery context:** found 2026-08-24 while reconciling a month-long branch divergence
between local `main` and `origin/main`. Story 6.2's correct-course (commit `28b9048`,
2026-07-26) updated the story spec, `epics.md`, and the RODO doc, but the actual code fix
(Task 6: intermediate confirm page + `POST`) was never implemented — `confirm/route.ts` is
still the pre-correction `GET`-mutates code. Story 6.3 was then built 2026-08-20, a month
later, by a different session that mirrored `confirm/route.ts` **as it existed on disk**
(still unfixed) per its own Dev Notes ("same redirect-only contract as confirm/route.ts...
this story is a close structural sibling, not a fresh design"). `epics.md`'s Story 6.3 section
was never updated by the July correct-course either — only 6.2's was.

**Root cause:** the already-approved design for 6.3 lived only in the RODO doc's prose (lines
189, 203–206, 304–305, 323, 336, and the "Gdzie to uderzy dalej" section) and in a warning
buried in 6.2's own Dev Notes — never in `epics.md`'s Story 6.3 AC section, which is what a
future implementer would actually consult. The decision existed; it just wasn't discoverable
from the artifact someone building 6.3 would read.

**Current status:** Story 6.3 is `done`, merged, and — per this repo's CI (`908ffb0 ci:
auto-apply Drizzle migrations to production DB on push to main`) — the code is live. This is
not a planning gap, it is a live production gap.

**Not affected:** `POST /api/alerts/unsubscribe-all` (bulk opt-out, same story) was already
built correctly — `POST`, `ApiResponse<T>`, requires an explicit click on
`UnsubscribeAllControl` (client component). Only the single-alert `GET` route has the gap.

## 2. Impact Analysis

### Epic Impact

Epic 6 (Email Price Alerts) — no epic-level scope change. This is a defect fix within the epic,
not new capability. Epic 6 stays `in-progress`.

### Story Impact

- **Story 6.2** (`in-progress`) — no new work from this proposal. Its ACs 1–10 and Task 6
  already fully specify the fix; it is simply unimplemented. Recommend implementing Task 6
  in the same `bmad-dev-story` pass as 6.3's fix below, since they share the pattern and (per
  the RODO doc's DRY note) should share a `AlertTokenActionButton` component.
- **Story 6.3** (`done` → **reopen to `in-progress`**) — needs new ACs and a new Task mirroring
  6.2's Task 6, applied to the unsubscribe flow. Zero schema/migration changes (`status='cancelled'`
  and `consent_log.action='unsubscribed'` already exist).

### Artifact Conflicts

| Artifact | Conflict | Action |
|---|---|---|
| `_bmad-output/planning-artifacts/epics.md` | Story 6.3 section (lines 1761–1792) still specifies `GET /api/alerts/unsubscribe?token=` as the state-mutating route | Rewrite to GET-page + POST pattern, mirroring the already-corrected Story 6.2 section (lines 1719–1727 banner + ACs) |
| `_bmad-output/implementation-artifacts/6-3-wylaczanie-powiadomien.md` | Status `done`; ACs describe the old GET-mutates route | Reopen `done` → `in-progress`; add correct-course banner (mirrors 6.2's); add new ACs + Task 7 mirroring 6.2's Task 6 |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | `6-3-wylaczanie-powiadomien: done` | Flip to `in-progress` |
| `AGENTS.md` (route table, line 31) | `GET /api/alerts/unsubscribe?token= ← anuluje (GET bo email link; 302 redirect, nie ApiResponse<T>)` | Replace with the corrected GET-page/POST pair, matching the confirm rows above it |
| `docs/solutions/architecture/rodo-consent-integrity.md` | "Status decyzji" table row for link scanners says "6.3 = greenfield mirror" as a design decision, not yet marked as scheduled/implemented | Add a note that implementation is now scheduled alongside 6.2's Task 6 |

No PRD, Architecture (`architecture.md`), or UX-spec changes needed — the consent_log rules
(L-2 through L-5) are unaffected; only which HTTP verb performs the mutation changes, and that
was already decided in the RODO doc.

## 3. Recommended Approach

**Option 1 — Direct Adjustment.** Extend Story 6.3 with a new correct-course Task, mirroring
6.2's Task 6 exactly (same team already designed and code-reviewed this pattern once). No
rollback needed — `unsubscribe-all` and the rest of Story 6.3's surface are unaffected and stay
as-is.

- Effort: **Low** — the design is not new, it is copy-adapted from an already-approved,
  already-code-reviewed pattern (6.2's Task 6). No new schema, no new consent_log action types,
  no new architecture decision.
- Risk: **Low** — the only behavior change is which HTTP verb mutates state; the underlying
  `unsubscribeAlert()` CTE (atomic, code-reviewed in 6.3's own review round) is untouched.

Option 2 (rollback) and Option 3 (MVP review) are not viable — there is nothing to roll back to
that wouldn't reintroduce the bug, and this does not touch MVP scope.

**Selected: Option 1, implemented as a Direct Adjustment to Story 6.3, executed together with
Story 6.2's already-pending Task 6 in one `bmad-dev-story` pass** (per the RODO doc's own DRY
note: extract a shared `AlertTokenActionButton` once, both stories consume it).

## 4. Detailed Change Proposals

### 4.1 `epics.md` — Story 6.3

**OLD** (lines 1761–1792, summarized): `GET /api/alerts/unsubscribe?token=<uuid>` sets
`status='cancelled'`, writes `consent_log`, redirects — mutating GET.

**NEW:** mirrors Story 6.2's corrected shape —

```
### Story 6.3: Wyłączanie Powiadomień — GET /alerts/unsubscribe (page) + POST /api/alerts/unsubscribe

**Dev: Dev A (Web)**

> **Correct-course 2026-08-24 (extends the 2026-07-24 party-mode RODO decision to 6.3):**
> the unsubscribe link no longer mutates state on GET — the same mail-scanner-prefetch
> risk that motivated 6.2's fix applies here, and per the RODO doc is "jeszcze ważniejszy"
> (silent, invisible retention sabotage). GET now renders a side-effect-free page with a
> muted "Wyłącz powiadomienia" button; the click does a POST.
> Full rationale: docs/solutions/architecture/rodo-consent-integrity.md.

**Given** GET /alerts/unsubscribe?token=<value> (a page, not an API route)
**When** the token resolves to any price_alerts row
**Then** it renders — zero DB writes — the game name and a muted "Wyłącz powiadomienia" button
(no modal, no "are you sure?" — landing here already signals intent), plus a reassurance line
that the user can resubscribe later

**Given** GET /alerts/unsubscribe?token=<value>
**When** the token is missing or not found
**Then** it redirects (zero DB writes) to /alerts/unsubscribed?invalid=1 — unchanged message

**Given** POST /api/alerts/unsubscribe with { token }
**When** unsubscribeAlert(token) returns 'unsubscribed' or 'already_unsubscribed'
**Then** it returns ApiResponse<{ outcome }> — the client navigates to
/alerts/unsubscribed?token=<value> — unchanged consent_log/idempotency semantics

[... AC-5/6 for /alerts/unsubscribed and the unsubscribe-all sub-flow: UNCHANGED, no edits]
```

### 4.2 `6-3-wylaczanie-powiadomien.md`

- `Status: done` → `Status: in-progress`, with a correct-course banner mirroring 6-2's exactly
  (same wording pattern, dated 2026-08-24).
- Original Tasks 1–6 kept as history (unchanged, still accurate for
  `unsubscribeAlert`/`unsubscribeAllAlertsByToken`/`unsubscribe-all` route/`unsubscribed` page).
- **New Task 7 — Correct-course: side-effect-free GET page + POST unsubscribe**, mirroring
  6.2's Task 6 structure:
  1. `getUnsubscribePreviewByToken(token)` in `alerts.ts` (MODIFY) — read-only, no status
     filter (unlike confirm, the unsubscribe token never rotates/expires — no TTL branch
     needed).
  2. `web/src/app/alerts/unsubscribe/page.tsx` (CREATE) — async server component, same
     `searchParams: Promise<{ token?: string }>` shape as `alerts/confirm/page.tsx`.
  3. Shared `web/src/components/AlertTokenActionButton.tsx` (CREATE) — extracted per the RODO
     doc's DRY note, props: `token`, `endpoint`, `successPath`, button label/tone. Both
     `AlertConfirmButton` (6.2 Task 6.3) and this story's unsubscribe button become thin
     wrappers around it. *(If Story 6.2's Task 6 is implemented first in the same pass,
     extract from the already-built `AlertConfirmButton`; if this task lands first, build the
     shared component directly and have 6.2 consume it.)*
  4. `web/src/app/api/alerts/unsubscribe/route.ts` (MODIFY): remove the `GET` handler, add
     `POST` returning `ApiResponse<T>`, calling the existing `unsubscribeAlert()` unchanged.
  5. Test updates mirroring 6.2's Task 6.5–6.8 pattern (route test rewritten GET→POST, new
     page test, new button test, new query-fn test).
  6. Doc sync: `AGENTS.md` route table, `epics.md` Story 6.3 (this proposal, §4.1),
     `rodo-consent-integrity.md` status table row.
  7. Verify: `tsc --noEmit`, `eslint`, `test:run` clean; explicit test asserting `GET
     /alerts/unsubscribe` performs zero DB writes for every input.

### 4.3 `sprint-status.yaml`

```
6-3-wylaczanie-powiadomien: in-progress  # correct-course 2026-08-24 — extends 6.2's POST-confirm decision (RODO party-mode 2026-07-24) to unsubscribe
```

### 4.4 `AGENTS.md`

```
GET  /alerts/unsubscribe?token=     ← strona pośrednia, side-effect-free (renderuje przycisk "Wyłącz powiadomienia")
POST /api/alerts/unsubscribe        ← anuluje, ApiResponse<T> (fetch()-owany z własnej strony, korekta 2026-08-24)
```
(replaces the current single `GET /api/alerts/unsubscribe?token=` row)

### 4.5 `rodo-consent-integrity.md`

Append to the "Status decyzji" table row for link scanners: implementation for 6.3 is now
scheduled (Sprint Change Proposal 2026-08-24), not just decided.

## 5. Implementation Handoff

**Scope classification: Minor.** This is a direct, well-specified extension of an
already-designed, already-code-reviewed pattern — no PRD/architecture/UX rework, no new
technology, no schema change.

**Route to:** Developer agent (`bmad-dev-story`), executing Story 6.2's Task 6 and Story 6.3's
new Task 7 together in one pass (shared `AlertTokenActionButton`, per the RODO doc's DRY note).

**Success criteria:** `GET /alerts/confirm` and `GET /alerts/unsubscribe` both render
side-effect-free pages with zero DB writes under every input (explicit test per each story's
verify task); the corresponding `POST` routes return `ApiResponse<T>` and preserve every
existing idempotency/consent_log-pairing guarantee already established and code-reviewed for
`confirmAlert()`/`unsubscribeAlert()` — those query-layer functions are untouched by this
change.
