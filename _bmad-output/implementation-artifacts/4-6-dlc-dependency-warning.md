---
baseline_commit: 65947fc8c7f7fdeed25bcfa040aacaef7d6526ea
---

# Story 4.6: DLC Dependency Warning

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want to see a clear warning when a game is an expansion that requires a base game,
so that I don't accidentally buy an expansion without knowing I need the base game first.

## Prerequisite — Read Before Starting

This story consumes `game.base_game` and `game.is_expansion` from `getGameBySlug()`. Both fields only become real (non-`null`/non-hardcoded) after **Story 4.5b (Dev B)** is `done` — 4.5b adds the `parent_game_id` schema column, the BGG expansion-link parser, and the `base_game` join in the query. If 4.5b is not yet `done`, `base_game` is always `null` and only the "not rendered" branches of this story's ACs are exercisable. Check `_bmad-output/implementation-artifacts/sprint-status.yaml` for `4-5b-parent-game-bgg-link` status before starting.

## Acceptance Criteria

1. **Given** a Game Passport page for a game with `is_expansion = true` and a resolvable base game (`base_game !== null`) that has a non-null `current_min_price`, **when** rendered, **then** `DlcWarning` appears directly below the `GameMeta` panel with: amber gradient background `linear-gradient(135deg, #F5E6C8, #EDD89C)`, `border: 1.5px solid #C07B18`, `border-left: 5px solid #C07B18`, `border-radius: 10px`, `padding: 14px 20px`, text color `#3D2A08` — and shows "Ten dodatek wymaga: **[Base Game Name]**", "Cena od X zł" (formatted via `formatPrice`), and a "Zobacz grę bazową →" link to `/gra/[base_game_slug]`.
2. **Given** `is_expansion = true` but `base_game === null` (orphan expansion — no resolvable BGG parent), **when** rendered, **then** `DlcWarning` renders nothing — no banner, no empty wrapper element, no reserved space.
3. **Given** `is_expansion = false`, **when** rendered, **then** `DlcWarning` renders nothing, regardless of `base_game`'s value.
4. **Given** `is_expansion = true` and `base_game !== null` but `base_game.current_min_price === null` (base game resolved, but it currently has no in-stock offers), **when** rendered, **then** the banner still shows with the base game name and "Zobacz grę bazową →" link, but the price line is replaced with "Brak ofert w sklepach — sprawdź BGG →" linking to the base game's BGG page (`https://boardgamegeek.com/boardgame/{bgg_id}`) — component must not crash when `current_min_price` is `null`.
5. **Given** case 4 above but `base_game.bgg_id === null` too (base game exists locally but hasn't synced with BGG yet), **when** rendered, **then** the "sprawdź BGG →" link is omitted (no `href="https://boardgamegeek.com/boardgame/null"`) — show the plain text "Brak ofert w sklepach" without a link.

## Tasks / Subtasks

- [x] Task 1 — Build `DlcWarning` component (AC: 1, 2, 3, 4, 5)
  - [x] Create `web/src/components/DlcWarning.tsx`
  - [x] Props: `{ isExpansion: boolean; baseGame: BaseGameRef | null }` (import `BaseGameRef` from `@/db/queries/game-passport`)
  - [x] Early return `null` when `!isExpansion || !baseGame` (covers AC-2 and AC-3 in one guard)
  - [x] Render amber banner per UX-DR11 styling (exact values in Dev Notes)
  - [x] Price line: `formatPrice(baseGame.current_min_price)` prefixed with "Cena od " when `current_min_price` is not `null`; otherwise the BGG fallback line (AC-4, AC-5)
  - [x] "Zobacz grę bazową →" link → `` `/gra/${baseGame.slug}` `` (internal `next/link`, no `target="_blank"` — this stays in-app)

- [x] Task 2 — Wire into Game Passport page (AC: 1, 2, 3)
  - [x] In `web/src/app/gra/[slug]/page.tsx`, import `DlcWarning` and render it directly below `<GameMeta game={game} />` in the left column, passing `isExpansion={game.is_expansion}` and `baseGame={game.base_game}`

- [x] Task 3 — Tests (AC: 1, 2, 3, 4, 5)
  - [x] Create `web/src/components/DlcWarning.test.tsx` covering: full render with price (AC-1), `is_expansion=true` + `base_game=null` → renders nothing (AC-2), `is_expansion=false` → renders nothing regardless of `base_game` (AC-3), `current_min_price=null` + `bgg_id` present → BGG fallback link shown (AC-4), `current_min_price=null` + `bgg_id=null` → fallback text with no link (AC-5)

## Dev Notes

### Component Styling — Exact Values (UX-DR11, epics.md FR-9)

```
background: linear-gradient(135deg, #F5E6C8, #EDD89C)
border: 1.5px solid #C07B18
border-left: 5px solid #C07B18
border-radius: 10px
padding: 14px 20px
color: #3D2A08
```

Follow the existing inline-`style` + `data-testid` convention used by every other component in this epic (`BestDealBanner.tsx`, `StalenessWarningBanner.tsx`) — no CSS module, no new className system.

### Exact Component Skeleton

```tsx
import Link from 'next/link'
import { formatPrice } from '@/lib/format'
import type { BaseGameRef } from '@/db/queries/game-passport'

export interface DlcWarningProps {
  isExpansion: boolean
  baseGame: BaseGameRef | null
}

export function DlcWarning({ isExpansion, baseGame }: DlcWarningProps) {
  if (!isExpansion || !baseGame) return null

  const hasPrice = baseGame.current_min_price !== null

  return (
    <div
      data-testid="dlc-warning"
      style={{
        background: 'linear-gradient(135deg, #F5E6C8, #EDD89C)',
        border: '1.5px solid #C07B18',
        borderLeft: '5px solid #C07B18',
        borderRadius: '10px',
        padding: '14px 20px',
        color: '#3D2A08',
        marginTop: '16px',
      }}
    >
      <div>
        Ten dodatek wymaga: <strong>{baseGame.name}</strong>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
        {hasPrice ? (
          <span data-testid="dlc-warning-price">Cena od {formatPrice(baseGame.current_min_price)}</span>
        ) : baseGame.bgg_id !== null ? (
          <a
            href={`https://boardgamegeek.com/boardgame/${baseGame.bgg_id}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="dlc-warning-bgg-link"
          >
            Brak ofert w sklepach — sprawdź BGG →
          </a>
        ) : (
          <span data-testid="dlc-warning-no-offers">Brak ofert w sklepach</span>
        )}
        <Link href={`/gra/${baseGame.slug}`} data-testid="dlc-warning-link" style={{ color: '#3D2A08', fontWeight: 700 }}>
          Zobacz grę bazową →
        </Link>
      </div>
    </div>
  )
}
```

Adjust layout/markup as needed to match the visual intent — the CSS values above are non-negotiable (AC-1), the exact JSX structure is not.

### Page Wiring — Exact Change

`web/src/app/gra/[slug]/page.tsx` currently renders (left column):

```tsx
<div>
  <GameMeta game={game} />
