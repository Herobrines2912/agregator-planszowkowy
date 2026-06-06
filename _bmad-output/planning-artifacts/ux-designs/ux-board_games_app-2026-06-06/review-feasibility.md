# Feasibility Review — Agregator Cen Planszówek UX Design

_Reviewer: feasibility agent | Input: DESIGN.md + EXPERIENCE.md + mockup HTML files + PRD | Date: 2026-06-07_

## Summary Table

| ID  | Finding | Severity |
|-----|---------|----------|
| B-1 | Flipper Mode: `/flipper` route vs. view toggle conflict z PRD FR-16 | BLOCKING |
| B-2 | Confirmation landing `/alerty/potwierdz/{token}` — brak projektu UX | BLOCKING |
| B-3 | Token expiry: 24h (modal) vs. 48h (PRD C-4) | BLOCKING |
| B-4 | Email send failure state — niezaprojektowany | BLOCKING |
| B-5 | `localStorage` view toggle: SSR/hydration mismatch w Next.js 14 | BLOCKING |
| B-6 | Filter panel: layout i opcje niezaprojektowane | BLOCKING |
| B-7 | Resend link w Step 2 vs. PRD A-2 (poza zakresem MVP) | BLOCKING |
| NB-1 | SVG chart Y-axis musi być dynamiczny; polyline + dasharray advisory | Non-blocking |
| NB-2 | Stagger animation: 8 nth-child rules; użyj inline style dla kart 9+ | Non-blocking |
| NB-3 | "Mobile-responsive MVP" niezdefiniowane; viewport meta desktop-locked | Non-blocking |
| NB-4 | Search results page TBD; header search nie ma celu | Non-blocking |
| NB-5 | Brevo SMTP: SPF/DKIM/DMARC setup nieuwzględniony w planie | Non-blocking |
| OB-1 | ISR-cached price chip może być stale w modalu | Advisory |
| OB-2 | `stroke-dasharray: 1000` psuje się dla ścieżek > 1000px | Advisory |

## Blocking Findings

### B-1 — Flipper Mode: dedykowana trasa vs. view toggle
EXPERIENCE.md definiuje `/flipper` jako osobną trasę. PRD FR-16 i §9 IA table mówią "view toggle, nie URL." Architektury wzajemnie się wykluczają.

### B-2 — Confirmation landing page niezaprojektowana
PRD §9 definiuje `/alerty/potwierdz/{token}`. EXPERIENCE.md opisuje Step 3 tylko jako stan modala na `/gra/[slug]`. Link w emailu klika użytkownik w innej sesji — modal nie istnieje.

### B-3 — Token expiry: 24h vs. 48h
Modal Step 2 mówi "Link ważny 24 godziny." PRD C-4 i A-2 mówią 48 godzin. Backend i kopia user-facing nie mogą być jednocześnie poprawne.

### B-4 — Email send failure state niezaprojektowany
EXPERIENCE.md wprost oznacza to jako [NOTE FOR UX]. Gdy Brevo odrzuci email — modal nie ma stanu do przejścia.

### B-5 — localStorage view toggle: Next.js 14 SSR/hydration mismatch
Serwer renderuje card view (brak dostępu do localStorage). Klient czyta localStorage przy hydration i może przełączyć na list view → layout flash + React hydration mismatch error. Rozwiązanie: two-pass render, URL parameter (`?view=list`), lub akceptacja flashu jako known behavior MVP.

### B-6 — Filter panel całkowicie niezaprojektowany
Przycisk "Filtry (n)" jest ostylowany, panel który otwiera — nie istnieje. Opcje filtrów, layout (modal vs. inline expand), zachowanie apply/dismiss — wszystko TBD.

### B-7 — Resend link vs. PRD A-2
Step 2 renderuje "wyślij ponownie." PRD A-2: resend flow jest poza zakresem MVP. Martwy UI element jeśli endpoint nie istnieje.

## Non-blocking Findings

### NB-1 — SVG chart: Y-axis musi być dynamiczny
Formuła Y-axis jest tylko w komentarzu HTML mockupu (hardcoded 60–240 zł). W produkcji range musi być dynamiczny. Dodaj `pathLength="1000"` do `<polyline>` prewencyjnie.

### NB-2 — Stagger animation: karty 9+ animują się jednocześnie
Tylko 8 `nth-child` rules. Użyj `style={{ animationDelay: \`${Math.min(index * 0.07, 0.7)}s\` }}` w komponencie karty.

### NB-3 — Viewport meta desktop-locked
Wszystkie mockupy używają `width=1280`. W Next.js layout użyj `width=device-width, initial-scale=1`. Mobile layout traktuj jako Phase 3.

### NB-4 — Search results page TBD
`/szukaj?q=` całkowicie niezaprojektowana. Header search input nie ma celu. Zdecyduj scope MVP przed wdrożeniem headera.

### NB-5 — Brevo SMTP: konfiguracja DNS poza planem
Wymagane przed wysyłką: SPF `include:spf.brevo.com`, DKIM key, DMARC policy, test deliverability.
