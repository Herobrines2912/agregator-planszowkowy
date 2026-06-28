---
baseline_commit: edf230b
---

# Story 6.1a: AlertSubscribeForm — Frontend (Dev A)

**Status:** review
**Epic:** 6 — Email Price Alerts
**Dev:** Dev A (Web)
**Depends on:** Story 4.1 (done ✅)
**Mock data OK:** Yes — API route created by Dev B in parallel (contract defined below); mock API in tests

> **SPLIT STORY:** Story 6.1 is divided. Dev A does frontend only (`AlertModal.tsx`, `AlertSubscribeForm.tsx`, `page.tsx` update). Dev B does API/DB in parallel (`app/api/alerts/subscribe/route.ts`, `db/queries/alerts.ts`). Zero file conflicts.

---

## User Story

As a **user**,
I want to set up a price alert for a specific game by entering my email and target price,
So that I'll be notified when the price drops to a level I'm willing to pay.

---

## Acceptance Criteria

### AC-1 — "Ustaw alert" button on Game Passport page

- Given `app/gra/[slug]/page.tsx`
- When rendered
- Then a "Ustaw alert" button is visible in the right column (above the BestDealBanner placeholder)
- And clicking it opens `AlertSubscribeForm` modal overlay (State 1)
- The button has `data-testid="ustaw-alert-btn"`, style: background `#3D5C3A`, text white, border-radius `8px`, font-size `14px`, font-weight `700`, padding `10px 20px`

### AC-2 — AlertModal overlay (UX-DR9)

- Given the modal is open
- When rendered
- Then the backdrop covers the viewport: `position: fixed`, `inset: 0`, `z-index: 200`, `background: rgba(44,31,20,0.5)`, `backdrop-filter: blur(3px)`
- And the modal container: `width: 368px`, `border-radius: 16px`, background `var(--color-surface)`, centered on screen
- And it has `aria-modal="true"`, `role="dialog"`, `aria-labelledby` pointing to the modal title id
- And pressing Escape closes the modal without submitting
- And keyboard focus is trapped within modal (Tab/Shift+Tab cycles through focusable elements only)

### AC-3 — State 1: Form

- Given `AlertSubscribeForm` in State 1 (Form)
- When rendered
- Then it shows:
  - Modal title (h2, serif): "Ustaw alert cenowy" with `id` matching `aria-labelledby`
  - Email input: `type="email"`, placeholder `"twój@email.pl"`, `data-testid="email-input"`, full-width
  - Price threshold section: `type="number"` input (suffix "zł") AND range slider synchronized — slider `min="50"`, `max` = `maxPrice` prop (default `500`), `step="5"`, `data-testid="price-input"` / `data-testid="price-slider"`
  - Type B checkbox: label "Powiadamiaj też o przecenach > 50%", `data-testid="type-b-checkbox"`, **default checked**
  - RODO consent checkbox: label "Wyrażam zgodę na przetwarzanie adresu e-mail w celu wysyłki powiadomienia o cenie", `data-testid="consent-checkbox"`, **not pre-checked** (PKE 2024 — active consent required)
  - Age checkbox: label "Mam ukończone 16 lat", `data-testid="age-checkbox"`, **not pre-checked**
  - "Powiadom mnie" CTA button: `data-testid="submit-btn"`, disabled while fetching, background `#3D5C3A`
- And submission is rejected (button disabled + error shown) if consent or age checkbox is unchecked
- And a close button (×) in top-right corner: `data-testid="modal-close-btn"`, closes modal

### AC-4 — State 1: Client-side validation before POST

- Given user clicks "Powiadom mnie" with invalid email
- When validated
- Then error message shown inline: "Nieprawidłowy adres e-mail", no API call fired
- Given user clicks "Powiadom mnie" without checking consent
- Then error shown: "Zgoda na przetwarzanie danych jest wymagana", no API call
- Given user clicks "Powiadom mnie" without checking age
- Then error shown: "Wymagane potwierdzenie wieku (16+)", no API call

### AC-5 — State 1: POST to API

- Given all fields valid and checkboxes checked
- When user clicks "Powiadom mnie"
- Then `POST /api/alerts/subscribe` fires with JSON body:
  ```json
  {
    "email": "<value>",
    "targetPrice": "<number as string with 2 decimal places>",
    "typeBEnabled": <boolean>,
    "consentGiven": true,
    "ageConfirmed": true,
    "gameSlug": "<slug from props>"
  }
  ```
