# Story 4.5b: Parent Game BGG Link Resolution

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want the BGG enrichment job to capture and resolve an expansion's base-game relationship, and `getGameBySlug()` to expose it,
so that Story 4.6 (`DlcWarning`) can render a real base game instead of always receiving `null`.

## Background — Why This Story Exists

Story 4.5 (`done`) shipped `getGameBySlug()` with `base_game` hardcoded to `null` and left this note in its Dev Notes:

> Schema Gap — `base_game` Always `null` in MVP. Story 4.6 (DlcWarning) needs `base_game: { name, slug, current_min_price }`. This requires a `parent_game_id` (or `base_game_id`) column in the `games` table. **This column does not exist in `schema.ts` yet.** [...] Story 4.6 will need a schema migration before `DlcWarning` can be fully wired.

Story 4.6 in epics.md was scoped as **Dev A only** (`components/DlcWarning.tsx`), which assumes the data is already correct by the time Dev A builds the component. It isn't — nothing populates the parent/base-game relationship anywhere in the codebase today. This story (Dev B) closes that gap so Story 4.6 can be a pure presentational story.

## Acceptance Criteria

1. **Given** `games` table in `schema.ts`, **when** a migration is generated and applied, **then** a new nullable self-referencing column `parent_game_id: integer` exists, FK → `games.id`.
2. **Given** a BGG `thing` XML response for an item with `type="boardgameexpansion"`, **when** `BggClient._parse_thing()` parses it, **then** it extracts the base game's BGG numeric ID from `<link type="boardgameexpansion">` elements **excluding** any with `inbound="true"` — and if multiple non-inbound links exist, the first is used. The result dict gains key `base_game_bgg_id: int | None`.
3. **Given** `run_enrichment()` processing a game where `base_game_bgg_id` is present and a local `games` row already has that `bgg_id`, **when** the game is written, **then** `games.parent_game_id` is set to that row's local `id`.
4. **Given** `run_enrichment()` processing a game where `base_game_bgg_id` is present but no local `games` row has that `bgg_id` yet, **when** the game is written, **then** `parent_game_id` is left `NULL` — no placeholder row is created; it resolves on a later enrichment cycle.
5. **Given** `getGameBySlug()` in `game-passport.ts`, **when** the game row has non-null `parent_game_id`, **then** the query returns `base_game: { name, slug, bgg_id, current_min_price }` where `current_min_price` is the parent's lowest in-stock price (string) or `null` if the parent has no in-stock products.
6. **Given** a game with `parent_game_id = null`, **when** `getGameBySlug()` runs, **then** `base_game` stays `null` and the query still executes in a single DB round-trip (no separate query for the parent).

## Tasks / Subtasks

- [ ] Task 1 — Schema migration (AC: 1)
  - [ ] Add `parent_game_id` to the `games` table in `web/src/db/schema.ts` — see Dev Notes for the exact self-reference syntax (Drizzle requires a typed callback for self-referencing FKs, a plain `.references(() => games.id)` will fail to compile)
  - [ ] From `web/`, run `npx drizzle-kit generate` to produce `db/migrations/0004_*.sql`
  - [ ] Rename the generated file to `0004_games_add_parent_game_id.sql` (matches the hand-named convention of `0002_products_store_external_unique.sql` / `0003_hot_deals_indexes.sql`) and update `db/migrations/meta/_journal.json` tag accordingly if drizzle-kit renamed the entry — verify with `git diff` that the journal still matches the file
  - [ ] Do NOT hand-write the SQL — always generate via drizzle-kit so the journal stays in sync

- [ ] Task 2 — Capture base-game BGG ID in `bgg_client.py` (AC: 2)
  - [ ] Add a helper in `BggClient._parse_thing()` that reads `item.findall("link[@type='boardgameexpansion']")`, skips any element where `el.get("inbound") == "true"`, and returns `int(el.get("id"))` of the first remaining match, or `None`
  - [ ] Add `"base_game_bgg_id": <result>` to the dict returned by `_parse_thing()`
  - [ ] Add test cases to `scraper/tests/test_bgg_client.py`: (a) expansion item with a non-inbound `boardgameexpansion` link → `base_game_bgg_id` set correctly; (b) base game item with only `inbound="true"` links → `base_game_bgg_id` is `None`; (c) item with no `boardgameexpansion` links at all → `None`

