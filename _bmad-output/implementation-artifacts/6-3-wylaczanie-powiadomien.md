---
baseline_commit: 0d6458e
---

# Story 6.3: Wyłączanie Powiadomień — GET /alerts/unsubscribe (page) + POST /api/alerts/unsubscribe

Status: review

> **Correct-course (2026-08-24):** extends the 2026-07-24 party-mode RODO decision (Story 6.2)
> to this story. The original implementation unsubscribed on a plain `GET`, which email
> security scanners (SafeLinks, Proofpoint, etc.) request automatically before a human ever
> clicks — silently cancelling alerts and writing a `consent_log` row (`source='user'`) for
> an action the user never took. Per the RODO doc this is "jeszcze ważniejszy" than the confirm
> case — a scanner-triggered unsubscribe is silent, invisible retention sabotage (no error, no
> visible symptom, the user just stops getting emails they wanted). The design for this fix was
> already decided at the 2026-07-24 session (`docs/solutions/architecture/rodo-consent-integrity.md`,
> "ROZSTRZYGNIĘTE: skanery linków", "6.3 = greenfield mirror") but was never carried into this
> story's own ACs or into `epics.md`'s Story 6.3 section — it was only discovered live, in
> production, on 2026-08-24. Full rationale: `docs/solutions/architecture/rodo-consent-integrity.md`
> and `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-24.md`.
> Status reopened `done` → `in-progress`; Tasks 1–6 below are the **original** implementation
> (kept for history, still valid — see notes inline), Task 7 is the correction.

**Epic:** 6 — Email Price Alerts
**Dev:** Dev A (Web) per epics.md — _pliki: `app/api/alerts/unsubscribe/route.ts`, `app/alerts/unsubscribe/page.tsx` (new), `app/alerts/unsubscribed/page.tsx`, `components/AlertTokenActionButton.tsx` (new, shared with Story 6.2)_, plus shared files this story must also touch: `web/src/db/schema.ts`, `db/migrations/0007_*.sql`, `web/src/db/queries/alerts.ts`, `app/api/alerts/unsubscribe-all/route.ts`
**Depends on:** Story 6.1 (done) — `subscribeAlert()` in `alerts.ts`, `price_alerts`/`consent_log`/`email_suppressions` schema. Story 6.2 (in-progress) — `confirmAlert()`/`AlertConfirmButton` and the side-effect-free-GET-page + POST pattern this story's Task 7 mirrors exactly (implement together in the same pass; extract the shared `AlertTokenActionButton` from whichever story's button is built first).

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Prerequisite — Read Before Starting

Story 6.6 (Email o Spadku Ceny, done) shipped the price-drop email with a **placeholder** unsubscribe link (`{{game_url}}`, not a real one-click unsubscribe) and explicitly deferred the real link to this story — see `6-6-email-o-spadku-ceny.md` Dev Notes: *"Leave a note for Story 6.3: both `doi_email.html` and `price_drop_email.html` need their footer unsubscribe link swapped from `game_url` to a real `{{unsubscribe_url}}` once the token infrastructure exists."*

This story builds that infrastructure (the `unsubscribe_token` column, its generation, and the `/api/alerts/unsubscribe` endpoint) but **does not** swap the email templates' placeholder link. Template wiring touches `scraper/templates/*.html` and `scraper/utils/brevo_client.py` — Dev B (Scraper/Infra) files, not this story's Dev A (Web) files per epics.md's file-collision-free split. Swapping the link is a small, mechanical follow-up once this story's token exists; leave a Dev Notes flag (already below) for whoever picks it up next, same pattern 6.6 used for this story.

**Do not touch `scraper/` at all in this story.**

## Story

As a **user**,
I want a one-click link in every alert email to turn off notifications,
so that I can stop receiving them at any time without needing to log in.

## Acceptance Criteria

> AC 1–4 are the correct-course replacement for the original AC-1/AC-2/AC-3 (below, in that
> order): a mail-clicked `GET` may never mutate state — same reasoning as Story 6.2. AC 5–11 are
> the original AC-4..10, renumbered, unchanged in substance. AC 12 is new (UX tone), mirroring
> Story 6.2's AC-10.

