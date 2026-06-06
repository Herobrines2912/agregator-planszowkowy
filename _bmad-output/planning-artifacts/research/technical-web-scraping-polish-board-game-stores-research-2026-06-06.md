---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: ['_bmad-output/brainstorming/brainstorming-session-2026-06-05-233722.md']
workflowType: 'research'
lastStep: 5
research_type: 'technical'
research_topic: 'Web scraping feasibility for Polish board game stores aggregator'
research_goals: 'Verify technical viability of scraping approach from brainstorming: robots.txt constraints per store, PrestaShop scraping patterns, rate limits, EAN deduplication, BGG API limits, price history storage'
user_name: 'Kacper'
date: '2026-06-06'
web_research_enabled: true
source_verification: true
---

# Raport Techniczny: Scraping Polskich Sklepów z Planszówkami

**Data:** 2026-06-06
**Autor:** Kacper
**Typ badania:** Weryfikacja techniczna założeń z brainstormingu

---

## Technical Research Scope Confirmation

**Research Topic:** Web scraping feasibility for Polish board game stores aggregator
**Research Goals:** Verify technical viability of scraping approach from brainstorming: robots.txt per store, PrestaShop scraping, rate limits, EAN deduplication, BGG API limits, price history storage

**Technical Research Scope:**
- Architecture Analysis — design patterns, frameworks, system architecture
- Implementation Approaches — development methodologies, coding patterns
- Technology Stack — languages, frameworks, tools, platforms
- Integration Patterns — APIs, protocols, interoperability
- Performance Considerations — scalability, optimization, patterns

**Research Methodology:**
- Live robots.txt verification (direct HTTP fetch)
- Live store HTML structure inspection
- BGG API live endpoint testing
- Multi-source validation for critical technical claims
- Confidence levels on uncertain information

**Scope Confirmed:** 2026-06-06

---

## 1. Executive Summary

### Co działa zgodnie z założeniami

| Założenie z brainstormingu | Status | Szczegóły |
|---|---|---|
| 3Trolle i AlePlanszowki na PrestaShop | ✅ Potwierdzone | Oba sklepy potwierdzono jako PrestaShop |
| 3Trolle brak crawl-delay | ✅ Potwierdzone | Brak Crawl-delay w robots.txt |
| AlePlanszowki brak crawl-delay | ✅ Potwierdzone | Brak Crawl-delay w robots.txt |
| Rebel blokuje /promocje/ dla botów | ✅ Potwierdzone | Disallow: /promocje/ dla wszystkich poza Googlebotm |
| Mepel crawl-delay 1s | ✅ Potwierdzone | Request-rate: 1/s w robots.txt |
| MVP bez Rebela | ✅ Słuszna decyzja | Crawl-delay 5s + blokada /promocje/ |

### Krytyczne problemy wymagające zmiany planu

| Problem | Severity | Wpływ |
|---|---|---|
| BGG API wymaga teraz auth tokenów | 🔴 Krytyczny | Trzeba zarejestrować aplikację — nie jest to już darmowe 0-friction |
| EAN NIE jest w BGG API | 🔴 Krytyczny | Strategia deduplicacji EAN-first wymaga przeprojektowania |
| Mepel agresywnie blokuje boty (403) | 🟠 Wysoki | Mepel MVP może nie zadziałać bez obejścia anty-bot |
| BGG API nie zwraca EAN | 🟠 Wysoki | GameUPC jako alternatywa ma tylko 15k wpisów |
| 3Trolle używa wewnętrznych SKU, nie EAN | 🟡 Średni | EAN może być tylko na stronie produktu, nie w listingu |

---

## 2. Analiza robots.txt per sklep

### 2.1 3Trolle.pl

```
User-agent: *
Allow: */modules/*.css, */modules/*.js, /js/jquery/*
Disallow: [standardowe kontrolery PrestaShop: cart, order, auth, search, account]
Disallow: [katalogi systemowe: /app/, /cache/, /classes/, /config/ itd.]
Crawl-delay: BRAK
```

**Ocena dla scrapera:**
- ✅ Brak crawl-delay — scraper może działać szybko
- ✅ Strony produktów i kategorii są dostępne
- ✅ /promocje/ NIE jest zablokowane
- ✅ Standardowe blokady PrestaShop (koszyk, konto) nie wpływają na scraping cen
- Platforma: **PrestaShop** (potwierdzone przez HTML, URL-e, moduły)
- Rozmiar: 634+ planszówek, 53 strony paginacji (po 12 produktów/strona)

### 2.2 AlePlanszowki.pl

```
User-agent: *
Allow: */modules/*.css, */modules/*.js, /js/jquery/*
Disallow: [standardowe kontrolery PrestaShop: identyczne jak 3Trolle]
Crawl-delay: BRAK
Sitemap: https://aleplanszowki.pl/1_index_sitemap.xml
```

**Ocena dla scrapera:**
- ✅ Brak crawl-delay
- ✅ Sitemap dostępny — można zindeksować wszystkie produkty przez sitemap
- ✅ Kategorie: /231-wszystkie (wszystkie produkty), /368-gry-planszowe-i-towarzyskie
- ✅ URL struktura: `/[id]-[slug]` — przewidywalna
- Platforma: **PrestaShop** (potwierdzone przez HTML, moduł `ps_imageslider`, URL-e)

### 2.3 Mepel.pl

```
User-agent: *
search=yes, ai-train=no
Crawl-delay: 1
Request-rate: 1/1s
Disallow: /application, /environment (except cache/images), /libraries
Disallow: /*/fav/add, /*/p/comment/add, /*/p/mail/recommend, /*/p/q
Disallow: /*/reg, /*/login, /*/basket, /*/searchquery

User-agent: [Cloudflare Managed Bots]
Disallow: Amazonbot, Applebot-Extended, Bytespider, CCBot,
          ClaudeBot, CloudflareBrowserRenderingCrawler,
          Google-Extended, GPTBot, meta-externalagent
```

**Ocena dla scrapera:**
- ⚠️ Crawl-delay 1s — wolniejszy scraping niż 3Trolle/AlePlanszowki
- 🔴 Platforma to **NIE PrestaShop** — struktura robots.txt jest zupełnie inna
- 🔴 Używa Cloudflare do zarządzania botami (blokuje ClaudeBot, GPTBot)
- 🔴 W testach live: większość URL-i zwraca HTTP 403 (aktywna ochrona anty-bot)
- ❓ Platforma: prawdopodobnie **IdoSell/IAI-Shop** (struktura URL-i `/*/basket`, `/*/login` charakterystyczna dla IAI)
- ⚠️ `ai-train=no` — deklaracja intencji właściciela, nie jest technicznie egzekwowalna dla zwykłego HTTP

**WNIOSEK dla MVP: Mepel jest ryzykowny.** Scraper może działać jeśli zostanie zaimplementowany jako „normalny browser" (Playwright + właściwy User-Agent), ale trzeba to przetestować ręcznie. Scenariusz: Mepel wymagał MVP jako jeden z 3 sklepów startowych.

### 2.4 Rebel.pl

```
User-agent: *
Crawl-delay: 5
Disallow: /promocje/, /api/, /shopping/, /account/, /tmp/, /trap.php

User-agent: Googlebot
Allow: /promocje/

User-agent: [lista wrogich botów: MJ12Bot, AhrefsBot, SemrushBot...]
Disallow: /
```

