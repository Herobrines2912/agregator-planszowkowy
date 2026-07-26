---
title: RODO / consent_log — Integralność Zapisów Zgody (ustalenia z implementacji Story 6.2)
date: 2026-07-21
updated: 2026-07-24
category: architecture
module: "web/src/db/queries/alerts.ts, web/src/app/api/alerts/* — Epic 6 (email alerts, double opt-in)"
problem_type: architecture
component: database
severity: high
status: rozstrzygnięte (party-mode 2026-07-24) — patrz sekcje "Status decyzji" i "Rozstrzygnięcia sesji ustaleniowej"
applies_when:
  - "Dowolna zmiana stanu w price_alerts lub email_suppressions, która musi sparować się z wpisem w consent_log (architecture L-4)"
  - "Story 6.3 (unsubscribe), 6.5 (alert engine), 6.8 (Brevo webhook suppression) — każde robi ten sam sparowany zapis"
  - "Projektowanie linków klikanych z maila (confirm, unsubscribe) i tego, co uznajemy za dowód zgody"
  - "Rozważanie transakcji, batchy lub wielokrokowych zapisów na driverze neon-http"
tags: [rodo, gdpr, consent-log, double-opt-in, neon-http, transactions, atomicity, epic-6, alerts]
---

# RODO / consent_log — Integralność Zapisów Zgody

Dokument zbiera **wszystko, co ustaliliśmy o RODO podczas implementacji Story 6.2**
(Double Opt-In Confirmation) oraz **rozstrzygnięcia z sesji ustaleniowej party-mode
2026-07-24** (Winston/Sally/John/Amelia/Mary). Wszystkie wcześniej otwarte kwestie są
teraz zdecydowane — sekcje „Status decyzji" i „Rozstrzygnięcia sesji ustaleniowej"
na końcu mówią wprost, co i dlaczego.

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

## ROZSTRZYGNIĘTE (party-mode 2026-07-24): skanery linków a wiarygodność zgody

**To była najpoważniejsza otwarta kwestia RODO, jaką znaleźliśmy** — i żadna warstwa
transakcyjna jej nie dotyka. **Decyzja: wariant (b) — POST-confirm.** Uzasadnienie niżej.

Skanery bezpieczeństwa poczty (Outlook SafeLinks, Proofpoint, antywirusy, podglądy
w klientach) robią **GET na każdy URL w wiadomości**, zanim człowiek kliknie. Nasz link
potwierdzający aktywuje alert samym GET-em. Skutki:

- alert może zostać potwierdzony **bez świadomej akcji użytkownika**,
- `consent_log` zapisze `source='user'` i `ip_hash` **skanera**, nie osoby — czyli dowód
  zgody wskazujący na bota,
- to samo dotyczy Story 6.3: skaner może **wypisać** użytkownika z powiadomień.

Rozważane wyjścia:

- **(a)** zostawić GET jako normę branżową i zaakceptować ryzyko — **odrzucone**,
- **(b)** strona pośrednia z przyciskiem „Potwierdzam" i POST-em — **WYBRANE**,
- **(c)** zapisywać user-agent, żeby odróżnić prefetch od człowieka — **tylko jako
  metadana audytowa, nigdy jako brama** (heurystyka strzegąca dowodu prawnego to
  odwrotność accountability z art. 7).

### Uzasadnienie decyzji (b)

- **To nie problem bezpieczeństwa — to problem semantyki HTTP.** RFC 7231: GET ma być
  *safe* (bez efektów ubocznych). Skanery polegają na tym kontrakcie; to my go łamiemy,
  mutując stan na GET. Nie skaner „fałszuje" zgodę — to nasz endpoint zaprasza dowolnego
  bota do potwierdzania zgód.
- **Dodatkowy klik to nie koszt — to funkcja.** Art. 7 RODO wymaga „wyraźnego działania
  potwierdzającego". GET wywołany przez skaner z definicji nim nie jest; klik w „Potwierdzam"
  — jest. (b) podnosi jakość prawną zgody, a nie tylko łata dziurę.