1. **Given** `GET /alerts/unsubscribe?token=<value>` (a **page**, not an API route) **When** the token resolves to any `price_alerts` row (any status) **Then** it renders a side-effect-free page — **zero DB writes, zero `consent_log` writes** — showing the game name and a muted "Wyłącz powiadomienia" button (`AlertTokenActionButton`, `'use client'`), plus a small reassurance line that the user can resubscribe later. No modal, no "na pewno?" dialog — landing here having clicked the email link already signals intent.
2. **Given** `GET /alerts/unsubscribe?token=<value>` **When** the token is missing or not found **Then** it redirects (zero DB writes) to `/alerts/unsubscribed?invalid=1` — same message as before: "Ten link wygasł — jeśli chcesz wyłączyć powiadomienia, skontaktuj się z nami".
3. **Given** `POST /api/alerts/unsubscribe` with JSON body `{ token: string }` **When** `unsubscribeAlert(token)` (unchanged) returns `'unsubscribed'` or `'already_unsubscribed'` **Then** it returns `200 { success: true, data: { outcome } }` (`ApiResponse<{ outcome: 'unsubscribed' | 'already_unsubscribed' }>`) — writes exactly one `consent_log` row for a fresh `'unsubscribed'`, zero for `'already_unsubscribed'` (idempotency preserved verbatim from the existing query layer — this is the original AC-1's mutation half + AC-2's idempotency, now behind `POST`).
4. **Given** `POST /api/alerts/unsubscribe` **When** `unsubscribeAlert()` returns `'not_found'` (a rare race — token deleted between page render and button click, or throws) **Then** it returns a non-2xx `ApiResponse<never>` and the button's client component renders a warm inline error (no navigation) — the common not-found case is already intercepted at GET-time by AC-2.
5. **Given** `/alerts/unsubscribed` page with a valid `?token=`, **When** rendered, **Then** it shows "Wyłączono powiadomienia. Nie będziesz już otrzymywał powiadomień dla tej gry." and a secondary "Wyłącz wszystkie powiadomienia" control (inline expand + confirm, not a modal — matches the epics AC's explicit "no modal" instruction). **Unchanged — no code change required.**
6. **Given** the user clicks "Wyłącz wszystkie powiadomienia" and confirms, **When** `POST /api/alerts/unsubscribe-all` fires with `{ token }` (the same unsubscribe token already on the page — never a client-supplied raw email, so the request can't be used to suppress an address the caller doesn't hold a token for), **Then** it: resolves the email from the token's alert row, sets **every** `price_alerts` row for that (normalized, lowercased) email to `status = 'cancelled'`, inserts one `email_suppressions` row (`email` = raw normalized email — not hashed, per architecture L-2/L-3's exact-match join requirement; `reason = 'global_optout'`), and writes one `consent_log` row (`action = 'suppressed'`, `email_hash`, `source = 'user'`). Returns `ApiResponse<{ message: string }>`. **Unchanged — already `POST`-based, already correct.**
7. **Given** an email already in `email_suppressions` with `reason = 'global_optout'` or `'user_request'`, **When** `POST /api/alerts/unsubscribe-all` fires again for that email, **Then** it is idempotent — no duplicate `email_suppressions` row, no duplicate `consent_log` entry, still returns success. (Permanent reasons `hard_bounce`/`complaint` are Story 6.8's concern — this story never writes or overrides those.) **Unchanged.**
8. **Given** a future `POST /api/alerts/subscribe` call for a globally-suppressed email, **When** it fires, **Then** it already returns the generic 200 without inserting (existing `email_suppressions` check in `subscribeAlert()`, Story 6.1). **Unchanged.**
9. **Given** `price_alerts.unsubscribe_token`, **When** an alert is first created via `subscribeAlert()`, **Then** a token is generated once and **never rotated** — unlike `confirmation_token` (which rotates on a stale re-subscribe), the unsubscribe token must keep working for the lifetime of every email already sent, including ones sitting unread in an inbox for months. A re-subscribe (`onConflictDoUpdate`) must not touch this column. **Unchanged.**
10. **Given** existing `price_alerts` rows created before this migration, **When** the migration runs, **Then** every row is backfilled with a generated token (never left NULL) — an already-active alert must not lose its ability to unsubscribe. **Unchanged.**
11. **Given** RODO data retention, **When** `consent_log` is reviewed, **Then** every unsubscribe event is present with `action = 'unsubscribed'` (per-alert) or `action = 'suppressed'` (global opt-out) — append-only, no deletes — now also covering `getUnsubscribePreviewByToken` (read-only) and the `POST` route. **Substance unchanged, scope widened.**
12. **Given** `/alerts/unsubscribe` page **When** rendered **Then** the tone is matter-of-fact and muted — **not** festive, **not** apologetic, no sad-face copy, no "are you sure?" modal (the landing itself is the confirmation of intent) — with a short, honest reassurance that the user can subscribe again later. Same design tokens as the rest of `/alerts/*` (`var(--color-text-primary)`, `var(--font-playfair)`, etc.), but the visual weight of the button is secondary/neutral, not primary/celebratory like `AlertConfirmButton`.

## Tasks / Subtasks

- [x] **Task 1 — `unsubscribe_token` column + migration** (AC: 8, 9) — `web/src/db/schema.ts` (MODIFY), `db/migrations/0007_price_alerts_unsubscribe_token.sql` (NEW)
  - [x] 1.1 Added `unsubscribe_token: text('unsubscribe_token').notNull()` to `priceAlerts` with a unique constraint (`uq_price_alerts_unsubscribe_token`).
  - [x] 1.2 Migration follows the three-step pattern: add nullable column → backfill via `gen_random_uuid()` (built into Postgres core, no pgcrypto extension needed, unlike `gen_random_bytes`) → `SET NOT NULL` → unique constraint added last.
  - [x] 1.3 Confirmed `scraper/scraper/items.py` only models `ScrapedProduct`/`PriceRecord` — no `price_alerts` sync needed.

- [x] **Task 2 — Generate token on subscribe; add unsubscribe query functions** (AC: 1, 2, 5, 6, 8) — `web/src/db/queries/alerts.ts` (MODIFY)
  - [x] 2.1 `unsubscribe_token: randomBytes(32).toString('hex')` added to the insert values.
  - [x] 2.2 Deliberately omitted from `onConflictDoUpdate`'s `set` — comment explains why (never rotates).
  - [x] 2.3 `unsubscribeAlert(token)` added — not-found / already-cancelled (idempotent) / fresh-cancel via atomic CTE, mirroring `confirmAlert()`.
  - [x] 2.4 `unsubscribeAllAlertsByToken(token)` added — not-found / permanent-suppression-preserved / idempotent-replay / fresh-suppress paths.

- [x] **Task 3 — `GET /api/alerts/unsubscribe` route** (AC: 1, 2, 3) — `web/src/app/api/alerts/unsubscribe/route.ts` (NEW)
  - [x] 3.1–3.4 Redirect-only route mirroring `confirm/route.ts`; missing/invalid/not-found/error all dead-end at `/alerts/unsubscribed?invalid=1`; success redirects with `?token=`.

- [x] **Task 4 — `POST /api/alerts/unsubscribe-all` route** (AC: 5, 6) — `web/src/app/api/alerts/unsubscribe-all/route.ts` (NEW)
  - [x] 4.1–4.3 `ApiResponse<T>` JSON route mirroring `subscribe/route.ts`; 400 on bad/not-found token, 200 on success (incl. idempotent replay), 500 on unexpected error.

- [x] **Task 5 — `/alerts/unsubscribed` page** (AC: 4) — `web/src/app/alerts/unsubscribed/page.tsx` (NEW)
  - [x] 5.1–5.3 Server component + new `UnsubscribeAllControl` client component (collapsed → inline-expand confirm → done, no modal).
  - [x] 5.4 `page.test.tsx` + `UnsubscribeAllControl.test.tsx` added.

- [x] **Task 6 — Tests** (AC: all) — new/modified test files alongside each Task 2–5 file
  - [x] 6.1–6.3 All specified cases covered; 348/348 web tests pass (30 files), including 12 new tests in `alerts.test.ts`, 14 in the two route test files, 10 across the page/component tests.
  - [x] 6.4 No migration-testing convention exists anywhere in the repo (`db/migrations/`) — confirmed via search, correctly skipped per the task's own instruction rather than inventing a new pattern.

- [x] **Task 7 — Correct-course: side-effect-free GET page + POST unsubscribe** (AC: 1, 2, 3, 4, 12) — see Dev Notes → "Correct-course decision table" before starting
  - [x] 7.1 `web/src/db/queries/alerts.ts` (MODIFY): add `getUnsubscribePreviewByToken(token: string): Promise<{ status: 'pending_doi' | 'active' | 'cancelled'; gameName: string; gameSlug: string } | null>` — read-only `SELECT … WHERE unsubscribe_token = token`, join `price_alerts` → `games`, **no status filter and no TTL check** (unlike `getAlertPreviewByToken`, `unsubscribe_token` never rotates/expires per AC-9 — there is no expired branch to compute). `unsubscribeAlert()` itself: zero changes.
  - [x] 7.2 `web/src/app/alerts/unsubscribe/page.tsx` (CREATE): async server component, `searchParams: Promise<{ token?: string }>` (same pattern as `alerts/confirm/page.tsx` from Story 6.2). Missing token → `redirect('/alerts/unsubscribed?invalid=1')`. Calls `getUnsubscribePreviewByToken`; not found → same redirect. Found (any status) → render game name + `AlertTokenActionButton` per AC-1/AC-12. A `redirect()` call is not a mutation — GET stays pure.
  - [x] 7.3 `web/src/components/AlertTokenActionButton.tsx` (CREATE or EXTRACT, `'use client'`): shared component per the RODO doc's DRY note. Props: `{ token: string; endpoint: string; successPath: string; label: string; tone: 'primary' | 'muted' }`. On click: `fetch(endpoint, { method: 'POST', body: JSON.stringify({ token }) })`, parse `ApiResponse<{ outcome }>`; success → `router.push(successPath + '?token=' + token)`; failure → local inline error state. **If Story 6.2's Task 6 lands first in the same dev pass, extract this from the already-built `AlertConfirmButton` and have both stories' buttons consume it (re-verify 6.2's own tests still pass after the extraction). If this task lands first, build it directly here and flag 6.2's Task 6.3 to consume it instead of building its own.**
  - [x] 7.4 `web/src/app/api/alerts/unsubscribe/route.ts` (MODIFY): **remove the `GET` handler entirely** (moves to the page). Add `POST`: parse JSON body, validate `token` is a non-empty string (400 `ApiResponse<never>` if not), call `unsubscribeAlert(token)` (unchanged), map outcome to `ApiResponse<T>` per AC-3/AC-4.
  - [x] 7.5 `web/src/app/api/alerts/unsubscribe/route.test.ts` (MODIFY): rewrite from `GET(...)`/`Location`-header assertions to `POST(...)`/`ApiResponse<T>` body assertions.
  - [x] 7.6 `web/src/app/alerts/unsubscribe/page.test.tsx` (CREATE): RTL, mock `next/navigation` `redirect`, `next/link`, `@/db/queries/alerts`. Cover: any found status renders the button; missing/unknown token redirects to `/alerts/unsubscribed?invalid=1`.
  - [x] 7.7 `AlertTokenActionButton.test.tsx` (CREATE, or extend if extracted from `AlertConfirmButton.test.tsx`): RTL + mocked `fetch`. Cover both `tone` variants if the extraction changes rendering, success → `router.push`, failure → inline error, no navigation.
  - [x] 7.8 `web/src/db/queries/alerts.test.ts` (MODIFY): add coverage for `getUnsubscribePreviewByToken` — found (`active`), found (`pending_doi`), found (`cancelled`), not found.
  - [x] 7.9 Doc sync: `AGENTS.md` route table, `_bmad-output/planning-artifacts/epics.md` Story 6.3 AC text, `docs/solutions/architecture/rodo-consent-integrity.md` "Status decyzji" table row (mark 6.3 implemented, not just decided).
  - [x] 7.10 verify — `npx tsc --noEmit`, `npx eslint`, `npm run test:run` clean; add an explicit test asserting `GET /alerts/unsubscribe` performs **zero** DB writes under every input (the exact property that was violated).

