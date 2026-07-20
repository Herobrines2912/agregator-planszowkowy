# Spike: BGG API Access Validation

**Story:** 1.5
**Dev:** Dev B
**Applied:** 2026-06-19
**Updated:** 2026-07-20 — dokument nie był zaktualizowany po faktycznym otrzymaniu tokena; stan poniżej uzupełniony retroaktywnie na podstawie dowodu produkcyjnego (patrz niżej)

## Application Submission

- Submitted: yes
- Date: przed 2026-06-23 (dokładna data zgłoszenia nie została zapisana w tym pliku na czas)
- Contact email: wojtekkaminski507@gmail.com
- Non-commercial statement: included

## Token Status

- Received: **yes**
- Date received: przed 2026-06-23 (token był aktywny i używany zanim Story 2.4 — BGG enrichment — została zmergowana w commit `069d8a0`)
- Stored as `BGG_API_TOKEN` in GitHub Secrets / Vercel env vars (nie committowany do repo)

## Validation Results

- Test endpoint: `GET https://boardgamegeek.com/xmlapi2/thing?id=224517&stats=1`
- Dowód działania: `scraper/utils/bgg_client.py` uruchamiany produkcyjnie w ramach `scraper.yml` (cron dzienny) od Story 2.5; enrichment realnych gier (`bgg_sync_status = 'synced'`) potwierdzony w bazie Neon
- Rate limit: ≤1 req/s wymuszane client-side w `bgg_client.py` (zgodnie z FR-24)
- Dokładne wartości nagłówków/HTTP status z pierwotnego testu walidacyjnego nie zostały zarchiwizowane — jeśli potrzebne do audytu, do odtworzenia przez ręczne wywołanie z aktualnym tokenem

## Gate Decision

Epic 2 BGG stories: **GO** — token otrzymany i w użyciu produkcyjnym (potwierdzone przez działający Epic 2, w tym Story 2.4 BGG enrichment)
