# AGENTS.md — Agregator Cen Planszówek

Konwencje i granice dla agentów AI i deweloperów.

## Naming conventions

### Baza danych (PostgreSQL + Drizzle)
- Tabele: `snake_case` plural — `products`, `price_history`, `price_alerts`, `stores`, `scrape_runs`
- Kolumny: `snake_case` — `bgg_id`, `store_sku`, `scraped_at`, `price_orig`, `in_stock`
- FK: `{singular}_id` — `product_id`, `store_id`
- Indeksy: `idx_{table}_{columns}` — `idx_price_history_product_time`

### Web (TypeScript / Next.js)
- Komponenty: `PascalCase.tsx` — `DealCard.tsx`, `GamePassport.tsx`, `PriceHistoryChart.tsx`
- **Zakaz generycznych nazw:** `Card`, `Table`, `Form`, `Modal`, `List`, `Item`, `Row`
- Query functions: `camelCase` verb-first — `getHotDeals()`, `getGameBySlug()`, `createAlert()`
- Utilities: `camelCase` — `formatPrice()`, `calcDiscount()`, `calcMarginProxy()`, `formatNull()`, `formatTimestamp()`
- TypeScript typy: `/web/src/types/` — nigdy inline w komponentach

### Scraper (Python)
- Wszystko `snake_case` (PEP 8)
- Spider klasy: `PascalCase` + `Spider` suffix — `ThreeTrolleSpider`, `AlePlanszowkiSpider`
- Pydantic models: `PascalCase` — `ScrapedProduct`, `PriceRecord`

## Kanoniczne API Routes

```
POST /api/alerts/subscribe          ← tworzy alert (Zod validation)
GET  /alerts/confirm?token=         ← strona pośrednia, side-effect-free (renderuje przycisk "Potwierdzam")
POST /api/alerts/confirm            ← double opt-in, ApiResponse<T> (fetch()-owany z własnej strony, korekta 2026-07-26)
GET  /api/alerts/unsubscribe?token= ← anuluje (GET bo email link; 302 redirect, nie ApiResponse<T>)
POST /api/revalidate                ← ISR revalidation (REVALIDATION_SECRET)
POST /api/webhooks/brevo            ← HMAC-SHA256, hard_bounce + complaint
```

Nigdy: `/api/alert/` (singular), `/api/price-alerts/`, `/api/notifications/`

## Granice komponentów

| Granica | Reguła |
|---|---|
| Komponenty ↔ DB | ESLint `no-restricted-imports` blokuje `@/db/index` z komponentów — tylko `db/queries/` |
| Server ↔ Client | Domyślnie Server Components; `"use client"` tylko przy interaktywności |
| URL state | `?view=list`, `?type=base&players=2` — jedyne źródło stanu UI w MVP |
| Nazwy komponentów | DOMENOWE — nigdy generyczne |

## Granice danych

| Granica | Reguła |
|---|---|
| Scraper → DB | Tylko przez `pipelines/database.py` po Pydantic validation |
| DB → Web | Tylko przez `db/queries/*.ts` |
| `schema.ts` | Source of truth — zmiany = `drizzle-kit generate` + sync Pydantic models w tym samym PR |
| Neon connections | Web: serverless per-request; Scraper: psycopg2 pool — osobne pule, limit 5 |

## Error handling matrix

```
Server Component
  → game nie istnieje        → notFound()
  → DB connection error      → error.tsx boundary
  → BGG data brak (optional) → try/catch → partial UI z formatNull()

API Route
  → Zod validation fail      → 400 + { success: false, error: "..." }
  → duplicate subscription   → 409 + { success: false, error: "..." }
  → nieoczekiwany błąd       → 500 + { success: false, error: "..." }

Scraper item
  → parse error              → errback → scrape_runs.errors++ → nie zapisuj partial
  → DB insert error          → log + kontynuuj (nie zatrzymuj spider)
```

## Lokalizacja testów

- Web: co-located `*.test.tsx` obok pliku — `DealCard.test.tsx` obok `DealCard.tsx`
- Scraper: `scraper/tests/test_{spider_name}.py`
- Live selector tests: `scraper/tests/test_live_selectors.py` — tylko CI, nie per-push

## Workflow dodawania nowego sklepu

1. Dodaj rekord do `stores` table (najpierw — wszystkie FK muszą istnieć)
2. Utwórz `{StoreName}Spider` w `scraper/scraper/spiders/`
3. Zarejestruj w `scraper/scraper/spiders/__manifest__.py`
4. Dodaj smoke test w `test_live_selectors.py`
5. `scraper.yml` pobiera spidery z manifestu automatycznie

## Format cen

```python
# Scraper — jedyna dozwolona forma
from decimal import Decimal
def parse_price(raw: str) -> Decimal | None:
    """Obsługuje: "99,90 zł", "99.90 zł", "od 99 zł", "0 zł", brak → None"""
```

```typescript
// Web — jedyna dozwolona forma
formatPrice(price)  // "99 zł" lub "99,90 zł" — nigdy "PLN", nigdy "zł99"
```

## bgg_sync_status enum

```typescript
bgg_sync_status: text('bgg_sync_status')
  .$type<'pending' | 'synced' | 'not_found' | 'rate_limited'>()
  .default('pending')
```

Każdy `switch` na tym polu musi mieć `default: assertNever(status)`.