- And the button shows a loading state ("Wysyłam…", disabled) during fetch
- And on response `{ success: true, data: { message: string } }` → transitions to State 2
- And on response `{ success: false, error: string }` → shows error inline, stays in State 1, button re-enabled

### AC-6 — State 2: Pending DOI

- Given API returned `{ success: true, ... }` (State 2)
- When rendered
- Then modal shows:
  - Text: "Sprawdź skrzynkę i potwierdź otrzymywanie powiadomień"
  - Subtext: "Link ważny przez 48 godzin"
  - Prompt: "Nie widzisz? Sprawdź folder SPAM"
  - Resend link placeholder: `<button data-testid="resend-link">` with text "Wyślij ponownie" (non-functional placeholder — future story)
  - Form inputs are hidden
- And close button still works

### AC-7 — State 3: Success (UI-only for now)

- Given `initialState="success"` prop passed (future wiring by Story 6.2)
- When rendered
- Then modal shows:
  - Green checkmark circle (CSS — `background: #3D5C3A`, white ✓ icon, `border-radius: 50%`, `width: 56px`, `height: 56px`)
  - Heading: "Powiadomienie aktywne!"
  - Summary card: "Twój cel: [target price] zł" + "AKTYWNY" badge (background `#3D5C3A`, white text, `border-radius: 12px`, `font-size: 11px`)
  - Note: `gameName` prop displayed in summary card
- State 3 is used only via prop for now; Story 6.2 will wire the redirect

---

## Dev Notes & Guardrails

### Naming conflict: AlertForm vs AlertSubscribeForm

The epics spec (Story 6.1) lists `components/AlertForm.tsx` as the file path. Architecture lists `AlertSubscribeForm.tsx` and `AlertSubscribeForm.test.tsx`. **Use `AlertSubscribeForm`** — architecture is authoritative for directory structure and the name is more descriptive (CLAUDE.md: DOMENOWE naming).

Additionally, Story 7.6 references `AlertModal.tsx (reuse z 6.1)` — create it as a **separate reusable file**. This story creates two files: `AlertModal.tsx` (generic overlay) and `AlertSubscribeForm.tsx` (uses AlertModal).

### API endpoint: confirmed `POST /api/alerts/subscribe`

Epics spec says `POST /api/alerts`; architecture says `POST /api/alerts/subscribe`. **Confirmed:** use `/api/alerts/subscribe` (architecture path — aligns with future `/api/alerts/confirm` and `/api/alerts/unsubscribe` siblings). Dev B must create `app/api/alerts/subscribe/route.ts` (NOT `app/api/alerts/route.ts`). This decision is final and was confirmed by the product owner.

### File list

| File | Action | Notes |
|------|--------|-------|
| `web/src/components/AlertModal.tsx` | CREATE | Generic modal overlay; reused in Story 7.6 |
| `web/src/components/AlertSubscribeForm.tsx` | CREATE | 3-state form using AlertModal |
| `web/src/components/AlertSubscribeForm.test.tsx` | CREATE | Vitest + @testing-library |
| `web/src/app/gra/[slug]/page.tsx` | MODIFY | Add "Ustaw alert" button + import |

**Dev B files (do NOT touch):**
- `web/src/app/api/alerts/subscribe/route.ts` — Dev B creates this
- `web/src/db/queries/alerts.ts` — Dev B creates this

### API contract (for tests — Dev B implements)

```typescript
// POST /api/alerts/subscribe
// Request body:
interface AlertSubscribeRequest {
  email: string
  targetPrice: string           // "89.99" — 2 decimal places
  typeBEnabled: boolean
  consentGiven: true            // always true (validated on backend too)
  ageConfirmed: true            // always true (validated on backend too)
  gameSlug: string
}

// Response (ApiResponse<T> from types/api.ts):
type AlertSubscribeResponse =
  | { success: true; data: { message: string } }
  | { success: false; error: string }
```

### 'use client' — required

Both `AlertModal.tsx` and `AlertSubscribeForm.tsx` use `useState`, `useEffect`, DOM event listeners → `'use client'` at the top of each file.

### Focus trap implementation

