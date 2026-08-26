# Spike: Preorder Data Source Validation for Upcoming Releases (Epic 8)

**Story:** 8.1
**Dev:** Dev B
**Date:** 2026-08-26

## Methodology

Live HTTP verification of both store websites (`curl` with a browser User-Agent, raw HTML — no headless browser/JS execution used), building on Story 1.7's audit (`docs/spike-results/preorder-signal-audit.md`, 2026-06-12). 1.7 only inspected the main product listings; this spike additionally discovered and verified **dedicated preorder category pages** on both stores, which 1.7 did not find. Selectors and page structure re-confirmed live rather than trusted from the 2-month-old 1.7 document.

## Results

### Question 1 — viable data source

Both stores have a **dedicated preorder category page** (not found by 1.7, which only checked the main listing):

| Store | URL | Selector | Item count (all pages) |
|---|---|---|---|
| AlePlanszowki | `https://aleplanszowki.pl/532-przedsprzedaz` | `article.product-miniature` (same class as main listing) | **339** (14 pages × 24 + 3 on last page) |
| 3Trolle | `https://3trolle.pl/21-przedsprzedaz` | `article.product-miniature` (same class as main listing) | **136** (11 pages × 12 + 4 on last page) |

Both category pages are linked from main site navigation ("Przedsprzedaż").

**Note on count precision:** these are single-pass, point-in-time counts (page-count × items-per-page, sequential fetches on 2026-08-26) — not deduplicated by product URL across pages, and not re-verified over multiple sessions. A live catalog could shift between page fetches (new items added/reordered mid-crawl), so treat 339/136 as an order-of-magnitude estimate, not an exact reproducible count. This does not affect the PASSED conclusion given the large margin over the ≥10 threshold.

Separately, page 2 of AlePlanszowki's **general** listing (not the dedicated preorder page) also showed one item carrying the preorder badge ("Na straganie"). Story 8.2 should dedupe by product URL if it ever scrapes both the general listing and the dedicated preorder page for the same store, to avoid duplicate `upcoming_games` rows.

**Caveat:** both listings mix pure board games with TCG singles/booster boxes (Pokémon TCG, One Piece TCG) and RPG/miniatures products (Warhammer) — not all rows are board games in the `games` table's sense. This spike did **not** run an actual filtered count — spot-checking both lists visually confirmed multiple clearly-board-game items per store (e.g. AlePlanszowki: "Dixit Signature — Złoczyńcy", "Marvel Crisis Protocol" expansions), but "dozens" is a qualitative impression, not a measured number. Given the raw counts are ~14–34x the ≥10 threshold, it's very likely the board-game-only subset still clears it after Story 8.2 filters by `game_id`/name match — but this has not been verified with an actual count, and should be re-checked once 8.2's filtering is in place.

### Question 2 — selector stability / no JS rendering required

Confirmed via raw `curl` (no JS execution): both preorder pages return full product data in the initial HTML response (`article.product-miniature` blocks present, 200 OK). Scrapy (current architecture, no Splash/Playwright) is sufficient — matches 1.7's conclusion and the existing spider architecture.

`img[src*="available-presale"]` (AlePlanszowki, from 1.7) is confirmed still present and correct — every item on the dedicated preorder page carries this badge. **Correction:** the existing production spider (`ale_planszowki.py:20`) already traverses listings via `article.product-miniature .product-title a::attr(href)` — the same class-based selector this spike confirms on the preorder page. JSON-LD is only used per-product (name/ean/sku/availability), never for listing traversal. Story 8.2 needs a new spider instance targeting `/532-przedsprzedaz` specifically (a different URL/category, same selector family) — not new selector logic.

3Trolle's dedicated preorder page carries an **explicit** `"PRZEDSPRZEDAŻ:"` text banner on each product page (see Question 4) — a much more reliable signal than 1.7's `.shipping-info` heuristic. No stable CSS class wraps this banner (inline `style=` only) — match by text content (`"PRZEDSPRZEDAŻ:"` substring), not by class/id.

### Question 3 — games available "now"

