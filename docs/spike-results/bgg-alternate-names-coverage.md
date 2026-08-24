# Spike: BGG Alternate-Names Coverage for Polish Store Titles

**Story:** 2.7 (Part 1 of the "BGG-corpus title matching" initiative)
**Dev:** Dev B
**Date:** 2026-07-26

## Question

For our known-correct (Polish store title → BGG id) mappings, what fraction have the Polish
store title present as a BGG `<name type="alternate">` entry? If it's high, PL↔EN matching can
be replaced by a far stronger PL↔PL comparison against BGG's own data, with no machine
translation — see `_bmad-output/implementation-artifacts/2-7-bgg-corpus-title-matching-DRAFT.md`.

## Method

- **Sample:** the 22 (Polish store title, BGG id) pairs from Story 1.6's EAN spike
  (`docs/spike-results/gameUPC-coverage.md`). Titles used verbatim, including the
  `" — Publisher"` suffix.
- **Fetch:** `BggClient.get_thing_with_retry(bgg_id)` against the live BGG XML API v2
  (1 s throttle, 60/120/240 s backoff), 2026-07-26. 22/22 fetched successfully, 0 errors.
  `_parse_thing()` was extended in this story to return `alternate_names: list[str]`.
- **Normalisation:** `_normalise_name` from `scraper/scraper/pipelines/deduplication.py`,
  applied to **both** sides — the same normalisation the live matching pipeline uses.
- **Scorer:** `rapidfuzz.fuzz.token_sort_ratio`, threshold `FUZZY_THRESHOLD` = 85 (the constant
  already used in `deduplication.py`).
- **Script:** `scraper/scripts/spike_bgg_alternate_names.py` —
  `cd scraper && uv run python -m scripts.spike_bgg_alternate_names`

### Sample provenance — read this before trusting any number below

The 22 pairs were produced by Story 1.6's spike **using GameUPC's public demo key**
(`test_test_test_test_test`). `_bmad-output/implementation-artifacts/investigations/gameupc-sandbox-key-cross-contamination-investigation.md`
established (Finding 2, Confirmed/High) that this key **does not perform real per-EAN lookups** —
it serves a small pool of canned answers — and states explicitly that Story 1.6's "22/22 matched,
all distinct" result is *not* evidence the key is reliable; the 22-item sample simply did not
happen to hit the canned-answer collisions that two later spot-checks did.

On top of that, 21 of the 22 mappings carry `bgg_info_status = choose_from_bgg_info_or_search`
(unconfirmed candidates); only `Kilia` is `verified`.

So the sample is **not** verified ground truth, and this spike should be read as measuring
coverage *and* auditing the sample at the same time. Finding 4 below is the audit result.

## Results

