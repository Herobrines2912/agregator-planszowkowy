---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'Board game deals & promotions aggregator web app (similar to ceneo/i-szop but for Polish board game stores)'
session_goals: 'Brainstorm features, UX, architecture, and differentiation ideas for a Polish board game price/promotion aggregator targeting stores like 3Trolle, AlePlanszowki, Mepel'
selected_approach: 'ai-recommended'
techniques_used: ['What If Scenarios']
ideas_generated: [14]
session_active: false
workflow_completed: true
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Kacper
**Date:** 2026-06-05

## Session Overview

**Topic:** Board game deals & promotions aggregator web app (similar to ceneo/i-szop but for Polish board game stores)
**Goals:** Brainstorm features, UX, architecture, and differentiation ideas for a Polish board game price/promotion aggregator targeting stores like rebel, mepel, 3trolle, aleplanszowki

### Session Setup

User wants to build a promotions/deals aggregator focused specifically on board games from Polish online stores. Key differentiator: better UX and organization than i-szop.pl, with board-game-specific filters (Base/DLC, genre, player count, etc.). Web-first, then mobile.

---

## Technique Selection

**Podejście:** AI-Recommended Techniques
**Kontekst analizy:** Nowy produkt z jasnym punktem odniesienia (ceneo/i-szop) wymagający dyferencjacji i myślenia domenowego.

**Rekomendowane techniki:**
- **What If Scenarios:** Ekspansja wizji, przełamanie oczywistych rozwiązań
- **SCAMPER Method:** Systematyczna analiza funkcji względem istniejących agregatorów
- **Cross-Pollination:** Kradzież dobrych praktyk z innych domen

*Sesja skupiła się na What If Scenarios i wygenerowała wystarczający materiał — SCAMPER i Cross-Pollination przesunięto na kolejną sesję.*

---

## Wyniki Sesji Burzy Mózgów

### Wygenerowane Idee

