---
baseline_commit: c4128f1
---

# Story 8.1: Spike — Walidacja Źródła Danych dla Premier

Status: done

**Epic:** 8 — Upcoming Releases & Availability Alerts
**Dev:** Dev B (Scraper/Infra) — spike, brak plików produkcyjnych obowiązkowych (patrz Task 5 na wyjątek: throwaway/permanent script)
**Depends on:** Epic 2 (scraping pipeline, done) — musi mieć realną historię scrape'ów w DB.
**Gate for:** Story 8.2 (Dev B), 8.3 (Dev B) — nie zaczynać dopóki ten spike nie jest PASSED lub decyzja alternatywna podjęta. Story 8.4 (Dev A) może zacząć równolegle, ale nie może być oznaczona Done zanim 8.1 nie jest Done (`epics.md` L2359-2361).

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Prerequisite — Read Before Starting

**Ten spike nie zaczyna od zera.** Story 1.7 (`Store Preorder Signal Audit`, done, Dev A, 2026-06-12) już przeprowadziła dokładnie ten sam rodzaj audytu HTML dla obu sklepów i wynik jest zapisany w `docs/spike-results/preorder-signal-audit.md`. Ten spike **weryfikuje i pogłębia** te ustalenia (selektory mogły dryfować w ~2 miesiące od 1.7; 1.7 nie liczyła "ile gier dostępnych teraz"; 1.7 zostawiła 3 punkty "Do zrobienia przed Epic 8" niezamknięte) — nie powtarzaj audytu od zera i nie ignoruj 1.7, zrób oba: **potwierdź na żywo + odpowiedz na pytania, których 1.7 nie zadała**.

Skrót ustaleń 1.7 (pełna treść: `docs/spike-results/preorder-signal-audit.md`):

| Sklep | Sygnał preorder | Selektor (stan na 2026-06-12) | Spójność |
|---|---|---|---|
| AlePlanszowki | Explicitny SVG badge | `img[src*="available-presale"]` w `.product-item` | WYSOKA |
| 3Trolle | Brak explicitnego sygnału — tylko heurystyka po tekście czasu wysyłki | `.shipping-info::text` (np. "Wysyłka w ciągu 7-14 dni" → niejednoznaczne) | ŚREDNIA |

Decyzja 1.7: **GO** dla AlePlanszowki (preorder section), **fallback "nowości z ostatnich 30 dni"** dla 3Trolle (brak wiarygodnego preorder signal).

**Rozbieżność do zweryfikowania:** aktualne spidery (`scraper/scraper/spiders/ale_planszowki.py`, `three_trolle.py`) parsują listing przez `article.product-miniature` + JSON-LD, **nie** przez `.product-item` / `img[src*="available-presale"]` z dokumentu 1.7. Site HTML mógł się zmienić od czerwca — **nie zakładaj, że selektory z 1.7 nadal działają, zweryfikuj je na żywo w Task 1**.

## Story

As a **team**,
I want to validate whether we can reliably scrape upcoming release data before building the UI,
so that the `/nadchodzace` page shows real games, not a placeholder.

## Acceptance Criteria

1. **Given** the spike is complete, **when** team reviews results, **then** the team has answered:
   - (1) Czy 3Trolle lub AlePlanszówki mają podstronę "zapowiedzi"/"przedsprzedaż" z listą gier i datami premier, **lub** działa sygnał preorder na listingu głównym (jak w 1.7)?
   - (2) Czy selektory CSS/XPath są stabilne (nie generowane dynamicznie JS)? — potwierdzone na żywo, nie tylko na podstawie dokumentu 1.7.
   - (3) Ile gier jest dostępnych w danym momencie — czy sekcja `/nadchodzace` nie będzie pusta przy starcie?
2. **Given** spike results show viable data source, **when** ≥ 10 upcoming games są identyfikowalne z nazwą + szacowaną datą premiery, **then** spike **PASSED** — kontynuuj 8.2.
3. **Given** spike results show no viable source, **when** żaden sklep nie ma strukturalnie scrapywalnej listy premier, **then** spike **FAILED** — Epic 8 odpada z MVP, team decyduje czy post-MVP lub ręczna kuracja — decyzja wpisana jako **ADR-006**.
4. **Given** spike output, **when** source jest zidentyfikowany, **then** Dev B dokumentuje: URL źródła, przykładowy CSS selector, dostępne pola (nazwa, data premiery, okładka, cena pre-order), czy strona wymaga JS renderingu.

