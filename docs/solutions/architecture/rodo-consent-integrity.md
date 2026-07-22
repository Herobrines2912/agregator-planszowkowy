---
title: RODO / consent_log — Integralność Zapisów Zgody (ustalenia z implementacji Story 6.2)
date: 2026-07-21
category: architecture
module: "web/src/db/queries/alerts.ts, web/src/app/api/alerts/* — Epic 6 (email alerts, double opt-in)"
problem_type: architecture
component: database
severity: high
status: częściowo ustalone — patrz sekcja "Status decyzji"
applies_when:
  - "Dowolna zmiana stanu w price_alerts lub email_suppressions, która musi sparować się z wpisem w consent_log (architecture L-4)"
  - "Story 6.3 (unsubscribe), 6.5 (alert engine), 6.8 (Brevo webhook suppression) — każde robi ten sam sparowany zapis"
  - "Projektowanie linków klikanych z maila (confirm, unsubscribe) i tego, co uznajemy za dowód zgody"
  - "Rozważanie transakcji, batchy lub wielokrokowych zapisów na driverze neon-http"
tags: [rodo, gdpr, consent-log, double-opt-in, neon-http, transactions, atomicity, epic-6, alerts]
---

# RODO / consent_log — Integralność Zapisów Zgody

Dokument zbiera **wszystko, co ustaliliśmy o RODO podczas implementacji Story 6.2**
(Double Opt-In Confirmation). Powstał jako briefing dla osobnej, pełniejszej sesji
ustaleniowej (`bmad-help` + agenci) — część rzeczy jest **zdecydowana**, część
**otwarta**. Sekcja „Status decyzji" na końcu mówi wprost, co jest czym.

## Kontekst

Epic 6 buduje powiadomienia cenowe z double opt-in:

1. Story 6.1a/6.1b — formularz + `POST /api/alerts/subscribe` → `price_alerts` ze
   `status = 'pending_doi'` + `consent_log(action='opt_in_requested')`
2. Story 6.4 — klient Brevo wysyła maila DOI z linkiem potwierdzającym
3. **Story 6.2** — `GET /api/alerts/confirm?token=` → `status = 'active'` +
   `consent_log(action='opt_in_confirmed')`
4. Story 6.3 (backlog) — `GET /api/alerts/unsubscribe?token=` → `status = 'cancelled'` +
   `consent_log(action='unsubscribed')`

## Obowiązujące inwarianty

Z `CLAUDE.md` i `architecture.md` (L-2 … L-5):

- **`consent_log` jest append-only.** Nigdy DELETE, nigdy UPDATE. Wpis raz zapisany
  jest nie do naprawienia — to podstawa oceny wszystkich decyzji poniżej.
- **Każda operacja na `price_alerts` i `email_suppressions` MUSI mieć odpowiadający
  wpis w `consent_log`** (architecture L-4, RODO art. 7 — rozliczalność zgody).
- `email_hash` = SHA-256(email.toLowerCase()); surowy adres tylko w tabelach
  operacyjnych, hash w audycie (L-2).
- `ip_hash` czyszczony do NULL po 12 miesiącach, anonimizacja adresów po 3 latach (L-5,
  cron `maintenance.yml`, przebiegi zapisywane w `data_retention_log`).
- Token potwierdzający: 32 losowe bajty hex, ważny **48h**.

## Twarde ograniczenie techniczne: brak transakcji

Aplikacja używa **`drizzle-orm/neon-http`** (`web/src/db/index.ts`) — driver HTTP.

- `db.transaction()` **rzuca wyjątkiem**: `"No transactions support in neon-http driver"`
  (`node_modules/drizzle-orm/neon-http/session.js:152`). Transakcje interaktywne są
  niedostępne, kropka.
- `db.batch([...])` **jest** atomowy — mapuje się na `client.transaction(builtQueries)`
  (`session.js:131`) — ale zapytania muszą być zbudowane z góry; nie da się rozgałęzić
  na wyniku poprzedniego zapytania w obrębie batcha.
- Wersje: `drizzle-orm ^0.45.2`, `@neondatabase/serverless ^1.1.0`.