| Store title | BGG ID | BGG primary name | Alt names | Best alternate match | Alt score | Primary score | Alt matched |
|---|---|---|---|---|---|---|---|
| Simsala Spin (Makoto edycja polska) — Egmont | 437106 | Simsala Spin | 0 | — | 0 | 51 | ❌ |
| Unmatched: Lee vs Ali — OgryGames | 428308 | Unmatched: Lee vs Ali | 1 | Unmatched: Мухаммед Алі проти Брюса Лі | 37 | 100 | ❌ |
| Pojedynek Miast | 281020 | Treasures of Cibola | 3 | 7 złotych miast | 53 | 35 | ❌ |
| Marsz Mrówek — Bard | 416079 | March of the Ants: Evolved Edition | 4 | Marsz mrówek | 100 | 30 | ✅ |
| Wynalazcy znad Południowego Tygrysu — Portal | 350316 | Wayfarers of the South Tigris | 14 | Wędrowcy Znad Południowego Tygrysu | 84 | 40 | ❌ |
| Kinfire Council — Elderwood Academy | 411894 | Kinfire Council | 0 | — | 0 | 100 | ❌ |
| Wiedźmin: Ścieżka Przeznaczenia - Ronin — Rebel | 401325 | The Witcher: Path of Destiny | 13 | Wiedźmin: Ścieżka Przeznaczenia | 88 | 32 | ⚠️ false positive |
| Coalitions (edycja polska) — Granna | 57660 | Time's Up! Edición Azul | 10 | Time's up! Blaue Edition | 41 | 42 | ❌ |
| Ptasie Rewiry — Nasza Księgarnia | 113656 | 111: Alarm dla Warszawy | 0 | — | 0 | 27 | ❌ |
| Zeus — G3 | 22864 | Zeus on the Loose | 7 | Zeus | 100 | 38 | ✅ |
| Prapuszcza: Ostatnie starcie — Foxgames | 179719 | Risk: Game of Thrones | 4 | Ryzyko: Game of Thrones – Szybkie Starcie | 40 | 40 | ❌ |
| Metal Gear Solid: Gra Planszowa — Portal | 266529 | Metal Gear Solid: The Board Game | 4 | Metal Gear Solid: Gra planszowa | 100 | 57 | ✅ |
| Drużyna do Zadań Specjalnych — Portal | 462993 | Drużyna do Zadań Specjalnych | 0 | — | 0 | 100 | ❌ |
| Nemesis: Odwet — Awaken Realms | 381248 | Nemesis: Retaliation | 4 | Nemesis: Odwet | 100 | 64 | ✅ |
| Brass: Lancashire Deluxe (edycja polska) — Maldito | 28720 | Brass: Lancashire | 8 | Brass | 45 | 100 | ❌ |
| Clans of Caledonia — Karma Games | 216132 | Clans of Caledonia | 8 | Clanes de Caledonia | 86 | 100 | ✅ |
| Pola Arle — Lacerta | 159675 | Fields of Arle | 6 | Pola Arle | 100 | 52 | ✅ |
| World Order: Edycja Rozszerzona — Portal | 403150 | World Order | 3 | Világrend | 28 | 95 | ❌ |
| Mrówki — Portal | 212288 | Rainbow 35 | 1 | Mrówki | 100 | 37 | ✅ |
| Odkrywcy Navorii — Bard | 371932 | Explorers of Navoria | 9 | Odkrywcy Navorii | 100 | 44 | ✅ |
| West Story: A Town Building Game (edycja polska) — Rebel | 401009 | West Story: A Town Building Game | 0 | — | 0 | 100 | ❌ |
| Kilia — Floodgate Games | 437099 | Kilia | 0 | — | 0 | 100 | ❌ |

### Coverage

Reported four ways deliberately. The headline metric is what AC-1 asked for; the other three are
what a Part-2 matcher would actually experience. All are over 22 fetched rows (0 errors, so the
error-exclusion rule below did not bite this run).

| Metric | Count | % |
|---|---|---|
| **Headline (AC-1) — store title matches a BGG alternate name** | **9/22** | **41%** |
| …minus the verified false positive (Finding 3) | 8/22 | 36% |
| …also applying the production ≥8-char guard (Finding 2) | 6/22 | 27% |
| Secondary — matches the primary name **or** an alternate | 16/22 | 73% |
| …minus the verified false positive | 15/22 | 68% |

With n=22, one title is worth ~4.5 percentage points. Treat every number here as
order-of-magnitude, not precise.

## Four findings that matter more than the headline number

### 1. The headline understates the approach: 7 misses need no alias at all

Seven of the thirteen misses are titles where the **store title already matches the BGG
primary name** (score ≥ 95): `Unmatched: Lee vs Ali`, `Kinfire Council`,
`Drużyna do Zadań Specjalnych`, `Brass: Lancashire Deluxe`, `World Order: Edycja Rozszerzona`,
`West Story`, `Kilia`. These are English-titled or Polish-original games where BGG's primary
name *is* the store title. AC-1 counts them as misses, but a real matcher resolves them
trivially on the primary name — no alias needed. Hence the 73% secondary figure.

### 2. …but it also overstates it: 2 of the 9 matches die under the production guard

`_name_match_score` in `deduplication.py` treats any normalised string shorter than 8 chars as
a no-match (a deliberate 2.2b guard against short names over-matching):

| Title | Normalised | Length | Under production guard |
|---|---|---|---|
| `Zeus — G3` | `zeus` | 4 | dropped |
| `Mrówki — Portal` | `mrowki` | 6 | dropped |

Caveat on how far to push this: that guard currently lives only on the GameUPC/EAN candidate
path. `_try_name_path` scores with bare `fuzz.WRatio` and has no length guard. Treating it as
"the" production guard for a future alias matcher is an assumption, not current behaviour.

### 3. One "match" is the exact failure this whole initiative exists to prevent

`Wiedźmin: Ścieżka Przeznaczenia - Ronin` (an expansion) matched the alias
`Wiedźmin: Ścieżka Przeznaczenia` at **88** — which is the **base game**, BGG 401325,
`is_expansion: False`, verified live. The expansion scored above threshold against its own base
game's Polish alias purely because the alias is a prefix of the store title.