## Dev Notes

### What NOT to touch

- `scraper/` — nothing in this story touches Python, `alert_engine.py`, or the email templates. See Prerequisite section above.
- `confirmation_token` / `token_issued_at` / the DOI confirm flow (Story 6.2) — untouched; `unsubscribe_token` is a new, separate column with different lifecycle semantics (never rotates, never expires).
- `hard_bounce`/`complaint` suppression rows — permanent, never overridden by this story's global-opt-out path (architecture L-2). Story 6.8 owns writing those.
- Do not hash `email_suppressions.email` — architecture L-2/L-3 require the raw (lowercase-normalized) address for the exact-match join against `price_alerts.email` in `alert_engine.py`. Only `consent_log.email_hash` is hashed.

### Reference implementation: mirror `confirmAlert()` / `confirm/route.ts` almost exactly

Story 6.2's `confirmAlert()` (`web/src/db/queries/alerts.ts`) and `app/api/alerts/confirm/route.ts` already establish every pattern this story needs: the atomic single-CTE-statement UPDATE+INSERT (required because the neon-http driver has no `db.transaction()`) and the idempotent-replay-returns-success (not error) semantics, and the `assertNever`-guarded switch on outcome. Read both files fully before writing any code — this story is a close structural sibling, not a fresh design.