- **Rdzeń transakcyjny (CTE w `confirmAlert`) zostaje nietknięty** — zmienia się tylko
  czasownik HTTP i dochodzi cienka strona. Koszt na Vercel+Neon ~zerowy, mieści się we free tier.
- **6.3 (unsubscribe) jest jeszcze ważniejszy** — wypis aktywowany przez skaner to cichy
  sabotaż retencji: tracisz użytkownika, który nigdy nie kliknął. Niema awaria produktu (JTBD).

### Kształt implementacji (ustalony z Amelią na realnych plikach)

- **6.2 = correct-course, NIE nowa historyjka** (te same pliki, ta sama powierzchnia AC,
  zero nowej zdolności). `GET /api/alerts/confirm` → **side-effect-free strona**
  `web/src/app/alerts/confirm/page.tsx` + `AlertConfirmButton` (`'use client'`) → **POST**
  `/api/alerts/confirm` wołający istniejący `confirmAlert()` bez zmian.
- **Odwrócenie udokumentowanego wyjątku od `ApiResponse<T>`:** POST confirm będzie teraz
  `fetch()`-owany z naszej własnej strony (przycisk), więc **MUSI zwracać `ApiResponse<T>`**,
  nie redirect. Dotychczasowy wyjątek (route klikany z maila → redirect) przestaje obowiązywać.
- **Idempotencja już istnieje** w warstwie query (`already_confirmed` dla `status='active'`
  i dla przegranego wyścigu) — refaktor dotyczy wyłącznie warstwy HTTP.
- **6.3 = greenfield mirror** wzorca 6.2: `cancelAlert()` (ten sam CTE:
  `active → cancelled` + `consent_log(action='unsubscribed')`) + `/api/alerts/unsubscribe`
  (POST, `ApiResponse<T>`) + strony `alerts/unsubscribe` / `alerts/unsubscribed`.
  **ZERO migracji** — `status='cancelled'` i `action='unsubscribed'` już są w `schema.ts`.
- **DRY:** po 6.2 wyekstrahować wspólny `AlertTokenActionButton` (token + endpoint +
  docelowe URL-e jako propsy), żeby 6.3 go reużył.
- **UX confirm vs unsubscribe — przeciwny ładunek emocjonalny, ta sama architektura:**
  confirm ciepły/celebracyjny z dużym primary „Potwierdzam" + próg ceny dla zaufania;
  unsubscribe rzeczowy, wyciszony przycisk, uczciwa furtka „możesz zapisać się ponownie",
  BEZ smutnych minek i BEZ modala „na pewno?" (landing z jednym przyciskiem JUŻ jest
  potwierdzeniem intencji).

Cała praca to **Dev A (Web)**. Dev B (`scraper/utils/brevo_client.py::send_doi_email`)
tknięty dopiero gdy powstanie live caller (6.5/6.6, backlog) — wtedy zbuduje URL
`/alerts/confirm?token=` zamiast `/api/...`.

## Znalezione w code review (2026-07-22)

Przegląd 11 recenzentów na gotowej implementacji 6.2. Rzeczy istotne dla RODO, których wcześniejsza
analiza nie objęła:

- ~~**Ponowny zapis nie odświeża `created_at` — token rodzi się wygasły (P1).**~~ **NAPRAWIONE 2026-07-22.**
  Rozwiązanie: kolumna `price_alerts.token_issued_at` (`NOT NULL DEFAULT now()`, migracja
  `0004_price_alerts_token_issued_at.sql` — backfill z `created_at`, nie z `now()`, żeby dawno
  martwe linki nie ożyły na kolejne 48h) niesie TTL zamiast `created_at`, a `ON CONFLICT`
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
  progową z `/alerts/confirmed`. **Decyzja (party-mode 2026-07-24): ODROCZONE** — wyciek eksponuje
  tylko nazwę gry i próg ceny (zerowa wrażliwość, brak PII). Higiena tak, blokada launchu nie;
  dorzucić przy okazji POST-refactoru jeśli tanie, inaczej później. Ten sam kaliber decyzji co
  HMAC-pepper — „zrób gdy tanio", nie MUST.