This is the single most important row in the table. The initiative's stated goal is to fix two
things: PL↔EN matching *and* expansion-vs-base confusion. This spike shows that alternate-name
matching with `token_sort_ratio` at 85 **fixes the first and reproduces the second**. Alternate
names alone are not a solution to expansion/base; BGG's structured `type` +
`link[@type="boardgameexpansion"]` data (already parsed as `is_expansion` /
`base_game_bgg_id`) is, and Part 2 must use it as a hard gate rather than relying on the
string score.

The spike script now flags this class automatically (`expansion_overmatch_suspect`: matched
alias is a strict prefix of the store title). It fires on exactly this row and correctly does
not fire on the legitimate cross-language match `Clans of Caledonia` → `Clanes de Caledonia`.

### 4. At least 3 of the 22 "known-correct" pairs are wrong

Three pairs have a store title resembling neither the primary name nor any alias:

| Store title | Mapped BGG ID | BGG primary name | Best overall score |
|---|---|---|---|
| Coalitions (edycja polska) — Granna | 57660 | Time's Up! Edición Azul | 42 |
| Ptasie Rewiry — Nasza Księgarnia | 113656 | 111: Alarm dla Warszawy | 27 |
| Prapuszcza: Ostatnie starcie — Foxgames | 179719 | Risk: Game of Thrones | 40 |

A fourth, `Pojedynek Miast` → 281020 (`Treasures of Cibola`, best 53), is borderline and
probably also wrong.

**This is new evidence for an open question in the contamination investigation.** That
investigation left "enumerate all canned-answer clusters" as an open action item and noted it
could not tell how much of Story 1.6's 22-item sample was affected. These three (probably four)
rows are the first concrete answer: the demo-key sample was **not** 22/22 correct. Worth
carrying back into that investigation's record.

**Circularity warning — do not quietly prefer the cleaned number.** These rows were identified
*by the very score being measured* (`best_overall < 50`), so dropping them from the denominator
inflates the result by construction. Both denominators, for completeness: de-polluted headline
is 9/19 = 47% (8/19 = 42% minus the false positive) and de-polluted secondary is 16/19 = 84%
(15/19 = 79% minus the false positive). The 84% figure in particular is the most flattering
number in this document and the least trustworthy — it is a circular exclusion applied to a
sample of 19 drawn from a source documented to serve canned answers.

## Miss analysis — do misses cluster by publisher?

**No — misses look scattered, not clustered.** Publishers per miss (BGG `boardgamepublisher`
links; trimmed to the first few where BGG lists a dozen-plus localisation partners):

| Store title | BGG primary | Publishers (BGG) |
|---|---|---|
| Simsala Spin (Makoto edycja polska) | Simsala Spin | HUCH! |
| Unmatched: Lee vs Ali | Unmatched: Lee vs Ali | Restoration Games, Geekach, IELLO, MeepleBR, White Goblin |
| Pojedynek Miast | Treasures of Cibola | Ankama, Board Game Box, Nasza Księgarnia |
| Wynalazcy znad Południowego Tygrysu | Wayfarers of the South Tigris | Garphill, CMON, Fever, … Portal Games, … (15 total) |
| Kinfire Council | Kinfire Council | Incredible Dream Studios, PIF GAMES |
| Coalitions (edycja polska) | Time's Up! Edición Azul | Asterion, Crómola, Kaissa, MINDOK, … Rebel, Repos |
| Ptasie Rewiry | 111: Alarm dla Warszawy | Instytut Pamięci Narodowej (IPN) |
| Prapuszcza: Ostatnie starcie | Risk: Game of Thrones | The Op, Winning Moves FR/DE/UK |
| Drużyna do Zadań Specjalnych | Drużyna do Zadań Specjalnych | Portal Games |
| Brass: Lancashire Deluxe | Brass: Lancashire | Roxley, Warfrog, … Rebel, … (18 total) |
| World Order: Edycja Rozszerzona | World Order | Hegemonic, Bumble3ee, … Portal Games, … |
| West Story (edycja polska) | West Story: A Town Building Game | Smart Flamingo |
| Kilia | Kilia | HUCH! |

`HUCH!` appears twice (Simsala Spin, Kilia), but both of those games simply have **zero**
alternate names on BGG, so it isn't a "small publisher lacks curated aliases" signal.

