import hashlib
import html
import logging
import os
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"
DOI_EMAIL_SUBJECT = "Potwierdź powiadomienia o cenie"

_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"

load_dotenv()

BREVO_API_KEY = os.environ.get("BREVO_API_KEY")
if not BREVO_API_KEY:
    raise EnvironmentError("BREVO_API_KEY env var not set — cannot load brevo_client")

BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL")
if not BREVO_SENDER_EMAIL:
    raise EnvironmentError("BREVO_SENDER_EMAIL env var not set — cannot load brevo_client")

BREVO_SENDER_NAME = os.environ.get("BREVO_SENDER_NAME")
if not BREVO_SENDER_NAME:
    raise EnvironmentError("BREVO_SENDER_NAME env var not set — cannot load brevo_client")


def _hash_email(email: str) -> str:
    return hashlib.sha256(email.encode()).hexdigest()[:8]


def _load_template(name: str) -> str:
    return (_TEMPLATES_DIR / name).read_text(encoding="utf-8")


def _render(template: str, **kwargs: str) -> str:
    """Substitute {{key}} tokens with HTML-escaped values (all values render into HTML text or href attributes)."""
    rendered = template
    for key, value in kwargs.items():
        rendered = rendered.replace("{{" + key + "}}", html.escape(value, quote=True))
    return rendered


def _post_doi_email(payload: dict) -> httpx.Response:
    headers = {"api-key": BREVO_API_KEY, "Content-Type": "application/json"}
    return httpx.post(BREVO_API_URL, headers=headers, json=payload, timeout=15)


def send_doi_email(to_email: str, confirmation_url: str, game_name: str, target_price: str) -> bool:
    """
    Send the Double Opt-In confirmation email via Brevo transactional email API.
    Returns True on 2xx, False on any non-2xx (after one 429 retry) — never raises
    for HTTP-level failures.
    """
    email_hash = _hash_email(to_email)
    template = _load_template("doi_email.html")
    html_content = _render(
        template,
        game_name=game_name,
        target_price=target_price,
        confirmation_url=confirmation_url,
    )
    payload = {
        "sender": {"email": BREVO_SENDER_EMAIL, "name": BREVO_SENDER_NAME},
        "to": [{"email": to_email}],
        "subject": DOI_EMAIL_SUBJECT,
        "htmlContent": html_content,
    }

    logger.info("Sending DOI email to %s", email_hash)
    response = _post_doi_email(payload)

    if response.status_code == 429:
        logger.warning("Brevo rate limit (429) for %s — retrying once after 2s", email_hash)
        time.sleep(2)
        response = _post_doi_email(payload)

    if 200 <= response.status_code < 300:
        logger.info("DOI email sent to %s", email_hash)
        return True

    logger.warning(
        "Brevo DOI email send failed for %s: HTTP %d", email_hash, response.status_code
    )
    return False
