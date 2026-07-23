# GameUPC API — Production Access Research

Date: 2026-07-21
Scope: Investigate whether a real, production-grade GameUPC API key (genuine per-EAN lookups) is obtainable, on what terms, and whether it's worth depending on for the `scraper/scraper/pipelines/deduplication.py` EAN→BGG resolution step.

## Executive Summary

**A real production tier exists, but it is not self-serve.** GameUPC's own OpenAPI spec defines three environments: `test` (public demo, the one we've been using — explicitly "will be wiped periodically"), `dev` ("frequently unstable"), and `v1`, documented in-spec as **"Production database; email for API key."** There is no signup form, no account system, and no pricing page anywhere on the site — access is granted manually by the maintainer after a direct email request. We independently confirmed the demo key `test_test_test_test_test` returns `403 Forbidden` against the `/v1` production path (it only works on `/test`), which proves the production tier requires a genuinely different, individually-issued key — this is *not* purely a demo/portfolio project with no real path to data.

**Cost is unknown** — there's no pricing information published anywhere; you only find out by emailing. **GameUPC is a solo/hobbyist project**, not a company: contact is a personal email at `grettir.org`, the site runs on a free Bootstrap template, and there's no ToS, privacy policy, or company page. It has been live since at least Feb 2021 (Wayback Machine) and is still actively serving traffic today, but it's a single-maintainer dependency with no SLA.

**Recommendation (short version):** email the maintainer to request a `/v1` key and ask directly about cost, quota, and commercial-use terms (none of this is public), but do **not** make GameUPC a hard dependency — its database is small (~12k–17.5k UPCs, likely US/English-market skewed) and unverified for Polish retail EANs, and the maintainer bus-factor is 1. Keep BGG title-fuzzy-matching as the primary/fallback resolution path regardless of the outcome.