- ~~**`?slug=` na `/alerts/expired` odróżnia nieznany token od prawdziwego martwego.**~~
  **ROZSTRZYGNIĘTE 2026-07-22: zostawiamy slug, inwariant wycofany.** Przy 32-bajtowym losowym
  tokenie oracle jest bezużyteczny (trzeba już mieć token), a token aktywny i tak ujawnia więcej
  przez `/alerts/confirmed`; usunięcie sluga psułoby częstą, legalną ścieżkę powrotu na stronę
  gry przy 48-godzinnym oknie. Inwariant anty-enumeracyjny obowiązuje tam, gdzie identyfikator
  jest zgadywalny — czyli przy adresach e-mail w `subscribeAlert`, i tam zostaje.
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
  wzorzec dotyczy 6 kolumn `created_at` w `schema.ts`). Od 2026-07-22 TTL tokenu opiera się
  na `token_issued_at` (`NOT NULL`), więc nullowalność `created_at` nie dotyka już ścieżki
  potwierdzenia. Docelowo i tak `notNull()`.
- **Migracje: katalog `db/migrations/` ISTNIEJE i jest żywy.** ⚠️ Wcześniejsza wersja tego
  dokumentu twierdziła, że go nie ma — **to było błędne** i doprowadziło do wykonania DDL
  ręcznie na produkcji z pominięciem workflow. Stan faktyczny: `db/migrations/` w korzeniu
  repo (`web/drizzle.config.ts` → `out: '../db/migrations'`), migracje `0000`–`0004`, journal
  w `meta/_journal.json`, a tabela `drizzle.__drizzle_migrations` na Neonie ma odpowiadające
  wpisy. Migracje `0002`/`0003` są pisane ręcznie (bez snapshotów w `meta/`), więc
  `drizzle-kit generate` policzyłby diff względem snapshotu `0001` i wypluł nadmiarowe
  statementy — **wzorzec tego repo to ręcznie pisany plik `.sql` + wpis w journalu**, nie
  `generate`. Każda zmiana `schema.ts` musi mieć towarzyszący plik migracji w tym samym
  commicie.
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
| Skanery linków (GET vs POST-confirm) | **Rozstrzygnięte 2026-07-24 (party-mode): wariant (b) POST-confirm** dla 6.2 i 6.3; (c) tylko jako metadana. 6.2 = correct-course, 6.3 = greenfield mirror |
| Rotacja tokenu po użyciu | **Odroczone 2026-07-24** — wyciek eksponuje tylko nazwę gry + próg (zerowa wrażliwość); „zrób gdy tanio", nie MUST |
| Rate limiting na `/api/alerts/*` | **Rozstrzygnięte 2026-07-24: MUST-before-launch, osobna historyjka (6.10)** owijająca 3 POST-y (subscribe + confirm + unsubscribe). Wektor abuse: wpisywanie cudzego maila → spam potwierdzeń + log twierdzący „wyraziła zgodę". Per-IP + per-email throttle, może być prymitywny; brak Redis (stack=Neon) → tabela + okno `now()` albo Upstash |
| RODO art. 15/17 vs append-only `consent_log` | **Rozstrzygnięte 2026-07-24: proces ręczny udokumentowany w Story 6.9**, ZERO kodu erasure. Szczegóły niżej |
| HMAC-pepper na `email_hash` (art. 32, poufność) | **Rozstrzygnięte 2026-07-24: SHOULD w batchu launchowym** (nie MUST). `SHA-256(email)` to pseudonimizacja, nie anonimizacja — sam jest swoim kluczem. HMAC z globalnym PEPPER (env, poza bazą) broni przed wyciekiem samego dumpu bazy bez sekretu aplikacji. Nie launch blocker (pusta tabela pre-launch), ale zrób przed pierwszym prawdziwym wierszem — migracja żywej tabeli SHA→HMAC to bałagan (schemat w połowie zmigrowany). Szczegóły niżej |
| `created_at NOT NULL` w `price_alerts` | **Do ponownej oceny** — pierwotny argument („brak katalogu migracji") był błędny; migracje istnieją, więc koszt jest niski |
| Zmiana drivera na `neon-serverless` (prawdziwe transakcje) | **Odrzucone w tym zakresie** — zmiana infrastrukturalna dotykająca wszystkich zapytań; do rozważenia osobno, jeśli sparowanych zapisów przybędzie |

## Rozstrzygnięcia sesji ustaleniowej (party-mode 2026-07-24)

Sesja: Winston (architekt), Sally (UX), John (PM), Amelia (dev), Mary (analityk).
Pytania z poprzedniej wersji tego dokumentu i ich odpowiedzi:

1. **GET vs POST-confirm →** wariant **(b) POST-confirm** dla 6.2 i 6.3. (c) tylko jako
   metadana audytowa. Uzasadnienie i kształt: sekcja „ROZSTRZYGNIĘTE: skanery linków" wyżej.
2. **Zapytanie kontrolne integralności (`findActiveAlertsMissingConsent`) — test czy krok
   `maintenance.yml`?** Nierozstrzygnięte na tej sesji; niska pilność (dziś zwraca pustkę,
   dowód a nie rytuał). Domyślnie zostaje testem; ocenić przy okazji 6.5/`maintenance.yml`.
3. **`consent_log` przy automatycznych zmianach stanu?** Nierozstrzygnięte wprost; `data_retention_log`
   pokrywa przebiegi retencyjne, a każda ręczna erasure ma tam trafić (patrz niżej). Ocenić przy 6.5.
4. **Rate limiting `/api/alerts/*` →** **MUST-before-launch, osobna historyjka 6.10** owijająca
   trzy POST-y jednym przejściem (subscribe + confirm + unsubscribe). Nie wciskać w 6.3 (pokryłoby
   1 z 3). Sekwencjonowana OSTATNIA w Epiku 6.
5. **Ścieżka eksport/usunięcie (art. 15/17) vs append-only →** **proces ręczny udokumentowany
   w Story 6.9, ZERO kodu.** Szczegóły niżej.

### Art. 15/17 — proporcjonalna odpowiedź: 4 dokumenty, nie portal

Cały footprint danych osobowych produktu = `{email, gra, próg ceny, timestampy, zdarzenia zgody}`.
Brak imion, płatności, kategorii specjalnych (art. 9), profilowania. Przy tym zbiorze:

- **art. 15 (dostęp)** = jeden SELECT z `price_alerts` po mailu + jeden po `email_hash` do
  `consent_log`, plus stały szablon metadanych (cele, retencja, brak odbiorców). Mieści się w
  jednym mailu zwrotnym z tabelką.
- **art. 17 (usunięcie)** = `DELETE FROM price_alerts` po mailu (znika surowy email → realizacja
  art. 17); **`consent_log` ZOSTAJE** jako pseudonimizowany tombstone + dopisany wpis „erasure
  requested" (append-only działa też w tę stronę). Podstawa zachowania: **art. 17(3)(b) w zw. z
  art. 7(1) + art. 5(2)** — obowiązek wykazania zgody. Skasowanie dowodu zgody = dobrowolne
  pozbawienie się obrony, gdyby osoba potem zgłosiła „maile bez zgody".
- **Portal DSAR / automatyczny eksport = YAGNI** — uwierzytelnianie + weryfikacja tożsamości +
  eksport to nowa powierzchnia ataku; zbudowanie go *zwiększyłoby* ryzyko RODO. Art. 12 wymaga
  „miesiąc", nie self-service. Zgodne z wcześniejszą decyzją „brak strony zarządzania alertami".
- **Retencja `consent_log` MUSI mieć spisane uzasadnienie** (3 lata = okres przedawnienia roszczeń),
  inaczej „append-only na wieczność" łamie art. 5(1)(e) (ograniczenie przechowywania). `email_hash`
  to pseudonimizacja → licznik retencji tyka.

**MUST-before-launch (wszystko w Story 6.9, jako AC „Obsługa żądań RODO art. 15/17"):**
1. adres kontaktowy w polityce prywatności (jeden mailto na art. 15/16/17/21),
2. runbook ręczny (5 kroków: weryfikacja tożsamości = żądanie z tego samego maila per art. 12(6) →
   eksport → usunięcie → tombstone w `consent_log` → zapis daty obsłużenia + wpis w `data_retention_log`),
3. dwa SQL-e (eksport art. 15, usunięcie art. 17) jako snippet w runbooku,
4. akapit stanowiska retencyjnego + rejestr czynności przetwarzania (art. 30, jedna strona).

### HMAC-pepper na `email_hash` — kontrola art. 32, nie art. 17 (SHOULD, nie MUST)

Kluczowe rozróżnienie z sesji (Winston vs John): to **osobna oś** niż art. 17.

- `SHA-256(lower(email))` to **pseudonimizacja, nie anonimizacja** (motyw 26): niska entropia +
  brak solenia → każdy z kandydującym adresem robi `SHA-256(candidate)` i matchuje. `email_hash`
  pozostaje danymi osobowymi; hash **jest sam swoim kluczem**.
- **Scenariusz, który to zamyka (art. 32, poufność):** wyciek samego dumpu bazy **bez** sekretu
  aplikacji (leak connection stringa Neona — patrz `project_chat_contains_secret`, hasło Neona w
  plaintext w jednej sesji czatu; zły publiczny branch; SQLi). Atakujący z samym `consent_log`
  rehashuje listę kandydatów → **potwierdza członkostwo aktywnych subskrybentów** (zgłaszalne
  art. 32/33). DELETE-z-`price_alerts` + retencja + 17(3)(b) tego **nie dotykają** — bronią logu
  przed *podmiotem danych* (art. 17), nie przed *włamywaczem* (art. 32).
- **Rozwiązanie:** `HMAC-SHA-256(lower(email), PEPPER)`, PEPPER w env Vercela (poza bazą). Dump bez
  pepper-a staje się martwy — re-identyfikacja wymaga drugiego, niezależnego przełamania.
- **Priorytet: SHOULD, w batchu launchowym — nie MUST, nie launch blocker.** Ryzyko skaluje się z
  liczbą userów; breach w dniu 1 to pusta tabela. Ale zrobić **przed pierwszym prawdziwym wierszem**:
  migracja żywej tabeli SHA→HMAC (schemat w połowie zmigrowany) to bałagan. Uczciwie: HMAC+pepper
  **nie czyni logu anonimowym** — podnosi poprzeczkę; prawną tarczą pozostaje art. 17(3)(b), nie
  kryptografia. Globalny pepper to erasure „wszystko albo nic" — per-user crypto-erasure odroczone
  do czasu, gdy skala tego zażąda.

### Nowe/zmienione historyjki wynikające z sesji

- **6.2** — z `done` na `in-progress` przez `bmad-correct-course`; korekta AC-2 (GET→POST + strona);
  po zmerge z powrotem `done`.
- **6.3** — greenfield mirror wzorca 6.2 (POST unsubscribe).
- **6.9** — dorzucić AC „Obsługa żądań RODO (art. 15/17)": kontakt + runbook + 2 SQL + akapit retencyjny.
- **6.10 (NOWA)** — rate limiting POST endpoints (subscribe + confirm + unsubscribe), MUST-before-launch,
  sekwencjonowana ostatnia.
- **Backlog/higiena (nie blokują launchu):** rotacja tokenu po użyciu; HMAC-pepper na `email_hash`
  (SHOULD, w batchu launchowym); kolumna `consent_log.user_agent` jeśli zdecydujemy się logować UA.
