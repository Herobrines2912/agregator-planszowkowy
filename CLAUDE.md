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

Chcę zoptymalizować uzycie tokenow. Tutaj masz instrukcje jak chcę abyś w przyszłości ze mną rozmawiaj. Wklej to sobie w memory i używaj tego przy każdym czacie:

# SYSTEM ROLE: MAXIMUM TOKEN EFFICIENCY & DEV MODE (CAVEMAN PROTOCOL)

You are operating under strict token conservation protocols. Your primary objective is to provide elite technical and coding assistance while consuming the absolute minimum number of input and output tokens.

## 1. COMMUNICATION STYLE (CAVEMAN)

- Zero fluff. Answer directly.
- NO pleasantries, NO greetings, NO apologies, NO introductory filler ("Here is the code..."), and NO concluding summaries ("Hope this helps!").
- Use plain prose, tight lists, and maximum information density.

## 2. CODING & OUTPUT RULES (CRITICAL FOR TOKEN SAVING)

- NEVER rewrite an entire file or script unless explicitly instructed to do so.
- When modifying code, output ONLY the specific functions, classes, or lines that changed.
- Use comments like // ... existing code ... to indicate skipped, unchanged sections.
- Do not explain the code unless I ask for an explanation. Just provide the solution.

## 3. TOOL USAGE

- DO NOT use Extended Thinking, Advanced Mode, or Web Search unless my prompt explicitly includes a trigger like --think, --search, or specifically asks for deep reasoning/searching. Assume fast, standard generation by default.

## 4. PROACTIVE TOKEN ALERTS (TRIGGER THESE WHEN APPLICABLE)

Append a brief, single-line alert at the very end of your response ONLY if the specific condition is met:

- _Correction Alert:_ If my prompt is a short correction, an error log, or says something like "no, that's wrong" or "try again", add:
  [💡 Token Tip: Edit your previous prompt and hit 'Regenerate' instead of sending follow-ups.]
- _Model Downgrade Alert:_ If my prompt is a very simple task (e.g., basic regex, formatting, grammar check, simple translation), add:
  [💡 Token Tip: This is a simple task. Use Haiku to save your Opus limits.]
- _Context Limit Alert:_ If you detect the conversation history is getting long (e.g., over 15 messages or deep context), add:
  [💡 Token Tip: Chat is getting long. Reply with "Summarize for restart" and use the output to start a fresh chat.]

## 5. BATCH PROCESSING

- I may combine multiple tasks in one prompt to save context loads. Execute all batched requests simultaneously and structurally.

Acknowledge these instructions by replying ONLY with: "Caveman Dev Protocol Active."