</div>
```

Change to:

```tsx
<div>
  <GameMeta game={game} />
  <DlcWarning isExpansion={game.is_expansion} baseGame={game.base_game} />
</div>
```

Add `import { DlcWarning } from '@/components/DlcWarning'` alongside the other component imports at the top of the file.

### `formatPrice()` — Reuse, Don't Reinvent

`web/src/lib/format.ts` already has `formatPrice(value: string | number | null | undefined): string` which returns `"—"` for `null`. This story's "Cena od X zł" only calls it when `current_min_price !== null` (checked explicitly), so the `"—"` fallback path in `formatPrice` itself won't be hit here — the null case is handled by the BGG-link branch instead, per AC-4/AC-5. Do not call `formatNull()` on the price — `formatPrice` already handles formatting.

### BGG Page URL

No existing helper builds a `boardgamegeek.com` URL anywhere in `web/`. Use `https://boardgamegeek.com/boardgame/{bgg_id}` directly inline (as shown in the skeleton above) — BGG's routing resolves this path correctly even for items that are technically `boardgameexpansion` type. No new `lib/` helper needed for a single call site.

### `is_expansion` "DODATEK" Badge — Related but Separate

`GameMeta.tsx` already renders a "DODATEK" badge when `is_expansion = true` (Story 4.2, AC covering line ~1188 in epics.md). `DlcWarning` is a second, separate signal (the actionable "you need X" banner) — do not merge them into one component or remove the existing badge.

