"""
Spike: how often is a Polish store title already present as a BGG
``<name type="alternate">`` entry on the game it maps to?

Story 2.7 (Part 1 of the "BGG-corpus title matching" initiative) — Dev B.

If coverage is high, PL<->EN matching can be replaced by a much stronger PL<->PL
comparison against BGG's own alternate names, with no machine translation. This
script only *measures* that; it changes no pipeline behaviour.

Sample: the 22 known-correct (Polish store title, BGG id) pairs from Story 1.6's
spike, recorded in docs/spike-results/gameUPC-coverage.md.

Run: cd scraper && uv run python -m scripts.spike_bgg_alternate_names
Output: a markdown table + summary on stderr (logging default; capture with 2>),
        transcribed into docs/spike-results/bgg-alternate-names-coverage.md
"""
import logging
import os
from dataclasses import dataclass, field

from dotenv import load_dotenv
from rapidfuzz import fuzz

from scraper.pipelines.deduplication import FUZZY_THRESHOLD, _normalise_name
from utils.bgg_client import BggClient, BggRateLimitError

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# The 22 confirmed (Polish store title, BGG id) pairs from Story 1.6's EAN spike
# (docs/spike-results/gameUPC-coverage.md). Titles are verbatim as they appear in
# that table, including the " — Publisher" suffix — _normalise_name strips it, so
# this is the same input the real matching pipeline would see.
SAMPLE: list[tuple[str, int]] = [
    ("Simsala Spin (Makoto edycja polska) — Egmont", 437106),
    ("Unmatched: Lee vs Ali — OgryGames", 428308),
    ("Pojedynek Miast", 281020),
    ("Marsz Mrówek — Bard", 416079),
    ("Wynalazcy znad Południowego Tygrysu — Portal", 350316),
    ("Kinfire Council — Elderwood Academy", 411894),
    ("Wiedźmin: Ścieżka Przeznaczenia - Ronin — Rebel", 401325),
    ("Coalitions (edycja polska) — Granna", 57660),
    ("Ptasie Rewiry — Nasza Księgarnia", 113656),
    ("Zeus — G3", 22864),
    ("Prapuszcza: Ostatnie starcie — Foxgames", 179719),
    ("Metal Gear Solid: Gra Planszowa — Portal", 266529),
    ("Drużyna do Zadań Specjalnych — Portal", 462993),
    ("Nemesis: Odwet — Awaken Realms", 381248),
    ("Brass: Lancashire Deluxe (edycja polska) — Maldito", 28720),
    ("Clans of Caledonia — Karma Games", 216132),
    ("Pola Arle — Lacerta", 159675),
    ("World Order: Edycja Rozszerzona — Portal", 403150),
    ("Mrówki — Portal", 212288),
    ("Odkrywcy Navorii — Bard", 371932),
    ("West Story: A Town Building Game (edycja polska) — Rebel", 401009),
    ("Kilia — Floodgate Games", 437099),
]

GATE_THRESHOLD_PCT = 80


@dataclass
class Row:
    """One measured (store title, BGG id) pair."""

    store_title: str
    bgg_id: int
    primary_name: str = "—"
    best_alternate: str | None = None
    best_score: int = 0
    primary_score: int = 0
    alternate_count: int = 0
    publishers: list[str] = field(default_factory=list)
    is_expansion: bool = False
    error: str | None = None

    @property
    def matched(self) -> bool:
        """AC-1's headline metric: does an *alternate* name carry the store title?"""
        return self.error is None and self.best_score >= FUZZY_THRESHOLD

    @property
    def best_overall(self) -> int:
        """Best score against primary name OR any alternate — what Part 2 would really do."""
        return max(self.best_score, self.primary_score)

    @property
    def matched_overall(self) -> bool:
        return self.error is None and self.best_overall >= FUZZY_THRESHOLD

    @property
    def low_similarity_needs_human_check(self) -> bool:
        """Neither the primary name nor any alias resembles the store title at all.

        A signal that the (title, bgg_id) pair itself is wrong — the whole sample came
        from GameUPC's demo key, which is documented to serve canned answers for an
        unknown subset of EANs — not a verdict. Needs a human to confirm per case.

        Note this flag is derived from the same score being measured, so excluding these
        rows from the denominator is circular. Report both denominators, never just the
        cleaned one.
        """
        return self.error is None and self.best_overall < 50

    @property
    def expansion_overmatch_suspect(self) -> bool:
        """Matched an alias that is a strict *prefix* of the store title.

        That is the expansion-onto-base-game shape this whole initiative exists to
        prevent: "Wiedźmin: Ścieżka Przeznaczenia - Ronin" (an expansion) matching the
        base game's Polish alias "Wiedźmin: Ścieżka Przeznaczenia". A prefix test rather
        than a token-set test deliberately does not fire on a legitimate cross-language
        match like "Clans of Caledonia" vs "Clanes de Caledonia".
        """
        if not self.matched or self.best_alternate is None:
            return False
        title = _normalise_name(self.store_title)
        alias = _normalise_name(self.best_alternate)
        return title.startswith(alias) and len(title) > len(alias)


