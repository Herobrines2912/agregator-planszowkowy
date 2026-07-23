---
status: draft
source: code-review of Story 2.2b (2026-07-23) — decision to build robust PL↔EN + expansion/base matching
---

# DRAFT — Follow-up: BGG-corpus title matching (spike + story)

> This is a **draft/backlog stub**, not a dev-ready story. It captures a decision made
> during Story 2.2b's code review so it isn't lost. Run it through `create-story` before
> `dev-story`. It is intentionally out of scope for the 2.2b hotfix.

## Why this exists

Product goal (per Kacper, 2026-07-23): the app should **excel at distinguishing
expansions/accessories from base games** — where iSzop/Ceneo lump inserts, tokens and
add-ons under a base-game search, we want near-perfect resolution. That is a *matching*
problem, and the current string-similarity approach (`_try_name_path` / the EAN-path
guard) can't do it, for two reasons:

1. **PL↔EN.** Store titles are Polish localisations; BGG names are English. Fuzzy string
   similarity between them is inherently weak (`"Wsiąść do Pociągu: Europa"` vs
   `"Ticket to Ride: Europe"` ≈ 55). Machine translation does **not** fix this — game
   titles are creative localisations, not literal translations (`"Na skrzydłach"` → MT
   gives *"On wings"*, not `Wingspan`).
2. **Expansion vs base.** String similarity actively *mis*-merges here — an expansion
   name contains the base name, so it scores high against the base game.

## Key insight (why this is lighter than it looks)

**BGG already holds the answer — we don't need to translate.**

- The BGG `thing` endpoint returns `<name type="alternate">` entries, which commonly
  include the **Polish edition title**. So `"Wsiąść do Pociągu: Europa"` is likely already
  an alternate name on the BGG entry for *Ticket to Ride: Europe*. Match against alternate
  names → PL↔EN resolved deterministically, no MT.
- Expansions are **structured data**: BGG `type` is `boardgame` vs `boardgameexpansion`,
  and expansions link to their base via `<link type="boardgameexpansion" inbound="true">`.
  So "Catan" vs "Catan: Miasta i Rycerze" are two distinct items with an explicit
  base↔expansion relation — no guessing from strings.

## Part 1 — SPIKE (do this first): Polish coverage in BGG alternate names

**Question:** for our real scraped product corpus, what fraction of games have their
Polish title present as a BGG `<name type="alternate">`? This decides whether the corpus
approach is worth building or needs a supplementary alias source.

- Sample N (e.g. 100–200) known Polish products with their correct BGG id (reuse
  `docs/spike-results/gameUPC-coverage.md` sample + any hand-verified matches).
- Pull each game's full `thing` record; check whether the Polish store title fuzzy-matches
  any alternate name (high threshold, since now we're comparing PL↔PL).
- Report: % covered, examples of misses, whether misses cluster (small publishers?).
- Deliverable: `docs/spike-results/bgg-alternate-names-coverage.md`.

**Gate:** if coverage is high (say ≥80%), proceed to Part 2. If low, the story needs a
manual/crowdsourced alias table as a supplement — re-scope before building.

## Part 2 — STORY (only if the spike clears): BGG-corpus matching

Rough shape, to be detailed by `create-story`:

- Extend the BGG enrichment job (Story 2.4) to persist, per game: canonical name, **all
  alternate names**, `type` (base/expansion/accessory), and base↔expansion **links**.
  Requires a `schema.ts` change (new table e.g. `game_aliases`, plus `games.type` /
  parent link) → **must update `scraper/scraper/items.py` in the same PR** (CLAUDE.md rule).
- Change matching to resolve store title → BGG id against the local corpus (canonical +
  alternate names) instead of a live BGG search + English-only fuzzy match.
- Surface expansion/accessory status in the UI via the existing `DlcWarning` component;
  group products under their base game using the BGG links.
- Revisit the EAN-path guard: once the corpus exists, validate GameUPC's candidate against
  BGG alternate names (see the `TODO(korpus BGG)` left in `deduplication.py::_name_match_score`).

**Dev split:** primarily Dev B (Scraper: enrichment, corpus, matching); Dev A (Web) for the
UI grouping + `DlcWarning` wiring and any query changes.

## Explicitly out of scope / rejected

- **Live machine translation** as the primary mechanism — creative localisations defeat it;
  BGG alternate names are the deterministic substitute. MT at most a last-ditch fallback.
- Anything in the 2.2b hotfix — that only removes the demo key, adds the interim
  `token_sort_ratio` guard, and cleans the confirmed contamination.