- [ ] Task 3 — Resolve and persist `parent_game_id` in `bgg_enrichment.py` (AC: 3, 4)
  - [ ] In `_build_update_params()`, do NOT add `parent_game_id` there (it needs a DB lookup, not just data mapping) — instead resolve it in `run_enrichment()`'s per-game loop right after `data = client.get_thing_with_retry(bgg_id)` succeeds
  - [ ] Add a small helper `_resolve_parent_game_id(cur, base_game_bgg_id: Optional[int]) -> Optional[int]` that runs `SELECT id FROM games WHERE bgg_id = %s` and returns the row's `id` or `None` (no match / `base_game_bgg_id` is `None`)
  - [ ] Add `parent_game_id` to the `params` dict passed into `_write_game()` and to the `UPDATE games SET ...` statement in `_write_game()`
  - [ ] Add test cases to `scraper/tests/test_bgg_enrichment.py`: base game already exists locally → `parent_game_id` set; base game not yet scraped → `parent_game_id` stays `NULL`; non-expansion game (`base_game_bgg_id is None`) → `parent_game_id` stays `NULL`, no lookup query executed

- [ ] Task 4 — Wire `base_game` in `getGameBySlug()` (AC: 5, 6)
  - [ ] Extend `BaseGameRef` type in `web/src/db/queries/game-passport.ts` to add `bgg_id: number | null` (needed by Story 4.6's "no products yet" case, which links to the base game's BGG page)
  - [ ] Extend the raw SQL in `_getGameBySlug()` with a `LEFT JOIN games pg ON pg.id = g.parent_game_id` and a scalar subquery for the parent's cheapest in-stock price — see Dev Notes for exact SQL
  - [ ] Parse `parent_name` / `parent_slug` / `parent_bgg_id` / `parent_min_price` columns from `rows[0]` into a `base_game` object, or `null` if `parent_slug` is absent
  - [ ] Replace the `return { ...game, products, best_product, base_game: null }` line with the resolved `base_game` value
  - [ ] Update `web/src/db/queries/game-passport.test.ts`: replace the existing `'base_game is always null (schema gap — Story 4.6)'` test with cases for (a) `parent_game_id = null` → `base_game: null`, (b) parent with in-stock products → `base_game.current_min_price` is the cheapest in-stock price as a string, (c) parent with zero in-stock products → `current_min_price: null` but `name`/`slug`/`bgg_id` still populated

## Dev Notes

### Task 1 — Exact Drizzle self-reference syntax

Self-referencing FK columns need a typed callback, otherwise TypeScript reports a circular-reference error because `games` isn't defined yet at the point `.references()` runs:

```typescript
import { type AnyPgColumn, /* ...existing imports */ } from 'drizzle-orm/pg-core'

export const games = pgTable('games', {
  id: serial('id').primaryKey(),
  // ...existing columns...
  parent_game_id: integer('parent_game_id').references((): AnyPgColumn => games.id),
  // ...
})
```

Place it near `is_expansion` for readability. No `.notNull()` — most games have no parent. No `onDelete` cascade needed: if a base game row is ever deleted, the child's `parent_game_id` just becomes a dangling reference until the next enrichment cycle re-resolves it (acceptable per AC-4's "resolves later" behavior).

### Task 2 — BGG XML `inbound` semantics (read carefully — easy to get backwards)

On a BGG **base game**'s own `thing` response, `<link type="boardgameexpansion" inbound="true" id="X" value="Some Expansion">` lists the expansions that expand it — `inbound="true"` means "this link points to something that expands me."

On an **expansion**'s own `thing` response, `<link type="boardgameexpansion" id="Y" value="Base Game Name">` (no `inbound` attribute, or `inbound="false"`) points to the base game(s) it expands — this is what we want.

Current `_parse_thing()` (scraper/utils/bgg_client.py:98-103) has a `get_list()` helper that only extracts the `value` attribute and has no attribute-filtering — it can't be reused as-is. Write a small dedicated block instead:

```python
def get_base_game_bgg_id() -> Optional[int]:
    for el in item.findall("link[@type='boardgameexpansion']"):
        if el.get("inbound") == "true":
            continue
        raw_id = el.get("id")
        if raw_id:
            try:
                return int(raw_id)
            except ValueError:
                continue
    return None
```