No library installed for focus-trapping. Use `useEffect` pattern. **Critical:** re-query focusable elements inside the `keydown` handler (not captured once on mount) so the trap stays correct after form state transitions (State 1→2 swaps the focusable set — inputs disappear, close/resend appear):

```typescript
// Include formState in deps so the effect re-runs after each state transition
useEffect(() => {
  if (!open) return
  // Focus first focusable element on open / state change
  const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
    'button, input, [tabindex]:not([tabindex="-1"])'
  )
  firstFocusable?.focus()

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key !== 'Tab') return
    // Re-query on every keydown — list changes across states
    const focusable = Array.from(
      modalRef.current?.querySelectorAll<HTMLElement>(
        'button, input, [tabindex]:not([tabindex="-1"])'
      ) ?? []
    )
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }
  document.addEventListener('keydown', onKeyDown)
  return () => document.removeEventListener('keydown', onKeyDown)
}, [open, onClose, formState])  // formState in deps — re-run when state transitions
```

### Price input + slider sync

Number input and range slider must stay in sync via `value` state:
- `targetPrice` state (number, default 150)
- `<input type="number">` and `<input type="range">` both read from same state
- onChange on either updates the state → both re-render in sync
- Format to 2 decimal places only when building the POST body: `targetPrice.toFixed(2)`

### State machine

```
initialState (default: 'form')
  ↓ success POST
'pending'
  ↓ (via prop or future redirect)
'success'
```

Internal `type FormState = 'form' | 'pending' | 'success'`

### AlertModal props interface

```typescript
interface AlertModalProps {
  open: boolean
  onClose: () => void
  title: string
  titleId: string
  children: React.ReactNode
}
```

### AlertSubscribeForm props interface

```typescript
interface AlertSubscribeFormProps {
  gameSlug: string
  gameName: string
  maxPrice?: number          // range slider max; default 500
  initialState?: FormState   // default 'form'; Story 6.2 uses 'success'
}
```

The component manages `open` (modal visibility) internally. The "Ustaw alert" trigger button is INSIDE the component. `page.tsx` just renders `<AlertSubscribeForm gameSlug={slug} gameName={game.name} />`.

### page.tsx modification — what to preserve

Current `web/src/app/gra/[slug]/page.tsx` has:
- GameJsonLd, OfferJsonLd (do NOT remove)
- breadcrumb nav (do NOT touch)
- Left column: `<GameMeta game={game} />` (do NOT touch)
- Right column: 3 placeholder divs (BestDealBanner, PriceTable, PriceChart — do NOT remove, still needed)

Add `<AlertSubscribeForm>` in the right column, above the BestDealBanner placeholder. The component self-contains the button + modal overlay, so page.tsx just imports and renders it.

```tsx
// In right column, before BestDealBanner placeholder:
<AlertSubscribeForm gameSlug={slug} gameName={game.name} />
```

Import: `import { AlertSubscribeForm } from '@/components/AlertSubscribeForm'`

### Inline styles — project convention

No Tailwind utility classes in JSX. Use inline `style={{ ... }}` with `var(--color-*)` tokens where available. Check `web/src/app/globals.css` for available CSS variables (`--color-surface`, `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`, `--color-border`, `--color-surface-header`).

### Error display pattern

Use an inline `<p>` with red text below each field or below the submit button:
```tsx
{error && (
  <p data-testid="form-error" style={{ color: '#C42B2B', fontSize: '13px', margin: '4px 0 0' }}>
    {error}
  </p>
)}
```

### RODO compliance notes (frontend responsibilities)

- Consent checkbox: not pre-checked (PKE 2024 — user must actively opt in)
- Age checkbox (16+): not pre-checked, required — rejection if unchecked
- Neither checkbox value is stored separately; backend writes `consent_log` row as proof
- Never log or expose email in console/error messages (Dev B handles hashing, but frontend should not echo raw email to console either)

### ApiResponse<T> type

Import from `@/types/api.ts`:
```typescript
import type { ApiResponse } from '@/types/api'
```
Use `ApiResponse<{ message: string }>` for the response type.

---

## Tests (AlertSubscribeForm.test.tsx)

Framework: Vitest + @testing-library/react (same as FilterBar.test.tsx, GameMeta.test.tsx).