**Ocena dla scrapera:**
- ❌ `/promocje/` zablokowane dla wszystkich poza Googlebotm
- ❌ Crawl-delay 5s = skraping całego katalogu trwałby godziny
- ✅ Strony produktów NIE są zablokowane (tylko /promocje/, /api/ itp.)
- **Decyzja MVP: SŁUSZNA.** Rebel poza MVP jest właściwą decyzją. Faza 2 wymaga albo negocjacji z Rebel.pl, albo scraping stron produktów (nie /promocje/).

---

## 3. Identyfikacja platform e-commerce

| Sklep | Platforma | Pewność | Podstawa |
|---|---|---|---|
| 3Trolle.pl | PrestaShop | ✅ Wysoka | HTML, URL-e, moduły CSS, struktura robots.txt |
| AlePlanszowki.pl | PrestaShop | ✅ Wysoka | HTML, moduł `ps_imageslider`, URL-e, struktura robots.txt |
| Mepel.pl | Prawdopodobnie IdoSell/IAI | 🟡 Średnia | Struktura robots.txt (/*/basket, /*/reg), Cloudflare Managed, nie-PrestaShop wzorzec |
| Rebel.pl | Nieznana (prawdopodobnie własna) | 🟡 Średnia | Własna struktura robots.txt, brak typowych wzorców znanych platform |

### Konsekwencje dla architektury scraperów