> **Superseded by the 2026-08-24 correct-course below:** the line that used to be here — "the
> redirect-only GET route (not `ApiResponse<T>` — documented exception, same rationale applies
> here)" — described the *original* implementation of `confirm/route.ts`, which is itself being
> corrected by Story 6.2's Task 6 in the same dev pass. Do **not** build a new redirect-only GET
> route for unsubscribe; mirror `confirm/route.ts`'s **corrected** (page + POST) shape instead.
> See "Correct-course decision table" immediately below.

### Correct-course decision table (2026-08-24) — GET page vs. POST, and why

Same reasoning as Story 6.2 (party-mode 2026-07-24, `docs/solutions/architecture/rodo-consent-integrity.md`, "ROZSTRZYGNIĘTE: skanery linków"): a plain `GET` mutating state lets email security scanners (Outlook SafeLinks, Proofpoint, antivirus link-preview) silently unsubscribe a user before a human clicks — RFC 7231 requires GET to be *safe*, and the resulting `consent_log` row would carry the scanner's context as if it were the user's, falsely tagged `source='user'`. Per the RODO doc this case is **more consequential** than confirm's: it is a *silent* failure with no visible symptom — the user simply stops receiving emails they wanted, with no error for anyone to notice.

Unlike Story 6.2's `confirmAlert()`, `unsubscribeAlert()` has **no TTL to evaluate** — `unsubscribe_token` never rotates or expires (AC-9), so `getUnsubscribePreviewByToken` has no expired branch:

