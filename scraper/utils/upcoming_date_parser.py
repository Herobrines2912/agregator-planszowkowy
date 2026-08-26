import re
from datetime import date

# Both stores prefix every release estimate with "ok." (circa) and pair it with an
# explicit "may change" disclaimer elsewhere in the same sentence — see Story 8.2 Dev
# Notes. That is a deliberate signal from both stores that these are never committed
# dates, so this module never returns an `exact_date` today: every match becomes
# `approximate_text`, even the numeric DD.MM.YYYY form (which is unambiguous on its
# own but still carries the same "ok." qualifier as the others).
_PATTERNS = [
    # "ok. 25 września 2026r." / "ok. 9 października 2026r."  — day + genitive month + year
    re.compile(r"ok\.\s*\d{1,2}\s+[a-ząćęłńóśźż]+\s+\d{4}r?\.", re.IGNORECASE),
    # "ok. 16.09.2026" — numeric DD.MM.YYYY
    re.compile(r"ok\.\s*\d{1,2}\.\d{1,2}\.\d{4}"),
    # "ok. październik 2026r." / "ok. wrzesień 2026" — nominative month + year, no day
    re.compile(r"ok\.\s*[a-ząćęłńóśźż]+\s+\d{4}r?\.?", re.IGNORECASE),
]


def parse_release_date(raw_text: str | None) -> tuple[date | None, str | None]:
    """Extract an approximate release-date estimate from free-text description/banner HTML.

    Returns (exact_date, approximate_text). `exact_date` is always None today — both
    stores explicitly disclaim exact dates (see module docstring above); this return
    shape exists so a future store with a genuinely committed date can populate it
    without changing every caller.
    """
    if not raw_text:
        return None, None

    for pattern in _PATTERNS:
        match = pattern.search(raw_text)
        if match:
            return None, match.group(0).strip()

    return None, None
