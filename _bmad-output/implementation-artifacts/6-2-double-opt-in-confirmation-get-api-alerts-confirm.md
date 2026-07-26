---
baseline_commit: 9358c7ef32d5a3934d2c4e33a2eb1fd97323fd28
---

# Story 6.2: Double Opt-In Confirmation — GET /alerts/confirm (page) + POST /api/alerts/confirm

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **Correct-course (2026-07-26):** the original implementation confirmed alerts on a plain
> `GET`, which email security scanners (SafeLinks, Proofpoint, etc.) request automatically
> before a human ever clicks — silently activating alerts and fabricating consent evidence
> in the append-only `consent_log`. Party-mode session 2026-07-24 decided this must move to
> a side-effect-free `GET` page + explicit `POST` on click. Full rationale and impact
> analysis: `docs/solutions/architecture/rodo-consent-integrity.md` ("ROZSTRZYGNIĘTE:
> skanery linków") and `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-26.md`.
> Status reopened `done` → `in-progress`; Task 1–5 below are the **original** implementation
> (kept for history, still largely valid — see notes inline), Task 6 is the correction.

## Story

As a **user**,
I want clicking the confirmation link in my email to take me to a page where I explicitly confirm, which then activates my price alert,
so that I'm sure I'll receive notifications, no one (including an email scanner) can activate alerts using my email without a real click from me, and no one can activate alerts using my email without my consent.

**Dev:** Dev A (Web) — _pliki: `web/src/app/alerts/confirm/page.tsx`, `web/src/components/AlertConfirmButton.tsx`, `web/src/app/api/alerts/confirm/route.ts`, `web/src/app/alerts/confirmed/page.tsx`, `web/src/app/alerts/expired/page.tsx`_
**Depends on:** Story 6.1 (done) — `price_alerts` table, `confirmation_token` column, `subscribeAlert()` conventions.

## Acceptance Criteria

> AC 1–4 are the correct-course replacement for the original AC-1/AC-2/AC-3 (below, in that
> order): a mail-clicked `GET` may never mutate state. AC 5–9 are the original AC-4/5/6/7/8,
> renumbered, unchanged in substance. AC 10 is new (UX tone). See Dev Notes → "Correct-course
> decision table" for the full branch logic and Dev Notes → "Why POST now returns
> `ApiResponse<T>`" for the reversed exception.

1. **Given** `GET /alerts/confirm?token=<value>` (a **page**, not an API route) **When** the token's row exists with `status = 'pending_doi'` (any TTL) or `status = 'active'` **Then** it renders a side-effect-free confirmation page — **zero DB writes, zero `consent_log` writes** — showing the game name, target price (via `formatPrice`), a large primary "Potwierdzam" button (`AlertConfirmButton`, `'use client'`), and a small secondary line "nie zapisywałeś się? zignoruj maila".
2. **Given** `GET /alerts/confirm?token=<value>` **When** the token is missing, not found, belongs to a `cancelled` alert, or belongs to a `pending_doi` alert whose `token_issued_at` is past the 48h TTL **Then** it redirects (still zero DB writes) to `/alerts/expired`, with `?slug=<gameSlug>` appended only when the token *was* found (cancelled/expired-pending cases) — never for a genuinely unknown token. Same oracle-acceptance rule as today (Dev Notes → "The `?slug=` presence oracle is accepted, not a defect") — do not relax or re-derive it.
3. **Given** `POST /api/alerts/confirm` with JSON body `{ token: string }` **When** `confirmAlert(token, ipHash)` (unchanged) returns `'confirmed'` or `'already_confirmed'` **Then** it returns `200 { success: true, data: { outcome } }` (`ApiResponse<{ outcome: 'confirmed' | 'already_confirmed' }>`) — writes exactly one `consent_log` row for a fresh `'confirmed'`, zero for `'already_confirmed'` (idempotency preserved verbatim from the existing query layer — this is the original AC-1's mutation half + AC-3's idempotency, now behind `POST`).
4. **Given** `POST /api/alerts/confirm` **When** `confirmAlert()` returns `'expired'` (a rare race — token expired or was cancelled between page render and button click) or throws **Then** it returns a non-2xx `ApiResponse<never>` (`{ success: false, error: '...' }`, no DB error text exposed) and `AlertConfirmButton` renders a warm inline error state on the same page (no navigation, no `gameSlug` needed — the common expired/cancelled case is already intercepted at GET-time by AC-2).
5. **Given** `/alerts/confirmed` page rendered with `?token=<value>` **When** the token resolves to an alert **Then** it shows: green confirmation message "Gotowe! Powiadomimy Cię gdy cena spadnie.", the game name and target price (via `formatPrice`) echoed back, a "Wróć do gry →" link to `/gra/{slug}`, and a "Zarządzaj alertami →" element rendered as a disabled placeholder (see Dev Notes — no destination page exists yet in any epic). **Unchanged — no code change required.**
6. **Given** `/alerts/confirmed` page **When** rendered with a missing/invalid `token` param (direct navigation, no game context available) **Then** it still shows the generic green confirmation message, omitting the game-specific summary card and the "Wróć do gry →" link — does not error or 404. **Unchanged.**
7. **Given** `/alerts/expired` page **When** rendered **Then** it shows a warm message "Link wygasł lub jest nieprawidłowy" and a "Wróć do strony gry i spróbuj ponownie" link to `/gra/{slug}` **if** `?slug=` is present, otherwise a generic "Wróć do strony głównej i spróbuj ponownie" link to `/`. **Unchanged — gains one more caller (the new GET page's redirect, AC-2).**
8. **Given** the confirmation token **Then** it is the existing `price_alerts.confirmation_token` value (already generated as 32 random bytes / hex in Story 6.1b) — this story only *consumes* it, never generates a new one. **Unchanged.**
9. **Given** RODO/consent_log constraints (CLAUDE.md, architecture L-4) **Then** `consent_log` is only ever INSERTed, never UPDATEd/DELETEd, in this story's code paths — now also covering `getAlertPreviewByToken` (read-only) and the `POST` route.
10. **Given** `/alerts/confirm` page **When** rendered **Then** the visual tone is warm/inviting but **not** celebratory (no green checkmark — reserved for the post-confirm `/alerts/confirmed` state) — same design tokens (`var(--color-primary)`, `var(--font-playfair)`, etc.), large primary CTA, target price shown for trust, small "nie zapisywałeś się? zignoruj maila" as secondary/muted text.

## Tasks / Subtasks

> Tasks 1–5 are the **original** implementation (AC numbers below refer to the **original**
> AC-1..8, not the renumbered list above) — kept as history, still accurate for what they
> built. Task 6 is the correct-course addition; see its own AC references against the
> **current** numbered list.

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

- [ ] **Task 6 — Correct-course: side-effect-free GET page + POST confirm** (AC: 1, 2, 3, 4, 10) — see Dev Notes → "Correct-course decision table" before starting
  - [ ] 6.1 `web/src/db/queries/alerts.ts` (MODIFY): add `getAlertPreviewByToken(token: string): Promise<{ status: 'pending_doi' | 'active' | 'cancelled'; gameName: string; gameSlug: string; targetPrice: string | null; tokenIssuedAt: Date } | null>` — same read-only `SELECT … WHERE confirmation_token = token` shape `confirmAlert()` already does (join `price_alerts` → `games`), no status filter (needs to see `pending_doi`/`active`/`cancelled` alike to decide render-vs-redirect). Reuse the exported `CONFIRMATION_TOKEN_TTL_MS` for the page's display-only TTL check — do not hardcode 48h again. **`confirmAlert()` itself: zero changes.**
  - [ ] 6.2 `web/src/app/alerts/confirm/page.tsx` (CREATE): async server component, `searchParams: Promise<{ token?: string }>` (same pattern as `alerts/confirmed/page.tsx`). Missing token → `redirect('/alerts/expired')` (`next/navigation`). Calls `getAlertPreviewByToken`; not found → `redirect('/alerts/expired')`; `cancelled` or (`pending_doi` and TTL expired) → `redirect('/alerts/expired?slug=' + gameSlug)`; `pending_doi` (TTL valid) or `active` → render summary + `AlertConfirmButton`. A `redirect()` call is not a mutation — GET stays pure per AC-1/AC-2.
  - [ ] 6.3 `web/src/components/AlertConfirmButton.tsx` (CREATE, `'use client'`): props `{ token: string }`. On click: `fetch('/api/alerts/confirm', { method: 'POST', body: JSON.stringify({ token }) })`, parse `ApiResponse<{ outcome }>`; success → `router.push('/alerts/confirmed?token=' + token)`; failure → local error state rendered inline (AC-4). Mirror the fetch/error-state shape already used in `AlertSubscribeForm.tsx`.
  - [ ] 6.4 `web/src/app/api/alerts/confirm/route.ts` (MODIFY): **remove the `GET` handler entirely** (moves to the page). Add `POST`: parse JSON body, validate `token` is a non-empty string (400 `ApiResponse<never>` if not), derive `ipHash` exactly as the old `GET` did (`x-forwarded-for` → `sha256Hex`, unchanged), call `confirmAlert(token, ipHash)` (unchanged), map outcome to `ApiResponse<T>` per AC-3/AC-4.
  - [ ] 6.5 `web/src/app/api/alerts/confirm/route.test.ts` (MODIFY): rewrite from `GET(...)`/`Location`-header assertions to `POST(...)`/`ApiResponse<T>` body assertions.
  - [ ] 6.6 `web/src/app/alerts/confirm/page.test.tsx` (CREATE): RTL, mock `next/navigation` `redirect`, `next/link`, `@/db/queries/alerts`. Cover: `pending_doi`-valid renders button; `active` renders button; `cancelled`/expired-`pending_doi`/missing/unknown token all redirect to `/alerts/expired` with correct `?slug=` presence (mirror the existing oracle rule test coverage).
  - [ ] 6.7 `web/src/components/AlertConfirmButton.test.tsx` (CREATE): RTL + mocked `fetch`. Cover: success → `router.push` called with the right URL; failure → inline error rendered, no navigation.
  - [ ] 6.8 `web/src/db/queries/alerts.test.ts` (MODIFY): add coverage for `getAlertPreviewByToken` — found (`pending_doi`), found (`active`), found (`cancelled`), not found.
  - [ ] 6.9 Doc sync (tracked here, already partially done by the correct-course pass itself — verify still consistent after implementation): `AGENTS.md` route table, this story's own "Why POST now returns `ApiResponse<T>`" note below, `docs/solutions/architecture/rodo-consent-integrity.md` retraction, `_bmad-output/planning-artifacts/epics.md` Story 6.2 AC text.
  - [ ] 6.10 verify — `npx tsc --noEmit`, `npx eslint`, `npm run test:run` clean; add an explicit test asserting `GET /alerts/confirm` performs **zero** DB writes under every input (not just inspection — this is the exact property that was violated).

## Dev Notes

### Confirm flow decision table

The epics AC text (`_bmad-output/planning-artifacts/epics.md` lines 1719–1749) does not fully specify the branch logic — it only names two end states ("valid → active", "expired/not-found → /alerts/expired") plus one idempotency case. Implement `confirmAlert()` per this table (fills the gaps deliberately, do not invent alternatives):

| Lookup result | Action |
|---|---|
| No row for `confirmation_token = token` | → `{ outcome: 'expired', gameSlug: null }` — no slug to show, since no row was found (see note below on why this is not an anti-enumeration guarantee) |
| Row found, `status = 'active'` | → `{ outcome: 'already_confirmed' }` — **no** new `consent_log` write (AC-3: idempotent, not a fresh confirmation event) |
| Row found, `status = 'cancelled'` | → `{ outcome: 'expired', gameSlug: row.gameSlug }` — a cancelled alert must never be silently reactivated by replaying an old confirm link (security: this is the only place a stale link could resurrect an unsubscribed user) |
| Row found, `status = 'pending_doi'`, `token_issued_at` > 48h ago | → `{ outcome: 'expired', gameSlug: row.gameSlug }` |
| Row found, `status = 'pending_doi'`, `token_issued_at` ≤ 48h ago | activate + record consent in ONE statement (see below) → `{ outcome: 'confirmed' }` |

> **Updated post-implementation:** the TTL is measured from `token_issued_at`, not `created_at` — a re-subscribe rotates the token and restarts that clock, so measuring from row creation made a re-issued token arrive already expired (P1 found in review, fixed in `f683dc9`). Activation and its `consent_log` INSERT run as a single data-modifying CTE, not two statements, because the neon-http driver has no transactions and the pairing must be atomic — see `docs/solutions/architecture/rodo-consent-integrity.md`.

Compute the 48h check in JS (`Date.now() - row.token_issued_at.getTime() > 48 * 60 * 60 * 1000`) — `token_issued_at` comes back as a JS `Date` from the `timestamptz` column via Drizzle, same as every other timestamp read in this codebase.

> **This table describes `confirmAlert()`, which the 2026-07-26 correct-course does not touch.** Only the HTTP verb wrapping it changes (GET → POST) — see the next section.

### Correct-course decision table (2026-07-26) — GET page vs. POST, and why

Party-mode 2026-07-24 (`docs/solutions/architecture/rodo-consent-integrity.md`) found that a plain `GET` mutating state lets email security scanners (Outlook SafeLinks, Proofpoint, antivirus link-preview) silently activate alerts before a human clicks — RFC 7231 requires GET to be *safe*, and the resulting `consent_log` row would carry the scanner's `ip_hash` as if it were the user's. Fix: split the mail-clicked `GET` into a side-effect-free page, and move the mutation behind an explicit-click `POST`.

| `getAlertPreviewByToken` result | `GET /alerts/confirm` renders | `POST /api/alerts/confirm` (on click) |
|---|---|---|
| Not found | `redirect('/alerts/expired')` — no slug | never reached |
| `status = 'cancelled'` | `redirect('/alerts/expired?slug=' + gameSlug)` | never reached |
| `status = 'pending_doi'`, TTL expired | `redirect('/alerts/expired?slug=' + gameSlug)` | never reached |
| `status = 'pending_doi'`, TTL valid | Summary + `AlertConfirmButton` | `confirmAlert()` → `'confirmed'` (fresh) |
| `status = 'active'` | Summary + `AlertConfirmButton` (idempotent replay is fine — button still works) | `confirmAlert()` → `'already_confirmed'` |
| (rare race: valid at GET, expired/cancelled by click time) | — | `confirmAlert()` → `'expired'` → `ApiResponse<never>`, inline error, no redirect (AC-4) |

Do **not** duplicate the 48h math with a separate constant — the page's TTL check is display-only (decides render vs. redirect) and must import `CONFIRMATION_TOKEN_TTL_MS` from `alerts.ts` so it can never drift from what `confirmAlert()` actually enforces. The rare-race row exists because the GET-time check and the POST-time check are two different requests, seconds apart — this is expected and AC-4 handles it without needing a `gameSlug` on the failure response (the common case never reaches `POST` at all, per the redirect rows above).

### Why `/alerts/confirmed` and `/alerts/expired` carry `?token=` / `?slug=`, not raw game data

The epics AC says the confirm route "redirects to `/alerts/confirmed`" with no query params specified, but the same epic also requires that page to echo the game name and target price. There is no other way for that page (a fresh page load from an email client, zero client state) to know which alert to show. Resolution: redirect with `?token=<value>` and have the `/alerts/confirmed` page re-look-up the alert by token (`getAlertSummaryByToken`, scoped to `status = 'active'` rows only — read-only, no side effects, safe to call on every repeat visit). This keeps the confirmation token as the single identifier throughout the flow instead of introducing a new leaky identifier (e.g. a raw numeric `price_alerts.id` in the URL, which would let anyone enumerate other users' game+price choices).

`/alerts/expired` gets `?slug=` (not `?token=`) because by definition its whole point is "this token is no longer valid" — passing the dead token to it serves no purpose. The slug is pass-through display data only (not sensitive), safe to put in a URL.

### The `?slug=` presence oracle is accepted, not a defect

Because the slug is appended only when the token *was* found, its presence tells the visitor whether a token exists in the database. An earlier draft of these notes called that a leak to be avoided; **that was wrong and is retired here** (decision 2026-07-22, after code review flagged the contradiction with AC-2).

Anti-enumeration matters when the identifier is guessable. It is not here: the token is 32 random bytes, so reaching the oracle at all requires already holding a valid token — and anyone holding a *live* one already learns strictly more from `/alerts/confirmed`, which echoes the game name and target price. Removing the slug would buy nothing while breaking the common, legitimate path: expiry is frequent with a 48h window, and the slug is what lets a late clicker return to `/gra/{slug}` and re-subscribe in one click instead of hunting for the game from the home page.

Where the anti-enumeration rule genuinely applies in this codebase is `subscribeAlert`, which hides whether an **email address** is suppressed — a guessable identifier. That is implemented and must stay.

### Why POST now returns `ApiResponse<T>` (reverses this story's original exception)

~~CLAUDE.md: "Każdy API Route musi zwracać `ApiResponse<T>`" — this route is the one deliberate exception. `GET /api/alerts/confirm` is never called via `fetch()`; it is the target of a link a human clicks from their email client, so its only correct response is an HTTP redirect the browser follows. ... Story 6.3 (`/api/alerts/unsubscribe`) will be the same kind of exception; treat this as the established pattern for token-driven redirect routes, not a one-off hack.~~

**Reversed 2026-07-26 (correct-course).** The reasoning above was correct for a route that a mail client clicks directly — but as of this correction, `/api/alerts/confirm` is no longer that route. The mail-clicked link now points to `GET /alerts/confirm`, a **page**, which is not an API route at all and has nothing to except. `POST /api/alerts/confirm` is `fetch()`-ed from `AlertConfirmButton`, our own client component, so it **must** follow the normal rule and return `ApiResponse<T>` (AC-3/AC-4) — exactly like `.../alerts/subscribe/route.ts`.

**Consequence for Story 6.3:** the forward-reference above ("6.3 will be the same kind of exception") is now wrong and must not be copied — 6.3's `POST /api/alerts/unsubscribe` is a greenfield mirror of *this* corrected pattern (page + button + `POST` returning `ApiResponse<T>`), not of the original GET-redirect shape. `web/src/app/api/revalidate/route.ts` and `.../alerts/subscribe/route.ts` remain the two other `ApiResponse<T>`-returning, `fetch()`-consumed routes this pattern was always modeled on.

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

- `app/api/alerts/confirm/route.ts` keeps its **static** path with the token as a query string parameter (`?token=`) — unchanged by the correction, still matching the `subscribe` route's shape. **Do not** create a dynamic segment (`app/api/alerts/confirm/[token]/route.ts`) — an earlier note in Story 6-1b's Dev Notes speculatively mentioned `[token]` dynamic folders for 6.2/6.3; superseded, as before.
- `app/alerts/confirmed/page.tsx` and `app/alerts/expired/page.tsx` are unchanged by the correction. `app/alerts/confirm/page.tsx` (correct-course, new) is a third sibling under the same `app/alerts/` directory — same layout inheritance (`SiteHeader`/`SiteFooter` from root `layout.tsx`), same "no `sitemap.ts` entry" rule below.
- `AlertConfirmButton.tsx` (correct-course, new) goes in `web/src/components/`, alongside `AlertSubscribeForm.tsx` — not colocated with the page, matching this codebase's existing split between route files and reusable components.
- Both new pages are personal/transient (post-redirect, not link-worthy) and out of scope for `sitemap.ts` (`web/src/app/sitemap.ts` — do not add them there) — no story requires it and neither page has stable, indexable content per visit. This now also applies to `alerts/confirm/page.tsx`.

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
- [Source: docs/solutions/architecture/rodo-consent-integrity.md, "ROZSTRZYGNIĘTE: skanery linków" + "Rozstrzygnięcia sesji ustaleniowej (party-mode 2026-07-24)"] — full rationale for the GET→page/POST split this correct-course implements
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-07-26.md] — the correct-course proposal this Task 6 / AC 1–4/10 implement verbatim

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

- ~~**`created_at` is never refreshed on re-subscribe (P1).**~~ Fixed 2026-07-22 in a follow-up
  commit: new `price_alerts.token_issued_at` column carries the TTL, and the upsert rotates the
  token exactly when the current one is unusable (cancelled, or a `pending_doi` token past 48h).
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
| 2026-07-26 | Correct-course (party-mode 2026-07-24 RODO decision): status `done` → `in-progress`. AC 1–4 replace the old GET-mutates flow with a side-effect-free GET page + explicit POST; AC 10 added (UX tone). `ApiResponse<T>` exception reversed for `POST`. Task 6 added. Zero changes to `confirmAlert()`. See `sprint-change-proposal-2026-07-26.md`. |
