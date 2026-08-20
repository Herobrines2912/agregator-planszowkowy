---
baseline_commit: 0d6458e
---

# Story 6.3: Wyłączanie Powiadomień

Status: review

**Epic:** 6 — Email Price Alerts
**Dev:** Dev A (Web) per epics.md — _pliki: `app/api/alerts/unsubscribe/route.ts`, `app/alerts/unsubscribed/page.tsx`_, plus shared files this story must also touch: `web/src/db/schema.ts`, `db/migrations/0007_*.sql`, `web/src/db/queries/alerts.ts`, `app/api/alerts/unsubscribe-all/route.ts`
**Depends on:** Story 6.1 (done) — `subscribeAlert()` in `alerts.ts`, `price_alerts`/`consent_log`/`email_suppressions` schema. Story 6.2 (in-progress) — `confirmAlert()` and the redirect-only GET-route pattern this story mirrors exactly (`app/api/alerts/confirm/route.ts`).

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

1. **Given** `GET /api/alerts/unsubscribe?token=<value>`, **when** the token resolves to a `price_alerts` row (any status), **then** it sets `status = 'cancelled'`, writes a `consent_log` row (`action = 'unsubscribed'`, `source = 'user'`, `email_hash = SHA-256(email.toLowerCase())`, `token_id` = the alert's id), and redirects (302) to `/alerts/unsubscribed?token=<value>` — zero JSON response, same redirect-only contract as `confirm/route.ts` (this is a link a human clicks from an email client, never `fetch()`-ed).
2. **Given** an alert already `cancelled` (token reused / double-click), **when** `GET /api/alerts/unsubscribe` fires, **then** it is idempotent: no second `consent_log` row is written, still redirects to `/alerts/unsubscribed?token=<value>` with the same success message — not an error.
3. **Given** a missing, unknown, or malformed token, **when** `GET /api/alerts/unsubscribe` fires, **then** it still redirects (zero DB writes) to `/alerts/unsubscribed?invalid=1` — message "Ten link wygasł — jeśli chcesz wyłączyć powiadomienia, skontaktuj się z nami" — unsubscribing must never silently fail from the user's point of view, even when the token itself is bad.
4. **Given** `/alerts/unsubscribed` page with a valid `?token=`, **when** rendered, **then** it shows "Wyłączono powiadomienia. Nie będziesz już otrzymywał powiadomień dla tej gry." and a secondary "Wyłącz wszystkie powiadomienia" control (inline expand + confirm, not a modal — matches the epics AC's explicit "no modal" instruction).
5. **Given** the user clicks "Wyłącz wszystkie powiadomienia" and confirms, **when** `POST /api/alerts/unsubscribe-all` fires with `{ token }` (the same unsubscribe token already on the page — never a client-supplied raw email, so the request can't be used to suppress an address the caller doesn't hold a token for), **then** it: resolves the email from the token's alert row, sets **every** `price_alerts` row for that (normalized, lowercased) email to `status = 'cancelled'`, inserts one `email_suppressions` row (`email` = raw normalized email — not hashed, per architecture L-2/L-3's exact-match join requirement; `reason = 'global_optout'`), and writes one `consent_log` row (`action = 'suppressed'`, `email_hash`, `source = 'user'`). Returns `ApiResponse<{ message: string }>`.
6. **Given** an email already in `email_suppressions` with `reason = 'global_optout'` or `'user_request'`, **when** `POST /api/alerts/unsubscribe-all` fires again for that email, **then** it is idempotent — no duplicate `email_suppressions` row, no duplicate `consent_log` entry, still returns success. (Permanent reasons `hard_bounce`/`complaint` are Story 6.8's concern — this story never writes or overrides those.)
7. **Given** a future `POST /api/alerts/subscribe` call for a globally-suppressed email, **when** it fires, **then** it already returns the generic 200 without inserting (existing `email_suppressions` check in `subscribeAlert()`, Story 6.1 — this story adds no new logic there, just confirms the existing check now has a real path that populates the table with `reason = 'global_optout'`).
8. **Given** `price_alerts.unsubscribe_token`, **when** an alert is first created via `subscribeAlert()`, **then** a token is generated once and **never rotated** — unlike `confirmation_token` (which rotates on a stale re-subscribe), the unsubscribe token must keep working for the lifetime of every email already sent, including ones sitting unread in an inbox for months. A re-subscribe (`onConflictDoUpdate`) must not touch this column.
9. **Given** existing `price_alerts` rows created before this migration, **when** the migration runs, **then** every row is backfilled with a generated token (never left NULL) — an already-active alert must not lose its ability to unsubscribe.
10. **Given** RODO data retention, **when** `consent_log` is reviewed, **then** every unsubscribe event is present with `action = 'unsubscribed'` (per-alert) or `action = 'suppressed'` (global opt-out) — append-only, no deletes.

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

## Dev Notes

### What NOT to touch

- `scraper/` — nothing in this story touches Python, `alert_engine.py`, or the email templates. See Prerequisite section above.
- `confirmation_token` / `token_issued_at` / the DOI confirm flow (Story 6.2) — untouched; `unsubscribe_token` is a new, separate column with different lifecycle semantics (never rotates, never expires).
- `hard_bounce`/`complaint` suppression rows — permanent, never overridden by this story's global-opt-out path (architecture L-2). Story 6.8 owns writing those.
- Do not hash `email_suppressions.email` — architecture L-2/L-3 require the raw (lowercase-normalized) address for the exact-match join against `price_alerts.email` in `alert_engine.py`. Only `consent_log.email_hash` is hashed.

### Reference implementation: mirror `confirmAlert()` / `confirm/route.ts` almost exactly

Story 6.2's `confirmAlert()` (`web/src/db/queries/alerts.ts`) and `app/api/alerts/confirm/route.ts` already establish every pattern this story needs: the redirect-only GET route (not `ApiResponse<T>` — documented exception, same rationale applies here), the atomic single-CTE-statement UPDATE+INSERT (required because the neon-http driver has no `db.transaction()`), the idempotent-replay-returns-success (not error) semantics, and the `assertNever`-guarded switch on outcome. Read both files fully before writing any code — this story is a close structural sibling, not a fresh design.

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
