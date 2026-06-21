# Spike: GameUPC EAN Coverage Test

**Story:** 1.6
**Dev:** Dev B
**Date:** 2026-06-21

## API Details

- Endpoint: `GET https://api.gameupc.com/test/upc/{ean}`
- Auth required: **yes** — `x-api-key` header required
- Test key (public, visible in demo.html source): `test_test_test_test_test`
- BGG ID in response: **yes** — field `bgg_info[0].id` (when `bgg_info` is non-empty)
- BGG verification status: field `bgg_info_status` — values `verified` (human-confirmed) or `choose_from_bgg_info_or_search` (unconfirmed candidate)

## Test Corpus

EANs collected from: **3Trolle** (gtin13 from JSON-LD `<script type="application/ld+json">` on product pages, 2026-06-21)
Total tested: **22**

## Results

| EAN | Store product name | GameUPC result | BGG ID | bgg_info_status |
|-----|-------------------|----------------|--------|-----------------|
| 5903707560875 | Simsala Spin (Makoto edycja polska) — Egmont | ✅ matched | 437106 | choose_from_bgg_info_or_search |
| 5904326903586 | Unmatched: Lee vs Ali — OgryGames | ✅ matched | 428308 | choose_from_bgg_info_or_search |
| 5904305400938 | Pojedynek Miast | ✅ matched | 281020 | choose_from_bgg_info_or_search |
| 5902259208624 | Marsz Mrówek — Bard | ✅ matched | 416079 | choose_from_bgg_info_or_search |
| 5905794221226 | Wynalazcy znad Południowego Tygrysu — Portal | ✅ matched | 350316 | choose_from_bgg_info_or_search |
| 850052382254 | Kinfire Council — Elderwood Academy | ✅ matched | 411894 | choose_from_bgg_info_or_search |
| 5905289601472 | Wiedźmin: Ścieżka Przeznaczenia - Ronin — Rebel | ✅ matched | 401325 | choose_from_bgg_info_or_search |
| 5904063811731 | Coalitions (edycja polska) — Granna | ✅ matched | 57660 | choose_from_bgg_info_or_search |
| 5906700248498 | Ptasie Rewiry — Nasza Księgarnia | ✅ matched | 113656 | choose_from_bgg_info_or_search |
| 5904915903614 | Zeus — G3 | ✅ matched | 22864 | choose_from_bgg_info_or_search |
| 5904262958114 | Prapuszcza: Ostatnie starcie — Foxgames | ✅ matched | 179719 | choose_from_bgg_info_or_search |
| 5905794220618 | Metal Gear Solid: Gra Planszowa — Portal | ✅ matched | 266529 | choose_from_bgg_info_or_search |
| 5905794221561 | Drużyna do Zadań Specjalnych — Portal | ✅ matched | 462993 | choose_from_bgg_info_or_search |
| 5904689275115 | Nemesis: Odwet — Awaken Realms | ✅ matched | 381248 | choose_from_bgg_info_or_search |
| 5902650619845 | Brass: Lancashire Deluxe (edycja polska) — Maldito | ✅ matched | 28720 | choose_from_bgg_info_or_search |
| 632556295564 | Clans of Caledonia — Karma Games | ✅ matched | 216132 | choose_from_bgg_info_or_search |
| 5906954791122 | Pola Arle — Lacerta | ✅ matched | 159675 | choose_from_bgg_info_or_search |
| 5905794221516 | World Order: Edycja Rozszerzona — Portal | ✅ matched | 403150 | choose_from_bgg_info_or_search |
| 5905794221615 | Mrówki — Portal | ✅ matched | 212288 | choose_from_bgg_info_or_search |
| 5902259208303 | Odkrywcy Navorii — Bard | ✅ matched | 371932 | choose_from_bgg_info_or_search |
| 5901397454016 | West Story: A Town Building Game (edycja polska) — Rebel | ✅ matched | 401009 | choose_from_bgg_info_or_search |
| 4260071884688 | Kilia — Floodgate Games | ✅ matched | 437099 | **verified** |

## Summary

- Matched: **22 / 22 (100%)**
- Not found: 0
- Errors: 0

## Notes on `bgg_info_status`

- `verified`: human-confirmed mapping in the GameUPC crowdsource database — highest confidence
- `choose_from_bgg_info_or_search`: API has a candidate BGG ID from name-search but no human confirmation yet — `bgg_info[0].id` is available and likely correct but should be treated as a candidate, not authoritative

For the deduplication pipeline (Story 2.2): both statuses return `bgg_info[0].id`. The pipeline should store the BGG ID and rely on the existing BGG title-match logic for final validation.

## Gate Decision

**Epic 2 Story 2.2 EAN path: GO**

Coverage: **100%** — well above the 50% threshold.

BGG ID field in response: `bgg_info[0].id` — the deduplication pipeline in Story 2.2 must read this field.

API key for Story 2.2 implementation: read from env var `GAMEUPC_API_KEY`. The test key `test_test_test_test_test` (public, from gameupc.com/demo.html) suffices for development; a production key may be needed for production load.
