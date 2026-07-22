---
baseline_commit: 9358c7ef32d5a3934d2c4e33a2eb1fd97323fd28
---

# Story 6.2: Double Opt-In Confirmation — GET /api/alerts/confirm

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want clicking the confirmation link in my email to activate my price alert,
so that I'm sure I'll receive notifications and no one can activate alerts using my email without my consent.

**Dev:** Dev A (Web) — _pliki: `app/api/alerts/confirm/route.ts`, `app/alerts/confirmed/page.tsx`, `app/alerts/expired/page.tsx`_
**Depends on:** Story 6.1 (done) — `price_alerts` table, `confirmation_token` column, `subscribeAlert()` conventions.

## Acceptance Criteria

1. **Given** `GET /api/alerts/confirm?token=<value>` **When** called with a valid, unexpired token (created ≤48h ago, `status = 'pending_doi'`) **Then** it updates `price_alerts.status = 'active'` + `confirmed_at = now()`, writes one `consent_log` row (`action = 'opt_in_confirmed'`, `source = 'user'`, `email_hash` from the alert row, `token_id` = the `price_alerts.id`), and redirects (302) to `/alerts/confirmed?token=<value>`.
2. **Given** `GET /api/alerts/confirm?token=<value>` **When** called with a token that is missing, not found, expired (>48h and still `pending_doi`), or belongs to a `cancelled` alert **Then** it redirects to `/alerts/expired` (with `?slug=<gameSlug>` appended only when the token *was* found in the DB, i.e. expired/cancelled cases — never for a genuinely unknown token) — no error code, no DB error message exposed to the user.
3. **Given** `GET /api/alerts/confirm?token=<value>` **When** the token belongs to an alert that is already `status = 'active'` **Then** it redirects to `/alerts/confirmed?token=<value>` **without** writing a second `consent_log` row — idempotent, not an error (AC covers "confirmed twice").
4. **Given** `/alerts/confirmed` page rendered with `?token=<value>` **When** the token resolves to an alert **Then** it shows: green confirmation message "Gotowe! Powiadomimy Cię gdy cena spadnie.", the game name and target price (via `formatPrice`) echoed back, a "Wróć do gry →" link to `/gra/{slug}`, and a "Zarządzaj alertami →" element rendered as a disabled placeholder (see Dev Notes — no destination page exists yet in any epic).
5. **Given** `/alerts/confirmed` page **When** rendered with a missing/invalid `token` param (direct navigation, no game context available) **Then** it still shows the generic green confirmation message, omitting the game-specific summary card and the "Wróć do gry →" link — does not error or 404.
6. **Given** `/alerts/expired` page **When** rendered **Then** it shows a warm message "Link wygasł lub jest nieprawidłowy" and a "Wróć do strony gry i spróbuj ponownie" link to `/gra/{slug}` **if** `?slug=` is present, otherwise a generic "Wróć do strony głównej i spróbuj ponownie" link to `/`.
7. **Given** the confirmation token **Then** it is the existing `price_alerts.confirmation_token` value (already generated as 32 random bytes / hex in Story 6.1b) — this story only *consumes* it, never generates a new one.
8. **Given** RODO/consent_log constraints (CLAUDE.md, architecture L-4) **Then** `consent_log` is only ever INSERTed, never UPDATEd/DELETEd, in this story's code paths.

## Tasks / Subtasks

- [x] **Task 1 — DB query layer** (AC: 1, 2, 3, 7, 8) — `web/src/db/queries/alerts.ts` (MODIFY)
  - [x] 1.1 Add `confirmAlert(token: string): Promise<ConfirmAlertResult>` implementing the branch logic in Dev Notes → "Confirm flow decision table". Return a discriminated union: `{ outcome: 'confirmed' } | { outcome: 'already_confirmed' } | { outcome: 'expired'; gameSlug: string | null }` — mirrors the existing `SubscribeAlertResult` pattern in the same file.
  - [x] 1.2 Add `getAlertSummaryByToken(token: string): Promise<{ gameName: string; gameSlug: string; targetPrice: string | null } | null>` — used only by the `/alerts/confirmed` page, joins `price_alerts` → `games`, `WHERE confirmation_token = token AND status = 'active'`.
  - [x] 1.3 Extend `web/src/db/queries/alerts.test.ts` (MODIFY) — cover every branch in the decision table plus `getAlertSummaryByToken` found/not-found.