Mock `fetch` with `vi.fn()`. Mock `next/navigation` if needed (not strictly required since AlertSubscribeForm doesn't use router).

**Required test cases:**

```
1. Renders "Ustaw alert" trigger button (not open by default)
2. Clicking trigger button opens modal with State 1 form
3. State 1: email, price number input, price slider, type-B checkbox (checked), consent checkbox (unchecked), age checkbox (unchecked), submit button
4. Close button (×) closes modal
5. Escape key closes modal
6. Submit without consent → error "Zgoda na przetwarzanie danych jest wymagana", no fetch
7. Submit without age check → error "Wymagane potwierdzenie wieku (16+)", no fetch
8. Submit with invalid email → error "Nieprawidłowy adres e-mail", no fetch
9. Valid submit → fetch called with correct URL and body
10. POST success → transitions to State 2 (Pending DOI), email input hidden, "Sprawdź skrzynkę" text shown
11. POST error → error message shown, still in State 1
12. initialState="success" prop → State 3 shown, "Powiadomienie aktywne!" heading
```

---

## Patterns from previous stories

- **Client Component with useState**: see `FilterBar.tsx`, `DealCard.tsx`, `ListRow.tsx` — always `'use client'` at top
- **No Tailwind in JSX**: all components use inline styles
- **Test mocking next/navigation**: see `FilterBar.test.tsx` — `vi.mock('next/navigation', ...)`
- **data-testid**: all interactive elements and state-dependent outputs get `data-testid`
- **formatNull**: not needed in AlertForm (all values user-entered, never null)
- **assertNever**: not needed in AlertForm (no `.$type<>()` switch)
- **Naming**: `AlertSubscribeForm` → file `AlertSubscribeForm.tsx`, export function `AlertSubscribeForm`

---

---

## Tasks/Subtasks

- [x] T1: Create `AlertModal.tsx` — generic reusable modal overlay (backdrop, focus trap, Escape close, aria-modal)
- [x] T2: Create `AlertSubscribeForm.tsx` — 3-state form (form/pending/success) with validation and POST
- [x] T3: Create `AlertSubscribeForm.test.tsx` — 12 test cases covering all ACs
- [x] T4: Modify `web/src/app/gra/[slug]/page.tsx` — add AlertSubscribeForm in right column above BestDealBanner

---

## Dev Agent Record

### Implementation Notes

- Implemented `AlertModal` as a standalone reusable component (no `formState` prop — focus trap re-queries live on each keydown per advisor guidance)
- Submit button stays clickable always, only `disabled={loading}` during fetch — validation errors shown onClick (AC-3 "button disabled" refers to disabled-while-fetching)
- Validation order: email → consent → age (deterministic, tested in T6/T7/T8)
- `initialState="success"` sets `open=true` immediately for future Story 6.2 redirect flow
- All styles use literal hex where tests assert (e.g. `#3D5C3A`) — CSS variables only for non-asserted styles
- `targetPrice.toFixed(2)` produces string "150.00" in POST body as required

### Completion Notes

All 12 required test cases pass. 155 tests total passing (5 PriceChart failures are pre-existing, confirmed by git stash check). All 7 ACs satisfied. No regressions introduced by this story.

---

## File List

- `web/src/components/AlertModal.tsx` — CREATED
- `web/src/components/AlertSubscribeForm.tsx` — CREATED
- `web/src/components/AlertSubscribeForm.test.tsx` — CREATED
- `web/src/app/gra/[slug]/page.tsx` — MODIFIED (added AlertSubscribeForm import + render)

---

## Change Log

- 2026-06-28: Story 6.1a implemented — AlertModal + AlertSubscribeForm (3 states) + 12 tests (155 passing). Page.tsx updated with "Ustaw alert" button above BestDealBanner.

---

## Out of scope (Dev B, different stories)

| What | Story |
|------|-------|
| `POST /api/alerts/subscribe` route implementation | 6.1b (Dev B) |
| `db/queries/alerts.ts` (createAlert, upsert logic) | 6.1b (Dev B) |
| Brevo DOI email sending | 6.4 (Dev B) |
| `/api/alerts/confirm` route | 6.2 (Dev A — later) |
| `/alerts/confirmed` page | 6.2 (Dev A — later) |
| `/api/alerts/unsubscribe` route | 6.3 (Dev A — later) |
