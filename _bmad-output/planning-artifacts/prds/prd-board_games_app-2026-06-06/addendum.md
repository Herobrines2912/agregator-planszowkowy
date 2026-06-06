# Addendum — Agregator Cen Planszówek

*Techniczna głębokość, opcje odrzucone, decyzje architektoniczne — materiał dla Architecture i sprint planowania. Nie należy do PRD.*

---

## A. Rekomendowany stack techniczny

```
Scraper:    Python 3.11 + Scrapy 2.14 (AsyncCrawlerProcess)
BGG client: httpx + Bearer Token (zarejestrować PRZED implementacją)
EAN lookup: GameUPC API (best-effort; rate limits niezudokumentowane — weryfikacja w Sprint 0)
Backend:    FastAPI + psycopg2 / SQLAlchemy (Alembic migrations) + Pydantic v2
Frontend:   Next.js 14 App Router + TypeScript + Tailwind CSS
Baza:       PostgreSQL 16 (na VPS; bez managed DB w MVP)
Scheduler:  APScheduler in-process (prosta cron; Celery+Redis gdy potrzebne retry/distributed)
Email:      Brevo (300 emaili/dzień free) lub Resend (3000/mies. free)
Deploy:     Docker Compose + Hetzner CX21 + Vercel Hobby (Next.js)
Headless:   Playwright + playwright-stealth (tylko Mepel, Faza 1.5)
CI/CD:      GitHub Actions → SSH deploy → docker compose up
```

**Dlaczego nie microservices:** 42% firm wdrażających mikroserwisy konsoliduje je z powrotem z powodu operational overhead. Dla jednego dewelopera w trybie hobby: monolith modularny na Docker Compose to właściwy wybór. VPS ~$5/mies. vs $50–200+/mies. dla distributed setup.

**Dlaczego FastAPI, nie Django REST:** Lżejszy, typowany przez Pydantic, lepszy async support dla Scrapy pipeline integracji.

**Dlaczego Scrapy, nie httpx+BS4:** Wbudowane rate limiting, middleware retry, User-Agent rotation, pipeline pattern — sprawdzony dla e-commerce scraping.

---

## B. Schemat bazy danych (PostgreSQL)

```sql
-- Konfiguracja sklepów
CREATE TABLE stores (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    base_url    TEXT NOT NULL,
    platform    TEXT,              -- 'prestashop', 'idosell', etc.
    crawl_delay FLOAT DEFAULT 0,
    active      BOOLEAN DEFAULT TRUE
);

-- Produkty: jeden rekord per gra × sklep
CREATE TABLE products (
    id          BIGSERIAL PRIMARY KEY,
    store_id    INTEGER NOT NULL REFERENCES stores(id),
    store_sku   VARCHAR(100) NOT NULL,
    bgg_id      INTEGER,           -- NULL jeśli nieznany
    ean         VARCHAR(13),       -- NULL jeśli nieznany
    name        TEXT NOT NULL,
    url         TEXT NOT NULL,
    bgg_match_confidence FLOAT,    -- < 0.8 → manual review
    UNIQUE(store_id, store_sku)
);

-- Dane BGG (cache)
CREATE TABLE bgg_data (
    bgg_id          INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    thumbnail_url   TEXT,
    image_url       TEXT,
    year_published  INTEGER,
    min_players     INTEGER,
    max_players     INTEGER,
    min_playtime    INTEGER,
    max_playtime    INTEGER,
    min_age         INTEGER,
    weight          FLOAT,         -- complexity (0–5)
    bgg_rank        INTEGER,
    mechanics       JSONB,         -- ["Deck Building", "Worker Placement", ...]
    categories      JSONB,
    designers       JSONB,
    publishers      JSONB,
    expansion_of    INTEGER,       -- bgg_id of parent game (NULL if base game)
    is_expansion    BOOLEAN DEFAULT FALSE,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Historia cen — append-only time series
CREATE TABLE price_history (
    id          BIGSERIAL PRIMARY KEY,
    product_id  BIGINT NOT NULL REFERENCES products(id),
    scraped_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    price       NUMERIC(10,2) NOT NULL,
    price_orig  NUMERIC(10,2),     -- cena regularna (NULL = brak rabatu)
    in_stock    BOOLEAN DEFAULT TRUE
);

-- Alerty cenowe
CREATE TABLE price_alerts (
    id                  BIGSERIAL PRIMARY KEY,
    email               VARCHAR(254) NOT NULL,
    bgg_id              INTEGER NOT NULL,
    alert_type          VARCHAR(10) NOT NULL,   -- 'threshold' | 'anomaly' | 'available'
    threshold_price     NUMERIC(10,2),          -- tylko dla type='threshold'
    anomaly_enabled     BOOLEAN DEFAULT TRUE,
    confirmed           BOOLEAN DEFAULT FALSE,
    confirm_token       VARCHAR(64) NOT NULL,
    unsubscribe_token   VARCHAR(64) NOT NULL,
    confirmed_at        TIMESTAMPTZ,
    last_notified_at    TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    suppressed          BOOLEAN DEFAULT FALSE    -- po unsubscribe
);

-- Logi Scrape Cycles
CREATE TABLE scrape_runs (
    id              BIGSERIAL PRIMARY KEY,
    store_id        INTEGER REFERENCES stores(id),
    started_at      TIMESTAMPTZ NOT NULL,
    finished_at     TIMESTAMPTZ,
    products_scraped INTEGER DEFAULT 0,
    errors          INTEGER DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'running'  -- 'running'|'ok'|'failed'|'partial'
);

-- Indeksy
CREATE INDEX idx_ph_product_time     ON price_history (product_id, scraped_at DESC);
CREATE INDEX idx_ph_recent           ON price_history (scraped_at DESC);
CREATE INDEX idx_products_bgg        ON products (bgg_id) WHERE bgg_id IS NOT NULL;
CREATE INDEX idx_products_ean        ON products (ean)    WHERE ean IS NOT NULL;
CREATE INDEX idx_alerts_email_bgg    ON price_alerts (email, bgg_id);
CREATE INDEX idx_alerts_bgg_active   ON price_alerts (bgg_id, confirmed, suppressed);
```