| `getUnsubscribePreviewByToken` result | `GET /alerts/unsubscribe` renders | `POST /api/alerts/unsubscribe` (on click) |
|---|---|---|
| Not found | `redirect('/alerts/unsubscribed?invalid=1')` | never reached |
| Found (`status` = `pending_doi`, `active`, or `cancelled` — any status) | Game name + `AlertTokenActionButton` (idempotent replay is fine even if already `cancelled` — button still works, returns `already_unsubscribed`) | `unsubscribeAlert()` → `'unsubscribed'` (fresh) or `'already_unsubscribed'` |
| (rare race: found at GET, deleted by click time — not a real scenario today, no delete path exists, but the branch must not crash) | — | `unsubscribeAlert()` → `'not_found'` → `ApiResponse<never>`, inline error, no redirect (AC-4) |

`unsubscribe-all` (AC-6/AC-7) is untouched by this correct-course — it was already `POST`-based, already returns `ApiResponse<T>`, and already requires an explicit click on `UnsubscribeAllControl`. Only the single-alert path had the gap.

### Token generation and lifecycle (why it differs from `confirmation_token`)

`confirmation_token` rotates on a stale re-subscribe because a live one must eventually expire (48h DOI window) and a dead one must not block a genuine re-subscribe. `unsubscribe_token` has the opposite requirement: it must keep working indefinitely, because every email ever sent to a still-subscribed user embeds it, and there is no way to know which old emails a user might click "unsubscribe" from months later. Never add a TTL or rotation to this column — doing so would silently break unsubscribe links sitting in old, still-unread emails, which is the one failure mode AC-3's "must never silently fail" is most directly guarding against.