Add `"base_game_bgg_id": get_base_game_bgg_id(),` to the dict returned at the bottom of `_parse_thing()` (scraper/utils/bgg_client.py:125-142).

**Caveat to flag in the PR description:** this logic is written from the documented BGG XML API shape (confirmed by cross-referencing existing `is_expansion` detection at line 137, which already reads `item.get("type") == "boardgameexpansion"`), but has not been verified against a live BGG response for a real expansion during story prep — no live BGG call was made while writing this story. Verify against at least one real expansion (e.g. any Brass: Birmingham expansion, since the base game's XML is already used as a test fixture) during implementation before trusting it in production, and adjust the parsing if the real response shape differs.

### Task 3 — Where resolution happens and why not in `_build_update_params`

`_build_update_params()` (scraper/utils/bgg_enrichment.py:42-66) is a pure data-mapping function — it doesn't have DB access. `parent_game_id` needs a `SELECT ... WHERE bgg_id = %s` lookup, so it must be resolved in `run_enrichment()`'s loop (scraper/utils/bgg_enrichment.py:171-207), using the same `pool`/`cur` already available there, right after `data = client.get_thing_with_retry(bgg_id)` succeeds and before `_write_game()` is called:

```python
parent_game_id = None
base_bgg_id = data.get("base_game_bgg_id")
if base_bgg_id is not None:
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM games WHERE bgg_id = %s", (base_bgg_id,))
            row = cur.fetchone()
            parent_game_id = row[0] if row else None
    finally:
        pool.putconn(conn)

params, _ = _build_update_params(data)
params["parent_game_id"] = parent_game_id
_write_game(pool, game_id, params)
```

Add `parent_game_id = %(parent_game_id)s,` to the `UPDATE games SET ...` statement in `_write_game()` (scraper/utils/bgg_enrichment.py:93-116).

Do NOT create a placeholder `games` row for an unresolved base game — AC-4 explicitly requires leaving `parent_game_id` `NULL` until the base game is scraped and deduplicated into `games` on its own (via the existing Epic 2 pipeline). Inventing a row here would bypass the dedup pipeline and risk creating a duplicate game record.

### Task 4 — Exact SQL extension for `game-passport.ts`

Current query (`web/src/db/queries/game-passport.ts:77-112`) joins `games` → `products` → `stores` by slug. Add a `LEFT JOIN` to the parent game plus a scalar subquery for its cheapest in-stock price — a second query would break the "single round-trip" guarantee from Story 4.5's AC-6, which this story must not regress:

```sql
SELECT
  g.id, g.slug, g.name, g.cover_image_url, g.is_expansion,
  g.designers, g.publishers, g.year_published, g.bgg_id, g.bgg_rank,
  g.bgg_category_rank,
  g.bgg_avg_rating::text AS bgg_avg_rating,
  g.complexity::text     AS complexity,
  g.mechanics, g.min_players, g.max_players, g.min_playtime, g.max_playtime,
  g.min_age, g.rules_pdf_url,
  p.id                    AS product_id,
  p.price::text           AS price,
  p.price_orig::text      AS price_orig,
  p.in_stock,
  p.url                   AS product_url,
  s.name                  AS store_name,
  pg.name                 AS parent_name,
  pg.slug                 AS parent_slug,
  pg.bgg_id                AS parent_bgg_id,
  (
    SELECT MIN(pp.price)
    FROM products pp
    WHERE pp.game_id = pg.id AND pp.in_stock = true
  )::text                 AS parent_min_price
FROM games g
LEFT JOIN products p ON p.game_id = g.id
LEFT JOIN stores   s ON s.id = p.store_id
LEFT JOIN games   pg ON pg.id = g.parent_game_id
WHERE g.slug = ${slug}
ORDER BY
  p.in_stock DESC NULLS LAST,
  p.price    ASC  NULLS LAST
```

`pg.*` and `parent_min_price` repeat identically across every row of the (unrelated) products fan-out — that's fine, `parseGameRow` already only reads `rows[0]`.

Update `BaseGameRef` (game-passport.ts:16-20):

```typescript
export type BaseGameRef = {
  name: string
  slug: string
  bgg_id: number | null
  current_min_price: string | null
}
```

Build it in `_getGameBySlug()` right before the `return` (game-passport.ts:134), replacing the hardcoded `base_game: null`:

```typescript
const first = rows[0]
const base_game: BaseGameRef | null =
  typeof first.parent_slug === 'string' && typeof first.parent_name === 'string'
    ? {
        name: first.parent_name,
        slug: first.parent_slug,
        bgg_id: typeof first.parent_bgg_id === 'number' ? first.parent_bgg_id : null,
        current_min_price: typeof first.parent_min_price === 'string' ? first.parent_min_price : null,
      }
    : null

return { ...game, products, best_product, base_game }
```

### Existing Utilities — Do NOT Reinvent

- `unstable_cache` wrapping stays exactly as-is (`game-passport.ts:137-141`) — this story only changes what `_getGameBySlug` returns, not its caching.
- `getDb()` from `@/db/index` — unchanged.
- Never `parseFloat()` price strings in the query layer — cast with `::text` in SQL as shown above.

### Testing Approach

- **Python:** mock `httpx.get` for `bgg_client.py` tests (existing pattern in `test_bgg_client.py`); mock `psycopg2.pool` for `bgg_enrichment.py` tests (existing pattern in `test_bgg_enrichment.py`).
- **TypeScript:** mock `@/db/index` (`jest.mock('@/db/index', () => ({ getDb: jest.fn() }))`), same pattern as `game-passport.test.ts` already uses.

### Common Pitfalls

- ❌ Do NOT confuse `inbound="true"` and absent/`false` — getting this backwards makes every base game link resolve to a random expansion instead of the actual parent.
- ❌ Do NOT add a second DB query/round-trip for the parent — use the `LEFT JOIN` + scalar subquery shown above.
- ❌ Do NOT create a placeholder `games` row when the base game isn't locally known yet — leave `parent_game_id` `NULL`.
- ❌ Do NOT hand-write the migration SQL — generate via `drizzle-kit generate` so `meta/_journal.json` stays consistent.
- ❌ Do NOT forget `parent_game_id` in the `_write_game()` UPDATE statement — adding it only to `_build_update_params()` silently no-ops.

### Project Structure Notes

- Modified: `web/src/db/schema.ts` (add column)
- New: `db/migrations/0004_games_add_parent_game_id.sql` (generated, then renamed)
- Modified: `scraper/utils/bgg_client.py` (`_parse_thing`)
- Modified: `scraper/utils/bgg_enrichment.py` (`run_enrichment`, `_write_game`)
- Modified: `web/src/db/queries/game-passport.ts` (`_getGameBySlug`, `BaseGameRef`)
- Modified: `web/src/db/queries/game-passport.test.ts`
- Modified: `scraper/tests/test_bgg_client.py`
- Modified: `scraper/tests/test_bgg_enrichment.py`
- `scraper/scraper/items.py` is NOT touched — it has no Pydantic model for the `games` table (games are written via raw SQL in `bgg_enrichment.py`, not through `items.py`), so CLAUDE.md's "schema.ts change requires a simultaneous items.py update" rule doesn't apply here; the equivalent sync obligation is satisfied by updating the raw SQL in `_write_game()` in the same PR.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.5b]
- [Source: _bmad-output/implementation-artifacts/4-5-game-passport-db-queries.md — "Schema Gap" Dev Note that originated this story]
- [Source: _bmad-output/planning-artifacts/architecture.md#Drizzle queries — ścisła reguła]
- [Source: web/src/db/schema.ts — games table definition]
- [Source: web/src/db/queries/game-passport.ts — current query to extend]
- [Source: web/drizzle.config.ts — schema/migrations paths]
- [Source: db/migrations/0002_products_store_external_unique.sql, 0003_hot_deals_indexes.sql — hand-naming convention]
- [Source: scraper/utils/bgg_client.py — `_parse_thing`, `get_thing_with_retry`]
- [Source: scraper/utils/bgg_enrichment.py — `run_enrichment`, `_build_update_params`, `_write_game`]
- [Source: scraper/tests/test_bgg_client.py — BGG XML fixture pattern]
- [Source: CLAUDE.md — schema.ts/items.py sync rule, NUMERIC=string never float, TIMESTAMPTZ]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