**Materialized View dla Hot Deals Feed (odświeżana po każdym Scrape Cycle):**
```sql
CREATE MATERIALIZED VIEW hot_deals AS
SELECT
    p.id AS product_id,
    p.bgg_id,
    b.name,
    b.thumbnail_url,
    ph.price,
    ph.price_orig,
    ROUND((1 - ph.price / ph.price_orig) * 100) AS discount_pct,
    s.name AS store_name,
    ph.scraped_at
FROM price_history ph
JOIN products p  ON ph.product_id = p.id
JOIN stores s    ON p.store_id = s.id
LEFT JOIN bgg_data b ON p.bgg_id = b.bgg_id
WHERE ph.scraped_at > NOW() - INTERVAL '24 hours'
  AND ph.price_orig IS NOT NULL
  AND ph.price < ph.price_orig * 0.85
  AND ph.in_stock = TRUE
ORDER BY discount_pct DESC;

-- Refresh po każdym Scrape Cycle:
REFRESH MATERIALIZED VIEW CONCURRENTLY hot_deals;
```

**Szacunek wzrostu:** 3 sklepy × 2000 produktów × 365 scrapów/rok ≈ 2.19M wierszy/rok. PostgreSQL z indeksem wystarczy przez 3–5 lat bez optymalizacji.

---

## C. Architektura systemu

```
┌─────────────────────────── Hetzner CX21 VPS (~€4.50/mies.) ────────────────────────┐
│                                                                                     │
│  ┌─────────────────┐   ┌──────────────────┐   ┌────────────────────────────────┐  │
│  │  Scrapy Spiders │   │  FastAPI Backend  │   │       PostgreSQL 16             │  │
│  │                 │   │                  │   │                                │  │
│  │  PrestaShop     │   │  GET /api/deals  │   │  products                      │  │
│  │  (3Trolle +     │──▶│  GET /api/games  │◀──│  price_history (append-only)   │  │
│  │  AlePlanszowki) │   │  GET /api/alerts │   │  bgg_data (cache, 30d refresh)  │  │
│  │                 │   │  POST /api/alerts│   │  price_alerts                  │  │
│  └────────┬────────┘   └──────────────────┘   │  scrape_runs                   │  │
│           │                      ▲             └────────────────────────────────┘  │
│  ┌────────▼────────┐             │                                                 │
│  │  APScheduler    │             │                                                 │
│  │  (cron jobs)    │    ┌────────┴────────┐                                        │
│  │                 │    │  Nginx          │                                        │
│  │  @6:00 scrape   │    │  (reverse proxy)│                                        │
│  │  @6:30 alerts   │    └────────┬────────┘                                        │
│  │  @6:35 refresh  │             │                                                 │
│  │  materialized   │             │                                                 │
│  └─────────────────┘             │                                                 │
└─────────────────────────────────┼───────────────────────────────────────────────-─┘
                                  │ HTTPS
            ┌─────────────────────┼──────────────────────┐
            │     Vercel Hobby    │    (free tier)        │
            │                    ▼                        │
            │   Next.js 14 App Router                     │
            │   SSR / ISR Game Passports                  │
            │   schema.org JSON-LD                        │
            │   Hot Deals Feed (ISR, revalidate 1h)       │
            └─────────────────────────────────────────────┘
```