**Update (follow-up research, §9–§10):** ShelfScan is a real, actively-maintained (commits as recent as today) consumer web app built on GameUPC, but it has no reusable backend of its own and is explicitly "not licensed for modification" — it's evidence GameUPC has a serious, current user, not a resource we can build on directly. Its companion library `gameupc-hooks` (MIT-licensed, same author) confirmed our own integration pattern is correct and revealed no undocumented endpoints or extra rate-limit handling. Separately, BGG's own XML API does **not** expose UPC/barcode data (confirmed via BGG's own forum — a "productcode" field exists but is explicitly not for barcodes, and a "please add barcode field" request thread is still open/unresolved), so it can't substitute for a UPC service. General-purpose UPC/EAN databases (UPCitemdb, Go-UPC, Barcode Lookup, EAN-Search.org) exist as fallback/supplementary options, but none are board-game-specific, and BGG's own community confirms GameUPC is the only dedicated UPC→BGG-ID service anyone has built. EAN-Search.org (EU-based, ~9–19 EUR/month) is the most promising of the general databases for Polish-market coverage specifically. See §10 for the full assessment and updated recommendation.

---

## 1. How do you get a production API key?

Not self-serve. There is no registration, signup, or account-creation flow anywhere on `gameupc.com`. The site is a single-page marketing/demo page (Home / Demos / API / Contact anchors) backed by an embedded Swagger UI that documents the API but provides no interactive key-issuance mechanism.

The OpenAPI spec (`https://gameupc.com/gameupc-oas.yaml`) is explicit about the process:

```yaml
servers:
- url: https://api.gameupc.com/test
  description: Test server for you to develop against; will be wiped periodically
- url: https://api.gameupc.com/dev
  description: Current development master; frequently unstable
- url: https://api.gameupc.com/v1
  description: Production database; email for API key
```

So the only documented path is: **email the maintainer and ask.** (See §6 for the contact address.)

Source: `https://gameupc.com/gameupc-oas.yaml`, `https://gameupc.com/#api`

## 2. Pricing

**Not published anywhere.** No pricing page, no tier comparison, no "free tier" language. The homepage counters ("15,000+ Validated UPCs", "19,000+ Human suggestions") are marketing stats, not pricing tiers. We could not find any indication of whether a production key is free, donation-based, or paid — this is genuinely unknown from public pages and can only be resolved by asking directly in the access-request email. Do not assume it's free.

Source: full crawl of `https://gameupc.com/` (single page, no pricing section); no `pricing.html`, `terms.html`, or similar pages exist (all return 403/AccessDenied from the underlying S3 bucket, confirming they don't exist rather than being merely unlinked).

## 3. API documentation — endpoints, auth, request/response shape

Confirmed via the OpenAPI spec and live requests. **The production `/v1` API uses the identical path shape and auth mechanism as `/test`** — only the base URL and the key value differ:

- Auth: header `x-api-key`, scheme name `ApiKeyAuth` (`apiKey`/`header`), same on all three servers.
- `GET /upc/{upc}` — the core lookup. `upc` is EAN-13 or UPC-8. Optional `search` (override search terms) and `search_mode` (`speed` default, or `quality` — "~500ms slower, but suggestions on non-validated UPCs are more accurate") query params.
  - Response: `{status, upc, name, searched_for, bgg_info_status, bgg_info: [{id, name, thumbnail_url, image_url, page_url, data_url, update_url, confidence}]}` — this matches what's already coded against in `deduplication.py` (`bgg_info[0].id`).
  - `bgg_info_status` is either `verified` (trust `bgg_info[0]` directly) or `choose_from_bgg_info_or_search` (multiple candidates, needs user/heuristic disambiguation, `confidence` field present per candidate) — **the pipeline should only auto-trust `verified` responses**, not blindly take `bgg_info[0]` regardless of status (see §8 recommendation below — this is likely related to the corruption you saw).
  - `429` response documented: "Overloaded; try again later. There is a limit of 100 new UPCs per day." (see §5 — ambiguous whether this is a lookup cap or a crowdsource-write cap).
- `POST /upc/{upc}/bgg_id/{bgg_id}` and `POST /upc/{upc}/bgg_id/{bgg_id}/version/{bgg_version}` — crowdsource voting/correction endpoints (submit a `user_id`, at least 8 chars, to confirm/correct a mapping). Also have `DELETE` variants to retract a vote.
- `GET /upc/{upc}/user_id/{user_id}` — fetch a specific user's existing vote (404 if none).
- `GET /qr/game/{bgg_id}` / `GET /qr/user/{user_name}` — QR code image generation, irrelevant to this pipeline.
- `GET /warmup` (tagged `admin`) — pre-warms backend connections to cut cold-start latency; documents "first request may take up to 1000ms."

We independently verified the production/demo-key split live:
```
GET https://api.gameupc.com/v1/upc/19962194719  (x-api-key: test_test_test_test_test)  → 403 Forbidden {"message":"Forbidden"}
GET https://api.gameupc.com/test/upc/19962194719 (x-api-key: test_test_test_test_test) → 200 OK
```
This confirms `/v1` genuinely enforces a distinct, non-demo key — it is not the same backend with a shared key.

Backend infra is AWS API Gateway + Lambda (response headers show `x-amzn-requestid`, `x-amz-apigw-id`), consistent with a small serverless deployment rather than an enterprise platform.

We also compared `/test/stats` vs `/v1/stats` live and got **different numbers from different databases**:
```
GET /test/stats → {"upcs": 17565, "votes": 1860}
GET /v1/stats   → {"unverified_upcs": 10977, "upcs": 12269, "votes": 25109}
```
This confirms `/test` and `/v1` are genuinely separate datasets (not just separate auth on the same data) — good news for data isolation, but also confirms the total known-UPC universe is small either way (12k–17.5k), which bears on coverage expectations for Polish retail EANs (see §7/Recommendation).

Sources: `https://gameupc.com/gameupc-oas.yaml`; live `curl` verification against `api.gameupc.com/v1/*` and `api.gameupc.com/test/*`.

## 4. Terms of service / usage restrictions

**None found — no ToS, EULA, or privacy policy exists on the site.** We probed for common paths (`terms.html`, `tos.html`, `privacy.html`, `pricing.html`, `about.html`, `faq.html`, `docs.html`) — all return `403 AccessDenied` from the underlying static hosting (S3), confirming they simply don't exist, not that they're hidden/unlinked. `robots.txt` and `sitemap.xml` are likewise absent (403).

There is therefore **no documented restriction (or permission) covering**: commercial use, redistribution of returned BGG mappings, caching/storing results long-term, attribution requirements, or geographic limitations. This is a real gap, not a "restrictions exist but are lenient" situation — it's simply undocumented. Given the project is a commercial-adjacent Polish price-comparison site scraping third-party retailers, **explicitly ask about commercial use and redistribution/caching terms in the access-request email** rather than assuming silence means permission.

Source: direct path probing of `gameupc.com` (all 403/AccessDenied), full read of the only page that exists (the single-page homepage + Swagger-embedded API description).

## 5. Rate limits

The only documented limit is on the `429` response for `GET /upc/{upc}` and the `POST/DELETE` update endpoints:

> "Overloaded; try again later. There is a limit of 100 new UPCs per day."

This is ambiguous in a way that matters for your use case: it's unclear whether "100 new UPCs per day" means:
- (a) a cap on **total** lookup requests per day, or
- (b) a cap on requests for UPCs **not already in their database** (i.e., ones that trigger a fresh internet-scrape/heuristic lookup on their backend, vs. a fast cache hit for already-known UPCs).

Given the wording ("100 **new** UPCs"), (b) is the more likely reading — but this is not confirmed anywhere, and no per-second/burst rate limit is documented at all (typical of AWS API Gateway usage-plan setups, but the actual throttle value isn't published). Since the daily cron re-scrape does "hundreds of EAN lookups per run, likely growing," **this ambiguity is directly relevant and should be clarified explicitly when requesting a key** — ask what the actual quota is for the production tier and whether it's per-key or global.

Source: `https://gameupc.com/gameupc-oas.yaml` (`429` response descriptions on `/upc/{upc}` paths). No other rate-limit documentation exists publicly.

## 6. Contact / support

No contact form, no support ticketing system, no company page. The only contact info on the entire site is in the footer:

> "To reach me, send email to the name of this site @grettir.org"

I.e., an email address following the pattern `gameupc@grettir.org` (the "name of this site" being "gameupc", at the domain `grettir.org`). This is the only channel documented for requesting a production key, asking about pricing, or raising any other question (including the ToS gaps in §4 and the rate-limit ambiguity in §5).

Source: footer of `https://gameupc.com/` (`<p>To reach me, send email to the name of this site @grettir.org</p>`).

## 7. Company / service credibility check

GameUPC is **not a company** — it's an individually-run hobby/passion project:

- Contact is a personal email at a personal-looking domain (`grettir.org`), not a corporate domain.
- The site uses a free public Bootstrap template ("Baker" by BootstrapMade), with the template's required attribution links left intact in the footer — consistent with a low-budget/solo side project.
- No business entity, LinkedIn page, or company information found anywhere.
- Footer credits an individual (`@DoofusMagnus`) for icon contributions — community/hobbyist tone, not a vendor relationship.
- Backend is AWS API Gateway + Lambda — a reasonable, professional infra choice even for a hobby-scale service, and it responds live/correctly as of this research (July 2026).

**Longevity signal is genuinely positive**, though: Wayback Machine shows `gameupc.com` live since at least **February 2021**, with the most recent pre-existing snapshot from **August 2025**, and it's still serving live, differing data today. There's also a small ecosystem around it — a third-party open-source Android/web app, **ShelfScan** (`github.com/j5bot/shelfscan`, `shelfscan.io`), explicitly built on top of the GameUPC API, plus BGG community forum threads discussing it ("New REST service for UPC->BGG lookups", "Update on UPC --> BGG lookups" — both under BGG's "Geek Tools" forum; BGG blocks automated fetching so we could only confirm these threads exist via search, not read their full content).

Net assessment: **stable enough to have survived 5+ years and still be maintained**, but it is a **single-maintainer dependency with no SLA, no formal support channel, and no legal terms** — appropriate to lean on as a best-effort enrichment signal, risky to treat as load-bearing infrastructure.

Sources: `https://gameupc.com/` (footer, template attribution); Wayback Machine availability API (`archive.org/wayback/available?url=gameupc.com`); `github.com/j5bot/shelfscan`; `shelfscan.io/about`; BGG search results referencing threads 2579359 and 3519987 (BGG itself blocked direct fetch with 403/401 on both browser and XML-API access).

## 8. Is there any real production tier, or is this demo-only?

**There is a real production tier** — this is not a case of "no path to genuine data exists." The `/v1` server is explicitly documented as "Production database," and we proved live that it enforces a separate key from the demo (`403 Forbidden` when the demo key is used against `/v1`, `200 OK` on `/test`). So dropping EAN-matching entirely is not strictly necessary on the grounds of "the vendor doesn't offer real data."

However, it **is** effectively gated behind a manual, undocumented approval process with no visible pricing, no ToS, and an unconfirmed/ambiguous rate limit — so it doesn't behave like a normal self-serve production API either. Treat it as "obtainable, but only after direct contact, and only with terms you'll need to negotiate/clarify yourself."

---

## Recommendation

1. **Stop treating the demo key as capable of real per-EAN lookups** (already established from your reproduction) — it's confirmed structurally: the OAS spec's own "happy path" example UPC (`019962194719` → Gloomhaven) and the special test UPCs baked into `demo.py` (`111111111117`, `222222222224`, `333333333331`) show the `/test` server is designed around a small, fixed, periodically-wiped demo dataset, not general lookup.

2. **Email `gameupc@grettir.org`** (verify by checking the site footer yourself before sending, in case the pattern assumption is wrong) to request a `/v1` production key. In that email, explicitly ask the three things nothing on the site answers:
   - Is a key free, donation-based, or paid, and what would it cost at your expected volume (hundreds of EAN lookups/day via a daily cron re-scrape, likely growing)?
   - What exactly does the "100 new UPCs per day" limit apply to — all lookups, or only previously-unseen UPCs? Is there a per-second/burst limit too?
   - Are there any restrictions on commercial use, caching/storing the returned BGG mappings in your own database, or redistribution, for a Polish board-game price-comparison site?

3. **Don't make GameUPC a hard dependency regardless of the email's outcome.** Its total database is small (~12k–17.5k UPCs system-wide as of this research) and there's no evidence of Polish-market/EU-retail EAN coverage — it may simply not have most of your EANs even with a real key. Keep (or strengthen) the BGG title-fuzzy-matching path as the primary/fallback EAN→BGG resolution method, with GameUPC (if a key is granted) treated as a supplementary signal rather than a source of truth.

4. **Fix the pipeline's trust logic independent of the vendor question.** The response schema distinguishes `bgg_info_status: "verified"` from `"choose_from_bgg_info_or_search"` (multiple candidates with a per-candidate `confidence` score). If `deduplication.py` was taking `bgg_info[0].id` regardless of `bgg_info_status`, that alone — combined with a shared, low-quality demo dataset — would explain unrelated games merging into the same rows. This should be fixed (only auto-accept `verified`, and consider a `confidence` floor even then) whether or not a production key is ever obtained.

5. **Cache aggressively and never re-hit `/test`** for anything you intend to persist — it's explicitly documented as "will be wiped periodically," so any mapping learned from it isn't stable across time even if it happened to be momentarily correct.

### Explicitly unknown / could not be verified from public pages
- **Exact cost** of a production key (free vs. paid, and at what volume) — requires emailing the maintainer.
- **Exact production rate limit** semantics (see §5) — ambiguous in the spec, requires asking directly.
- **Formal ToS on commercial use, redistribution, caching, attribution** — no such document exists publicly; must be asked about directly and ideally get a written answer via email before relying on it commercially.
- **Current responsiveness of the maintainer** to a cold access-request email — the service infrastructure is confirmed live and serving current data (July 2026), but we have no signal on how quickly or whether the maintainer replies to key requests today.
- **Polish/EU retail EAN coverage** — database size is known (~12k–17.5k total) but its composition (which markets/regions are represented) is not documented anywhere.

---

## 9. ShelfScan assessment

**Verdict: not worth building on directly, but its companion library is a useful cross-check — and its metadata is genuinely useful evidence about GameUPC itself.**

### (a) Is ShelfScan itself usable for us?

No. ShelfScan (`github.com/j5bot/shelfscan`, live at `shelfscan.io`) is a **client-side, browser-only consumer app** — a Next.js 16 / React 19 web app that scans barcodes via the device camera and calls the GameUPC and BGG XML APIs directly from the browser (persistence is local, via IndexedDB/`Dexie`). It does not run its own hosted backend or expose an API of its own that we could call instead of GameUPC's. It's purely a UI layer over the same two APIs we already know about.

More importantly, the README states explicitly:

> "At this time the app is not licensed for modification. Message me if you'd like to discuss contributing or forking the app."

The GitHub repo has no OSS license set (`license: null` via the GitHub API) — so even if it did have reusable server logic, it isn't legally available to fork or embed. This rules out "use ShelfScan as a hosted lookup service" entirely.

### (b) Does its source reveal anything new about GameUPC?

Partially — not new endpoints, but useful confirmation and a validated integration pattern. ShelfScan's actual GameUPC calls live in a **separate, MIT-licensed, standalone npm package by the same author**: `gameupc-hooks` (`github.com/j5bot/gameupc-hooks`, npm `gameupc-hooks@1.0.11`, author Jonathan Cook / `jonathan.j5.cook@gmail.com`, `cookie@shelfscan.io`). Reading its source (`src/constants.ts`, `src/server.ts`) confirms:

- **Same endpoint set as the OpenAPI spec, nothing undocumented**: `GET /warmup`, `GET /upc/{upc}?search=`, `POST/DELETE /upc/{upc}/bgg_id/{bggId}[/version/{version}]`. No hidden endpoints, no alternate host.
- **Confirms our own `GAMEUPC_API_KEY` env-var pattern is the intended usage**: the library picks `https://api.gameupc.com/v1` when a `GAMEUPC_TOKEN` env var is set, and falls back to `https://api.gameupc.com/test` with the same demo key `test_test_test_test_test` when it isn't — i.e. an independent, professionally-built client made the identical design choice our pipeline already uses. This is a good cross-check that our integration shape is correct.
- **No special rate-limit handling or backoff logic** — plain `fetch()` calls, no retry/backoff, no client-side throttling to respect the "100 new UPCs/day" limit. So this doesn't give us any new insight into how that limit actually behaves in practice.
- **No evidence either way on non-US/EU coverage** — nothing in the code references geography, locales, or region-specific behavior.
- **Reinforces the "don't blindly trust `bgg_info[0]`" fix already flagged in §8**: `useGameUPC`'s design centers on a `submitOrVerifyGame` human-confirmation step before treating a match as final, i.e. the API's intended consumption pattern is "suggest candidates, let a human confirm," not "auto-trust the top result" — which lines up with our own recommended fix to check `bgg_info_status === 'verified'` before auto-merging.

### (c) Actively maintained, or abandoned?

**Actively maintained, unambiguously.** The GitHub repo's most recent commit at the time of this research is from **today** (`2026-07-21`, PR #161 merged, GPG-signed by the author). It was created June 2025 and has been pushed to continuously since. It's also promoted on BGG's own blog (`boardgamegeek.com/blog/16520/shelfscan-news`) and linked from the official BGG "Geek Tools" forum thread, so it's a recognized, community-visible project, not an abandoned side experiment.

This is a positive signal for GameUPC's own health by association: a currently-active, real-name developer (Jonathan Cook) is building serious production software on top of it right now, in July 2026 — GameUPC has at least one committed, current consumer beyond us. Worth noting as a secondary contact avenue if the `grettir.org` email in §6 doesn't get a response: Jonathan Cook (via the ShelfScan/gameupc-hooks GitHub repos, or `shelfscan.io`) may be able to confirm whether GameUPC's maintainer is still responsive, though it's unconfirmed whether he is the same person operating `grettir.org` or simply GameUPC's most prominent external integrator.

Sources: `https://github.com/j5bot/shelfscan` (repo metadata + README via GitHub API); `https://github.com/j5bot/gameupc-hooks` (repo tree + source files `src/constants.ts`, `src/server.ts`, `README.md`); `https://registry.npmjs.org/gameupc-hooks`; `https://shelfscan.io`; BGG blog post reference in ShelfScan's README.

---

## 10. Alternative UPC/EAN → BGG services

### Board-game-specific alternatives: none found

We searched BGG's own "Geek Tools" forum category, GitHub, and the general web for any other UPC/EAN → BGG-ID mapping service besides GameUPC. **We found none.** The BGG forum threads on this topic ("New REST service for UPC->BGG lookups," "Update on UPC --> BGG lookups," "Add 'Barcode' Field to Game Versions," "Add UPC identified to database") all converge on GameUPC as *the* community-adopted solution — there is no competing or backup board-game-specific barcode service to fail over to. This raises the stakes on the single-maintainer risk already flagged in §7: if GameUPC disappears, there is currently no drop-in replacement in this niche.

### Does BGG's own XML API expose UPC/barcode data? No.

Checked directly: BGG's XML API v2 (`boardgamegeek.com/xmlapi2/thing?...&versions=1`) does **not** have a barcode or UPC field for game versions. Confirmed via BGG's own forum:

- Thread **"Add 'Barcode' Field to Game Versions"** (`boardgamegeek.com/thread/2813714`) is an open feature *request* — i.e. it doesn't exist yet. The thread notes BGG does have a "product code" field, but that it's explicitly reserved for publisher-assigned SKUs, not UPC/EAN/ISBN barcodes, and shouldn't be conflated with one.

So there's no way to get barcode/UPC-to-BGG mapping data "for free" out of BGG itself via the token you already hold (`BGG_API_TOKEN`) — a third-party UPC service (GameUPC or a general-purpose one) remains necessary for the EAN-matching path specifically.

One relevant side-finding while checking this: BGG's XML API **now requires registration and an authorization/bearer token** as of a rollout that went from optional to enforced around **October 2025** (BGG forum threads: "Registration to use the XML API (and obtain soon-to-be-required Tokens) is now open," "Heads up.... BGG now requiring authorization tokens for XML API," "XML API registration required"). This matches what `deduplication.py` already does (`Authorization: Bearer {BGG_API_TOKEN}` on the `/xmlapi2/search` call) — the existing code is already correctly aligned with BGG's current auth requirement; no cheaper/unauthenticated path was available even before this research and none is expected to reopen.

### General-purpose UPC/EAN lookup databases (for feeding `_try_name_path`, not for BGG-ID mapping)

These don't return BGG IDs — the idea per the coordinator's question is whether their **product name/brand text** could be a stronger candidate string than what's scraped from a Polish store page, to feed into the existing BGG-search fuzzy-match (`_try_name_path` in `deduplication.py`, which already calls `boardgamegeek.com/xmlapi2/search` with `rapidfuzz.fuzz.WRatio` against a `FUZZY_THRESHOLD` of 85). Assessed each candidate:

| Service | Free tier | Paid tiers | Coverage/credibility read |
|---|---|---|---|
| **UPCitemdb** (`upcitemdb.com`) | 100 combined requests/day, no auth required, 50/sheet bulk lookup | DEV $99/mo (20k lookups/day), PRO $699/mo (150k/day), + per-call overage | Largest advertised catalog (715M+ UPCs), but US-retail-centric by reputation; no board-game-specific curation; unclear whether Polish-distributor EANs (as opposed to US retail UPCs) are represented at all. Established, long-running service — credible as a company, but a generic retail-data vendor, not a hobby/niche fit. |
| **Go-UPC** (`go-upc.com`) | **None** — "request a trial key" only, no self-serve free tier | Developer $74.95/mo (5k req/mo), Startup $245/mo (45k/mo), Enterprise $795/mo (450k/mo) | Markets itself specifically on "better international coverage than other services" (1B+ items, 6 continents) — plausibly the best of the US-based options for non-US EANs, but this is a marketing claim, not independently verified for Polish board games specifically. Pricing is high relative to project scale. |
| **Barcode Lookup** (`barcodelookup.com`) | Free trial account, then paid | Tiered monthly plans (exact $ not published without signup); 100 req/min cap, raisable for Enterprise | API docs page blocked our fetch (403); pricing not transparent without an account. Established consumer-facing brand (UPC/EAN/ISBN), but same US-retail-skew concern as UPCitemdb. |
| **EAN-Search.org** (`ean-search.org`) | No free tier; Trial = 1 EUR first month for 100 queries, then 9 EUR/mo | Pro 19 EUR/mo (5,000/mo), Bronze 39 EUR/mo (50,000/mo), Silver 99 EUR/mo (150,000/mo), Gold 149 EUR/mo (300,000/mo); 10% off annual | **European-founded/operated service** (1.2B+ EANs, explicitly built around EAN/GS1 data, which is the standard Polish/EU retailers use) — the most plausible of the general databases for genuinely better Polish/EU EAN coverage than US-centric alternatives. Also by far the cheapest realistic paid option for this project's scale: the 19 EUR/mo Pro tier (5,000 queries/month) would comfortably cover "hundreds of EAN lookups per run" on a **daily** cron job *if* already-resolved EANs are cached and not re-queried every run (which the pipeline should be doing anyway — see `_upsert_game`'s `ON CONFLICT (bgg_id)` pattern). |
| **UPC Database** (`upcdatabase.org`) | Unclear — requires account/app registration for a token; limits not published without signing up | Pricing page not published without account | Looks actively maintained (dated changelog, full dashboard/tooling) but is a smaller, less-established player than the above four; treat as a distant fallback only. |

**Caveat that applies to all five:** none of these are board-game-specific. Their strength is broad consumer-retail coverage (electronics, groceries, general merchandise), which is a different shape of catalog than "hobby board games sold by specialty Polish retailers." Even the best of them (EAN-Search.org, on EU-coverage grounds) is a **plausible improvement over scraped-page names for common/mainstream titles with standard EU retail barcodes**, but there's no evidence any of them curate hobby-game-specific data the way GameUPC's crowdsourced 12k–17.5k-UPC dataset does. Treat all of them as a way to get a *cleaner brand/product-name string* to feed the existing fuzzy-match — not as a UPC→BGG-ID shortcut, and not as guaranteed-better coverage than what's already being scraped.

Sources: `https://devs.upcitemdb.com/`, `https://go-upc.com/plans/api`, `https://www.ean-search.org/ean-database-api.html`, `https://upcdatabase.org/api`, general web search for Barcode Lookup pricing (direct fetch of `barcodelookup.com/api` blocked, 403); BGG forum thread titles via web search: `boardgamegeek.com/thread/2813714` (barcode field request), `boardgamegeek.com/thread/3525319`, `boardgamegeek.com/thread/3600185`, `boardgamegeek.com/thread/3540336` (XML API auth rollout).

### Updated recommendation (supersedes/extends §"Recommendation" above)

1. There is **no board-game-specific alternative to GameUPC** — if the project wants dedicated UPC→BGG-ID mapping, GameUPC (via the email request in §6) is genuinely the only game in town, which makes the single-maintainer risk in §7 more consequential, not less. Plan for graceful degradation (BGG name-fuzzy-match as fallback, already implemented) rather than expecting to swap vendors if GameUPC becomes unavailable.
2. **BGG's own API cannot replace GameUPC** — no barcode field exists or is planned to ship soon (the request thread is still open, unresolved).
3. If the project wants to strengthen the *name* side of matching independent of GameUPC, **EAN-Search.org is the most promising general-purpose candidate to pilot** given its EU/GS1 focus and low cost (19 EUR/month comfortably covers this project's volume if lookups are cached per-EAN rather than repeated every cron run) — but this should be treated as an experiment (measure whether it actually returns usable product names for Polish retail EANs) before committing spend, not assumed to work.
4. Do not invest in UPCitemdb, Go-UPC, or Barcode Lookup for this specific niche without evidence they carry Polish board-game EANs — their free/entry tiers are cheap enough to trial-test with a handful of real scraped EANs before deciding, but their marketing is generic-retail-first and board games are a small, easily-uncovered category within that.
5. ShelfScan/`gameupc-hooks` are not a path to avoid depending on GameUPC — they're built on the same vendor. Their value here was purely diagnostic (confirming our integration pattern matches an independent implementation, and confirming no hidden endpoints exist).