The real predictor of a miss is not the publisher but **whether a Polish localisation exists at
all**. Note the shape of the evidence: several misses (`Wynalazcy`, `Coalitions`, `Brass`,
`World Order`) list a Polish publisher — Portal, Rebel — among BGG's publisher links, yet still
missed. That is because the miss is caused by something other than a missing Polish edition:
a normalisation gap, a wrong ground-truth pair, or a store title that already matches the
primary name.

Of the sample rows that genuinely are Polish localisations of a foreign-language game — the only
rows the alternate-name mechanism actually serves — the mechanism worked on **7 of 9**
(`Marsz Mrówek`, `Zeus`, `Metal Gear Solid`, `Nemesis: Odwet`, `Pola Arle`, `Mrówki`,
`Odkrywcy Navorii`; misses: `Wynalazcy` at 84, `Simsala Spin` at 0). `Clans of Caledonia` is
deliberately excluded from that denominator — it matched a *Spanish* alias and its primary name
already scored 100, so it is not evidence about Polish coverage. `Ronin` is excluded as the
false positive from Finding 3.

### Two secondary, actionable observations

- **One near-miss at the threshold:** `Wynalazcy znad Południowego Tygrysu` scored **84** against
  the alternate `Wędrowcy Znad Południowego Tygrysu` — one point under the 85 cutoff. (These are
  genuinely different Polish words, *Wynalazcy* vs *Wędrowcy*, so this may be a store-side title
  error rather than a threshold problem.) Worth revisiting the cutoff empirically in Part 2
  rather than inheriting 85 unexamined.
- **A normalisation gap:** `Simsala Spin (Makoto edycja polska)` normalises to
  `simsala spin (makoto edycja polska` — the `_EDITION_PATTERNS` entry matches the literal
  `(edycja polska)` only, so a parenthetical with extra words inside is left intact, dragging the
  primary-name score down to 51. A pattern like `\([^)]*edycja polska[^)]*\)` would fix it. Small,
  self-contained, and independent of Part 2. (This is also why `Simsala Spin` is *not* recoverable
  via the primary name today, unlike the other `HUCH!` title `Kilia`, which scores 100.)

## Gate Decision

**BGG-corpus title matching (Story 2.9+): NO-GO, needs a supplementary alias source**

Coverage: **9/22 = 41%** against BGG alternate names — well below the 80% gate. Adjusted for the
verified false positive and the existing production short-name guard, the honest range is
**27–36%**.

### What this does and does not mean

This is **not** "the BGG-corpus idea doesn't work," and it is also not "just get more data."
The result is more specific than the gate line:

- **For PL↔EN, the mechanism works.** Where a Polish localisation genuinely exists, BGG carried
  it as an alternate name in 7 of 9 sample cases. No machine translation needed, as the draft
  predicted.
- **For expansion-vs-base, alternate names actively make things worse** (Finding 3). Part 2 must
  gate on BGG's structured expansion links, not on the string score. This is the most valuable
  design constraint this spike produced, and it would not have shown up in a bare coverage number.
- **The 80% bar cannot be honestly resolved by this sample.** n=22, at least 3 (probably 4) pairs
  wrong, and the whole sample drawn from a source documented to serve canned answers.

### Recommended next step (for the human reviewing this gate)

Before commissioning or rejecting Part 2, **rebuild the ground truth**: assemble 100–200
hand-verified (Polish store title, BGG id) pairs. Story 2.8's GameUPC vote-back will accumulate
exactly this corpus as a side effect, now that a real production key is configured. Re-running
this script against a clean, larger sample is cheap — the script and the `alternate_names` field
both exist now — and would give the gate a number worth trusting. This one is not.

Do **not** read this NO-GO as a reason to build a manual alias table yet. On this evidence the
supplementary source that would move the number most is a better *sample*, not a better
*alias corpus*.

## Notes

- Part 2 (persisting `game_aliases`, `schema.ts` changes, changing the matching pipeline,
  `DlcWarning` UI wiring) was explicitly out of scope for this story and was not built. No
  Part-2 story file was created — that is a separate `create-story` invocation, after a human
  reviews this report.
- The only production-code change from this spike is the purely additive
  `alternate_names: list[str]` key on `BggClient._parse_thing()`.
- Reproducibility caveat: BGG alternate-name lists change over time, so a future re-run will not
  necessarily reproduce this table exactly. Per the precedent set by `gameUPC-coverage.md`, a
  later re-measurement should be appended here as a dated addendum rather than overwriting these
  numbers.