- [x] **Task 2 — API route** (AC: 1, 2, 3) — `web/src/app/api/alerts/confirm/route.ts` (CREATE)
  - [x] 2.1 `GET` handler: read `token` from `request.nextUrl.searchParams`, call `confirmAlert`, branch on `outcome`, `NextResponse.redirect(new URL(path, request.url))`. See Dev Notes → "Why this route does not return `ApiResponse<T>`".
  - [x] 2.2 `web/src/app/api/alerts/confirm/route.test.ts` (CREATE) — mock `confirmAlert`, assert redirect target (`Location` header / `res.headers.get('location')`) for each outcome, and that a missing `token` query param redirects to `/alerts/expired` without calling `confirmAlert`.
- [x] **Task 3 — `/alerts/confirmed` page** (AC: 4, 5) — `web/src/app/alerts/confirmed/page.tsx` (CREATE)
  - [x] 3.1 Async server component, reads `searchParams.token`, calls `getAlertSummaryByToken` when present.
  - [x] 3.2 Reuse the visual language already established for the "success" state in `AlertSubscribeForm.tsx` (green checkmark circle, summary card, "AKTYWNY" badge) — same inline-style values, not a shared import (see Dev Notes).
  - [x] 3.3 `web/src/app/alerts/confirmed/page.test.tsx` (CREATE) — RTL render, mock `next/link` and `@/db/queries/alerts` per the pattern in `web/src/app/gra/[slug]/game-passport.test.tsx`.
- [x] **Task 4 — `/alerts/expired` page** (AC: 6) — `web/src/app/alerts/expired/page.tsx` (CREATE)
  - [x] 4.1 Async server component reading `searchParams.slug` (no DB query needed — slug arrives pre-resolved from the API route).
  - [x] 4.2 Model markup/style after `web/src/app/gra/[slug]/not-found.tsx` (same warm-empty-state pattern already in the codebase).
  - [x] 4.3 `web/src/app/alerts/expired/page.test.tsx` (CREATE) — asserts correct link target for both the `slug` and no-`slug` cases.
- [x] **Task 5 — verify** — `npx tsc --noEmit` and `npx eslint` clean on all new/changed files; `npm run test:run` green.

## Dev Notes

### Confirm flow decision table

The epics AC text (`_bmad-output/planning-artifacts/epics.md` lines 1719–1749) does not fully specify the branch logic — it only names two end states ("valid → active", "expired/not-found → /alerts/expired") plus one idempotency case. Implement `confirmAlert()` per this table (fills the gaps deliberately, do not invent alternatives):

| Lookup result | Action |
|---|---|
| No row for `confirmation_token = token` | → `{ outcome: 'expired', gameSlug: null }` — never leak whether a token "almost" matched |
| Row found, `status = 'active'` | → `{ outcome: 'already_confirmed' }` — **no** new `consent_log` write (AC-3: idempotent, not a fresh confirmation event) |
| Row found, `status = 'cancelled'` | → `{ outcome: 'expired', gameSlug: row.gameSlug }` — a cancelled alert must never be silently reactivated by replaying an old confirm link (security: this is the only place a stale link could resurrect an unsubscribed user) |
| Row found, `status = 'pending_doi'`, `created_at` > 48h ago | → `{ outcome: 'expired', gameSlug: row.gameSlug }` |
| Row found, `status = 'pending_doi'`, `created_at` ≤ 48h ago | UPDATE `status = 'active'`, `confirmed_at = now()` → INSERT `consent_log` (`action = 'opt_in_confirmed'`, `source = 'user'`, `email_hash = row.email_hash`, `token_id = row.id`) → `{ outcome: 'confirmed' }` |

Compute the 48h check in JS (`Date.now() - row.created_at.getTime() > 48 * 60 * 60 * 1000`) — `created_at` comes back as a JS `Date` from the `timestamptz` column via Drizzle, same as every other timestamp read in this codebase. No new SQL interval logic needed.

### Why `/alerts/confirmed` and `/alerts/expired` carry `?token=` / `?slug=`, not raw game data