**Konsekwencja dla RODO:** sparowanego zapisu (zmiana stanu + wpis zgody) **nie da się
zrobić dwoma osobnymi statementami bez okna niespójności.** To nie jest teoretyczne —
patrz niżej.

## Ustalenie 1: sparowany zapis musi być jednym statementem

### Problem znaleziony w Story 6.2

Pierwsza implementacja `confirmAlert()` robiła dwa osobne zapisy: UPDATE statusu, potem
INSERT do `consent_log`. Jeśli INSERT padnie po udanym UPDATE:

- alert jest `active` → użytkownik dostaje maile,
- w `consent_log` **nie ma dowodu zgody**,
- i jest to **nieodwracalne**: ponowne kliknięcie linku trafia w gałąź
  `status = 'active'` → `already_confirmed` → nigdy nie dopisze brakującego wpisu.

Kontrast: `subscribeAlert()` ma ten sam wzorzec, ale **leczy się sam** — ON CONFLICT
zostawia `pending_doi`, więc ponowne wysłanie formularza dopisze `consent_log`.
`confirmAlert()` po flipie statusu zamyka drogę na zawsze.

### Scenariusze awarii

Okno ryzyka to przerwa między dwoma round-tripami HTTP — otwiera się przy **każdym**
potwierdzeniu, nie tylko „czasem".

| # | Zdarzenie | 2 statementy (UPDATE→INSERT) | Odwrócona kolejność (INSERT→UPDATE) | Jeden statement (CTE) |
|---|---|---|---|---|
| S1 | Bez awarii | OK | OK | OK |
| S2 | Timeout/reset sieci między zapisami | alert `active`, **brak zgody** — nieodwracalne | wpis jest, alert `pending_doi` → retry doda **drugi** wpis | nic albo komplet; retry leczy |
| S3 | Vercel ubija funkcję między `await` (timeout, OOM, deploy) | jak S2 | jak S2 | bezpiecznie |
| S4 | Neon odrzuca INSERT (constraint, limit połączeń) | jak S2 | alert nietknięty, wpis jest | rollback całości |
| S5 | Scale-to-zero: 1. statement budzi bazę, 2. trafia w restart | jak S2 | jak S2 | bezpiecznie |
| S6 | Dwa równoległe kliknięcia | guard łapie, 1 wpis | **2 wpisy** | 1 wpis |
| S7 | Zapis zacommitowany, odpowiedź zginęła | alert `active`, brak zgody | wpis jest, alert `pending_doi` | dane spójne, user widzi „wygasł", retry → sukces |

S2/S3/S5/S7 to normalna charakterystyka serverless + HTTP driver + scale-to-zero, nie
egzotyka.

### Rozwiązanie: data-modifying CTE

```sql
WITH updated AS (
  UPDATE price_alerts SET status='active', confirmed_at=now()
  WHERE id=$1 AND status='pending_doi'
  RETURNING id, email_hash
)
INSERT INTO consent_log (email_hash, action, source, token_id)
SELECT email_hash, 'opt_in_confirmed', 'user', id FROM updated
RETURNING id
```

Jedno zapytanie = atomowe z definicji Postgresa, jeden round-trip HTTP, zero zmian
w driverze. `db.execute()` na neon-http zwraca `FullQueryResults` z `.rows`, więc liczba
wierszy z `RETURNING` daje wynik wprost: **1 → `confirmed`, 0 → `already_confirmed`**.

Bonus: **wyścig załatwia się tym samym mechanizmem.** UPDATE bierze row lock
i re-ewaluuje `WHERE` po commicie konkurenta → przegrany dostaje 0 wierszy → CTE
`updated` jest puste → INSERT nie wstawia nic. Osobny guard w kodzie przestaje być
potrzebny.

### Dlaczego NIE warstwować „na wszelki wypadek"