**[Funkcja #1]: Flipper Mode**
_Concept:_ Tryb widoku dedykowany osobom kupującym gry na przecenach w celu odsprzedaży. Zamiast "ładna okładka + opis gry", widok pokazuje: aktualna cena, cena regularna, historia cen, szacowany zysk ze sprzedaży, trend (rośnie/spada). Maksymalnie transakcyjny, zero ozdobników.
_Novelty:_ Żaden istniejący agregator w Polsce nie adresuje flipperów jako segmentu — to pierwsze narzędzie dla tej niszy. Flipping planszówek to duże zjawisko na polskim rynku.

**[Funkcja #2]: Historia cen**
_Concept:_ Każda gra ma wykres historii cen ze wszystkich scrapowanych sklepów. Widać trend, historyczne minimum i maksimum, średnią cenę rynkową. Flipper Mode używa tego do szybkiej oceny opłacalności.
_Novelty:_ Ceneo ma historię cen elektroniki — nikt nie robi tego dla planszówek w Polsce. Dla flipperów to kluczowe narzędzie decyzyjne.

**[Funkcja #3]: Alerty cenowe (dwa typy)**
_Concept:_ Typ A — użytkownik podaje email i ustawia próg dla konkretnej gry ("daj znać gdy Brass Birmingham będzie poniżej 120 zł"). Typ B — system automatycznie wykrywa drastyczne spadki (>50%, >70%, >80%) i powiadamia subskrybentów danej gry. Bez rejestracji — tylko email.
_Novelty:_ Typ B to "anomaly detection" bez konfiguracji — flipper nie musi śledzić każdej gry z osobna, aplikacja sama wyłapuje okazje rynkowe.

**[Funkcja #4]: Feed "Gorące okazje dziś"**
_Concept:_ Publiczna sekcja na stronie głównej pokazująca gry z największymi spadkami cen tego dnia, posortowana po % zniżki. Widoczna bez logowania. Odświeżana automatycznie przy każdym scrapie.
_Novelty:_ Strona główna która sama w sobie jest użyteczna bez rejestracji — redukuje barierę wejścia i buduje nawyk codziennego odwiedzania.

**[Funkcja #5]: Filtry planszówkowe (MVP)**
_Concept:_ Dwa filtry specyficzne dla planszówek: (1) Podstawka/Dodatek — kluczowe bo flipperzy i kolekcjonerzy mają różne potrzeby; (2) Liczba graczy — bo "gra dla 2 osób" to zupełnie inny zakup niż "gra imprezowa na 8". Pozostałe filtry (mechanika, wiek, czas gry) w późniejszych etapach.
_Novelty:_ Ceneo i i-szop traktują planszówki jak każdy inny produkt — te filtry wymagają rozumienia domeny, co jest barierą wejścia dla konkurencji.

**[Funkcja #6]: Strona gry — "Paszport planszówki"**
_Concept:_ Dedykowana podstrona dla każdej gry z wyszukiwarką. Dane z BGG API: nazwa, okładka, autorzy, wydawcy, ranking ogólny BGG, ranking w kategorii, trudność (weight), mechaniki (euro/deckbuilder/kooperacja), liczba graczy, linki do zasad PDF. Dane własne: mini wykres historii cen, aktualnie najtańszy sklep, status podstawka/DLC.
_Novelty:_ Żaden polski sklep ani agregator nie łączy danych BGG z danymi cenowymi. Zastępuje wizytę na BGG + wizyty w 3 sklepach jednym ekranem.

**[Funkcja #7]: Ostrzeżenie o wymaganiach DLC**
_Concept:_ Na stronie każdego dodatku automatyczne ostrzeżenie "Ten dodatek wymaga [Nazwa Podstawki]" z aktualną ceną podstawki i linkiem do jej strony. Dane o zależnościach pobierane z BGG API.
_Novelty:_ Ratuje niedoświadczonych graczy przed zakupem dodatku bez podstawki — żaden sklep tego nie robi mimo że dane są w BGG.

**[Funkcja #8]: Podstrona "Nadchodzi" (preordery i nowości)**
_Concept:_ Sekcja dedykowana preordenom i nowościom ze sklepów (3Trolle, Mepel, AlePlanszowki). Gry dostępne w preorderze, daty premier, nowe tytuły ostatnich 30 dni. Alert "powiadom mnie gdy gra trafi do sprzedaży" — bez konta, tylko email. Kickstarter/Gamefound i strony wydawców jako faza 2.
_Novelty:_ Łączy rolę agregatora cen z rolą "radaru nowości" — powód do wchodzenia na aplikację nawet bez aktywnego szukania przecen.

**[Funkcja #9]: Newsletter tygodniowy**
_Concept:_ Automatycznie generowany email z top 10 największych spadków tygodnia, top 5 nowości w promocji, "gra tygodnia" z najniższą historyczną ceną. Zero dodatkowej pracy — dane już są, wystarczy szablon i cron job raz w tygodniu.
_Novelty:_ Darmowy kanał retention bez budowania funkcji społecznościowych.

**[Funkcja #10]: SEO-first architektura**
_Concept:_ Każda strona gry to SSR landing page z unikalną treścią: nazwa gry w tytule, meta description z aktualną ceną, structured data (schema.org Product) dla rich snippets. URL w stylu `/gra/brass-birmingham`.
_Novelty:_ Tysiące stron gier = tysiące punktów wejścia z Google. "Brass Birmingham promocja" to nisko zawieszona gruszka — Ceneo jej nie zrywa bo nie rozumie domeny.

**[Tech #1]: Wyzwanie scrapingu — paginacja i robots.txt**
_Concept:_ Rebel blokuje `/promocje/` dla botów (robots.txt), crawl-delay 5s. Mepel: crawl-delay 1s, brak blokady promocji. 3Trolle i AlePlanszowki: brak crawl-delay, brak blokady, platforma PrestaShop. MVP bez Rebela — 3Trolle + AlePlanszowki + Mepel jako zakres startowy.
_Novelty:_ Optymalizacja: sortowanie po cenie rosnąco + stop gdy cena wraca do poziomu regularnego — potencjalne skrócenie czasu scrape'a z 15 min do 2 min.

**[Tech #2]: Strategia "scraper per platforma"**
_Concept:_ Zamiast osobnego scrapera dla każdego sklepu — jeden moduł PrestaShop obsługuje 3Trolle i AlePlanszowki (ta sama struktura HTML, te same selektory CSS). Nowe sklepy na PrestaShop wchodzą "za darmo" — konfiguracja zamiast programowania.
_Novelty:_ Skalowalność przez rozpoznanie platformy — dodanie nowego sklepu PrestaShop to zmiana konfiguracji, nie pisanie nowego kodu.

**[Tech #3]: Stack mobilny**
_Concept:_ React Native dla iOS i Android jako drugi etap projektu. Dystrybucja przez GitHub releases (APK dla Android, IPA dla iOS) bez App Store na wczesnym etapie. Jeden kod dla obu platform.
_Novelty:_ Unika 30% prowizji i review process Apple/Google w fazie eksperymentalnej.

**[Tech #4]: Strategia deduplicacji produktów**
_Concept:_ EAN (kod kreskowy) jako główny klucz łączący ten sam produkt między sklepami. BGG ID jako backup gdy EAN brakuje. Fuzzy matching nazw jako ostatnia deska ratunku z progiem pewności — dopasowania poniżej progu trafiają do kolejki ręcznej weryfikacji.
_Novelty:_ EAN-first jest bardziej niezawodne niż fuzzy matching — eliminuje fałszywe dopasowania przy zachowaniu pełnego pokrycia.

---

## Organizacja i Priorytety

### Grupy tematyczne

**Temat 1: Odkrywanie Okazji (Core)**
Funkcje które robią aplikację użyteczną bez rejestracji i od pierwszej wizyty.
- Feed "Gorące okazje dziś" (strona główna)
- Historia cen (wykres per gra)
- Filtry: Podstawka/DLC + liczba graczy
- Alerty cenowe (email, bez konta)

**Temat 2: Profil Gry**
Centrum informacyjne które zastępuje BGG + wizyty w sklepach.
- Paszport planszówki (BGG API + dane cenowe)
- Ostrzeżenie o wymaganiach DLC
- Podstrona "Nadchodzi" (preordery i nowości)

**Temat 3: Niszowy Segment — Flippers**
Dedykowane narzędzie dla kupujących z myślą o odsprzedaży.
- Flipper Mode (widok transakcyjny)
- Historia cen + szacowany zysk
- Alerty o drastycznych spadkach (Typ B)

**Temat 4: Wzrost i Retention**
Mechanizmy które budują nawyk i przyciągają nowych użytkowników.
- SEO-first architektura stron gier
- Newsletter tygodniowy
- Feed gorących okazji jako magnes dla nowych użytkowników

**Temat 5: Fundamenty Techniczne**
Decyzje architektoniczne które warunkują wszystko inne.
- Scraper PrestaShop (3Trolle + AlePlanszowki jeden moduł)
- Deduplicacja EAN → BGG ID → Fuzzy
- MVP bez Rebela (robots.txt blokuje /promocje/)

---

### Priorytety — MVP vs Etapy Późniejsze

**MVP (Faza 1) — Sklepy: 3Trolle, AlePlanszowki, Mepel**
- ✅ Feed "Gorące okazje dziś" na stronie głównej
- ✅ Paszport planszówki (BGG API + ceny)
- ✅ Historia cen
- ✅ Filtry: Podstawka/DLC + liczba graczy
- ✅ Alerty cenowe (email, bez rejestracji)
- ✅ Ostrzeżenie o wymaganiach DLC
- ✅ Flipper Mode
- ✅ Podstrona "Nadchodzi" (preordery ze sklepów)
- ✅ SEO-first architektura
- ✅ Scraper PrestaShop + deduplicacja EAN

**Faza 2**
- 🔜 Rebel.pl (wymaga obejścia robots.txt lub negocjacji)
- 🔜 Konta użytkowników + wishlist + optymalizacja koszyka
- 🔜 BGG integracja użytkownika (kolekcja, wishlist sync)
- 🔜 Więcej sklepów planszówkowych
- 🔜 Newsletter tygodniowy
- 🔜 Dodatkowe filtry (mechanika, wiek, czas gry)

**Faza 3**
- 🔮 React Native (iOS + Android), dystrybucja GitHub
- 🔮 Kickstarter/Gamefound integracja
- 🔮 Strony wydawców (PortalGames, Lacerta itp.)
- 🔮 Monetyzacja + programy afiliacyjne
- 🔮 Allegro/OLX integracja dla flipperów (marża rynkowa)

---

## Podsumowanie Sesji

**Łączna liczba pomysłów:** 14 (10 funkcji + 4 decyzje techniczne)
**Kluczowy przełom:** Flipper Mode jako unikalny segment nieobsługiwany przez żaden istniejący polski agregator
**Największe odkrycie techniczne:** 3Trolle i AlePlanszowki działają na PrestaShop — jeden scraper obsługuje oba sklepy
**Krytyczna decyzja:** EAN jako główny klucz deduplicacji produktów między sklepami
**Projekt:** Open-source, hobbistyczny — monetyzacja gdy produkt osiągnie dojrzałość

**Następne kroki w BMad:**
1. Stworzenie PRD na podstawie zebranych pomysłów
2. Architektura techniczna (stack frontendowy, backend, baza danych, schemat scraperów)
3. Epiki i stories dla MVP