**Producer–Consumer pattern (bez event queue w MVP):**
```
[Scrapy] --INSERT--> [PostgreSQL] <--READ-- [FastAPI] --JSON--> [Next.js]
                          |
                    [Alert Engine]   ← uruchamiany po każdym Scrape Cycle
                    [BGG Enrichment] ← background job (queue w tabeli products)
```

---

## D. Strategia deduplicacji (BGG ID as primary key)

**Zmiana względem brainstormingu:** EAN-first niemożliwe — BGG API nie zwraca EAN.

**Nowa kolejność:**
```
1. EAN (ze strony produktu, nie listingu) → GameUPC API → BGG ID   [fast path, może być brak]
2. Fuzzy match nazwy → BGG Search API → BGG ID                      [slow path, zawsze dostępne]
3. Ręczna weryfikacja (kolejka w DB, confidence < 0.8)              [fallback]
```

**Kluczowe ograniczenie: EAN scraping wymaga wizyty na stronie produktu, nie listingu.**
Listingi 3Trolle pokazują wewnętrzne SKU (np. `3T35971`) — nie EAN. EAN może być widoczny dopiero na stronie produktu (`/[slug]-[id].html`). To oznacza:
- EAN scraping = ~N dodatkowych requestów (N = liczba nowych produktów)
- EAN scraping MUSI być background job przy pierwszym dodaniu produktu — NIE część cyklicznego Scrape Cycle
- Gdyby był per-cycle: 634 produkty × 0.2s = ~2 min dodatkowe tylko dla 3Trolle → NFR-2 (<15 min) nadal OK, ale przy większej liczbie sklepów staje się problemem
- Optymalizacja: sprawdź EAN tylko przy nowych produktach (`bgg_match_confidence IS NULL` lub `ean IS NULL`); przy re-scrape cen pomijaj strony produktów

**Implementacja fuzzy match:**
- Python `rapidfuzz` library (Levenshtein + token_sort_ratio)
- Próg pewności: 0.85 dla auto-accept, 0.7–0.85 → manual queue, < 0.7 → rejected
- BGG Search API: `/xmlapi2/search?query={name}&type=boardgame`

**EAN scraping:** Tylko na stronie produktu (nie w listingu). Background job przy pierwszym dodaniu produktu — nie blokuje Scrape Cycle dla cen.

---

## E. Mepel — strategia obejścia Cloudflare (Faza 1.5)

**Platform:** Mepel to prawdopodobnie **IdoSell/IAI-Shop** — NIE PrestaShop. Konsekwencje:
- Inna struktura URL: `/[kategoria]/[id],[slug],p,[numer].html`
- Inny scraper — PrestaShop spider NIE zadziała; potrzebny oddzielny IdoSell spider
- Odmienny robots.txt pattern (`/*/basket`, `/*/login`, `/*/reg` — charakterystyczny dla IAI)
- HTML structure do weryfikacji manualnie (brak dostępu bez obejścia anty-bot)


Mepel zwraca HTTP 403. Opcje (od najprostszej):

| Opcja | Narzędzie | Skuteczność | Koszt |
|---|---|---|---|
| 1. Playwright + playwright-stealth | `playwright-stealth` | Średnia | $0 |
| 2. Nodriver (undetected) | `nodriver` Python | Wysoka | $0 |
| 3. Playwright + residential proxy | Brightdata ~$15/GB | Bardzo wysoka | $15+/mies. |
| 4. Rezygnacja z Mepel | — | N/A | $0 |

**Rekomendacja:** Test Playwright + stealth przed Fazą 1.5. Nie używaj proxy w MVP — koszt nieuzasadniony.

**Cloudflare AI Labyrinth (marzec 2025):** Blokuje boty po >4 poziomach nawigacji bez ludzkich akcji. Playwright + stealth musi imitować ludzkie wzorce (random delays, mouse movement, realistic viewport).