def score_against_alternates(store_title: str, alternate_names: list[str]) -> tuple[str | None, int]:
    """Best (alternate name, score) for a store title, comparing PL-normalised on both sides.

    Uses token_sort_ratio — the same scorer deduplication.py already uses for its
    GameUPC candidate guard, so this measures what Part 2 would actually see rather
    than an idealised comparison.
    """
    normalised_title = _normalise_name(store_title)
    best_name: str | None = None
    best_score = 0
    for candidate in alternate_names:
        score = int(fuzz.token_sort_ratio(normalised_title, _normalise_name(candidate)))
        if score > best_score:
            best_score = score
            best_name = candidate
    return best_name, best_score


def measure(client: BggClient, store_title: str, bgg_id: int) -> Row:
    row = Row(store_title=store_title, bgg_id=bgg_id)
    try:
        result = client.get_thing_with_retry(bgg_id)
    except BggRateLimitError:
        row.error = "rate_limited (retries exhausted)"
        logger.error("BGG ID %d: rate limited after retries", bgg_id)
        return row
    except Exception as exc:
        row.error = f"{type(exc).__name__}: {exc}"
        logger.error("BGG ID %d: fetch failed: %s", bgg_id, exc)
        return row

    if result is None:
        row.error = "404 not found"
        logger.warning("BGG ID %d not found (404)", bgg_id)
        return row

    # _parse_thing returns a minimal {"name": "Nieznana gra"} dict — with no
    # "alternate_names" key at all — when the XML fails to parse or carries no <item>.
    # Without this check that sentinel would score as a genuine zero-alternates miss
    # AND as a false "ground truth is wrong" accusation, while the run still reports
    # zero errors. Silently corrupting the coverage number is the one failure mode a
    # measurement script must not have.
    if "alternate_names" not in result:
        row.error = "parse failure (malformed XML or no <item> in response)"
        logger.error("BGG ID %d: %s", bgg_id, row.error)
        return row

    alternates = result.get("alternate_names") or []
    row.primary_name = result.get("name") or "—"
    row.alternate_count = len(alternates)
    row.publishers = result.get("publishers") or []
    row.is_expansion = bool(result.get("is_expansion"))
    row.best_alternate, row.best_score = score_against_alternates(store_title, alternates)
    row.primary_score = int(
        fuzz.token_sort_ratio(_normalise_name(store_title), _normalise_name(row.primary_name))
    )

    logger.info(
        "%-52s bgg_id=%-7d alts=%-3d alt=%-3d primary=%-3d %s",
        store_title[:52],
        bgg_id,
        row.alternate_count,
        row.best_score,
        row.primary_score,
        "MATCH" if row.matched else ("via-primary" if row.matched_overall else "miss"),
    )
    return row