Rozważaliśmy dołożenie odwróconej kolejności jako dodatkowej warstwy bezpieczeństwa
(„lepiej nadmiarowy wpis niż brak"). **Nie da się tego złożyć:**

- **Wariant dosłowny** (INSERT przed CTE) daje drugi wpis przy *każdym udanym*
  potwierdzeniu, nie tylko przy awarii — gwarantowany duplikat w tabeli append-only.
- **Wariant „fallback gdy CTE rzuci"** nie ma czego łapać: jeśli CTE rzucił, to albo nie
  zapisał **nic** (leczy retry), albo zapisał **komplet**. Nie istnieje przeplot,
  w którym pojedynczy statement zostawia połowę — to gwarancja Postgresa, nie kwestia
  szczęścia.

Różnica jakościowa: dziś stan „`active` bez zgody" jest *mniej lub bardziej
prawdopodobny*; po CTE jest **nieosiągalny**. Dokładanie drugiego zapisu nie podnosi
100% do 110% — degraduje wierność logu, który ma być dowodem 1:1 wobec organu
nadzorczego.

## Ustalenie 2: warstwa bezpieczeństwa = wykrywanie, nie drugi zapis

Zamiast dodatkowego zapisu — **zapytanie kontrolne** szukające alertów
`status = 'active'` bez odpowiadającego wpisu
`consent_log(action='opt_in_confirmed', token_id=id)`.

Dziś zwróci pustkę i o to chodzi: to dowód, a nie rytuał. Kandydaci na miejsce: test
integralności w suite albo krok w `maintenance.yml` (jest już `data_retention_log`
zapisujący przebiegi).

**Backfill w gałęzi `already_confirmed` byłby dziś udowodnialnie martwy** — przed Story
6.2 żaden kod nie ustawiał `status = 'active'`; `subscribeAlert()` w ON CONFLICT robi
wyłącznie `cancelled → pending_doi`. Nie ma zaległych niespójnych wierszy do wyleczenia.

## Otwarte: skanery linków a wiarygodność zgody

**To jest najpoważniejsza otwarta kwestia RODO, jaką znaleźliśmy** — i żadna warstwa
transakcyjna jej nie dotyka.

Skanery bezpieczeństwa poczty (Outlook SafeLinks, Proofpoint, antywirusy, podglądy
w klientach) robią **GET na każdy URL w wiadomości**, zanim człowiek kliknie. Nasz link
potwierdzający aktywuje alert samym GET-em. Skutki:

- alert może zostać potwierdzony **bez świadomej akcji użytkownika**,
- `consent_log` zapisze `source='user'` i `ip_hash` **skanera**, nie osoby — czyli dowód
  zgody wskazujący na bota,
- to samo dotyczy Story 6.3: skaner może **wypisać** użytkownika z powiadomień.

Rozważane wyjścia:

- **(a)** zostawić GET jako normę branżową i zaakceptować ryzyko,
- **(b)** strona pośrednia z przyciskiem „Potwierdzam" i POST-em ← **chwilowo się do
  tego skłaniamy**, decyzja niepodjęta,
- **(c)** zapisywać user-agent, żeby odróżnić prefetch od człowieka.

Uwaga: (b) zmienia kształt Story 6.2 i 6.3 (link z maila prowadzi na stronę, nie na
route API), więc decyzja powinna zapaść **przed** implementacją 6.3.

## Znalezione w code review (2026-07-22)

Przegląd 11 recenzentów na gotowej implementacji 6.2. Rzeczy istotne dla RODO, których wcześniejsza
analiza nie objęła:

- ~~**Ponowny zapis nie odświeża `created_at` — token rodzi się wygasły (P1).**~~ **NAPRAWIONE 2026-07-22.**
  Rozwiązanie: kolumna `price_alerts.token_issued_at` (`NOT NULL DEFAULT now()`, dodana ręcznie na
  Neonie — tabela była pusta, więc bez backfillu) niesie TTL zamiast `created_at`, a `ON CONFLICT`
  rotuje token wtedy i tylko wtedy, gdy obecny jest bezużyteczny: wiersz `cancelled` **albo**
  `pending_doi` z tokenem starszym niż 48h. Świeży `pending_doi` zostaje nietknięty, żeby korekta
  progu nie unieważniała linku, którego użytkownik może mieć otwartego w skrzynce; `active` nie
  jest ruszany nigdy (AC-4). Stała TTL jest przekazywana z TS jako parametr, więc nie może
  rozjechać się z tą, którą egzekwuje `confirmAlert`. Opis problemu zostawiony poniżej jako
  kontekst.

  Pierwotny opis: 
  `subscribeAlert` w `ON CONFLICT DO UPDATE` rotuje token dla wiersza `cancelled`, ale **nigdy nie
  ustawia `created_at`** — a to od niego liczy się TTL. Alert anulowany dawniej niż 48h temu po
  ponownym zapisie dostaje świeży token, który `confirmAlert` natychmiast uznaje za wygasły.
  Użytkownik nie ma żadnej drogi wyjścia. Wariant jeszcze cichszy: wiersz `pending_doi` starszy niż
  48h w ogóle nie rotuje tokenu (`CASE` łapie tylko `cancelled`), więc mail DOI wychodzi ze starym,
  martwym tokenem, a API raportuje sukces. Rozważane: dedykowana kolumna `token_issued_at`
  (semantycznie poprawne, wymaga migracji) albo reset `created_at` + rotacja tokenu dla każdego
  wiersza innego niż `active` (bez zmiany schematu). Naprawa w osobnym commicie.
- **Skanery linków — potwierdzone niezależnie przez cztery persony** (`security`, `correctness`,
  `adversarial`, `api-contract`). To wzmacnia argument za wariantem (b) z sekcji wyżej. Dotyczy
  także 6.3: skaner może użytkownika **wypisać**.
- **Token nigdy nie rotuje po użyciu.** Potwierdzony link zostaje wieczystą przepustką: kto go ma
  (przekazany mail, historia przeglądarki, logi), ten w każdej chwili odczyta nazwę gry i cenę
  progową z `/alerts/confirmed`. Rozważyć rotację lub wyzerowanie `confirmation_token` przy
  aktywacji i osobny token dla 6.3.
- **`?slug=` na `/alerts/expired` odróżnia nieznany token od prawdziwego martwego.** To sprzeczność
  wewnątrz samej story 6.2: AC-2 nakazuje slug, lista inwariantów zakazuje rozróżnialności.
  Rekomendacja: **zostawić slug, wycofać inwariant** — przy 256-bitowym tokenie oracle jest
  bezużyteczny (trzeba już mieć token), a aktywny token i tak ujawnia więcej przez
  `/alerts/confirmed`; usunięcie sluga psuje częstą, legalną ścieżkę powrotu na stronę gry.
  Inwariant anty-enumeracyjny ma sens tam, gdzie identyfikator jest zgadywalny — czyli przy
  adresach e-mail w `subscribeAlert`, i tam jest poprawnie wdrożony.
- **Surowy token może trafić do logów.** `DrizzleQueryError` wkleja treść zapytania i parametry do
  komunikatu (`drizzle-orm/errors.js:12`), a route loguje `err` w całości. Ten sam problem dotyczy
  `subscribe/route.ts`, gdzie parametrem jest adres e-mail.
- **Brak indeksu na `price_alerts.confirmation_token`** — każde kliknięcie w link to seq scan na
  tabeli rosnącej z każdym subskrybentem, na nieuwierzytelnionym endpoincie.

## Pozostałe obserwacje RODO zebrane po drodze

- **`ip_hash` jest best-effort, nie dowodem.** Pochodzi z `x-forwarded-for`, który jest
  ustawialny przez klienta i nieweryfikowany względem zaufanego proxy hopa
  (komentarz w `web/src/app/api/alerts/subscribe/route.ts`). Trafia do audytu jako
  kontekst, nigdy jako podstawa kontroli dostępu.
- **`price_alerts.created_at` jest nullable** (`defaultNow()` bez `notNull()`; ten sam
  wzorzec dotyczy 6 kolumn `created_at` w `schema.ts`). Wiek tokenu potwierdzającego
  opiera się na tej kolumnie, więc `confirmAlert()` traktuje NULL jako **wygasły**
  (odmowa zamiast akceptacji tokenu o niesprawdzalnym wieku). Docelowo: `notNull()`.
- **Brak katalogu migracji.** `web/drizzle.config.ts` wskazuje `out: '../db/migrations'`,
  a katalog nie istnieje i nie ma ani jednego pliku `.sql`. Każda zmiana schematu jest
  dziś **ręczną operacją na Neonie** — to podnosi koszt każdego „poprawmy schemat" i było
  argumentem za odłożeniem `created_at NOT NULL`.
- **Alert `cancelled` nie może zmartwychwstać.** Replay starego linku potwierdzającego na
  anulowanym alercie musi kończyć się jak wygasły — to jedyne miejsce, gdzie stary link
  mógłby cofnąć wypisanie się użytkownika.
- **Anti-enumeration ma lukę czasową.** W `subscribeAlert()` ścieżka „suppressed" pomija
  dwa zapisy i jest mierzalnie szybsza od „subscribed", mimo identycznej odpowiedzi.
  Ryzyko przyjęte świadomie (wymaga wielu żądań, brak rate limitingu czyni to
  teoretycznie wykonalnym) — udokumentowane w kodzie.
- **Route'y token-driven nie zwracają `ApiResponse<T>`** — świadomy wyjątek od reguły
  z `CLAUDE.md`: są klikane z maila, nigdy `fetch()`-owane, więc jedyną sensowną
  odpowiedzią jest redirect.

## Gdzie to uderzy dalej

- **Story 6.3 (unsubscribe)** — ten sam sparowany zapis (`active → cancelled` +
  `consent_log`), ten sam brak transakcji, ten sam problem skanerów. Musi użyć CTE.
- **Story 6.5 (alert engine)** — zapisy stanu wysyłki; sprawdzić, czy któryś wymaga
  sparowania z `consent_log`.
- **Story 6.8 (Brevo webhook → suppression)** — `email_suppressions` + `consent_log`
  (`action='suppressed'`, `source='brevo_webhook'`) to znowu para; dodatkowo webhook może
  przyjść wielokrotnie, więc idempotencja jak wyżej.
- **Story 6.9 (dokumenty prawne)** — polityka prywatności powinna być spójna z tym, co
  faktycznie logujemy (ip_hash, user-agent jeśli dojdzie, okresy retencji z L-5).

## Status decyzji

| Temat | Status |
|---|---|
| Sparowany zapis jako jeden statement (CTE) w `confirmAlert` | **Wdrożone** 2026-07-22 |
| Zapytanie kontrolne wykrywające `active` bez zgody | **Wdrożone** 2026-07-22 — `findActiveAlertsMissingConsent()` |
| `ip_hash` przy `opt_in_confirmed` | **Wdrożone** 2026-07-22 (znalezione w code review) |
| TTL liczony od `created_at`, którego ponowny zapis nie odświeża | **Wdrożone** 2026-07-22 — kolumna `token_issued_at` + rotacja tokenu gdy jest bezużyteczny |
| Odwrócona kolejność / dodatkowa warstwa zapisu | **Odrzucone** — uzasadnienie wyżej |
| Skanery linków (GET vs POST-confirm) | **Otwarte** — chwilowo skłaniamy się do (b), decyzja w osobnej sesji |
| `created_at NOT NULL` w `price_alerts` | **Odłożone** — brak katalogu migracji podnosi koszt; gałąź obronna zostaje |
| Rate limiting na `/api/alerts/*` | **Nieporuszone** — brak dziś, warto ocenić przy okazji |
| Zmiana drivera na `neon-serverless` (prawdziwe transakcje) | **Odrzucone w tym zakresie** — zmiana infrastrukturalna dotykająca wszystkich zapytań; do rozważenia osobno, jeśli sparowanych zapisów przybędzie |

## Pytania na pełniejszą sesję ustaleniową

1. GET vs POST-confirm — czy przechodzimy na (b) i przebudowujemy 6.2/6.3, czy
   akceptujemy (a) z zapisem user-agenta?
2. Czy zapytanie kontrolne integralności ma być tylko testem, czy stałym krokiem
   `maintenance.yml` z alertowaniem?
3. Czy `consent_log` potrzebuje wpisu również przy *automatycznych* zmianach stanu
   (wygaśnięcie tokenu, czyszczenie retencyjne), czy `data_retention_log` wystarczy?
4. Rate limiting `/api/alerts/*` — czy przed publicznym uruchomieniem?
5. Czy potrzebujemy ścieżki „eksport / usunięcie danych na żądanie" (RODO art. 15/17)
   i jak pogodzić ją z append-only `consent_log`?
