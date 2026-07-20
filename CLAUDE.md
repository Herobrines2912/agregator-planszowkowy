# CLAUDE.md — Agregator Cen Planszówek

Przeczytaj ten plik i `AGENTS.md` przed napisaniem pierwszej linii kodu.

## Krytyczne reguły

### Baza danych
- `schema.ts` to source of truth — każda zmiana wymaga jednoczesnej aktualizacji `scraper/scraper/items.py` (Pydantic models) w tym samym PR
- `consent_log` jest append-only — **nigdy DELETE z tej tabeli**
- Ceny: zawsze `NUMERIC(10,2)` — nigdy `real`, `float`, `FLOAT`
- Timestamps: zawsze `TIMESTAMPTZ` — nigdy `TIMESTAMP` bez strefy

### Queries (TypeScript)
- Wszystkie queries **wyłącznie** w `/web/src/db/queries/*.ts`
- **Nigdy** inline w komponentach ani stronach — ESLint to egzekwuje

### Ceny (Python)
- Parsowanie cen: **wyłącznie** `parse_price()` z `scraper/utils/price_parser.py`
- Nigdy własne `float(raw.replace(",", "."))` — to błąd

### Timestamps (Python)
- **Zawsze** `datetime.now(timezone.utc)` — nigdy `datetime.now()` (naive datetime odrzucany przez TIMESTAMPTZ)

### TypeScript switch na enumach
- Każdy `switch` na polu z `.$type<>()` **musi** mieć `default: assertNever(x)`
- `assertNever` wyeksportowany z `lib/utils.ts`

### Null w UI
- Zawsze `formatNull(value)` → em-dash `"—"` — nigdy `"N/A"`, `"Brak"`, puste `""`

### API Routes
- Każdy API Route musi zwracać `ApiResponse<T>` (z `types/api.ts`)
- Pusta lista: `{ success: true, data: [] }` — nigdy `null`

### Logging (Python)
- `logging.getLogger(__name__)` — **nigdy `print()`** w spiderach i pipeline

### Sprint status
- `_bmad-output/implementation-artifacts/sprint-status.yaml` to **source of truth** dla statusu epików i story — nie odtwarzać statusu z historii commitów
- Po **każdym** w pełni ukończonym story lub fixie (feature gotowy, przetestowany, zmergowany) — zaktualizować w tym pliku status story (`ready-for-dev` → `in-progress` → `review` → `done`) oraz `last_updated`
- Gdy wszystkie story w epiku mają `done` — epik też przechodzi na `done`

## Anti-patterns (ZABRONIONE)

```typescript
// ❌ query inline w komponencie
const data = await db.select().from(products)

// ❌ własne parsowanie ceny
const price = parseFloat(rawPrice.replace(" zł", "").replace(",", "."))

// ❌ null display bez formatNull
{game.rank || ""}      // puste
{game.rank ?? "N/A"}   // N/A
{game.rank || "-"}     // myślnik zamiast em-dash

// ❌ switch bez assertNever
switch (status) {
  case 'pending': ...
  case 'synced': ...
  // brak default → runtime bomb
}
```

```python
# ❌ naive datetime
datetime.now()

# ❌ print w spider
print(f"Got {n} products")

# ❌ float zamiast Decimal
float(raw.replace(",", "."))
```

## Nazwy komponentów

**DOMENOWE** — opisują co renderują, nie jak wyglądają:
- ✅ `DealCard`, `GamePassport`, `PriceHistoryChart`, `FlipperTable`, `DlcWarning`
- ❌ `Card`, `Table`, `Chart`, `Form`, `Modal`, `List`