### Previous Story Intelligence (4.5, 4.5b)

- `GameProduct.price` / `BaseGameRef.current_min_price` are `string | null`, never `number` — never `parseFloat()` in this component beyond what `formatPrice` already does internally.
- `game-passport.ts` computes `base_game` inside `_getGameBySlug()`, which is wrapped in `unstable_cache` tagged `'game-passport'` — no new caching concerns for this story, it's purely a consumer of the existing cached shape.
- If 4.5b is `done` but you see `base_game` still coming back `null` for a game you expect to be an expansion, check `games.bgg_sync_status` for that game — enrichment (and therefore `parent_game_id` resolution) only runs for games with `bgg_sync_status IN ('pending', 'synced'+stale)`; a game stuck on `not_found`/`rate_limited` never gets `parent_game_id` populated. This is expected behavior, not a bug in this story.

### Git Intelligence — Recent Component Story Pattern

Recent commits (`f8934a5 feat: Story 4.4 — Best Deal Banner, 19 tests`) establish the pattern this story should follow: one component file, one co-located `.test.tsx`, inline styles with `data-testid` hooks, Vitest + Testing Library, PR-sized commit `feat: Story 4.6 — DLC Dependency Warning, N tests`.

### Testing Approach

Vitest + `@testing-library/react`, same pattern as `BestDealBanner.test.tsx`:

```tsx
import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DlcWarning } from './DlcWarning'
import type { BaseGameRef } from '@/db/queries/game-passport'

function baseGame(overrides: Partial<BaseGameRef> = {}): BaseGameRef {
  return { name: 'Brass: Birmingham', slug: 'brass-birmingham', bgg_id: 224517, current_min_price: '199.00', ...overrides }
}
```

Key cases (map 1:1 to ACs):
1. `isExpansion=true`, `baseGame` with price → banner renders, shows name + "Cena od 199 zł" + link to `/gra/brass-birmingham`
2. `isExpansion=true`, `baseGame=null` → `container.firstChild` is `null`
3. `isExpansion=false`, `baseGame` non-null → `container.firstChild` is `null` (guard order matters: `is_expansion` is checked, not just `baseGame`)
4. `current_min_price=null`, `bgg_id=224517` → BGG link rendered, `href` contains `224517`, no crash
5. `current_min_price=null`, `bgg_id=null` → plain text fallback, no `<a>` element for BGG

### Common Pitfalls

- ❌ Do NOT render an empty wrapper `<div>` when the component should show nothing — AC-2/AC-3 require literally nothing in the DOM (`container.firstChild === null` in tests), not a hidden/zero-height element.
- ❌ Do NOT build a BGG link when `bgg_id === null` — produces a broken `.../boardgame/null` URL (AC-5).
- ❌ Do NOT open the internal "Zobacz grę bazową →" link in a new tab — it's in-app navigation, unlike the external BGG fallback link.
- ❌ Do NOT hardcode "Ten dodatek wymaga" copy differently from epics.md — Polish copy is exact, matches CLAUDE.md tone conventions elsewhere in the app.
- ❌ Do NOT start this story's implementation before confirming Story 4.5b status is `done` — the `base_game` prop will silently be `null` for every game otherwise, making AC-1/AC-4/AC-5 untestable against real data (they're still unit-testable with mocked props, but end-to-end verification requires 4.5b).

### Project Structure Notes