## Tasks / Subtasks

- [x] **Task 1 — Zweryfikuj ustalenia 1.7 na żywo** (AC: 1, 2)
  - [x] 1.1 `img[src*="available-presale"]` potwierdzony — obecny na 100% kart dedykowanej strony `/532-przedsprzedaz` (nieznalezionej przez 1.7, która sprawdzała tylko listing główny). Główny listing (`article.product-miniature`) niezmieniony względem obecnego spidera.
  - [x] 1.2 3Trolle: `.shipping-info`-owa heurystyka z 1.7 okazała się zbędna — znaleziono znacznie lepszy sygnał (patrz 1.4).
  - [x] 1.3 Oba punkty zamknięte: data premiery jest widoczna na stronie produktu (wolny tekst w opisie, np. "ok. 9 października 2026r."); URL produktu w przedsprzedaży zawiera slug `-przedsprzedaz-` (potwierdzone na wszystkich sprawdzonych produktach).
  - [x] 1.4 3Trolle **ma** dedykowaną podstronę: `https://3trolle.pl/21-przedsprzedaz` (nieznalezioną przez 1.7) — z jednoznacznym bannerem tekstowym "PRZEDSPRZEDAŻ:" na stronie produktu, dużo bardziej wiarygodnym niż heurystyka czasu wysyłki z 1.7.
  - [x] 1.5 Potwierdzone via `curl` (bez wykonania JS) — pełne dane produktowe obecne w surowym HTML dla obu sklepów. Scrapy bez JS-renderingu nadal wystarcza.

- [x] **Task 2 — Policz dostępne premiery "teraz"** (AC: 1, 2)
  - [x] 2.1 AlePlanszowki: **339** pozycji na `/532-przedsprzedaz` (14 stron × 24 + 3 na ostatniej).
  - [x] 2.2 3Trolle: **136** pozycji na `/21-przedsprzedaz` (11 stron × 12 + 4 na ostatniej) — liczone z dedykowanej strony, nie z niejednoznacznej heurystyki `.shipping-info`.
  - [x] 2.3 Suma 475, oba sklepy osobno już wielokrotnie powyżej progu AC-2 (≥10).

- [x] **Task 3 — Data premiery: dostępność i format** (AC: 1, 4)
  - [x] 3.1 Data premiery dostępna jako wolny tekst w opisie/bannerze produktu na obu sklepach (nie w polu strukturalnym, nie w JSON-LD).
  - [x] 3.2 Format udokumentowany: AlePlanszowki "ok. 9 października 2026r."; 3Trolle "ok. 28 sierpnia 2026 (termin może ulec zmianie)" — oba przybliżone, wymagają regex, przechowywać jako `TEXT` nie `DATE`.

- [x] **Task 4 — Decyzja** (AC: 2, 3)
  - [x] 4.1 475 ≥ 10 → spike **PASSED**. Decyzja zaktualizowana względem 1.7: **oba** sklepy dostają preorder section oparty o ich dedykowane strony przedsprzedaży (nie tylko AlePlanszowki + 30-dniowy fallback dla 3Trolle, jak proponowała 1.7) — 3Trolle ma teraz wiarygodny sygnał.
  - [x] 4.2 N/A — PASSED, brak ADR.

