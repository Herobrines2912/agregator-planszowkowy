## Deferred from: code review of story-6.7 (2026-08-20)

- `priceAlerts.status` TS `.$type<>()` union omits `'triggered'`, a real value the scraper writes and Story 6.7 now formally relies on via `status IN ('active', 'triggered')` [web/src/db/schema.ts:135, web/src/db/queries/alerts.ts:157-215] — pre-existing since Story 6.5 (not introduced by 6.7); `confirmAlert()`'s exhaustive `switch`/`assertNever` is type-unsound as a result, currently unreachable in practice. Revisit by adding `'triggered'` to the union in a follow-up.

## Deferred from: code review of story-6.6 (2026-08-19)

- Non-deterministic pick among rows with identical `(game_id, price, store_id)` (duplicate SKU same store) [scraper/alert_engine.py] — `DISTINCT ON` has no defined tiebreak beyond `store_id`; low-value edge case requiring duplicate product rows for the same store/price, and this story's own Dev Notes discourage adding further ORDER BY keys without a test demanding it. Revisit only if data drift ever produces true store/price duplicates.
- "Wyłącz powiadomienia" footer link points at `game_url`, not a real unsubscribe [scraper/templates/price_drop_email.html] — explicitly scoped to Story 6.3 (unsubscribe_token infrastructure) per this story's Prerequisite section; same pattern already deferred for `doi_email.html` in story-6.4.

## Deferred from: code review of story-6.5 (2026-08-03)

- `MIN(price)` over an in-stock product group where every row has a NULL `price` is indistinguishable in logs from "no in-stock products at all" [scraper/alert_engine.py] — low-value observability gap, alert is correctly skipped either way; no reported occurrence.
- Full DB-level idempotency (`SELECT ... FOR UPDATE SKIP LOCKED` or advisory lock) to fully close the window where two concurrent `alert_engine.yml` runs could both select the same active alert before either commits `'triggered'` — user explicitly chose the cheaper GH Actions `concurrency:` group mitigation instead (2026-08-03) for the common case (manual re-run overlap). Revisit if duplicate price-drop emails are actually reported in production.

## Deferred from: code review of story-4.6 (2026-08-03)

- Self-referential `base_game` link renders "Zobacz grę bazową →" pointing at the current page when `parent_game_id` ever equals the game's own `id` [web/src/components/DlcWarning.tsx:46, web/src/db/queries/game-passport.ts:74-82] — a cycle guard belongs in the 4.5b data layer (`parent_game_id` resolution), not in `DlcWarning`, which is a pure consumer. No known code path produces this today.
- Non-numeric `current_min_price` string (e.g. `""`) makes `hasPrice` true and renders misleading "Cena od —" instead of falling to the BGG-link/no-offers branch [web/src/components/DlcWarning.tsx:11-17] — `current_min_price` is a `NUMERIC(10,2)` column; a malformed value here would indicate an upstream query/scraper bug. Same `!== null` trust pattern already used by `BestDealBanner`/`StalenessWarningBanner`.

## Deferred from: code review of story-4.5b (2026-07-30)

- FK `ON DELETE no action` on `games.parent_game_id` + TOCTOU between `_resolve_parent_game_id()`'s lookup and `_write_game()`'s update [db/migrations/0005_games_add_parent_game_id.sql:2, scraper/utils/bgg_enrichment.py:204-214] — if a base game row is ever deleted while an expansion still references it, the delete will fail with a raw FK-violation error rather than being handled gracefully. No code path deletes `games` rows today; revisit when delete/cleanup tooling is built.

## Deferred from: code review of story-6.4 (2026-07-21)

- Missing/renamed `doi_email.html` raises an uncaught `FileNotFoundError` from `_load_template()` [scraper/utils/brevo_client.py:29-30] — not required by any AC; low-effort hardening candidate (wrap in try/except, log, return False).
- No URL-scheme allow-list on `confirmation_url` before it's placed in the email's `href` [scraper/utils/brevo_client.py:31-36] — low risk today since the URL is server-generated, not user input; worth a defensive check if the caller contract ever loosens.
- Network/timeout errors (`httpx.ConnectError`, etc.) propagate uncaught out of `send_doi_email()` [scraper/utils/brevo_client.py:52-58] — explicitly sanctioned by AC-1, but Story 6.5 (alert engine) and any future caller must wrap their own call in a try/except or a single transient network blip will crash the caller.
- No `List-Unsubscribe` email header; footer link is a static `href="#"` placeholder [scraper/templates/doi_email.html:52-54] — explicitly sanctioned by AC-3 (no unsubscribe token exists at DOI stage); revisit once a token-bearing unsubscribe flow exists at DOI stage, and consider adding `List-Unsubscribe`/`List-Unsubscribe-Post` headers for deliverability.

## Deferred from: code review of 6-3-wylaczanie-powiadomien (2026-08-24)

- Migration `0007_price_alerts_unsubscribe_token.sql`: backfill + `SET NOT NULL` steps not wrapped in an explicit transaction — a concurrent insert during a rolling deploy could land a NULL row between steps and abort the migration. Pre-existing pattern shared with migration `0004`; not caused by this story.