---

## F. BGG API — integracja

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

**Rate limiting:** ≤ 1 req/s z exponential backoff na HTTP 429 (historyczne safe: 2 req/s, konserwatywne: 1 req/s).

**Strategia cache:** BGG data w tabeli `bgg_data`, refresh co 30 dni (`synced_at < NOW() - INTERVAL '30 days'`). Lazy load — pobieraj BGG data tylko gdy nowy produkt zostaje po raz pierwszy zmatchowany do BGG ID.

**Rejestracja:** `https://boardgamegeek.com/using_the_xml_api` — licencja non-commercial, bezpłatna.

---

## G. Email alerty — RODO data model

```python
class PriceAlertCreate(BaseModel):
    email: EmailStr
    bgg_id: int
    alert_type: Literal["threshold", "anomaly", "available"]
    threshold_price: Decimal | None = None
    anomaly_enabled: bool = True
    consent_given: bool  # musi być True — walidacja w API

# W bazie: suppress list zamiast delete
# Double opt-in token: secrets.token_urlsafe(32)
# Expiry unconfirmed: 48h (cron job usuwa co 24h)
```

**RODO Art. 17 flow (prawo do usunięcia):**
1. User wysyła request erasure (email do operatora lub dedykowany endpoint)
2. Operator usuwa rekord z `price_alerts` (nie tylko suppressed — pełne usunięcie)
3. Email trafia do globalnej suppression list (inaczej user mógłby się ponownie zapisać bez wiedzy)

---

## H. Dostawcy email (free tier comparison)

| Dostawca | Free | Python SDK | Uwagi |
|---|---|---|---|
| **Brevo** | 300 emaili/dzień (bez limitu mies.) | ✅ | Darmowy bez miesięcznego pułapu |
| **Resend** | 3,000 emaili/mies. | ✅ | Developer-friendly, dobre DX |
| **Mailgun** | 5,000 emaili/3 mies. | ✅ | Sprawdzony w produkcji |

**Rekomendacja:** Brevo dla MVP (brak miesięcznego limitu, 300/dzień wystarczy).

---

## I. Koszty infrastruktury

**MVP stack (najtańszy działający):**

| Komponent | Rozwiązanie | Koszt/mies. |
|---|---|---|
| VPS (backend + scraper + DB) | Hetzner CX21 (2 vCPU, 4GB) | €4.50 |
| Frontend | Vercel Hobby | $0 |
| Email | Brevo free tier | $0 |
| Domena | ~$10/rok | ~$0.83 |
| **Łącznie** | | **~€5–6/mies.** |

**Ścieżka skalowania:**

| Próg | Upgrade | Koszt |
|---|---|---|
| >50k req/dzień | Hetzner CX31 (2vCPU, 8GB) | €9/mies. |
| >500k req/dzień | Osobny managed PostgreSQL (Neon) | +€20/mies. |
| Newsletter >3k/mies. | Brevo Starter | €9/mies. |

---

## J. CI/CD pipeline

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: pip install -r requirements.txt && pytest tests/ -v

  deploy:
    needs: test
    steps:
      - name: Deploy to Hetzner VPS
        uses: appleboy/ssh-action@v1
        with:
          script: |
            cd /opt/board-games-app
            git pull origin main
            docker compose up -d --build
            docker image prune -f
```

```yaml
# .github/workflows/scraper-health.yml — codziennie 8:00
on:
  schedule:
    - cron: '0 8 * * *'
jobs:
  selector-check:
    steps:
      - run: pytest tests/test_live_selectors.py -v
