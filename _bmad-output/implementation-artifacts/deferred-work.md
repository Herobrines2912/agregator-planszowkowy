## Deferred from: code review of story-4.5b (2026-07-30)

- FK `ON DELETE no action` on `games.parent_game_id` + TOCTOU between `_resolve_parent_game_id()`'s lookup and `_write_game()`'s update [db/migrations/0005_games_add_parent_game_id.sql:2, scraper/utils/bgg_enrichment.py:204-214] — if a base game row is ever deleted while an expansion still references it, the delete will fail with a raw FK-violation error rather than being handled gracefully. No code path deletes `games` rows today; revisit when delete/cleanup tooling is built.

## Deferred from: code review of story-6.4 (2026-07-21)

- Missing/renamed `doi_email.html` raises an uncaught `FileNotFoundError` from `_load_template()` [scraper/utils/brevo_client.py:29-30] — not required by any AC; low-effort hardening candidate (wrap in try/except, log, return False).
- No URL-scheme allow-list on `confirmation_url` before it's placed in the email's `href` [scraper/utils/brevo_client.py:31-36] — low risk today since the URL is server-generated, not user input; worth a defensive check if the caller contract ever loosens.
- Network/timeout errors (`httpx.ConnectError`, etc.) propagate uncaught out of `send_doi_email()` [scraper/utils/brevo_client.py:52-58] — explicitly sanctioned by AC-1, but Story 6.5 (alert engine) and any future caller must wrap their own call in a try/except or a single transient network blip will crash the caller.
- No `List-Unsubscribe` email header; footer link is a static `href="#"` placeholder [scraper/templates/doi_email.html:52-54] — explicitly sanctioned by AC-3 (no unsubscribe token exists at DOI stage); revisit once a token-bearing unsubscribe flow exists at DOI stage, and consider adding `List-Unsubscribe`/`List-Unsubscribe-Post` headers for deliverability.