The epics AC says the confirm route "redirects to `/alerts/confirmed`" with no query params specified, but the same epic also requires that page to echo the game name and target price. There is no other way for that page (a fresh page load from an email client, zero client state) to know which alert to show. Resolution: redirect with `?token=<value>` and have the `/alerts/confirmed` page re-look-up the alert by token (`getAlertSummaryByToken`, scoped to `status = 'active'` rows only — read-only, no side effects, safe to call on every repeat visit). This keeps the confirmation token as the single identifier throughout the flow instead of introducing a new leaky identifier (e.g. a raw numeric `price_alerts.id` in the URL, which would let anyone enumerate other users' game+price choices).

`/alerts/expired` gets `?slug=` (not `?token=`) because by definition its whole point is "this token is no longer valid" — passing the dead token to it serves no purpose. The slug is pass-through display data only (not sensitive), safe to put in a URL.

### Why this route does not return `ApiResponse<T>`

CLAUDE.md: "Każdy API Route musi zwracać `ApiResponse<T>`" — this route is the one deliberate exception. `GET /api/alerts/confirm` is never called via `fetch()`; it is the target of a link a human clicks from their email client, so its only correct response is an HTTP redirect the browser follows. Returning `{ success: true, data: ... }` JSON here would show the user raw JSON instead of navigating them anywhere. `web/src/app/api/revalidate/route.ts` and `.../alerts/subscribe/route.ts` are the two existing routes that *do* return `ApiResponse<T>` — both are `fetch()`-consumed. Story 6.3 (`/api/alerts/unsubscribe`) will be the same kind of exception; treat this as the established pattern for token-driven redirect routes, not a one-off hack.

### "Zarządzaj alertami →" has no destination page

The epics AC for `/alerts/confirmed` (line 1739) lists a "Zarządzaj alertami →" link, but no epic (6, 7, or 8) in `epics.md` defines a manage-alerts page or route — grepped the whole file, zero hits beyond this one line. Do not invent a page for it. Precedent already exists in this exact codebase for this situation: Story 6.1a's "Wyślij ponownie" resend button (`AlertSubscribeForm.tsx`, State 2) is rendered `disabled` with `data-testid="resend-link"` and the comment "non-functional placeholder — future story". Render "Zarządzaj alertami →" the same way: a disabled, non-interactive element, not an `<a href>` to nowhere.

### Route/page reference

- `NextResponse.redirect(new URL('/alerts/confirmed?token=...', request.url))` — use `request.url` as the base, not `siteUrl` from `@/lib/config` — this is the standard Next.js App Router pattern and works unmodified across localhost/preview/prod without env coupling.
- Route file signature: `export async function GET(request: NextRequest) { ... }`, read query via `request.nextUrl.searchParams.get('token')`.
- Page `searchParams` prop in this Next.js version is a `Promise` (see existing `params: Promise<{ slug: string }>` pattern in `web/src/app/gra/[slug]/page.tsx`) — the new pages must `await searchParams` the same way, e.g. `{ searchParams }: { searchParams: Promise<{ token?: string }> }`.

### Reused patterns / conventions (do not deviate)

- Queries **only** in `web/src/db/queries/alerts.ts` — no inline `db.select()` in the route or pages (CLAUDE.md, ESLint-enforced).
- Drizzle query builder, not raw `sql` template strings — established explicitly in Story 6.1b's Dev Notes and followed by `subscribeAlert()`.
- Email/consent invariant already enforced elsewhere in this file: every `price_alerts`/`email_suppressions` write pairs with a `consent_log` INSERT (architecture L-4) — `confirmAlert`'s `pending_doi → active` branch is the only write path in this story and must keep that pairing.
- `formatPrice()` from `@/lib/format` for the echoed target price — never hand-roll price formatting (CLAUDE.md).
- Inline `style={{...}}` objects matching the existing design tokens (`var(--color-primary)`, `var(--color-surface)`, `var(--color-text-primary)`, etc.) — this codebase has no CSS-module/styled-component layer; every component (`DealCard`, `AlertModal`, `not-found.tsx`) uses the same inline-style approach. Match `web/src/app/gra/[slug]/not-found.tsx` specifically for the `/alerts/expired` empty-state layout.
- Component/page names are domain-named per CLAUDE.md ("DOMENOWE") — the two new pages are plain Next.js route files (`page.tsx`), no separate named component needed for either.

### Project Structure Notes

- `app/api/alerts/confirm/route.ts` is a **static** route path with the token as a query string parameter (`?token=`), matching `epics.md`'s explicit file path and the `subscribe` route's shape. **Do not** create a dynamic segment (`app/api/alerts/confirm/[token]/route.ts`) — an earlier note in Story 6-1b's Dev Notes speculatively mentioned `[token]` dynamic folders for 6.2/6.3; that speculation is superseded by `epics.md`'s explicit `app/api/alerts/confirm/route.ts` file path and by this story's ACs, which all use `?token=`.
- `app/alerts/confirmed/page.tsx` and `app/alerts/expired/page.tsx` are new sibling routes under a new `app/alerts/` directory (parallel to existing `app/gra/[slug]/`) — first routes under this path, no existing `app/alerts/layout.tsx` to worry about; they inherit `SiteHeader`/`SiteFooter` from the root `layout.tsx` automatically.
- Both new pages are personal/transient (post-redirect, not link-worthy) and out of scope for `sitemap.ts` (`web/src/app/sitemap.ts` — do not add them there) — no story requires it and neither page has stable, indexable content per visit.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.2] — original AC text (lines 1719–1749)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.1] — DOI email link generation context (lines 1675–1717)
- [Source: _bmad-output/planning-artifacts/architecture.md#L-4] — consent_log append-only rules (lines 804–834)
- [Source: _bmad-output/planning-artifacts/architecture.md#L-2] — email normalization / suppression semantics (lines 751–769) — not directly touched by this story but explains why `price_alerts.email` is lowercase-normalized elsewhere
- [Source: _bmad-output/implementation-artifacts/6-1b-alert-subscribe-api-db.md] — `subscribeAlert()` implementation this story extends; confirms `/api/alerts/subscribe` (not `/api/alerts`) as the sibling-route naming precedent
- [Source: _bmad-output/implementation-artifacts/6-1a-alert-subscribe-form-frontend.md] — AC-7 "State 3: Success (UI-only for now)" — confirms the visual spec this story's `/alerts/confirmed` page must match, and confirms `/alerts/confirmed` was deferred to this story
- [Source: web/src/db/schema.ts] — `priceAlerts`, `consentLog`, `games` table definitions (current, read directly — no separate schema doc)
- [Source: web/src/db/queries/alerts.ts] — `subscribeAlert()` pattern to mirror (discriminated-union result type, normalized-email handling)
- [Source: web/src/app/gra/[slug]/page.tsx, not-found.tsx] — page/metadata/empty-state conventions

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code, bmad-dev-story workflow)

### Debug Log References

- `npx vitest run src/db/queries/alerts.test.ts` — 17 passed (11 new)
- `npx vitest run src/app/api/alerts/confirm/route.test.ts` — 8 passed
- `npx vitest run src/app/alerts/confirmed/page.test.tsx` — 5 passed
- `npx vitest run src/app/alerts/expired/page.test.tsx` — 3 passed
- `npm run test:run` — 25 files / 300 tests passed, no regressions
- `npx tsc --noEmit` — clean; `npx eslint` on all touched paths — clean
- `npm run build` — clean; `/alerts/confirmed`, `/alerts/expired` and `/api/alerts/confirm` all register as dynamic (ƒ), no prerender/DB-at-build-time issues

### Completion Notes List

- `confirmAlert()` implements the Dev Notes decision table verbatim. Three deliberate hardening
  details beyond the table, all preserving its outcomes:
  - **activation is a single data-modifying CTE**, not an UPDATE followed by an INSERT. The
    neon-http driver has no transactions (`db.transaction()` throws), so two statements leave a
    window where the alert is active with no consent record — unrepairable, because `consent_log`
    is append-only. One statement is atomic by definition, and its `RETURNING` row count doubles
    as the outcome (1 → confirmed, 0 → another request won the race). This also removes the need
    for a separate concurrency guard: the UPDATE takes the row lock and re-evaluates its WHERE
    after a competing commit, so the loser's CTE is empty and its INSERT writes nothing.
    Full analysis: `docs/solutions/architecture/rodo-consent-integrity.md`.
  - `confirmed_at` uses the database's `now()` rather than a JS `Date`, so it shares a clock with
    `created_at` instead of the serverless function's.
  - a `null` `created_at` (column is nullable in `schema.ts`) is treated as expired — the token's
    age cannot be verified, so it is refused rather than accepted as fresh.
- `ip_hash` is threaded from the route into the `opt_in_confirmed` entry, matching what
  `opt_in_requested` already records. The confirmation click is the strongest consent evidence
  captured, and an append-only table cannot be backfilled later.
- `findActiveAlertsMissingConsent()` is the reconciliation check for architecture L-4: active
  alerts with no matching `opt_in_confirmed` entry. It should always return an empty array. It is
  a detector, deliberately not a second writer — see the doc above for why a compensating write
  would only duplicate rows.
- `GET /api/alerts/confirm` returns 302 redirects rather than `ApiResponse<T>`, per the story's
  "Why this route does not return `ApiResponse<T>`" note. A `confirmAlert` throw is caught, logged
  server-side, and redirected to `/alerts/expired` with no slug — the user never sees an error code
  or a DB message (AC-2).
- Both new pages read `searchParams` as a `Promise` (Next.js 16 convention already used by
  `gra/[slug]/page.tsx`) and are server components; neither was added to `sitemap.ts`.
- "Zarządzaj alertami →" renders as a `disabled` `<button>`, mirroring the "Wyślij ponownie"
  placeholder in `AlertSubscribeForm.tsx` — no destination route was invented.
- `/alerts/confirmed` reuses the success-state visual values from `AlertSubscribeForm.tsx`
  (green ✓ circle, summary card, AKTYWNY badge) as inline styles, not a shared import, per Dev Notes.
- Target price is rendered through `formatPrice()`, so a `null` target shows the em-dash "—".

### File List

- `web/src/db/queries/alerts.ts` (MODIFY) — added `confirmAlert`, `getAlertSummaryByToken`, `findActiveAlertsMissingConsent`, `ConfirmAlertResult`, `AlertSummary`, `CONFIRMATION_TOKEN_TTL_MS`
- `web/src/db/queries/alerts.test.ts` (MODIFY) — 15 new tests; chain mock extended with `innerJoin`/`set`, `getDb` mock extended with `update`/`execute`, added `sqlParams` helper
- `web/src/app/api/alerts/confirm/route.ts` (CREATE)
- `web/src/app/api/alerts/confirm/route.test.ts` (CREATE)
- `web/src/app/alerts/confirmed/page.tsx` (CREATE)
- `web/src/app/alerts/confirmed/page.test.tsx` (CREATE)
- `web/src/app/alerts/expired/page.tsx` (CREATE)
- `web/src/app/alerts/expired/page.test.tsx` (CREATE)
- `AGENTS.md` (MODIFY) — canonical route table corrected to `GET /api/alerts/confirm?token=`
- `docs/solutions/architecture/rodo-consent-integrity.md` (CREATE) — RODO findings and decisions
- `_bmad-output/implementation-artifacts/6-2-double-opt-in-confirmation-get-api-alerts-confirm.md` (MODIFY)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MODIFY — left uncommitted, carries an unrelated workstream's status lines)

### Code review outcome (2026-07-22)

11-reviewer pass. Applied here: the atomic CTE, `ip_hash`, the reconciliation query, a `try/catch`
around the confirmed page's summary lookup (a failed read must not present a successful opt-in as
an error), assertions on the query predicates the chain mock had left unverified, and a fix to a
48h-boundary test that only passed when both `Date.now()` calls landed in the same millisecond.