### `email_suppressions` — raw, lowercase-normalized email (not hashed)

Per architecture L-2/L-3: `email_suppressions.email` must be the raw, lowercase-normalized address, because `alert_engine.py`'s suppression join (`pa.email = es.email`) requires an exact string match against `price_alerts.email`, which is normalized the same way in `subscribeAlert()`. `consent_log.email_hash` is the only hashed field. Reuse `input.email.toLowerCase()`-style normalization consistently — do not introduce a second normalization convention.

### Suppression override semantics (architecture L-2) — relevant only as a boundary, not implemented here

`user_request`/`global_optout` suppressions are overridable by a conscious resubscribe (DELETE + `consent_log` `suppression_overridden` entry) — but that override flow lives in `subscribeAlert()` (Story 6.1, already handles the `email_suppressions` check on subscribe) or a future story, not here. This story only ever **writes** a `global_optout` suppression, never removes one.

### Testing Approach

Vitest, same mocking style as `subscribe/route.test.ts` (`vi.mock('@/db/queries/alerts', ...)`, hand-built `NextRequest`-shaped objects for route tests). For `alerts.ts` query-function tests, follow whatever DB-mocking approach `alerts.test.ts` already uses for `confirmAlert()`/`subscribeAlert()` — read that file before writing new tests, do not introduce a second mocking strategy in the same file.

### Project Structure Notes

- Modified: `web/src/db/schema.ts` (`unsubscribe_token` column + unique index)
- New: `db/migrations/0007_price_alerts_unsubscribe_token.sql`
- Modified: `web/src/db/queries/alerts.ts` (token generation in `subscribeAlert()`, new `unsubscribeAlert()`/`unsubscribeAllAlertsByToken()`)
- New: `web/src/app/api/alerts/unsubscribe/route.ts`
- New: `web/src/app/api/alerts/unsubscribe-all/route.ts`
- New: `web/src/app/alerts/unsubscribed/page.tsx` (+ a small client component for the inline-expand "unsubscribe all" control)
- New/modified: corresponding `*.test.ts`/`*.test.tsx` for every file above
- No `scraper/` changes, no `items.py` changes (see Task 1.3, Prerequisite)

**Correct-course additions (Task 7):**

