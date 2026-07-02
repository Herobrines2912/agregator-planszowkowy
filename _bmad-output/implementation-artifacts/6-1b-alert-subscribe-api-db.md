---
baseline_commit: f4d189f
---

# Story 6.1b: Alert Subscribe API & DB — Backend (Dev B)

Status: review

**Epic:** 6 — Email Price Alerts
**Dev:** Dev B (API/DB)
**Depends on:** Story 4.1 (done ✅), Story 6.1a (done ✅ — frontend contract locked, see below)
**Mock data OK:** No — this is the real implementation the frontend already calls

> **SPLIT STORY:** Story 6.1 is divided. Dev A built the frontend (Story 6.1a — `AlertModal.tsx`, `AlertSubscribeForm.tsx`, already merged in `ba583e4`). Dev B (this story) builds `app/api/alerts/subscribe/route.ts` + `db/queries/alerts.ts`. Zero file conflicts — Dev A's files are off-limits here.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

---

## Story

As a **user**,
I want my price-alert request to be validated, checked against suppression lists, and durably recorded,
so that I get a working "check your inbox" response and the system holds proof of my consent (RODO).

---

## Acceptance Criteria

### AC-1 — Endpoint contract (locked by Story 6.1a, do not change)

- `POST /api/alerts/subscribe` (NOT `/api/alerts` — epics.md text says `/api/alerts`, architecture.md and Story 6.1a both say `/api/alerts/subscribe`; the frontend already calls `/api/alerts/subscribe` and its tests assert that URL — **this is final**)
- Request body (frontend sends exactly this — see `AlertSubscribeForm.tsx`):
  ```typescript
  interface AlertSubscribeRequest {
    email: string
    targetPrice: string      // "89.99" — 2 decimal places, already formatted by frontend
    typeBEnabled: boolean
    consentGiven: true
    ageConfirmed: true
    gameSlug: string
  }
  ```
- Response — `ApiResponse<{ message: string }>` from `@/types/api`:
  ```typescript
  type AlertSubscribeResponse =
    | { success: true; data: { message: string } }
    | { success: false; error: string }
  ```

### AC-2 — Server-side validation (never trust the client, even though frontend already validates)

- Given `email` is not a valid email format
  When POST fires
  Then respond `400 { success: false, error: "Nieprawidłowy adres e-mail" }`, no DB writes
