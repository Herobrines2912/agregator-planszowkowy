import hashlib
import html
import logging
import os
import re
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"
DOI_EMAIL_SUBJECT = "Potwierdź powiadomienia o cenie"
PRICE_DROP_EMAIL_SUBJECT = "Cena spadła!"

_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"

load_dotenv()

BREVO_API_KEY = (os.environ.get("BREVO_API_KEY") or "").strip()
if not BREVO_API_KEY:
    raise EnvironmentError("BREVO_API_KEY env var not set — cannot load brevo_client")

BREVO_SENDER_EMAIL = (os.environ.get("BREVO_SENDER_EMAIL") or "").strip()
if not BREVO_SENDER_EMAIL:
    raise EnvironmentError("BREVO_SENDER_EMAIL env var not set — cannot load brevo_client")

BREVO_SENDER_NAME = (os.environ.get("BREVO_SENDER_NAME") or "").strip()
if not BREVO_SENDER_NAME:
    raise EnvironmentError("BREVO_SENDER_NAME env var not set — cannot load brevo_client")


def _hash_email(email: str) -> str:
    return hashlib.sha256(email.encode()).hexdigest()[:8]


def _load_template(name: str) -> str:
    return (_TEMPLATES_DIR / name).read_text(encoding="utf-8")


def _render(template: str, **kwargs: str) -> str:
    """Substitute {{key}} tokens with HTML-escaped values in a single pass, so a
    substituted value's literal {{...}} text is never re-matched as a placeholder."""
    escaped = {key: html.escape(value, quote=True) for key, value in kwargs.items()}
    pattern = re.compile("|".join(re.escape("{{" + key + "}}") for key in escaped))
    return pattern.sub(lambda m: escaped[m.group()[2:-2]], template)


def _post_email(payload: dict) -> httpx.Response:
    headers = {"api-key": BREVO_API_KEY, "Content-Type": "application/json"}
    return httpx.post(BREVO_API_URL, headers=headers, json=payload, timeout=15)


def _send_email(to_email: str, subject: str, html_content: str) -> bool:
    """Shared send path: builds the Brevo payload, sends, retries once on 429.
    Returns True on 2xx, False on any other non-2xx — never raises for HTTP-level failures."""
    email_hash = _hash_email(to_email)
    payload = {
        "sender": {"email": BREVO_SENDER_EMAIL, "name": BREVO_SENDER_NAME},
        "to": [{"email": to_email}],
        "subject": subject,
        "htmlContent": html_content,
    }

    logger.info("Sending email to %s", email_hash)
    response = _post_email(payload)

    if response.status_code == 429:
        logger.warning("Brevo rate limit (429) for %s — retrying once after 2s", email_hash)
        time.sleep(2)
        response = _post_email(payload)

    if 200 <= response.status_code < 300:
        logger.info("Email sent to %s", email_hash)
        return True

    logger.warning("Brevo email send failed for %s: HTTP %d", email_hash, response.status_code)
    return False


def send_doi_email(to_email: str, confirmation_url: str, game_name: str, target_price: str) -> bool:
    """
    Send the Double Opt-In confirmation email via Brevo transactional email API.
    Returns True on 2xx, False on any non-2xx (after one 429 retry) — never raises
    for HTTP-level failures.
    """
    template = _load_template("doi_email.html")
    html_content = _render(
        template,
        game_name=game_name,
        target_price=target_price,
        confirmation_url=confirmation_url,
    )
    return _send_email(to_email, DOI_EMAIL_SUBJECT, html_content)


def send_price_drop_email(
    to_email: str,
    game_name: str,
    game_url: str,
    current_price: str,
    target_price: str,
    store_name: str,
    buy_url: str,
) -> bool:
    """
    Send the price-drop notification email via Brevo transactional email API.
    Same retry/return contract as send_doi_email — True on 2xx, False on any
    other non-2xx (after one 429 retry), never raises for HTTP-level failures.

    NOTE: unsubscribe_token infrastructure (Story 6.3) doesn't exist yet — the
    template's "Wyłącz powiadomienia" footer link points at game_url as a
    placeholder, not a real one-click unsubscribe.
    """
    template = _load_template("price_drop_email.html")
    html_content = _render(
        template,
        game_name=game_name,
        game_url=game_url,
        current_price=current_price,
        target_price=target_price,
        store_name=store_name,
        buy_url=buy_url,
    )
    return _send_email(to_email, PRICE_DROP_EMAIL_SUBJECT, html_content)