**Zmiana względem brainstormingu [Tech #2]:**
Założenie „jeden moduł PrestaShop obsługuje 3Trolle i AlePlanszowki" pozostaje **prawdziwe**, ale:
- Mepel **nie jest** na PrestaShop — wymaga oddzielnego scrapera
- Wersje PrestaShop mogą się różnić między sklepami — selektory CSS mogą się różnić
- Podejście: 1 scraper PrestaShop z konfiguracją per-sklep (selektory mogą wymagać dostosowania)

---

## 4. Struktura HTML — scraping praktyczny

### 4.1 PrestaShop (3Trolle, AlePlanszowki)

**Karty produktów w listingu:**
- Kontener: `.product-item` lub podobna klasa (standardowy PrestaShop)
- Nazwy: nagłówki linkowane
- Ceny: `<span>` z ceną aktualną i regularną
- Rabaty: badge z procentem (np. `-7%`)
- Kody produktów: widoczne w HTML (3Trolle: wewnętrzne SKU jak `3T35971` — **nie EAN**)
- Zdjęcia: lazy-loading z `data:image/svg+xml`

**Paginacja:**
- Standard: numerowane linki stronic
- URL: `?p=2` lub `/p/2/` (zależnie od konfiguracji PrestaShop)
- 3Trolle: 53 strony po 12 produktów (634+ produktów) — da się też ustawić 72/stronę
- Bez infinite scroll / JS loading — statyczny HTML ✅

**Dostępność strony produktu:**
- URL produktu: `/[slug]-[id].html` lub podobny wzorzec
- Na stronie produktu EAN może być widoczny (trzeba zweryfikować ręcznie)

### 4.2 Mepel.pl

- HTTP 403 na wszystkich testowanych URL-ach (/, /gry-planszowe, /sitemap.xml)
- Brak możliwości analizy HTML bez obejścia anty-bot
- **Wymaga przetestowania z Playwright + browser-like User-Agent**
- Prawdopodobna struktura IdoSell: `/[kategoria]/[id],[slug],p,[numer].html`

---

## 5. BGG API — Krytyczna zmiana (październik 2025)

### 5.1 Status (czerwiec 2026)

🚨 **BGG XML API2 wymaga teraz Bearer Token od października 2025.**

To największa nieoczekiwana zmiana techniczna od brainstormingu. BGG przeprowadziło migrację systemu dostępu:
- Wszystkie requesty do `https://boardgamegeek.com/xmlapi2/` zwracają HTTP 401 bez tokenu
- Rejestracja aplikacji jest wymagana
- Dostępna jest licencja niekomercyjna (non-commercial license) — hobby projekty kwalifikują się
- Po rejestracji: Bearer Token w nagłówku `Authorization: Bearer <token>`

**Źródła:**
- BGG Forum: "Heads up... BGG now requiring authorization tokens for XML API" (2025)
- BGG Forum: "Registration to use the XML API (and obtain soon-to-be-required Tokens) is now open"
- BGG Forum: "XML API2 doesn't work anymore" — potwierdzono HTTP 401

### 5.2 Jak to wpływa na projekt

| Scenariusz | Ocena |
|---|---|
| Projekt hobbyistyczny/open-source | ✅ Kwalifikuje się do licencji niekomercyjnej |
| Rejestracja jest bezpłatna | Prawdopodobnie tak, ale wymaga weryfikacji |
| Czas implementacji | +1-2 dni (rejestracja + dodanie auth do kodu) |
| Rate limity po rejestracji | ❓ Nieudokumentowane, ale >2 req/s historycznie dozwolone |

**Zalecenie:** Zarejestruj aplikację na BGG przed rozpoczęciem implementacji. Proces wygląda na prosty (formularz + token), ale dodaje friction której nie było w brainstormingu.

### 5.3 Pola dostępne w BGG XML API2

Endpoint: `GET /xmlapi2/thing?id=<bgg_id>&stats=1`

| Pole | Dostępne | Uwagi |
|---|---|---|
| `name` | ✅ | Nazwa gry |
| `yearpublished` | ✅ | Rok wydania |
| `minplayers` / `maxplayers` | ✅ | Liczba graczy |
| `minplaytime` / `maxplaytime` | ✅ | Czas rozgrywki |
| `minage` | ✅ | Minimalny wiek |
| `averageweight` (trudność) | ✅ | Ze stats=1 |
| `categories` | ✅ | Link type="boardgamecategory" |
| `mechanics` | ✅ | Link type="boardgamemechanic" |
| `designers` / `artists` / `publishers` | ✅ | Link type= |
| `expansions` | ✅ | Link type="boardgameexpansion" — **kluczowe dla DLC warning** |
| `image` / `thumbnail` | ✅ | URL do okładki |
| **EAN / barcode** | ❌ **NIE MA** | BGG API nie zwraca kodów EAN |

### 5.4 BGG XML Snapshot (bulk download)

- Ostatni oficjalny snapshot: **2008** — przestarzały, bezużyteczny
- Brak aktualnego bulk download od BGG
- Alternatywa: GitHub repos z community-scraped danymi (np. `inaimathi/all-boardgames-ever`)
- **Rekomendacja:** Używać API on-demand (lazy loading danych BGG przy dodawaniu nowej gry do bazy)

---

## 6. Deduplicacja produktów — weryfikacja strategii EAN-first

### 6.1 Problem z EAN

**Założenie z brainstormingu [Tech #4]:** EAN jako główny klucz deduplicacji.

**Rzeczywistość:**

| Źródło EAN | Status | Szczegóły |
|---|---|---|
| BGG API | ❌ Brak | API nie zawiera pola EAN/barcode |
| Listing produktów w sklepie | ❓ Nieznany | 3Trolle pokazuje wewnętrzne SKU (3T35971), nie EAN |
| Strona produktu w sklepie | 🟡 Prawdopodobne | EAN może być w HTML szczegółów produktu |
| GameUPC | 🟡 Częściowe | 15,000 zwalidowanych + 19,000 sugestii — tylko ~34k wpisów |

### 6.2 GameUPC jako alternatywa

GameUPC (`gameupc.com`) to serwis mapujący kody UPC/EAN na BGG ID:
- ✅ Posiada RESTful API
- ✅ 15,000+ zwalidowanych wpisów (human-verified)
- 🟡 19,000 dodatkowych sugestii (community, niezwalidowane)
- ❓ Rate limity i pricing nieznane (strona ich nie podaje)
- ⚠️ Pokrycie nieznane — dla polskich wydań gier może być niskie

### 6.3 Strategia deduplicacji — zalecana zmiana

**Stara strategia (brainstorming):** EAN → BGG ID → fuzzy matching

**Nowa zalecana strategia:**

```
Krok 1: Scraping strony produktu (nie tylko listingu)
        → Pobranie EAN (jeśli sklep go pokazuje)

Krok 2: BGG ID jako primary key (zamiast EAN)
        → BGG ID jest stabilny, unikalny, zawsze dostępny przez API
        → EAN traktuj jako dodatkowe pole, nie klucz

Krok 3: Matching produkt → BGG ID
        Priorytet:
        a) EAN → GameUPC API → BGG ID (jeśli EAN dostępny i GameUPC go ma)
        b) Fuzzy matching nazwy → BGG Search API → BGG ID
        c) Ręczna weryfikacja (kolejka)

Krok 4: Deduplicacja między sklepami = BGG ID (jeden produkt = jeden BGG ID)
```

**Dlaczego BGG ID jako klucz zamiast EAN:**
- BGG ID zawsze dostępny po API BGG
- EAN może być różny dla polskiego/angielskiego wydania tej samej gry
- BGG ID jest jednoznaczny dla konkretnej edycji
- EAN może się powtarzać między wersjami (zdarza się błędy wydawców)

---

## 7. Architektura scraperów — ocena techniczna

### 7.1 Stack rekomendowany

```
Language:     Python 3.11+
Scraping:     Scrapy (lub httpx + BeautifulSoup dla prostszych przypadków)
Scheduling:   APScheduler lub Celery + Redis
Storage:      PostgreSQL (prosta tabela price_history)
BGG Client:   httpx z Bearer Token auth
```

**Uzasadnienie Scrapy:**
- Wbudowane rate-limiting (DOWNLOAD_DELAY, AUTOTHROTTLE)
- Middleware do retry, cookies, User-Agent rotation
- Pipeline do parsowania i zapisu do DB
- Sprawdzony w produkcji dla e-commerce

### 7.2 Architktura scrapera PrestaShop

```python
# Pseudo-flow dla 3Trolle i AlePlanszowki
class PrestaShopSpider(scrapy.Spider):
    custom_settings = {
        'DOWNLOAD_DELAY': 0,  # 3Trolle i AlePlanszowki — brak crawl-delay
        'CONCURRENT_REQUESTS_PER_DOMAIN': 4,
    }

    def start_requests(self):
        # Opcja A: Scraping przez kategorię (paginacja numeryczna)
        for page in range(1, MAX_PAGES):
            yield scrapy.Request(f"{CATEGORY_URL}?p={page}")

        # Opcja B: Scraping przez sitemap (AlePlanszowki ma sitemap)
        yield scrapy.Request(SITEMAP_URL, callback=self.parse_sitemap)

    def parse_listing(self, response):
        # Selektory — MUSZĄ być skonfigurowane per-sklep
        products = response.css('.product-item')  # przykład
        for product in products:
            yield {
                'name': product.css('.product-name::text').get(),
                'price': product.css('.price::text').get(),
                'url': product.css('a::attr(href)').get(),
            }
        # Paginacja
        next_page = response.css('.pagination .next a::attr(href)').get()
        if next_page:
            yield scrapy.Request(next_page)
```

**Ważna uwaga:** CSS selektory będą różne dla 3Trolle i AlePlanszowki mimo tej samej platformy — każdy sklep może używać customowego theme. Konieczna jest weryfikacja ręczna HTML każdego ze sklepów.

### 7.3 Mepel — wymagania specjalne

Mepel zwraca HTTP 403 dla standardowych requestów. Opcje:

| Opcja | Trudność | Ryzyko |
|---|---|---|
| Playwright + browser fingerprinting | Średnia | Może zadziałać |
| Scrapy + Splash (headless browser proxy) | Średnia | Sprawdzony w produkcji |
| Zmiana User-Agent na popularny browser | Niska | Może być niewystarczające |
| Zakup proxy rotation | Wysoka | Koszt, złożoność |
| Rezygnacja z Mepel w MVP | Brak | Zmniejszenie zakresu |

**Rekomendacja:** Przetestuj najpierw z samą zmianą User-Agent. Jeśli nie zadziała — Playwright. Jeśli nadal problem — rozważ wykluczenie z MVP lub kontakt z Mepel.

### 7.4 Scraping na stronach produktów (EAN)

Dla uzyskania EAN konieczne jest odwiedzenie strony każdego produktu (nie tylko listingu):
- Dodaje ~N requestów (N = liczba produktów)
- Dla 3Trolle: 634 produktów → 634 dodatkowych requestów przy pierwszym scrape
- Bez crawl-delay: ~634 req × 0.2s avg = ~2 minuty
- Z crawl-delay 1s (Mepel): ~634 req × 1s = ~10 minut

**Optymalizacja:** EAN scraping robić tylko przy nowych produktach (nie przy każdym cyklicznym scrapie cen).

---

## 8. Szacunek czasu scrapingu

### 8.1 Scraping kategorii (ceny) — cykliczny

| Sklep | Produkty | Strony | Delay | Czas szacunkowy |
|---|---|---|---|---|
| 3Trolle.pl | ~634 | ~53 | Brak | 1–2 minuty |
| AlePlanszowki.pl | ~TBD (podobna skala) | ~TBD | Brak | 1–2 minuty |
| Mepel.pl | ❓ Nieznany | ❓ | 1s/req | 10–30 minut |
| **Łącznie** | | | | **12–35 minut** |

Brainstorming zakładał "15 min bez optymalizacji → 2 min z optymalizacją". Realnie dla 2 sklepów PrestaShop (bez Mepel): **2–4 minuty**. Z Mepel: znacznie dłużej.

### 8.2 Scraping BGG (uzupełnianie danych)

Przy 2 req/s (historyczny safe limit):
- 1000 gier → ~8 minut
- BGG API może throttlować (HTTP 429) przy przekroczeniu limitu
- Zalecenie: scrap BGG danych lazily przy dodawaniu produktu, nie bulk

---

## 9. Przechowywanie historii cen

### 9.1 Schema (PostgreSQL)

```sql
-- Produkty (jeden rekord per gra × sklep)
CREATE TABLE products (
    id          BIGSERIAL PRIMARY KEY,
    bgg_id      INTEGER,               -- BGG ID (NULL jeśli nieznany)
    ean         VARCHAR(13),           -- EAN/UPC (NULL jeśli nieznany)
    store_id    INTEGER NOT NULL,
    store_sku   VARCHAR(100) NOT NULL, -- wewnętrzny SKU sklepu
    name        TEXT NOT NULL,
    url         TEXT NOT NULL,
    UNIQUE(store_id, store_sku)
);

-- Historia cen — append-only time series
CREATE TABLE price_history (
    id          BIGSERIAL PRIMARY KEY,
    product_id  BIGINT NOT NULL REFERENCES products(id),
    scraped_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    price       NUMERIC(10,2) NOT NULL,
    price_orig  NUMERIC(10,2),         -- cena regularna (przed rabatem)
    in_stock    BOOLEAN DEFAULT TRUE
);

-- Index dla wykresów historii
CREATE INDEX idx_price_history_product_time
    ON price_history (product_id, scraped_at DESC);
```

### 9.2 Ocena rozwiązań

| Rozwiązanie | MVP | Skala | Uwagi |
|---|---|---|---|
| PostgreSQL (powyższe) | ✅ | Do ~10M wierszy | Wystarczające dla MVP |
| TimescaleDB | ❌ Zbędne | 100M+ wierszy | Overkill na MVP |
| SQLite | 🟡 Lokalnie | Do ~1M wierszy | OK na dev, nie prod |

Przy 3 sklepach × 2000 produktów × 365 scrapów/rok = **2.19M wierszy/rok** — zwykły PostgreSQL z indeksem wystarczy przez co najmniej 3-5 lat.

---

## 10. Matryca ryzyk

| Ryzyko | Prawdopodobieństwo | Wpływ | Mitygacja |
|---|---|---|---|
| BGG API zmienia warunki/cennik dla non-commercial | Niskie | Wysoki | Cachować dane BGG lokalnie, ograniczyć zależność |
| Mepel aktualizuje anty-bot i blokuje scraper | Średnie | Średni | Alternatywne podejście (Playwright) lub wykluczenie |
| 3Trolle/AlePlanszowki zmienia strukturę HTML | Niskie | Niski | Testy CI wykrywające zmiany selektorów |
| EAN niedostępny w listingach sklepów | Wysokie | Średni | BGG ID jako primary key, EAN jako bonus |
| GameUPC nie pokrywa polskich wydań | Wysokie | Średni | Fuzzy matching + ręczna weryfikacja |
| Rebel.pl pozew za scraping | Bardzo niskie | Wysoki | MVP bez Rebela, ewentualne negocjacje |

---

## 11. Rekomendacje — zmiany względem brainstormingu

### Zachować bez zmian
- ✅ MVP = 3Trolle + AlePlanszowki + Mepel (ale Mepel jest ryzykowny)
- ✅ Rebel.pl poza MVP
- ✅ PrestaShop jako primary scraper platform
- ✅ Strategia "scraper per platforma"
- ✅ Cykliczny scraping (cron job)

### Zmienić względem brainstormingu

**[Tech #4] Deduplicacja — zmiana klucza:**
> **Stare:** EAN → BGG ID → fuzzy matching
> **Nowe:** BGG ID jako primary key. EAN zbierać ze stron produktów (lazy), używać jako pomocniczy. GameUPC jako most EAN→BGG ID.

**[Funkcja #6] Paszport planszówki — BGG API:**
> **Stare:** BGG API jest darmowe i bezproblemowe
> **Nowe:** BGG API wymaga rejestracji i Bearer Token od X 2025. **Zadanie przed implementacją:** zarejestruj aplikację na BGG (prawdopodobnie bezpłatne dla non-commercial).

**[Tech #1] Mepel — ryzyko anty-bot:**
> **Stare:** Mepel dostępny (crawl-delay 1s, brak blokady)
> **Nowe:** Mepel aktywnie blokuje boty (HTTP 403, Cloudflare). Wymagany Playwright lub zmiana User-Agent. Alternatywnie: start od 2 sklepów (3Trolle + AlePlanszowki) i dodaj Mepel w Fazie 1.5.

### Nowe rekomendacje (spoza brainstormingu)

1. **Sitemap-first dla AlePlanszowki:** `https://aleplanszowki.pl/1_index_sitemap.xml` pozwala zindeksować wszystkie produkty bez paginacji.
2. **EAN na stronie produktu, nie listingu:** Scraping szczegółów produktu jest wymagany dla EAN — dodaj to do planu implementacji.
3. **BGG ID lookup jako background job:** Nie blokuj scraping cen na dopasowanie BGG ID. Dodawaj produkty do kolejki BGG lookup asynchronicznie.
4. **Lazy BGG data:** Pobieraj dane BGG dopiero gdy produkt zostaje po raz pierwszy zlinkowany do BGG ID — nie z góry.

---

## 12. Stack techniczny — rekomendacja końcowa

```
Backend scraper:    Python 3.11 + Scrapy
BGG client:         httpx + Bearer Token (zarejestrowany token)
EAN lookup:         GameUPC API (jako best-effort)
Baza danych:        PostgreSQL 16 z powyższym schema
Scheduler:          APScheduler (prosty cron-like) lub Celery + Redis
Deployment:         Docker Compose (lokalnie), VPS (prod)
Headless browser:   Playwright (tylko dla Mepel, jeśli potrzebny)
```

---

---

## 13. Integration Patterns Analysis

### 13.1 Data Pipeline — Scrapy → PostgreSQL

**Wzorzec:** Scrapy Item Pipeline (sprawdzony dla e-commerce, 2024–2026)

```
Spider (HTTP request)
    ↓
Item (structured data object)
    ↓
Pipeline Stage 1: Validation (price > 0, name not empty)
    ↓
Pipeline Stage 2: Deduplication (store_id + store_sku → product_id)
    ↓
Pipeline Stage 3: PostgreSQL upsert (price_history INSERT)
```

**Scrapy 2.14+ (2026):** Nowe AsyncCrawlerProcess i AsyncCrawlerRunner — lepsze async performance. Domyślny template zmienił `DOWNLOAD_DELAY=1` — dla 3Trolle/AlePlanszowki można go wyzerować.

**PostgreSQL integracja:** psycopg2 lub SQLAlchemy w pipeline. Pattern:
```python
class PriceHistoryPipeline:
    def open_spider(self, spider):
        self.conn = psycopg2.connect(DATABASE_URL)

    def process_item(self, item, spider):
        # Upsert product, insert price_history
        with self.conn.cursor() as cur:
            cur.execute("""
                INSERT INTO price_history (product_id, price, price_orig, scraped_at)
                VALUES (%s, %s, %s, NOW())
            """, (item['product_id'], item['price'], item['price_orig']))
        self.conn.commit()
        return item
```

_Źródła:_ [Scrapy + PostgreSQL](https://www.jitsejan.com/scraping-with-scrapy-and-postgres), [Scrapy Pipelines docs](https://docs.scrapy.org/en/latest/topics/item-pipeline.html)

---

### 13.2 Scheduler — kiedy scrapeować

**Rekomendacja dla MVP: APScheduler (in-process)**

| Narzędzie | Złożoność | Kiedy używać |
|---|---|---|
| System cron | Minimalna | OK dla MVP if Docker |
| APScheduler | Niska | MVP — in-process, Python |
| Celery + Redis | Wysoka | Skala produkcyjna |

**Prosty wzorzec z APScheduler:**
```python
from apscheduler.schedulers.blocking import BlockingScheduler

scheduler = BlockingScheduler()

@scheduler.scheduled_job('cron', hour=6, minute=0)  # codziennie 6:00
def run_scrapers():
    run_scrapy('threeTrolleSpider')
    run_scrapy('alePlanszowkiSpider')
    run_scrapy('mepelSpider')

@scheduler.scheduled_job('cron', day_of_week='mon', hour=7)  # newsletter
def send_weekly_newsletter():
    send_top_deals_email()
```

**Celery + Redis: kiedy warto?** Gdy potrzebne są: retry po 429, distributed workers, monitoring. MVP nie potrzebuje — prosta cron wystarczy.

_Źródła:_ [APScheduler vs Celery Beat](https://leapcell.io/blog/scheduling-tasks-in-python-apscheduler-vs-celery-beat), [Celery web scraping](https://scrapeops.io/web-scraping-playbook/celery-rabbitmq-scraper-scheduling/)

---

### 13.3 Email Alerty — integracja

**Wzorzec:** Transactional email API (bez SMTP dla produkcji)

**Rekomendowani dostawcy dla projektu hobby/open-source:**

| Dostawca | Free tier | Python SDK | Uwagi |
|---|---|---|---|
| **Resend** | 3,000 emaili/miesiąc | ✅ `resend` | Najnowszy, developer-friendly |
| **Mailgun** | 5,000 emaili/3 miesiące | ✅ requests | Sprawdzony w prod |
| **Brevo (Sendinblue)** | 300 emaili/dzień | ✅ sib-api | Darmowy bez limitu miesięcznego |

**Dla MVP (bez kont użytkownika) — alert e-mail bez rejestracji:**
```python
# Wzorzec: podpisany link do anulowania subskrypcji
import secrets

def create_alert(email, game_id, threshold_price):
    token = secrets.token_urlsafe(32)
    db.insert('price_alerts', {
        'email': email,
        'game_id': game_id,
        'threshold': threshold_price,
        'unsubscribe_token': token,
        'confirmed': False  # double opt-in via email
    })
    send_confirmation_email(email, token)
```

**Double opt-in obowiązkowy** (RODO/GDPR wymaga potwierdzenia dla alertów email bez rejestracji konta).

_Źródła:_ [Best Email APIs 2026](https://www.agentmail.to/blog/5-best-email-api-for-developers-compared-2026), [Mailgun Python](https://www.mailgun.com/blog/it-and-engineering/send-email-using-python/)

---

### 13.4 BGG API — integracja z Bearer Token

**Od X 2025: Bearer Token wymagany.**

```python
import httpx

class BGGClient:
    BASE_URL = "https://boardgamegeek.com/xmlapi2"

    def __init__(self, token: str):
        self.headers = {"Authorization": f"Bearer {token}"}

    def get_game(self, bgg_id: int) -> dict:
        r = httpx.get(
            f"{self.BASE_URL}/thing",
            params={"id": bgg_id, "stats": 1},
            headers=self.headers
        )
        r.raise_for_status()
        return parse_bgg_xml(r.content)
```

**Strategia cachowania BGG danych:**
- BGG data zmienia się rzadko (ranking, mechanics, etc.)
- Cache w PostgreSQL: kolumna `bgg_synced_at`, odświeżaj co 30 dni
- Lazy load: pobieraj BGG data dopiero gdy gra pojawia się w scrape po raz pierwszy

**Rate limiting BGG (nieudokumentowane, praktyczne):**
- Historycznie: 2 req/s max
- Bezpieczne: 1 req/s z exponential backoff na 429
- Nie pushuj bulk (1000+ gier naraz) — throttle do 0.5–1 req/s

---

### 13.5 Frontend — API i SEO integracja

**Wzorzec: Next.js 14+ App Router z Server Components**

```
PostgreSQL
    ↓
REST API (FastAPI/Django REST / Next.js API Routes)
    ↓
Next.js Server Components (SSR/ISR)
    ↓
HTML z JSON-LD (schema.org Product)
```

**Schema.org Product dla stron gier (rich snippets):**
```json
{
  "@context": "https://schema.org/",
  "@type": "Product",
  "name": "Brass Birmingham",
  "description": "Strategiczna gra ekonomiczna dla 2-4 graczy",
  "image": "https://...",
  "offers": [{
    "@type": "Offer",
    "url": "https://3trolle.pl/...",
    "priceCurrency": "PLN",
    "price": "119.90",
    "availability": "https://schema.org/InStock",
    "seller": {"@type": "Organization", "name": "3Trolle"}
  }]
}
```

**Product wymaga dla rich snippets:** `AggregateRating` LUB `Review` + `Offer` z ceną. Dla agregatora: `AggregateOffer` z `lowPrice`, `highPrice`, `offerCount`.

**ISR (Incremental Static Regeneration) dla stron gier:**
- Generuj statycznie strony gier (tysiące URL-i)
- Revalidate co X minut (np. `revalidate: 3600`) — ceny nie muszą być real-time

_Źródła:_ [Next.js SEO](https://nextjs.org/learn/seo/metadata), [Structured Data 2026](https://www.digitalapplied.com/blog/structured-data-seo-2026-rich-results-guide), [Schema.org e-commerce](https://crystallize.com/answers/tech-dev/structured-data)

---

### 13.6 GameUPC API — integracja EAN→BGG ID

```python
import httpx

class GameUPCClient:
    BASE_URL = "https://gameupc.com/api"  # URL do weryfikacji

    def lookup_ean(self, ean: str) -> int | None:
        """Zwraca BGG ID lub None jeśli nie znaleziono."""
        r = httpx.get(f"{self.BASE_URL}/upc/{ean}")
        if r.status_code == 200:
            return r.json().get("bgg_id")
        return None
```

**Strategia użycia:**
1. Scraped EAN → GameUPC lookup → BGG ID (fast path)
2. GameUPC nie ma EAN → BGG Search API po nazwie gry → BGG ID (slow path)
3. Brak pewnego dopasowania → kolejka ręcznej weryfikacji

**Uwaga:** GameUPC API endpoint i rate limits wymagają weryfikacji na etapie implementacji — serwis nie dokumentuje ich publicznie.

---

---

## 14. Architectural Patterns and Design

### 14.1 Monolith vs Microservices — decyzja architektoniczna

**Rekomendacja dla MVP: Modular Monolith**

Dane z 2025: 42% organizacji które przyjęły mikroservisy konsoliduje je z powrotem w większe jednostki — powody: debugging complexity, operational overhead, network latency.

Dla projektu hobby/open-source z jednym deweloperem:

| Kryterium | Monolith | Microservices |
|---|---|---|
| Koszt infrastruktury | $5–20/miesiąc (VPS) | $50–200+/miesiąc |
| Złożoność operacyjna | Niska | Wysoka |
| Czas do MVP | Tygodnie | Miesiące |
| Debug i monitoring | Proste | Wymaga dodatkowych narzędzi |
| Skalowanie | Wystarczające dla obecnej skali | Overkill |

**Zalecanaz architektura: Modular Monolith na Docker Compose**

```
┌─────────────────────────────────────────────────────────┐
│                    VPS (1 serwer)                       │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Scrapy     │  │  FastAPI     │  │  PostgreSQL   │  │
│  │  (worker)   │  │  (backend)   │  │  (baza danych)│  │
│  │             │  │              │  │               │  │
│  │  Cron jobs  │  │  REST API    │  │  price_history│  │
│  │  per store  │  │  /games      │  │  products     │  │
│  │             │  │  /deals      │  │  alerts       │  │
│  └─────────────┘  │  /alerts     │  └───────────────┘  │
│         ↓         └──────────────┘                      │
│  ┌─────────────┐         ↑                             │
│  │  APScheduler│         │                             │
│  │  (cron)     │  ┌──────┴──────┐                      │
│  └─────────────┘  │   Nginx     │                      │
│                   │  (reverse   │                      │
│                   │   proxy)    │                      │
│                   └─────────────┘                      │
└─────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────┐
│              Next.js (Vercel — free tier)               │
│  SSR/ISR pages, schema.org, SEO                        │
└─────────────────────────────────────────────────────────┘
```

**Uzasadnienie podziału Frontend/Backend:**
- Next.js na Vercel: free tier obsługuje SSR/ISR, automatyczne CDN, bez DevOps
- FastAPI na VPS: scraper + API w tym samym środowisku Python
- PostgreSQL: na tym samym VPS (bez managed DB dla MVP)

---

### 14.2 System Architecture Patterns

**Wzorzec: Producer–Consumer z shared database**

```
[Scrapy Spiders] --insert--> [PostgreSQL] <--read-- [FastAPI]
      ↑                           |                      ↓
[APScheduler]              [Price Alerts]          [Next.js]
  (cron trigger)           (background check)    (frontend)
```

Nie Event-driven (Kafka/RabbitMQ) dla MVP — direct DB polling wystarczy przy tej skali.

**Alert engine pattern:**
```python
# Po każdym scrape — sprawdź alerty
def check_alerts_after_scrape(product_id: int, new_price: float):
    alerts = db.query("""
        SELECT * FROM price_alerts
        WHERE game_id = %s
        AND threshold >= %s
        AND confirmed = TRUE
        AND last_notified_at < NOW() - INTERVAL '24 hours'
    """, (product_id, new_price))

    for alert in alerts:
        send_price_alert_email(alert)
        db.update_last_notified(alert.id)
```

---

### 14.3 Deployment Architecture

**Docker Compose — docker-compose.yml dla MVP:**

```yaml
version: '3.9'
services:
  postgres:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
    env_file: .env

  backend:
    build: ./backend
    depends_on: [postgres]
    environment:
      - DATABASE_URL=postgresql://...
      - BGG_TOKEN=${BGG_TOKEN}
    command: uvicorn main:app --host 0.0.0.0 --port 8000

  scraper:
    build: ./scraper
    depends_on: [postgres]
    command: python scheduler.py  # APScheduler z cron jobs

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf

volumes:
  pgdata:
```

**Deployment na VPS:**
- DigitalOcean Droplet (4GB RAM, 2 vCPU) ~$24/miesiąc lub Hetzner CX21 ~€4.5/miesiąc
- Certbot + Let's Encrypt dla SSL
- GitHub Actions → SSH → `docker-compose up -d --build` (CD pipeline)

**Opcja alternatywna:** Next.js na Vercel (free) + FastAPI na Railway.app (free tier: $5 credit/miesiąc) + Neon PostgreSQL (free tier: 0.5GB)

---

### 14.4 Data Architecture

**Separation of concerns w bazie:**

```
products          — "co" (gra × sklep, raz, rzadko się zmienia)
price_history     — "za ile" (append-only, często, historyczne)
bgg_data          — "jakie info" (cache BGG API, odświeżane co 30 dni)
price_alerts      — "kto chce wiedzieć" (email subscriptions)
stores            — "skąd" (konfiguracja sklepów)
```

**Indexing strategy:**
```sql
-- Najczęstsze zapytania
CREATE INDEX idx_price_history_product_date ON price_history (product_id, scraped_at DESC);
CREATE INDEX idx_products_bgg ON products (bgg_id) WHERE bgg_id IS NOT NULL;
CREATE INDEX idx_products_ean ON products (ean) WHERE ean IS NOT NULL;
CREATE INDEX idx_price_history_recent ON price_history (scraped_at DESC);  -- "hot deals today"
```

**Materialized View dla "gorące okazje" (Feed strony głównej):**
```sql
CREATE MATERIALIZED VIEW hot_deals AS
SELECT
    p.id, p.name, p.bgg_id,
    ph.price, ph.price_orig,
    ROUND((1 - ph.price/ph.price_orig) * 100) AS discount_pct,
    ph.scraped_at
FROM price_history ph
JOIN products p ON ph.product_id = p.id
WHERE ph.scraped_at > NOW() - INTERVAL '24 hours'
  AND ph.price_orig IS NOT NULL
  AND ph.price < ph.price_orig * 0.85  -- min 15% rabat
ORDER BY discount_pct DESC;

-- Odświeżaj po każdym scrape
REFRESH MATERIALIZED VIEW hot_deals;
```

---

### 14.5 Security Architecture

**Brak kont użytkowników w MVP — uproszczone wymagania:**

| Obszar | Ryzyko | Mitygacja |
|---|---|---|
| Email alerts | Dane osobowe (email) | Double opt-in + RODO compliance |
| BGG API token | Token w env vars | Docker secrets lub .env poza repo |
| SQL injection | Zawsze | Parametrized queries (psycopg2) |
| SSRF przez scraper | Niskie (fixed URLs) | Whitelist domen do scrapowania |
| Rate limiting API | DoS | Nginx rate limit lub FastAPI middleware |

---

### 14.6 RODO/GDPR Compliance — email alerty

**Krytyczna zmiana prawna: Polska PKE (od 10 listopada 2024)**

Nowa Ustawa Prawo Komunikacji Elektronicznej zastąpiła Prawo Telekomunikacyjne. Wymagania dla email alertów:

1. **Explicit consent** — użytkownik musi aktywnie wyrazić zgodę (np. checkbox, nie pre-checked)
2. **Double opt-in** — potwierdzenie emailem przed wysłaniem alertów (best practice → de facto standard w Polsce)
3. **Suppression list** — po rezygnacji: email trafia na listę wykluczeń, nie jest usuwany
4. **Prawo do usunięcia** — oddzielny proces niż unsubscribe (RODO Art. 17)
5. **Data minimization** — przechowuj tylko email + ID gry + próg ceny + token

**Wymagane w MVP:**
```python
class PriceAlert(BaseModel):
    email: EmailStr
    game_id: int
    threshold_price: Decimal
    consent_marketing: bool  # musi być True
    # Generowane przez system:
    unsubscribe_token: str  # secrets.token_urlsafe(32)
    confirmed: bool = False  # double opt-in
    confirmed_at: datetime | None = None
```

**Rekordy w Polsce 2025:** UODO nałożyło ponad 64 mln PLN kar w 2025 — enforcement jest realny. Dla hobby projektu z kilkudziesięcioma alertami ryzyko jest minimalne, ale double opt-in jest tanią ochroną.

_Źródła:_ [Microservices vs Monolith 2026](https://www.javacodegeeks.com/2025/12/microservices-vs-monoliths-in-2026-when-each-architecture-wins.html), [Next.js FastAPI PostgreSQL Docker](https://www.travisluong.com/how-to-develop-a-full-stack-next-js-fastapi-postgresql-app-using-docker/), [GDPR Email Compliance 2025](https://maildiver.com/blog/gdpr-email-marketing-compliance-guide/), [Polska PKE 2024](https://www.igdpr.eu/en/gdpr-email-marketing-consent/)

---

---

## 15. Implementation Approaches and Technology Adoption

### 15.1 Testowanie scraperów

**Kluczowy problem:** 10–15% scraperów wymaga napraw co tydzień z powodu zmian DOM w sklepach. Bez testów każda taka zmiana przechodzi niezauważona.

**Wzorzec: scrapy-mock + pytest fixtures**

```python
# tests/fixtures/3trolle_listing.html  ← zapisz prawdziwy HTML ze sklepu
# tests/test_three_trolle_spider.py

import pytest
from scrapy.http import HtmlResponse
from spiders.three_trolle import ThreeTrolleSpider

@pytest.fixture
def sample_listing_page():
    with open("tests/fixtures/3trolle_listing.html", "rb") as f:
        return HtmlResponse(
            url="https://www.3trolle.pl/promocje",
            body=f.read()
        )

def test_extracts_product_name(sample_listing_page):
    spider = ThreeTrolleSpider()
    items = list(spider.parse(sample_listing_page))
    assert len(items) > 0
    assert items[0]["name"] != ""

def test_extracts_price_as_decimal(sample_listing_page):
    spider = ThreeTrolleSpider()
    items = list(spider.parse(sample_listing_page))
    assert all(item["price"] > 0 for item in items)

def test_extracts_discount_price(sample_listing_page):
    spider = ThreeTrolleSpider()
    items = list(spider.parse(sample_listing_page))
    discounted = [i for i in items if i.get("price_orig")]
    assert len(discounted) > 0
    assert all(i["price"] < i["price_orig"] for i in discounted)
```

**Testy integracyjne — weryfikacja selektorów:**
```python
# Uruchamiane w CI raz dziennie (nie przy każdym push)
def test_live_selector_still_works():
    """Smoke test — wykryj zmiany DOM zanim trafi do prod."""
    r = httpx.get("https://www.3trolle.pl/promocje", headers=USER_AGENT)
    soup = BeautifulSoup(r.text, "html.parser")
    products = soup.select(".product-item")  # CSS selector do walidacji
    assert len(products) > 0, "Selector broken — store HTML changed!"
```

**Monitoring danych (post-scrape validation):**
```python
def validate_scrape_results(results: list[dict]) -> None:
    null_rate = sum(1 for r in results if not r.get("price")) / len(results)
    assert null_rate < 0.05, f"Too many null prices: {null_rate:.0%}"
    assert all(r["price"] > 0 for r in results if r.get("price"))
    assert all(r["price"] < 10000 for r in results)  # sanity check PLN
```

_Źródła:_ [scrapy-mock](https://github.com/tcurvelo/scrapy-mock), [Test a Web Scraper using Mocking 2025](https://datawookie.dev/blog/2025/01/test-a-web-scraper-using-mocking/), [Web Scraping Monitoring Challenges](https://www.promptcloud.com/blog/web-scraping-monitoring-challenges/)

---

### 15.2 CI/CD Pipeline

**Stack: GitHub Actions → Docker → VPS (Hetzner)**

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: {python-version: '3.11'}
      - run: pip install -r requirements.txt && pytest tests/ -v

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /opt/board-games-app
            git pull origin main
            docker compose pull
            docker compose up -d --build
            docker image prune -f
```

**Osobny workflow dla scraperów (daily smoke test):**
```yaml
# .github/workflows/scraper-health.yml
on:
  schedule:
    - cron: '0 8 * * *'  # codziennie 8:00

jobs:
  selector-check:
    runs-on: ubuntu-latest
    steps:
      - run: pytest tests/test_live_selectors.py -v
```

**Czas setup:** GitHub Actions CI/CD dla tego stacku można skonfigurować w ~20 minut według aktualnych poradników.

_Źródła:_ [CI/CD Docker GitHub Actions Hetzner](https://infocusdata.com/blog/devops/ci-cd-docker-github-actions-hetzner-deployment), [Easy Python CI/CD Pipeline](https://towardsdatascience.com/the-easy-python-ci-cd-pipeline-using-docker-compose-and-github-actions-80498f47b341/)

---

### 15.3 Mepel — strategia obejścia Cloudflare

**Stan na 2026:**

Cloudflare w marcu 2025 wprowadził **AI Labyrinth** — jeśli bot nawiguje przez >4 poziomy stron bez działań ludzkich, jego fingerprint jest rejestrowany i blokowany. Standardowe stealth plugins nie wystarczają bo Cloudflare sprawdza też TLS fingerprinting i behavioral analysis.

**Opcje dla Mepel (od najprostszej do najtrudniejszej):**

| Opcja | Narzędzie | Skuteczność | Koszt |
|---|---|---|---|
| 1. Zmiana User-Agent | httpx/Scrapy | Niska | $0 |
| 2. Playwright + playwright-stealth | `playwright-stealth` (Python) | Średnia | $0 |
| 3. Nodriver/undetected-chromedriver | `nodriver` | Wysoka | $0 |
| 4. Playwright + residential proxy | Brightdata ~$15/GB | Bardzo wysoka | $15+/miesiąc |
| 5. Rezygnacja z Mepel MVP | — | N/A | $0 |

**Rekomendacja dla MVP:**
1. Zacznij od opcji 2 (Playwright + stealth) — może działać bez proxy
2. Jeśli nie: opcja 3 (Nodriver) — łata TLS fingerprinting
3. Jeśli nadal nie: opcja 5 — Mepel przenieś do Fazy 2

**Nie używaj proxy na MVP** — koszt i złożoność nieuzasadnione dla hobby projektu.

_Źródła:_ [Playwright Stealth Bypass Cloudflare 2025](https://kameleo.io/blog/how-to-bypass-cloudflare-with-playwright), [Bypass Cloudflare 2026](https://scrapfly.io/blog/posts/how-to-bypass-cloudflare-anti-scraping)

---

### 15.4 Monitoring scraperów w produkcji

**Minimalistyczny monitoring dla hobby projektu:**

```python
# Po każdym scrape — zapis metryki do bazy
def record_scrape_run(store_id: int, products_scraped: int,
                      errors: int, duration_s: float):
    db.execute("""
        INSERT INTO scrape_runs (store_id, products_scraped, errors,
                                  duration_s, ran_at)
        VALUES (%s, %s, %s, %s, NOW())
    """, (store_id, products_scraped, errors, duration_s))

# Alert jeśli scraper nie zbierze minimum produktów
def alert_if_broken(store_id: int, min_expected: int = 100):
    last_run = db.fetchone("""
        SELECT products_scraped FROM scrape_runs
        WHERE store_id = %s ORDER BY ran_at DESC LIMIT 1
    """, (store_id,))

    if last_run["products_scraped"] < min_expected:
        send_admin_alert(f"Scraper for store {store_id} may be broken!")
```

**Narzędzie zewnętrzne:** `changedetection.io` (open-source, self-hosted) — monitoring zmian HTML sklepu, alert gdy strona zmieni strukturę.

---

### 15.5 Implementation Roadmap — szacunek czasu

| Faza | Zadania | Szacunek |
|---|---|---|
| **Sprint 0 (Setup)** | Docker Compose, PostgreSQL schema, GitHub Actions CI | 3–5 dni |
| **Sprint 1 (Scraper)** | Scrapy spiders (3Trolle + AlePlanszowki), testy, cron | 1–2 tygodnie |
| **Sprint 2 (API)** | FastAPI endpoints (/games, /deals, /alerts), BGG client | 1–2 tygodnie |
| **Sprint 3 (Frontend MVP)** | Next.js: strona główna + hot deals + strona gry | 2–3 tygodnie |
| **Sprint 4 (Email alerts)** | Subscriptions, double opt-in, Resend/Brevo integracja | 1 tydzień |
| **Sprint 5 (SEO)** | Schema.org, meta tags, ISR, sitemap.xml | 3–5 dni |
| **Sprint 6 (Mepel)** | Playwright scraper, testy, ewentualne obejście Cloudflare | 1–2 tygodnie |
| **Łącznie MVP** | | **~8–12 tygodni** (hobby tempo) |

---

### 15.6 Cost Optimization — rzeczywiste koszty infrastruktury

**Najtańszy działający stack:**

| Komponent | Rozwiązanie | Koszt/miesiąc |
|---|---|---|
| VPS (backend + scraper + DB) | Hetzner CX21 (2 vCPU, 4GB) | €4.50 |
| Frontend | Vercel Hobby (free) | $0 |
| Email | Brevo free (300 emaili/dzień) | $0 |
| Monitoring | Własny (scrape_runs table) | $0 |
| Domain | ~$10/rok | ~$0.83 |
| **Łącznie** | | **~€5–6/miesiąc** |

**Skalowanie (gdy wzrośnie ruch):**

| Próg | Upgrade | Koszt |
|---|---|---|
| >50k req/dzień | Hetzner CX31 (2vCPU, 8GB) | €9/miesiąc |
| >500k req/dzień | Osobny managed PostgreSQL | +€20/miesiąc |
| Newsletter >3k/miesiąc | Brevo Starter | €9/miesiąc |

---

### 15.7 Technical Research Recommendations

**Implementation Roadmap — priorytety:**

1. **Natychmiast:** Zarejestruj aplikację w BGG (Bearer Token) — bez tego Paszport Planszówki nie zadziała
2. **Sprint 0:** Ustaw Docker Compose + PostgreSQL schema (zainwestuj czas w dobry schemat bazy)
3. **MVP bez Mepel:** Zacznij od 2 sklepów (3Trolle + AlePlanszowki) i rozszerzaj
4. **EAN strategy:** Nie blokuj MVP na EAN — zacznij od fuzzy matching, dodawaj EAN lazily
5. **SEO od dnia 1:** Schema.org i ISR to nie opcja dla MVP — to warunek konieczny dla organicznego ruchu

**Technology Stack Recommendations:**

```
Scraper:    Python 3.11 + Scrapy 2.14 (AsyncCrawlerProcess)
Backend:    FastAPI + psycopg2 + Pydantic v2
Frontend:   Next.js 14 App Router + TypeScript + Tailwind
Database:   PostgreSQL 16 + SQLAlchemy (migrations z Alembic)
Deploy:     Docker Compose + Hetzner + GitHub Actions
BGG:        httpx + Bearer Token (zarejestrować PRZED implementacją)
Email:      Resend lub Brevo (free tier)
Mepel:      Playwright + playwright-stealth (przetestować przed sprintem)
```

**Success Metrics (post-launch):**

| Metryka | Cel MVP | Cel Faza 2 |
|---|---|---|
| Sklepy zintegrowane | 2–3 | 5+ |
| Produkty w bazie | >1000 | >5000 |
| Scraping reliability | >95% sukces | >99% |
| Czas scrape | <15 min | <5 min |
| Subskrypcje email | >50 | >500 |
| Organic Google traffic | >100 sesji/tydzień | >1000/tydzień |

_Źródła:_ [changedetection.io](https://github.com/dgtlmoon/changedetection.io), [GitHub Actions CI/CD 2026](https://tech-insider.org/github-actions-ci-cd-pipeline-tutorial-2026/), [Hetzner + Docker deployment](https://infocusdata.com/blog/devops/ci-cd-docker-github-actions-hetzner-deployment)

---

## Źródła

- [3Trolle.pl robots.txt](https://www.3trolle.pl/robots.txt) — live fetch 2026-06-06
- [AlePlanszowki.pl robots.txt](https://aleplanszowki.pl/robots.txt) — live fetch 2026-06-06
- [Mepel.pl robots.txt](https://www.mepel.pl/robots.txt) — live fetch 2026-06-06
- [Rebel.pl robots.txt](https://www.rebel.pl/robots.txt) — live fetch 2026-06-06
- [BGG Forum: BGG now requiring authorization tokens](https://boardgamegeek.com/thread/3600185/heads-up-bgg-now-requiring-authorization-tokens-fo) — 2025
- [BGG Forum: Registration to use the XML API](https://boardgamegeek.com/thread/3525319/registration-to-use-the-xml-api-and-obtain-soon-to) — 2025
- [BGG Forum: XML API2 doesn't work anymore](https://boardgamegeek.com/thread/3602374/xml-api2-doesnt-work-anymore) — 2025
- [BoardGameGeek Python data fetching](https://drangovski.com/posts/boardgamegeek-python-data-fetching/)
- [GameUPC](https://gameupc.com/) — barcode→BGG ID database
- [BGG XML Snapshot wiki](https://boardgamegeek.com/wiki/page/BGG_XML_Snapshot) — snapshot z 2008, przestarzały
- [GitHub: board-game-scraper (recommend-games)](https://github.com/recommend-games/board-game-scraper)
- [GitHub: rem42/scraper-prestashop](https://github.com/rem42/scraper-prestashop)
- [PrestaShop Developer Docs — listing templates](https://devdocs.prestashop-project.org/8/themes/reference/templates/listing/)
- [Red-Gate: Designing a Price History Database Model](https://www.red-gate.com/blog/price-history-database-model/)
- [IdoSell robots.txt docs](https://www.idosell.com/pl/sklep-internetowy-przyjazny-wyszukiwarkom-seo-/mozliwosc-blokowania-robotow-wyszukiwarek-sieciowych/)
- [Scrapy + PostgreSQL](https://www.jitsejan.com/scraping-with-scrapy-and-postgres)
- [scrapy-mock fixtures](https://github.com/tcurvelo/scrapy-mock)
- [Playwright Stealth Cloudflare Bypass 2025](https://kameleo.io/blog/how-to-bypass-cloudflare-with-playwright)
- [Monolith vs Microservices 2026](https://www.javacodegeeks.com/2025/12/microservices-vs-monoliths-in-2026-when-each-architecture-wins.html)
- [Next.js + FastAPI + PostgreSQL Docker](https://www.travisluong.com/how-to-develop-a-full-stack-next-js-fastapi-postgresql-app-using-docker/)
- [GDPR Email Compliance 2025](https://maildiver.com/blog/gdpr-email-marketing-compliance-guide/)
- [APScheduler vs Celery Beat](https://leapcell.io/blog/scheduling-tasks-in-python-apscheduler-vs-celery-beat)
- [Schema.org Structured Data SEO 2026](https://www.digitalapplied.com/blog/structured-data-seo-2026-rich-results-guide)

---

## Wnioski końcowe

### Podsumowanie kluczowych odkryć

**Scraping zadziała — ale nie bez poprawek do planu.**

Dwa sklepy (3Trolle, AlePlanszowki) są technicznie dostępne, na tej samej platformie (PrestaShop), bez crawl-delay i bez mechanizmów anty-bot. Jeden scraper z konfiguracją per-sklep obsłuży oba — założenie z brainstormingu potwierdzone.

Rebel jest słusznie poza MVP — blokada `/promocje/` i crawl-delay 5s są realne. Mepel to risk — Cloudflare aktywnie blokuje boty, platforma to prawdopodobnie IdoSell (nie PrestaShop), wymaga Playwright lub rezygnacji z MVP scope.

Trzy istotne zmiany wymagają uwagi przed implementacją:
1. **BGG API** — rejestracja Bearer Token wymagana od X 2025 (bezpłatna dla non-commercial, ale trzeba ją zrobić przed startem)
2. **EAN** — BGG API nie ma EAN; strategia deduplicacji musi być BGG ID-first, nie EAN-first
3. **RODO/PKE 2024** — polska ustawa z listopada 2024 wzmocniła wymogi zgody; double opt-in dla alertów email jest obowiązkowy

### Gotowość techniczna do PRD

Badanie potwierdza wystarczającą dojrzałość techniczną do stworzenia PRD i architektury. Kluczowe ryzyka są zidentyfikowane i mitygowalne. Rekomendowany stos (Python + Scrapy + FastAPI + Next.js + PostgreSQL + Docker Compose) jest sprawdzony, dobrze udokumentowany i osiągalny dla jednego dewelopera w trybie hobby.

### Natychmiastowe akcje przed implementacją

1. Zarejestruj aplikację w BGG: `https://boardgamegeek.com/using_the_xml_api`
2. Przetestuj ręcznie scraping Mepel z Playwright (go/no-go dla MVP scope)
3. Kup domenę i skonfiguruj Hetzner VPS

---

**Data zakończenia badania:** 2026-06-06
**Okres badania:** Dane aktualne na czerwiec 2026
**Weryfikacja źródeł:** Wszystkie twierdzenia cytowane z bieżących źródeł webowych
**Poziom pewności:** Wysoki — opieramy się na wielokrotnych live fetchach i potwierdzonych źródłach

_Ten raport techniczny stanowi podstawę do stworzenia PRD i architektury dla agregatora cen planszówek. Weryfikuje i koryguje założenia z sesji brainstormingowej z 2026-06-05._
