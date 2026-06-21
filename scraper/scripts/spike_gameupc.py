"""
Spike: GameUPC EAN coverage test for Polish board games.
Story 1.6 — Dev B.

API discovered: https://api.gameupc.com/test/upc/{ean}
Auth: NONE required (open /test/ endpoint)
BGG ID field in response: bgg_info[0].id (when bgg_info_status == 'verified')

Run: cd scraper && python -m scripts.spike_gameupc
"""
import logging
import time

import httpx

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# EANs collected from 3Trolle (gtin13 from JSON-LD structured data, 2026-06-21)
# Format: (ean, product_name_as_shown_in_store)
TEST_EANS = [
    ("5903707560875", "Simsala Spin (Makoto edycja polska) — Egmont"),
    ("5904326903586", "Unmatched: Lee vs Ali — OgryGames"),
    ("5904305400938", "Pojedynek Miast"),
    ("5902259208624", "Marsz Mrówek — Bard"),
    ("5905794221226", "Wynalazcy znad Południowego Tygrysu — Portal"),
    ("850052382254",  "Kinfire Council — Elderwood Academy"),
    ("5905289601472", "Wiedźmin: Ścieżka Przeznaczenia - Ronin — Rebel"),
    ("5904063811731", "Coalitions (edycja polska) — Granna"),
    ("5906700248498", "Ptasie Rewiry — Nasza Księgarnia"),
    ("5904915903614", "Zeus — G3"),
    ("5904262958114", "Prapuszcza: Ostatnie starcie — Foxgames"),
    ("5905794220618", "Metal Gear Solid: Gra Planszowa — Portal"),
    ("5905794221561", "Drużyna do Zadań Specjalnych — Portal"),
    ("5904689275115", "Nemesis: Odwet — Awaken Realms"),
    ("5902650619845", "Brass: Lancashire Deluxe (edycja polska) — Maldito"),
    ("632556295564",  "Clans of Caledonia — Karma Games"),
    ("5906954791122", "Pola Arle — Lacerta"),
    ("5905794221516", "World Order: Edycja Rozszerzona — Portal"),
    ("5905794221615", "Mrówki — Portal"),
    ("5902259208303", "Odkrywcy Navorii — Bard"),
    ("5901397454016", "West Story: A Town Building Game (edycja polska) — Rebel"),
    ("4260071884688", "Kilia — Floodgate Games"),
]

GAMEUPC_BASE = "https://api.gameupc.com/test/upc"


# Public test API key visible in gameupc.com/demo.html source code
GAMEUPC_TEST_KEY = "test_test_test_test_test"

HEADERS = {
    "x-api-key": GAMEUPC_TEST_KEY,
    "Accept": "application/json",
}


def lookup_ean(client: httpx.Client, ean: str) -> dict | None:
    """Return API response dict, or None on 404/error."""
    url = f"{GAMEUPC_BASE}/{ean}"
    try:
        response = client.get(url, headers=HEADERS, timeout=10)
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as exc:
        logger.warning("HTTP %d for EAN %s", exc.response.status_code, ean)
        return None
    except Exception as exc:
        logger.error("Error for EAN %s: %s", ean, exc)
        return None


def main() -> None:
    matched = []
    not_found = []
    errors = []

    with httpx.Client() as client:
        for ean, name in TEST_EANS:
            logger.info("Testing EAN %s — %s", ean, name)
            result = lookup_ean(client, ean)
            time.sleep(0.5)

            if result is None:
                not_found.append((ean, name))
                logger.info("  → NOT FOUND")
            elif result.get("status") != "ok":
                errors.append((ean, name, result))
                logger.warning("  → ERROR: %s", result)
            else:
                bgg_info = result.get("bgg_info", [])
                bgg_id = bgg_info[0]["id"] if bgg_info else None
                status = result.get("bgg_info_status", "unknown")
                matched.append((ean, name, bgg_id, status, result))
                logger.info("  → MATCHED — bgg_id=%s status=%s", bgg_id, status)

    total = len(TEST_EANS)
    coverage = len(matched) / total * 100 if total else 0

    logger.info("=" * 60)
    logger.info("RESULTS: %d/%d matched (%.0f%%)", len(matched), total, coverage)
    logger.info("Not found: %d", len(not_found))
    logger.info("Errors: %d", len(errors))
    logger.info("Gate: %s", "GO (>=50%)" if coverage >= 50 else "SKIP (<50%)")

    logger.info("\nMatched examples (first 5):")
    for ean, name, bgg_id, status, _ in matched[:5]:
        logger.info("  EAN %s | %s | bgg_id=%s | %s", ean, name[:40], bgg_id, status)

    logger.info("\nNot-found examples (first 5):")
    for ean, name in not_found[:5]:
        logger.info("  EAN %s | %s", ean, name[:50])

    if errors:
        logger.info("\nErrors:")
        for ean, name, r in errors:
            logger.info("  EAN %s | %s | %s", ean, name[:40], r)


if __name__ == "__main__":
    main()