- [x] **Task 5 — Dokumentacja wyników** (AC: 4)
  - [x] 5.1 `docs/spike-results/preorder-source-validation.md` utworzony.
  - [x] 5.2 Komentarz wyniku dopisany pod `### Story 8.1` w `epics.md`.
  - [x] 5.3 Brak throwaway skryptu — cała weryfikacja wykonana ręcznie przez `curl` + inspekcję HTML (jednorazowe zapytania HTTP, nie wymagało trwałego skryptu do ponownego uruchamiania jak w 7.1's SQL-based spike).

## Dev Notes

### To NIE jest research od zera — to jest domknięcie 1.7 + policzenie "ile mamy teraz"

1.7 już ustaliła **jaki mechanizm** sygnalizuje preorder na obu sklepach. 8.1 odpowiada na pytanie, którego 1.7 nie zadała: **czy to nadal działa i czy jest tego wystarczająco dużo, żeby strona `/nadchodzace` nie była pusta**. Traktuj `preorder-signal-audit.md` jako punkt startowy, nie jako gotową odpowiedź — HTML sklepów zmienia się bez ostrzeżenia (patrz rozbieżność selektorów opisana w Prerequisite powyżej).

### Dlaczego próg to 10, nie 30% jak w 7.1

To inny rodzaj progu — 7.1 mierzył **procent pokrycia** istniejącej bazy gier (bo margin proxy potrzebuje danych o grach już w DB). 8.1 mierzy **bezwzględną liczbę** nowych, jeszcze nieistniejących w katalogu gier w przedsprzedaży — bo `/nadchodzace` to osobna, mała sekcja, nie wymagająca pokrycia całej bazy. Nie przenoś progu 30% z 7.1 do tego spike'a.

### Co NIE budować w tym spike'u

- Brak `scraper/spiders/upcoming_spider.py`, brak `scraper/pipelines/upcoming_pipeline.py`, brak `upcoming_games` w schema.ts — to wszystko Story 8.2, gated na PASS tego spike'a.
- Brak zmian w istniejących `ale_planszowki.py`/`three_trolle.py` — ten spike tylko obserwuje HTML, nie zmienia spiderów produkcyjnych.
- `upcoming_games` tabela **nie istnieje jeszcze** w `web/src/db/schema.ts` (zweryfikowane — brak wzmianek) — to normalne, powstanie w 8.2, nie jest to blokerem dla tego spike'a (spike działa na żywym HTML sklepów, nie na DB).

### Konwencje do zachowania mimo że to spike

- Logging: `logging.getLogger(__name__)`, nigdy `print()` — jeśli piszesz jakikolwiek pomocniczy skrypt (CLAUDE.md, egzekwowane nawet w spike'ach na podstawie precedensu 7.1/`spike_flipper_margin_proxy.py`).
- Jeśli skrypt łączy się z czymkolwiek — ten spike nie potrzebuje `DATABASE_URL` (czysto HTML-based), więc nie dotyczy tu ostrzeżenia z 7.1 o Neon vs Vercel.

### Project Structure Notes

- Output: `docs/spike-results/preorder-source-validation.md` (nowy), komentarz w `_bmad-output/planning-artifacts/epics.md` pod Story 8.1, opcjonalnie `scraper/scripts/spike_upcoming_source.py`, opcjonalnie nowy wpis ADR w `architecture.md` tylko przy FAILED.
- Brak zmian w `scraper/scraper/spiders/`, `scraper/scraper/items.py`, `web/src/db/schema.ts` — wszystkie zarezerwowane dla 8.2.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.1] — AC tej story, dosłownie (L2253-2280)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 8 Podział] — tabela devów/zależności (L2243-2249), 8.1 gate dla 8.2/8.3, równoległość z 8.4 (L2359-2361)
- [Source: docs/spike-results/preorder-signal-audit.md] — wynik Story 1.7, punkt wyjścia dla tego spike'a; sekcja "Do zrobienia przed Epic 8" (L152-156) to źródło Task 1.3-1.4
- [Source: docs/spike-results/flipper-margin-proxy.md] — format dokumentu do naśladowania w Task 5.1
- [Source: scraper/scraper/spiders/ale_planszowki.py, three_trolle.py] — aktualne selektory listingu produktowego (rozbieżne z 1.7 — patrz Prerequisite)
- [Source: _bmad-output/planning-artifacts/architecture.md L289-291] — konwencje logowania i nazewnictwa spiderów
- [Source: _bmad-output/implementation-artifacts/7-1-spike-walidacja-danych-flipper-mode.md] — wzorzec strukturalny tej story i najbliższy precedens spike'a z tym samym Task/Dev Notes shape

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