- New: `web/src/components/DlcWarning.tsx`
- New: `web/src/components/DlcWarning.test.tsx`
- Modified: `web/src/app/gra/[slug]/page.tsx` (add import + render call, left column)
- No schema/query changes in this story — those belong to Story 4.5b

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.6]
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR11 — DLC Warning Banner styling]
- [Source: _bmad-output/implementation-artifacts/4-5b-parent-game-bgg-link.md — base_game data source, must be done first]
- [Source: web/src/db/queries/game-passport.ts — `BaseGameRef`, `GamePassportData.base_game`]
- [Source: web/src/lib/format.ts — `formatPrice()`]
- [Source: web/src/components/BestDealBanner.tsx — inline-style + data-testid + external-link convention]
- [Source: web/src/components/StalenessWarningBanner.tsx — amber banner precedent]
- [Source: web/src/components/GameMeta.tsx — existing "DODATEK" badge, adjacent but separate concern]
- [Source: web/src/app/gra/[slug]/page.tsx — current left-column layout to modify]
- [Source: CLAUDE.md — formatNull/formatPrice rules, domain-named components]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

None — implementation followed the story's exact component skeleton and page-wiring diff with no deviations.

### Completion Notes List

- Implemented `DlcWarning` exactly per the story's component skeleton (Dev Notes), no changes needed to the proposed markup/styling.
- Wired into `web/src/app/gra/[slug]/page.tsx` left column directly below `GameMeta`, per the exact diff specified.
- 6 new tests in `DlcWarning.test.tsx` cover all 5 ACs plus a guard-order case (isExpansion=false + baseGame=null). All pass.
- Verified `4-5b-parent-game-bgg-link` is `done` in sprint-status.yaml — `base_game` is real (not hardcoded null) for expansions with a resolved parent.
- `npx tsc --noEmit` clean, `npx eslint` clean on new/changed files, full suite green: 314/314 tests across 26 files (no regressions).

### File List

- New: `web/src/components/DlcWarning.tsx`
- New: `web/src/components/DlcWarning.test.tsx`
- Modified: `web/src/app/gra/[slug]/page.tsx` (import + render `DlcWarning` below `GameMeta` in left column)

### Review Findings

- [x] [Review][Defer] Self-referential `base_game` link renders "Zobacz grę bazową →" pointing at the current page [web/src/components/DlcWarning.tsx:46, web/src/db/queries/game-passport.ts:74-82] — deferred, pre-existing: `parent_game_id` resolution is owned by Story 4.5b's data layer; a cycle guard belongs there, not in this pure-consumer component.
- [x] [Review][Defer] Non-numeric `current_min_price` string (e.g. `""`) makes `hasPrice` true and renders misleading "Cena od —" instead of the BGG fallback branch [web/src/components/DlcWarning.tsx:11-17] — deferred, pre-existing: same `!== null` trust pattern used by sibling components (`BestDealBanner`, `StalenessWarningBanner`); `current_min_price` is a `NUMERIC(10,2)` column, malformed values would indicate an upstream query/scraper bug, not a defect in this diff.

Dismissed as noise (6): formatPrice "crash" claim (formatPrice already returns `'—'` on NaN, never throws — format.ts:4); empty/degenerate slug → broken `/gra/` link (slug is a NOT NULL generated column, same trust boundary as every other `Link` in the app); `bgg_id === 0` treated as valid (BGG numeric IDs are never 0 in practice); generic "runtime trust beyond top-level guard" concern (applies to any typed React component, not actionable); `current_min_price = "0.00"` rendering "Cena od 0 zł" (valid display of a real zero price, no evidence it's reachable); guard-order test (case 6) not discriminating (functionally moot — `!isExpansion || !baseGame` returns `null` identically regardless of clause order).

## Change Log

| Date | Change |
| --- | --- |
| 2026-07-31 | Story 4.6 implemented: `DlcWarning` component, wired into Game Passport left column, 6 new tests. Status → review. |
| 2026-08-03 | Code review (dev b): 3-layer adversarial review (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 0 decision-needed, 0 patch, 2 deferred (data-layer trust concerns for future stories), 6 dismissed. No AC violations. Status → done. |