def report(rows: list[Row]) -> None:
    """Log the per-title markdown table, the coverage line, and the gate decision."""
    logger.info("")
    logger.info(
        "| Store title | BGG ID | BGG primary name | Alt names | Best alternate match | Alt score "
        "| Primary score | Alt matched |"
    )
    logger.info("|---|---|---|---|---|---|---|---|")
    for row in rows:
        if row.error:
            logger.info(
                "| %s | %d | ERROR: %s | — | — | — | — | ✗ |",
                row.store_title, row.bgg_id, row.error,
            )
            continue
        logger.info(
            "| %s | %d | %s | %d | %s | %d | %d | %s |",
            row.store_title,
            row.bgg_id,
            row.primary_name,
            row.alternate_count,
            row.best_alternate or "—",
            row.best_score,
            row.primary_score,
            "✅" if row.matched else "❌",
        )

    # Coverage is measured over rows we actually got data for. A fetch failure is not
    # evidence of absent alternate names, so counting it as an automatic miss would
    # understate coverage — errors are excluded from BOTH numerator and denominator.
    fetched = [r for r in rows if r.error is None]
    total = len(fetched)
    matched = sum(1 for r in fetched if r.matched)
    matched_overall = sum(1 for r in fetched if r.matched_overall)
    errors = len(rows) - total
    coverage_pct = matched / total * 100 if total else 0.0
    coverage_overall_pct = matched_overall / total * 100 if total else 0.0

    logger.info("")
    logger.info("=" * 72)
    logger.info("Sample size: %d pairs, %d fetched successfully, %d errors", len(rows), total, errors)
    logger.info("Errors are excluded from both the numerator and the denominator.")
    logger.info(
        "AC-1 coverage (alternate names only): %d/%d = %.1f%% (match threshold %d)",
        matched, total, coverage_pct, FUZZY_THRESHOLD,
    )
    logger.info(
        "Secondary (primary name OR alternate): %d/%d = %.1f%%",
        matched_overall, total, coverage_overall_pct,
    )

    misses = [r for r in fetched if not r.matched]
    if misses:
        logger.info("")
        logger.info(
            "Misses vs alternates (%d) — store title | BGG primary | alt score | primary score | publishers:",
            len(misses),
        )
        for row in misses:
            logger.info(
                "  %s | %s | %d | %d | %s",
                row.store_title,
                row.primary_name,
                row.best_score,
                row.primary_score,
                ", ".join(row.publishers) or "—",
            )

    overmatch = [r for r in fetched if r.expansion_overmatch_suspect]
    if overmatch:
        logger.info("")
        logger.info(
            "EXPANSION OVER-MATCH suspect (%d) — matched alias is a strict prefix of the store "
            "title, i.e. an expansion matching its base game. These are FALSE POSITIVES inside "
            "the coverage numerator:",
            len(overmatch),
        )
        for row in overmatch:
            logger.info(
                "  %s | bgg_id=%d → %r (is_expansion=%s) | matched alias %r | score=%d",
                row.store_title, row.bgg_id, row.primary_name,
                row.is_expansion, row.best_alternate, row.best_score,
            )

    suspect = [r for r in fetched if r.low_similarity_needs_human_check]
    if suspect:
        logger.info("")
        logger.info(
            "LOW SIMILARITY, needs human check (%d) — store title resembles neither primary nor "
            "any alias (best overall < 50); the sample pair itself is probably wrong. NOTE: this "
            "flag is derived from the same score being measured, so excluding these rows from the "
            "denominator is circular — report both denominators:",
            len(suspect),
        )
        for row in suspect:
            logger.info(
                "  %s | bgg_id=%d → %r | best overall=%d",
                row.store_title, row.bgg_id, row.primary_name, row.best_overall,
            )

    gate = (
        "BGG-corpus title matching (Story 2.9+): GO"
        if coverage_pct >= GATE_THRESHOLD_PCT
        else "BGG-corpus title matching (Story 2.9+): NO-GO, needs a supplementary alias source"
    )
    logger.info("")
    logger.info("Gate threshold: %d%% — measured %.1f%%", GATE_THRESHOLD_PCT, coverage_pct)
    logger.info("Gate: %s", gate)


def main() -> None:
    load_dotenv()
    token = os.environ.get("BGG_API_TOKEN")
    if not token:
        raise RuntimeError("BGG_API_TOKEN env var not set — cannot run this spike")

    client = BggClient(token=token)
    logger.info("Measuring alternate-name coverage for %d known-correct pairs", len(SAMPLE))
    rows = [measure(client, title, bgg_id) for title, bgg_id in SAMPLE]
    report(rows)


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        logger.error("%s", exc)
        raise SystemExit(1) from exc