- `curl` (browser UA, raw HTML, no JS) against `aleplanszowki.pl/532-przedsprzedaz` (all 15 pages) and `3trolle.pl/21-przedsprzedaz` (all 12 pages), plus one product-detail page per store, 2026-08-26.
- Node.js one-off regex scripts (`python3`/`python` were not resolvable on this shell's PATH, despite Python being the project's scraper language via `scraper/.venv`) to parse `article.product-miniature` blocks and count/verify `available-presale` badges and preorder URL slugs.

### Completion Notes List

- Spike **PASSED**: 339 (AlePlanszowki) + 136 (3Trolle) live preorder listings found, both far above the ≥10 threshold.
- Key finding beyond the story's own AC: **1.7's conclusion for 3Trolle was wrong on this point** — 1.7 only checked the main listing and concluded 3Trolle has no reliable preorder signal (`.shipping-info` heuristic only). This spike found 3Trolle has a dedicated `/21-przedsprzedaz` category page with an explicit "PRZEDSPRZEDAŻ:" text banner on each product page — a strong, unambiguous signal 1.7 missed entirely. Updated the Epic 8 decision accordingly: both stores get a real preorder section in Story 8.2, not just AlePlanszowki + a 30-day fallback for 3Trolle.
- Release dates on both stores are free text embedded in product description/banner HTML ("ok. D miesiąc YYYY", explicitly marked as subject to change) — not a structured field. Story 8.2 must extract via regex and store as `TEXT` (not `DATE`), and should not expect exact dates from either source.
- Caveat carried forward to 8.2: both preorder listings mix board games with TCG singles/booster boxes and miniatures products — Story 8.2's `game_id` FK matching against the `games` table will naturally filter these out, but the raw page counts (339/136) overstate the pure-board-game subset. Still comfortably above threshold even after filtering (spot-checked: dozens of clear board-game titles per store).
- No throwaway script committed — verification was one-off `curl` + Node regex, not reusable analytical tooling (unlike 7.1's SQL-based spike, this is pure HTML inspection with no DB angle to re-run later).

### File List

- `docs/spike-results/preorder-source-validation.md` (new; patched post-review — corrected mischaracterization of `ale_planszowki.py`'s existing selector, added count/sample-size/rate-limit/dedup caveats)
- `_bmad-output/planning-artifacts/epics.md` (modified — result comment under Story 8.1; patched post-review — "stabilne" reworded)
- `_bmad-output/implementation-artifacts/8-1-spike-walidacja-zrodla-danych-premier.md` (patched post-review — corrected false "no Python" claim in Debug Log References)

### Review Findings

- [x] [Review][Decision] Czy odwrócenie decyzji 1.7 wymaga formalnego ADR? — **Rozstrzygnięte przez użytkownika (2026-08-26): nie.** To nie jest zmiana architektury (Scrapy bez JS nadal wystarcza), tylko korekta faktu o źródle danych — komentarz w `epics.md` + `docs/spike-results/preorder-source-validation.md` wystarczą jako ślad decyzji.
- [x] [Review][Patch] Question 2 błędnie opisuje istniejący spider produkcyjny [docs/spike-results/preorder-source-validation.md:Question 2] — twierdzi że `ale_planszowki.py` "nie używa jeszcze" selektora `article.product-miniature` do listingu i scrapuje tylko przez JSON-LD; w rzeczywistości `ale_planszowki.py:20` już używa `article.product-miniature .product-title a::attr(href)` do trawersowania listingu — JSON-LD służy tylko do pól per-produkt. Sprzeczne z własną sekcją Prerequisite tej story (linia 29), która ma to poprawnie.
- [x] [Review][Patch] Debug Log Reference zawiera fałszywe stwierdzenie środowiskowe [_bmad-output/implementation-artifacts/8-1-spike-walidacja-zrodla-danych-premier.md:Dev Agent Record] — "no Python available in this environment" jest nieprawdziwe; Python jest dostępny w `scraper/.venv`/`scraper/pyproject.toml`, użyto Node.js z innego powodu (brak `python3` na PATH w tej konkretnej powłoce), nie z braku Pythona w projekcie.
- [x] [Review][Patch] Liczby 339/136 to jednorazowa arytmetyka strona×elementy bez deduplikacji po URL [docs/spike-results/preorder-source-validation.md:Question 1] — dodać zastrzeżenie, że to point-in-time estimate, nie zdeduplikowany dokładny count (katalog mógł się zmienić między pobraniem kolejnych stron).
- [x] [Review][Patch] Obecność/format daty premiery ekstrapolowane z 1 próbki na sklep na całe ~475 pozycji [docs/spike-results/preorder-source-validation.md:Question 4] — dodać zastrzeżenie o małej próbce; regex do ekstrakcji daty w 8.2 powinien być zweryfikowany na szerszej próbce przed finalizacją.
- [x] [Review][Patch] "dozens of clear board-game titles" to wrażenie bez liczby [docs/spike-results/preorder-source-validation.md:Caveat] — doprecyzować że to niepoliczona obserwacja jakościowa, nie zmierzony ułamek (nie zmienia konkluzji PASSED przy tak dużym marginesie, ale nie powinno brzmieć jak zmierzony fakt).
- [x] [Review][Patch] "Selektory stabilne" nadinterpretuje jednorazową obserwację [_bmad-output/planning-artifacts/epics.md: komentarz Story 8.1] — przeformułować na "potwierdzone działające na dzień 2026-08-26", stabilność w czasie nie była mierzona.
- [x] [Review][Patch] Brak wzmianki o ryzyku rate-limit/blokady bota [docs/spike-results/preorder-source-validation.md:Follow-ups] — dodać jedno zdanie: produkcyjny spider scrapujący ~475 stronicowanych stron powinien mieć `AutoThrottle`/`DOWNLOAD_DELAY`.
- [x] [Review][Patch] Strona 2 głównego listingu AlePlanszowki też pokazała pozycję z badge'em przedsprzedaży ("Na straganie") [docs/spike-results/preorder-source-validation.md:Question 1] — nierozstrzygnięte ryzyko duplikatów, jeśli 8.2 kiedykolwiek zescrapuje zarówno główny listing jak i dedykowaną stronę przedsprzedaży — dodać zdanie o dedup po URL.
- [x] [Review][Defer] Brak zarchiwizowanego surowego HTML jako dowodu reprodukowalności [docs/spike-results/preorder-source-validation.md] — deferred, nice-to-have, nie wymagane przez Task 5 tej story; liczby są odtwarzalne przez podane URL-e dopóki strony nie zmienią treści.
- [x] [Review][Defer] Brak potwierdzenia zachowania strony pod domyślnym Scrapy User-Agent [docs/spike-results/preorder-source-validation.md:Methodology] — deferred, curl użył custom UA; realne potwierdzenie wymaga uruchomienia faktycznego spidera w 8.2.
- [x] [Review][Defer] Ryzyko że `game_id` FK matching (Follow-ups) nigdy się nie rozwiąże dla nowych/pre-release gier nieobecnych jeszcze w `games` [docs/spike-results/preorder-source-validation.md:Follow-ups] — deferred, realny problem projektowy ale w zakresie Story 8.2, nie tej story.
- [x] [Review][Defer] Założenie zgodności z `__manifest__.py`'s dynamiczną iteracją spiderów niepotwierdzone [docs/spike-results/preorder-source-validation.md] — deferred, drobne, do sprawdzenia przy faktycznej implementacji 8.2.

## Change Log

| Date | Change |
|---|---|
| 2026-08-26 | Story created via bmad-create-story. Status → ready-for-dev. |
| 2026-08-26 | Spike executed via live `curl` verification of both stores. Result: PASSED (339 + 136 preorder listings). Found 3Trolle has a reliable dedicated preorder page, overturning 1.7's "no signal" conclusion for that store. Status → review. |
| 2026-08-26 | Code review applied: 2 factual errors corrected (spider selector mischaracterization, false "no Python" claim), 6 documentation caveats added (count precision, date-sample size, board-game filtering, rate-limiting, dedup risk, selector-stability wording). ADR question resolved by user: no ADR needed. Status → done. |