- Modified: `web/src/db/queries/alerts.ts` (`getUnsubscribePreviewByToken`), `alerts.test.ts`
- New: `web/src/app/alerts/unsubscribe/page.tsx` (+ `page.test.tsx`)
- New: `web/src/components/AlertTokenActionButton.tsx` (+ test) — shared with Story 6.2's `AlertConfirmButton` (thin wrapper)
- Modified: `web/src/app/api/alerts/unsubscribe/route.ts` (`GET` → `POST`) + `route.test.ts`
- No new migration, no schema change (AC unchanged: `status='cancelled'`, `consent_log.action='unsubscribed'` already exist)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.3] — original AC text (`GET /api/alerts/unsubscribe?token=<uuid>`, `/alerts/unsubscribed` page, "Wyłącz wszystkie powiadomienia" no-modal requirement)
- [Source: _bmad-output/planning-artifacts/architecture.md#L-2] — Suppression Override Semantics (raw email, overridable vs. permanent reasons)
- [Source: _bmad-output/planning-artifacts/architecture.md#L-4] — `consent_log` RODO table, append-only rule
- [Source: _bmad-output/implementation-artifacts/6-6-email-o-spadku-ceny.md] — Prerequisite/Dev Notes flag naming this story as the owner of real unsubscribe-token wiring; explicit scope boundary (this story does not touch the templates)
- [Source: web/src/db/queries/alerts.ts] — `subscribeAlert()`, `confirmAlert()` — patterns this story extends and mirrors
- [Source: web/src/app/api/alerts/confirm/route.ts] — redirect-only route pattern this story's `unsubscribe/route.ts` mirrors
- [Source: web/src/app/api/alerts/subscribe/route.ts] — `ApiResponse<T>` JSON route pattern this story's `unsubscribe-all/route.ts` mirrors
- [Source: web/src/app/alerts/confirmed/page.tsx] — page structure/styling convention for `/alerts/unsubscribed`
- [Source: db/migrations/0004_price_alerts_token_issued_at.sql] — three-step add-column/backfill/set-not-null migration pattern this story's migration follows
- [Source: web/src/db/schema.ts] — current `priceAlerts`/`emailSuppressions`/`consentLog` table definitions
- [Source: CLAUDE.md] — queries-only-in-`/web/src/db/queries/*.ts` rule, `assertNever` switch rule, `ApiResponse<T>` rule, schema/items.py sync rule (scoped to scraped-data tables only, per Task 1.3)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npx vitest run` (web full suite): 348 passed, 30 test files, no regressions.
- `npx tsc --noEmit`: clean.
- `npx eslint` on all new/modified files: clean.

### Completion Notes List

- `unsubscribe_token` added to `price_alerts` (migration `0007`), generated once at subscribe time, deliberately never rotated (omitted from `onConflictDoUpdate`'s `set`) — differs from `confirmation_token`'s rotate-on-stale-resubscribe behavior because every already-sent email embeds this token and must keep working indefinitely.
- `unsubscribeAlert()`/`unsubscribeAllAlertsByToken()` mirror `confirmAlert()`'s atomic single-CTE-statement pattern (neon-http has no `db.transaction()`) and idempotent-replay-returns-success semantics.
- `unsubscribeAllAlertsByToken()` correctly distinguishes permanent (`hard_bounce`/`complaint`) vs. overridable (`user_request`/`global_optout`) `email_suppressions` reasons per architecture L-2 — alerts are always cancelled, but a permanent suppression is never overridden and an existing overridable one is never duplicated.
- `GET /api/alerts/unsubscribe` and `POST /api/alerts/unsubscribe-all` mirror the established `confirm`/`subscribe` route patterns exactly (redirect-only vs. `ApiResponse<T>` JSON).
- `/alerts/unsubscribed` page + new `UnsubscribeAllControl` client component implement the inline-expand (not modal) "Wyłącz wszystkie powiadomienia" flow per epics AC.
- No `scraper/` files touched — confirmed items.py sync not required (price_alerts is an application table, not scraped data).
- All 10 acceptance criteria verified against the implementation; full web test suite green with no regressions.

### File List

- Modified: `web/src/db/schema.ts`
- New: `db/migrations/0007_price_alerts_unsubscribe_token.sql`
- Modified: `web/src/db/queries/alerts.ts`
- Modified: `web/src/db/queries/alerts.test.ts`
- New: `web/src/app/api/alerts/unsubscribe/route.ts`
- New: `web/src/app/api/alerts/unsubscribe/route.test.ts`
- New: `web/src/app/api/alerts/unsubscribe-all/route.ts`
- New: `web/src/app/api/alerts/unsubscribe-all/route.test.ts`
- New: `web/src/app/alerts/unsubscribed/page.tsx`
- New: `web/src/app/alerts/unsubscribed/page.test.tsx`
- New: `web/src/components/UnsubscribeAllControl.tsx`
- New: `web/src/components/UnsubscribeAllControl.test.tsx`

### Review Findings

- [x] [Review][Patch] `unsubscribeAllAlertsByToken()` not atomic — concurrent double-submit produces duplicate `email_suppressions`/`consent_log` rows (violates AC6 idempotency); a failure after the `price_alerts` cancel but before the suppression/consent writes leaves alerts cancelled with no matching audit trail (AC10 gap). Fixed: added unique constraint on `email_suppressions.email` (migration `0008`) and rewrote the function as one atomic CTE mirroring `unsubscribeAlert()` — cancel + `INSERT ... ON CONFLICT (email) DO NOTHING` + conditional `consent_log` insert, all in a single `db.execute(sql\`...\`)`. [web/src/db/queries/alerts.ts:1107-1157]
- [x] [Review][Patch] Migration comment claims "122 bits of entropy" but the backfill concatenates two UUIDs (~244 bits) — fixed the comment. [db/migrations/0007_price_alerts_unsubscribe_token.sql:203-204]
- [x] [Review][Defer] Migration's backfill→`SET NOT NULL` window is not wrapped in an explicit transaction — a concurrent insert from old app code during a rolling deploy could insert a NULL row between steps and abort the migration. Pre-existing pattern (same three-step approach as migration `0004`), not introduced by this story — deferred, pre-existing.

### Task 7 — Correct-course implementation (2026-08-25)

Implemented together with Story 6.2's Task 6 in one pass (shared component), per Sprint Change
Proposal 2026-08-24.

- `getUnsubscribePreviewByToken()` added: read-only, no status filter and no TTL check (unlike
  `getAlertPreviewByToken`, `unsubscribe_token` never rotates/expires — AC-9). `unsubscribeAlert()`
  itself: zero changes.
- `web/src/app/alerts/unsubscribe/page.tsx`: renders game name + a muted `AlertTokenActionButton`
  ("Wyłącz powiadomienia") + a resubscribe-reassurance line; redirects to
  `/alerts/unsubscribed?invalid=1` for missing/unknown tokens. Any found status (`pending_doi`,
  `active`, `cancelled`) renders the page — idempotent replay on an already-cancelled alert is
  fine, matching Story 6.2's precedent for an already-`active` confirm.
- **`AlertTokenActionButton` was built directly as the shared component** (Story 6.2's Task 6
  landed in the same pass, so there was no separately-built `AlertConfirmButton` to extract
  from — it was built as a thin wrapper around this component from the start instead). Used here
  with `endpoint="/api/alerts/unsubscribe"`, `successPath="/alerts/unsubscribed"`,
  `label="Wyłącz powiadomienia"`, `tone="muted"`. No separate unsubscribe-specific wrapper
  component was created — the page uses `AlertTokenActionButton` directly, since AC-1 doesn't
  name one the way Story 6.2's AC-1 names `AlertConfirmButton`.
- `POST /api/alerts/unsubscribe` (rewritten from `GET`): same body-shape/validation pattern as
  `unsubscribe-all/route.ts`; `unsubscribeAlert()` is byte-for-byte unchanged, just called from
  `POST` now instead of a `GET` query-param handler.
- `unsubscribe-all` (AC-6/AC-7) and the `/alerts/unsubscribed` page (AC-5) were not touched —
  already correct, as the correct-course anticipated.
- 399/399 web tests pass (up from 348 pre-change, combined with Story 6.2's Task 6 in the same
  pass). `npx tsc --noEmit` and `npx eslint .` both clean.

## Change Log

| Date | Change |
|---|---|
| 2026-08-20 | Story implemented: `unsubscribe_token` column/migration, `unsubscribeAlert()`/`unsubscribeAllAlertsByToken()`, redirect-only `GET /api/alerts/unsubscribe`, `POST /api/alerts/unsubscribe-all`, `/alerts/unsubscribed` page. 348/348 web tests pass. Code review: 2 patches applied (atomicity fix for `unsubscribeAllAlertsByToken`, entropy comment), 1 deferred. |
| 2026-08-24 | **Correct-course, discovered during branch-divergence reconciliation:** `GET /api/alerts/unsubscribe` mutates state on a bare GET — the same mail-scanner-prefetch vulnerability the 2026-07-24 RODO party-mode session already decided to fix for this story (`docs/solutions/architecture/rodo-consent-integrity.md`, never carried into this story's ACs or `epics.md` at the time). Status → `in-progress`. New ACs 1–4 + 12 and Task 7 added, mirroring Story 6.2's already-approved side-effect-free-GET-page + POST pattern. See `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-24.md`. |
| 2026-08-25 | Task 7 implemented (together with Story 6.2's Task 6, shared `AlertTokenActionButton`): `getUnsubscribePreviewByToken` added, `/alerts/unsubscribe` page built, `POST /api/alerts/unsubscribe` replaces the old `GET` handler. 399/399 web tests pass, `tsc`/`eslint` clean. Status → review. |