Both counts (339 AlePlanszowki, 136 3Trolle) are point-in-time snapshots (2026-08-26) of a live, continuously-updated category — comfortably non-empty at launch, and structurally guaranteed to keep populating: the pages are permanent store sections, not a one-off list.

### Question 4 — available fields

| Field | AlePlanszowki | 3Trolle |
|---|---|---|
| Name | ✅ (`h3`/product title) | ✅ |
| Cover image | ✅ | ✅ |
| Price | ✅ (`X,XX zł`) | ✅ |
| Release date | ✅ — free text in `product-description` HTML, e.g. *"PLANOWANA WYSYŁKA - w dniu premiery (ok. 9 października 2026r.)"* — **not a structured field**, needs regex extraction (`ok\. (\d{1,2} \w+ \d{4})r?\.`) from paragraph text | ✅ — free text in a highlighted banner div, e.g. *"Przewidywana data dostawy to ok. 28 sierpnia 2026 (termin może ulec zmianie)"* — same shape: regex extraction from free text, format `ok. D miesiąc YYYY` |
| Preorder URL slug | Confirmed: product URLs contain `-przedsprzedaz-` segment (answers 1.7's open question) — extra dedup signal, but not required since the dedicated category page is now the primary source | N/A (no equivalent slug pattern observed) |
| JS rendering required | ❌ No | ❌ No |

Both stores express dates as **approximate** ("ok. …", "termin może ulec zmianie") — Story 8.2 should store these as `TEXT`, not `DATE` (per `epics.md` 8.2 AC: exact → `DATE`, approximate → `TEXT`). Neither store currently exposes an exact ISO date on these listings; both give month + day estimates with an explicit disclaimer that the date may shift.

**Sample size caveat:** date presence and format were confirmed on **one product page per store** (spot-checked), not systematically across all ~475 listings. The regex above is derived from these two examples only — Story 8.2 should sample a broader set (≥10 per store) before finalizing the date-extraction regex, since other phrasings may exist on listings not sampled here.

## Decision

**Spike PASSED.** Both stores have a reliable, JS-free, dedicated preorder source with far more than 10 identifiable upcoming games (339 + 136). This **updates Story 1.7's decision**: 1.7 recommended AlePlanszowki-only preorder support with a "last 30 days" fallback for 3Trolle (no reliable preorder signal found at the time). This spike found 3Trolle *does* have a reliable, explicit preorder signal via its own dedicated category page — Story 8.2 should build a preorder spider for **both** stores against their `/532-przedsprzedaz` and `/21-przedsprzedaz` category pages, not just AlePlanszowki + a 30-day fallback.

No architecture change required (Scrapy without JS rendering remains sufficient) — no ADR needed.

## Follow-ups for Story 8.2

- Build `UpcomingSpider`(s) against the two dedicated preorder category URLs above, not the general product listings.
- Date parsing: extract `ok\. (\d{1,2} \w+ \d{4})` from free-text description/banner HTML per store; store as `TEXT` (approximate, not `DATE`) given both stores explicitly disclaim exact-date guarantees. Validate the regex against a broader sample first (see sample-size caveat above).
- Filter out non-board-game items (TCG singles, booster boxes, miniatures-only products) — likely by requiring a `game_id` match against the existing `games` table (BGG-linked) before insert, consistent with how `UpcomingPipeline` (8.2 AC) already links by name match. **Open question:** upcoming/pre-release games are by definition unlikely to already exist in `games` — clarify whether 8.2 creates a provisional `games` row on first sight, or only surfaces items that already happen to match an existing row (which could silently drop most/all results if never resolved).
- 3Trolle preorder detection: match on the `"PRZEDSPRZEDAŻ:"` text banner (no stable CSS class available), not on `.shipping-info` text as 1.7 originally proposed — this spike found a stronger signal.
- Rate-limiting: a production spider crawling ~475 paginated pages (339 + 136, weekly per `epics.md` 8.2 AC) should use Scrapy's `AutoThrottle`/`DOWNLOAD_DELAY` settings rather than fetching at full speed, to avoid tripping either store's bot/rate-limit protection — not evaluated by this spike's manual `curl` checks.