- Given `consentGiven !== true` or `ageConfirmed !== true`
  When POST fires
  Then respond `400` with `error: "Zgoda na przetwarzanie danych jest wymagana"` (consent) or `"Wymagane potwierdzenie wieku (16+)"` (age) — check consent before age (deterministic order, matches frontend's own validation order per 6.1a dev notes)
- Given `targetPrice` is not parseable as a positive number
  When POST fires
  Then respond `400 { success: false, error: "Nieprawidłowa cena progowa" }`, no DB writes
- Given `gameSlug` does not match any row in `games`
  When POST fires
  Then respond `400 { success: false, error: "Nieprawidłowa gra" }`, no DB writes
  — *(not explicit in epics.md AC, but required for the system to work end-to-end: `game_id` is a NOT NULL FK on `price_alerts`)*

### AC-3 — Suppression check (no user enumeration)

- Given `email_suppressions` has a row where `email` equals the submitted email (raw, case-sensitive exact match per architecture L-2 — suppression is joined on raw email, not hash)
  When POST fires
  Then respond `200 { success: true, data: { message: "Sprawdź skrzynkę i potwierdź otrzymywanie powiadomień" } }` — **identical message and status as the success path** — no DB writes, no distinguishing signal

### AC-4 — Upsert into `price_alerts`

- Given no suppression hit and all validation passes
  When POST fires
  Then upsert into `price_alerts` on the `uq_price_alerts_email_game` unique constraint (`email_hash`, `game_id`):
    - INSERT: `game_id`, `email` (raw), `email_hash` (`SHA-256(email.toLowerCase())`), `alert_type = 'price_drop'`, `type_b_enabled`, `target_price`, `status = 'pending_doi'`, `confirmation_token` (`crypto.randomBytes(32).toString('hex')`)
    - CONFLICT (existing alert for this email+game): UPDATE `target_price` and `type_b_enabled` only — **do not** touch `status` or `confirmation_token` of an already-`active` alert (resetting a confirmed subscriber back to `pending_doi` on every threshold tweak would silently stop their notifications and force an unwanted re-confirmation — this diverges from the literal epics.md text "re-sends DOI email", but DOI sending is out of scope for this story per AC-6 below, so there is nothing to re-send yet; flag this as a product decision for whoever picks up the DOI-resend behavior later)
- Given the row insert succeeds
  When it completes
  Then respond `200 { success: true, data: { message: "Sprawdź skrzynkę i potwierdź otrzymywanie powiadomień" } }`

### AC-5 — `consent_log` write (RODO proof, append-only)

- Given a successful upsert (AC-4, not the suppression short-circuit in AC-3)
  When the `price_alerts` write completes
  Then insert exactly one `consent_log` row: `email_hash` (same hash as above), `action = 'opt_in_requested'`, `source = 'user'`, `ip_hash = SHA-256(<client IP>)`, `token_id = <price_alerts.id just written>`
- This row IS the durable proof both the consent and age checkboxes were checked — no separate boolean columns store that fact (CLAUDE.md / architecture L-8)
- **Never** `DELETE` from `consent_log`. Ever. Not even in error-handling/rollback code.

### AC-6 — Brevo sending is explicitly OUT OF SCOPE for this story

- This route does **not** call Brevo, does not send any email, and does not import any Brevo client.
- Architecture is explicit: *"Brevo API | Tylko przez `alert_engine.py` — nigdy bezpośrednio z web/"* (architecture.md L~613) — Brevo may only ever be called from the Python side (`scraper/utils/alert_engine.py`, Story 6.4/6.5), never from a Next.js API route.
- This directly overrides the epics.md Story 6.1 AC text ("...calls Brevo to send the DOI email and awaits the result..."), which predates this architectural decision and this story split. The 6.1a artifact already encodes this: its "Out of scope" table lists "Brevo DOI email sending → Story 6.4 (Dev B)".
- **Net effect:** after this story ships, alerts will sit in `price_alerts.status = 'pending_doi'` with nothing sending the DOI email yet. That gap is intentional and belongs to a later story (6.4 creates the Brevo client; nothing in the current epic list explicitly schedules "send pending DOI emails" as a job — flag this as an open question for the PM/next sprint-planning pass, not something to solve here).

---

## Tasks / Subtasks

- [x] T1: Create `web/src/db/queries/alerts.ts` (AC: #2, #4, #5)
  - [x] Add `sha256Hex(input: string): string` helper (Node `crypto.createHash('sha256')`)
  - [x] Add `subscribeAlert(input: {...}): Promise<SubscribeAlertResult>` — looks up `game_id` by slug, checks `email_suppressions`, upserts `price_alerts`, inserts `consent_log`, all in a single flow (see Dev Notes for transaction guidance)
- [x] T2: Create `web/src/app/api/alerts/subscribe/route.ts` (AC: #1, #2, #3, #6)
  - [x] Parse + validate request body manually (no zod in this repo — see Dev Notes)
  - [x] Call `subscribeAlert()`, map result to `ApiResponse<{ message: string }>`
  - [x] Extract client IP from `x-forwarded-for` header for `ip_hash`
- [x] T3: Create `web/src/db/queries/alerts.test.ts` — unit tests for `subscribeAlert()` and `sha256Hex()` (AC: #2–#5)
- [x] T4: Create `web/src/app/api/alerts/subscribe/route.test.ts` — route-level tests mocking the query layer (AC: #1–#3, #6)

---

## Dev Notes

### File list

| File | Action | Notes |
|------|--------|-------|
| `web/src/db/queries/alerts.ts` | CREATE | All alert-related queries live here per CLAUDE.md ("queries wyłącznie w /web/src/db/queries/*.ts") |
| `web/src/db/queries/alerts.test.ts` | CREATE | Vitest |
| `web/src/app/api/alerts/subscribe/route.ts` | CREATE | Thin — validation + delegate to `alerts.ts` |
| `web/src/app/api/alerts/subscribe/route.test.ts` | CREATE | Vitest |

**Dev A's files — do NOT touch:** `web/src/components/AlertModal.tsx`, `web/src/components/AlertSubscribeForm.tsx`, `web/src/components/AlertSubscribeForm.test.tsx`, `web/src/app/gra/[slug]/page.tsx` (already has the "Ustaw alert" button wired to this endpoint).

### Schema reference (already exists in `web/src/db/schema.ts`, do not modify)

```typescript
priceAlerts:  id, game_id (FK→games), email, email_hash, alert_type ('price_drop'|'availability'),
              type_b_enabled, target_price (numeric 10,2), status ('pending_doi'|'active'|'cancelled'),
              confirmation_token, confirmed_at, created_at
              UNIQUE (email_hash, game_id) — constraint name: uq_price_alerts_email_game

emailSuppressions: id, email (raw, not hashed), reason, is_anonymized, created_at

consentLog:   id, email_hash, action ('opt_in_requested'|'opt_in_confirmed'|'unsubscribed'|
              'suppressed'|'suppression_overridden'|'reactivated'), source ('user'|'brevo_webhook'|'system'),
              ip_hash, token_id, created_at — APPEND-ONLY, never DELETE
```

### Response pattern — match `revalidate/route.ts` exactly

```typescript
// web/src/app/api/revalidate/route.ts is the only existing API route — mirror its shape:
import type { ApiResponse } from '@/types/api'
const body: ApiResponse<{ message: string }> = { success: true, data: { message: '...' } }
return Response.json(body)              // 200 default
return Response.json(body, { status: 400 })  // explicit status for errors
```

### No zod in this repo

`package.json` has no `zod` dependency, and no route in this codebase uses it despite architecture.md mentioning "Zod validation" in passing. Follow existing convention (`revalidate/route.ts`): plain manual validation (regex for email, `Number.isFinite` + `> 0` for price, `typeof x === 'boolean'` / `=== true` for booleans). Do not add a new dependency for this story.

### Query layer pattern — Drizzle query builder, not raw `sql`

Existing read-only queries (`hot-deals.ts`, `game-passport.ts`) use raw `sql\`...\`` for complex joins. This story is a simple upsert + insert — use the Drizzle query builder instead (cleaner, type-checked):

```typescript
import { getDb } from '@/db/index'
import { games, priceAlerts, consentLog, emailSuppressions } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import { randomBytes, createHash } from 'crypto'

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

// Upsert:
const [alert] = await db
  .insert(priceAlerts)
  .values({ game_id, email, email_hash, alert_type: 'price_drop', type_b_enabled, target_price, status: 'pending_doi', confirmation_token })
  .onConflictDoUpdate({
    target: [priceAlerts.email_hash, priceAlerts.game_id],
    set: { target_price, type_b_enabled },
  })
  .returning({ id: priceAlerts.id })
```

Note: `onConflictDoUpdate` requires targeting the named unique constraint's columns — Drizzle resolves this from the column pair matching `uq_price_alerts_email_game`; confirm this compiles against the installed Drizzle version (check `web/package.json` for `drizzle-orm` version before relying on `onConflictDoUpdate` syntax — API has changed across major versions).

### Transaction guardrail

The `price_alerts` upsert and `consent_log` insert must not be allowed to diverge (a `price_alerts` write with no matching `consent_log` row breaks the RODO audit trail — architecture L-4: "Każda operacja na `price_alerts` MUSI mieć odpowiadający zapis w `consent_log`"). Wrap both writes in a single `db.transaction(async (tx) => {...})` if the Drizzle neon-http driver in this project supports it — **verify first**: `@neondatabase/serverless` with `drizzle-orm/neon-http` (used in `db/index.ts`) has limited/no interactive transaction support in some versions (HTTP driver is typically single-statement). If transactions are unavailable, sequence the writes so `consent_log` is written immediately after `price_alerts` succeeds, and log loudly (no `console.log` — none exists yet in `web/`, use `console.error` for the failure path) if the second write fails, rather than silently swallowing the inconsistency.

### IP hashing

```typescript
const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
const ip_hash = sha256Hex(ip)
```
Vercel App Router `NextRequest` has no reliable `.ip` property on all runtimes — use the header, matching architecture's Vercel `fra1` non-Edge routing note (this route must NOT use Edge runtime per architecture §RODO region pinning — do not add `export const runtime = 'edge'`).

### Token generation

`crypto.randomBytes(32).toString('hex')` per architecture.md line 193 (Node convention for opt-in tokens; Python side uses `secrets.token_urlsafe(32)` — do not mix). No expiry column exists on `price_alerts`; 48h expiry is computed from `created_at` at confirm-time — that's Story 6.2's concern, not this one.

### Rate limiting — not in scope

Architecture mentions "Alert endpoints — rate limiting przez Vercel Edge Middleware" but no `web/src/middleware.ts` exists yet in this repo. Do not add middleware in this story — it's a cross-cutting concern for a separate story if/when it gets picked up.

### CLAUDE.md rules that apply directly

- `target_price` → `NUMERIC(10,2)` already enforced by schema; pass the string straight through to Drizzle (don't round-trip through `parseFloat`/`toFixed` — the frontend already sends `"89.99"`)
- Queries **only** in `web/src/db/queries/*.ts` — the route file must not contain inline Drizzle/SQL calls
- `consent_log` is append-only — no DELETE, no UPDATE, ever
- Every `switch` on a `.$type<>()` field needs `default: assertNever(x)` from `@/lib/utils` — applies if you switch on `alert_type` or `action` anywhere

---

## Previous Story Intelligence (Story 6.1a)

- Frontend is **done and merged** (`ba583e4`, 155 tests passing) — its `AlertSubscribeForm.test.tsx` mocks `fetch` against `/api/alerts/subscribe`, so this story's contract is fixed by those tests, not just by this document
- 6.1a resolved the `AlertForm` vs `AlertSubscribeForm` and `/api/alerts` vs `/api/alerts/subscribe` naming conflicts already — both are settled, carried forward here
- 6.1a's frontend treats any `{ success: false, error }` response as a recoverable inline error (form stays open, button re-enables) — error strings from this route surface directly to the user, so keep them the exact Polish strings specified in AC-2

## Git Intelligence Summary

- Recent commits (`edf230b`, `500c804`) show a two-commit-per-story pattern: `feat:` for initial implementation, `fix: Story X code review` for the follow-up after review — expect the same review cycle here
- `500c804` (Story 4.5 code review) shows the project takes "nullable price" and error-boundary correctness seriously in review — expect similar scrutiny on the validation edge cases in AC-2/AC-4
- No prior story in this repo has written an INSERT/UPSERT query file — this is the first one; the pattern above is inferred from schema + `revalidate/route.ts`, not copied from precedent

---

### Project Structure Notes

- Matches existing `web/src/app/api/<name>/route.ts` structure (only precedent: `revalidate/route.ts`)
- New subfolder `app/api/alerts/subscribe/` — first nested API route in the project; `app/api/alerts/confirm/[token]` and `app/api/alerts/unsubscribe/[token]` will follow in Stories 6.2/6.3 as sibling folders, not created here

### References

- [Source: _bmad-output/implementation-artifacts/6-1a-alert-subscribe-form-frontend.md] — frontend contract, out-of-scope table, endpoint decision
- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.1] — original AC text (lines 1597–1639)
- [Source: _bmad-output/planning-artifacts/architecture.md#L-2] — suppression override semantics (line ~751)
- [Source: _bmad-output/planning-artifacts/architecture.md#L-4] — consent_log rules (line ~802)
- [Source: _bmad-output/planning-artifacts/architecture.md] — "Brevo API tylko przez alert_engine.py" (line ~613), API routes list (line ~198), token generation convention (line ~193)
- [Source: web/src/db/schema.ts] — priceAlerts, emailSuppressions, consentLog table definitions (lines 116–178)
- [Source: web/src/app/api/revalidate/route.ts] — only existing API route, response pattern precedent
- [Source: CLAUDE.md] — query location rule, consent_log append-only rule, NUMERIC(10,2) rule

---

## Tests

Framework: Vitest (matches `game-passport.test.ts`, `scrape-runs.test.ts`).

**`alerts.test.ts` — required cases:**
1. `sha256Hex()` produces a stable, correct SHA-256 hex digest
2. New alert (no existing row) → inserts `price_alerts` with `status='pending_doi'` and one `consent_log` row with `action='opt_in_requested'`
3. Existing alert for same `(email_hash, game_id)` → updates `target_price`/`type_b_enabled`, does not create a duplicate row, does not reset `status` if already `active`
4. `email_suppressions` hit → returns suppressed result, zero writes to `price_alerts` or `consent_log`
5. Unknown `gameSlug` → throws/returns an identifiable error (no game_id to write)

**`route.test.ts` — required cases:**
1. Invalid email → `400`, error `"Nieprawidłowy adres e-mail"`
2. `consentGiven` missing/false → `400`, error `"Zgoda na przetwarzanie danych jest wymagana"`
3. `ageConfirmed` missing/false → `400`, error `"Wymagane potwierdzenie wieku (16+)"`
4. Invalid/non-positive `targetPrice` → `400`, error `"Nieprawidłowa cena progowa"`
5. Unknown `gameSlug` → `400`, error `"Nieprawidłowa gra"`
6. Valid request → `200 { success: true, data: { message: "Sprawdź skrzynkę i potwierdź otrzymywanie powiadomień" } }`
7. Suppressed email → same `200` + same message as case 6 (no distinguishing behavior)

---

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

None — no failing runs requiring debug capture. `npx tsc --noEmit` and `npx eslint` clean on all new files; pre-existing `PriceChart.tsx` lint errors confirmed present on baseline (`git stash` check) and unrelated to this story.

### Completion Notes List

- `subscribeAlert()` implemented with Drizzle query builder (not raw `sql`, per Dev Notes) — game lookup → suppression check → upsert `price_alerts` → insert `consent_log`, in that order, matching AC-2 through AC-5.
- `onConflictDoUpdate` targets `(priceAlerts.email_hash, priceAlerts.game_id)` and its `set` clause is limited to `target_price`/`type_b_enabled` only — verified by test asserting the exact key set, so an existing `active` alert's `status`/`confirmation_token` are never touched on a threshold update (AC-4 decision).
- No transaction wraps the `price_alerts` upsert + `consent_log` insert (per Dev Notes: `drizzle-orm/neon-http` does not support interactive transactions). Sequenced instead; a `consent_log` failure is logged via `console.error` and rethrown rather than swallowed.
- Route performs full server-side validation independent of the frontend (email regex, consent/age booleans, positive numeric price, known `gameSlug`) — order matches 6.1a's client-side order (email → consent → age) per Dev Notes.
- Confirmed AC-6: no Brevo import or call anywhere in this story's files. `price_alerts.status` stays `'pending_doi'` after this route runs; DOI email sending remains unimplemented pending Story 6.4+ (documented gap, not a defect of this story).
- Suppression hit and successful subscribe both return the identical `200` response — verified by dedicated tests — no enumeration signal.
- 12 new tests added (`alerts.test.ts`: 5 — `sha256Hex` + 4 `subscribeAlert` cases; `route.test.ts`: 7 validation/response cases). Full suite: 191 tests passing, zero regressions.

### File List

- `web/src/db/queries/alerts.ts` — CREATED
- `web/src/db/queries/alerts.test.ts` — CREATED
- `web/src/app/api/alerts/subscribe/route.ts` — CREATED
- `web/src/app/api/alerts/subscribe/route.test.ts` — CREATED

---

## Change Log

- 2026-07-02: Story 6.1b implemented — `alerts.ts` query layer (subscribeAlert, sha256Hex), `POST /api/alerts/subscribe` route, 12 new tests (191 total passing, no regressions). Brevo sending confirmed out of scope per architecture L-constraint.
