import re
from decimal import Decimal


def parse_price(raw: str | None) -> Decimal | None:
    if not raw:
        return None
    raw = raw.strip()
    if not raw:
        return None
    cleaned = re.sub(r'[^\d,.]', '', raw.replace('od ', '').replace('OD ', ''))
    cleaned = cleaned.replace(',', '.')
    cleaned = cleaned.rstrip('.')
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except Exception:
        return None