```

---

## K. Szacunek czasu implementacji

| Sprint | Zadania | Szacunek (hobby tempo) |
|---|---|---|
| Sprint 0 | Docker Compose setup, PostgreSQL schema, GitHub Actions CI | 3–5 dni |
| Sprint 1 | Scrapy spiders (3Trolle + AlePlanszowki), testy, cron | 1–2 tygodnie |
| Sprint 2 | FastAPI endpoints (/deals, /games, /alerts), BGG client | 1–2 tygodnie |
| Sprint 3 | Next.js: Hot Deals Feed + Game Passport + filtry | 2–3 tygodnie |
| Sprint 4 | Email alerty, Double Opt-In, Brevo integracja | 1 tydzień |
| Sprint 5 | SEO: schema.org, ISR, sitemap, SEO slugs | 3–5 dni |
| Sprint 6 | Flipper Mode, Upcoming section | 1 tydzień |
| **Łącznie MVP** | | **~8–12 tygodni** |

**Pre-Sprint 0:** Zarejestruj BGG Bearer Token (bloker Sprint 2).

---

## L. Optymalizacja scraperów — early-stop pattern

Brainstorming zidentyfikował optymalizację skracającą czas scrape'a z ~15 min do ~2 min dla kategorii promocyjnych:

**Wzorzec early-stop:**
```python
# Zamiast scraping wszystkich stron paginacji:
# 1. Sortuj wyniki po cenie rosnąco (parametr URL w PrestaShop)
# 2. Scraping strona po stronie
# 3. Stop gdy cena produktów na stronie >= price_orig (brak dalszych rabatów)

def should_stop_scraping(page_products: list) -> bool:
    discounted = [p for p in page_products if p.get("price_orig") and p["price"] < p["price_orig"]]
    return len(discounted) == 0  # cała strona bez rabatów → stop

# URL z sortowaniem po cenie rosnąco (PrestaShop):
# https://www.3trolle.pl/promocje?orderby=price&orderway=asc&p={page}
```

**Zastrzeżenie:** Optymalizacja działa tylko dla stron z separatnymi kategorii "promocje". Dla pełnego katalogu (wszystkie produkty) early-stop nie ma zastosowania — ceny nierebutowe nie sygnalizują końca.

**Rekomendacja:** Użyj early-stop dla kategorii promocyjnych przy codziennym scrapie. Pełny katalog scrapuj tygodniowo (discovery nowych produktów + EAN background job).

---

## M. Faza 2/3 — notatki architektoniczne

**Rebel.pl — Faza 2:**
Strony produktów Rebel (nie `/promocje/`) są dostępne przy crawl-delay 5s. Pełny katalog (~5,000 produktów) = ~7 godzin przy 5s/request. Strategia Fazy 2: scraping product pages w niskiej częstotliwości (tygodniowo, nie dziennie), nie /promocje/. Wymaga negocjacji z Rebel lub akceptacji bardzo wolnego scrape cycle.

**Allegro/OLX schema — Faza 3:**
Flipper Mode w MVP używa Margin Proxy z historycznych cen. Faza 3 wymaga danych rynkowych (Allegro/OLX live ceny odsprzedaży). Migracja schema:
```sql
-- Tabela do dodania w Fazie 3:
CREATE TABLE market_prices (
    id          BIGSERIAL PRIMARY KEY,
    bgg_id      INTEGER NOT NULL,
    source      VARCHAR(20) NOT NULL,  -- 'allegro', 'olx'
    avg_price   NUMERIC(10,2),
    min_price   NUMERIC(10,2),
    max_price   NUMERIC(10,2),
    sample_size INTEGER,
    fetched_at  TIMESTAMPTZ NOT NULL
);
```
Tabela `products` nie wymaga modyfikacji w Fazie 3 — margin obliczany przez JOIN z `market_prices`. Rozważ przy projektowaniu schematu MVP.

---

## N. Odrzucone alternatywy

**Microservices zamiast monolitu:** Odrzucone — operational overhead nieuzasadniony dla jednego dewelopera. 42% firm wdrażających mikroservisy konsoliduje je z powrotem.

**TimescaleDB zamiast PostgreSQL:** Odrzucone — overkill. TimescaleDB potrzebny przy >100M wierszy time series. MVP generuje ~2.2M wierszy/rok — zwykły PostgreSQL z indeksem wystarczy przez 3–5 lat.

**SQLite zamiast PostgreSQL:** Odrzucone dla produkcji — concurrent writes z Scrapy + FastAPI mogą powodować lock contention. OK dla local dev.

**Celery + Redis zamiast APScheduler:** Odrzucone dla MVP — Celery wymaga Redis (dodatkowy kontener), monitoring, retry config. APScheduler in-process wystarczy; upgrade do Celery jeśli potrzebne retry/distributed workers.

**EAN-first deduplicacja:** Odrzucone — BGG API nie zawiera EAN. EAN zbierany lazily ze stron produktów jako bonus, nie klucz.

**Rebel.pl w MVP:** Odrzucone — `/promocje/` zablokowane w robots.txt (tylko Googlebot allowed). Crawl-delay 5s. Faza 2 po negocjacjach lub strategii product-page-only.