Open, deliberately not in this commit:

- **`created_at` is never refreshed on re-subscribe (P1).** `subscribeAlert`'s ON CONFLICT rotates
  the token for a cancelled row but keeps the original `created_at`, which is what the TTL is
  measured from — so a re-issued token for a row older than 48h is born expired and the user can
  never confirm. Next commit; touches Story 6.1b's upsert.
- `?slug=` on `/alerts/expired` makes an unknown token distinguishable from a real dead one.
  AC-2 mandates it, the Dev Notes invariant forbids it — a contradiction in the story that needs a
  decision, not a code fix.
- Email link scanners can auto-confirm via GET; token never rotates after use. Both deferred to a
  dedicated RODO session — recorded in the doc above.
- No index on `price_alerts.confirmation_token`; log redaction for `DrizzleQueryError` (which
  embeds query params); unauthenticated `subscribe` can rewrite a confirmed subscriber's target
  price. All pre-existing, on the backlog.

## Change Log

| Date | Change |
|---|---|
| 2026-07-21 | Story 6.2 implemented: `confirmAlert`/`getAlertSummaryByToken` queries, `GET /api/alerts/confirm` redirect route, `/alerts/confirmed` and `/alerts/expired` pages. 27 new tests; suite 300 passed. Status → review. |
| 2026-07-22 | Code review applied: activation collapsed into one atomic CTE, `ip_hash` recorded on confirmation, `findActiveAlertsMissingConsent()` reconciliation query, error handling on the confirmed page, query-predicate assertions, and a flaky 48h-boundary test fixed. Suite 306 passed. |
