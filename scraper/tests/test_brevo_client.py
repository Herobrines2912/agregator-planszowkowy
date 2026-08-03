"""Tests for scraper/utils/brevo_client.py (Story 6.4).

All HTTP calls are mocked — no real Brevo API key required.
Required env vars are set at module import time (see below) so the
module-level fail-fast check (AC-4/AC-6) succeeds during collection;
the missing-var case is tested separately via importlib.reload().
"""
import hashlib
import importlib
import os
from unittest.mock import MagicMock, patch

import httpx
import pytest

os.environ.setdefault("BREVO_API_KEY", "test-api-key")
os.environ.setdefault("BREVO_SENDER_EMAIL", "test@example.com")
os.environ.setdefault("BREVO_SENDER_NAME", "Test Sender")

from utils import brevo_client  # noqa: E402


def _make_response(status_code: int) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    return resp


class TestSendDoiEmailSuccess:
    @patch("utils.brevo_client.httpx.post")
    def test_returns_true_on_2xx(self, mock_post):
        mock_post.return_value = _make_response(201)

        result = brevo_client.send_doi_email(
            "user@example.com", "https://example.com/confirm?token=abc",
            "Brass: Birmingham", "89.99",
        )

        assert result is True

    @patch("utils.brevo_client.httpx.post")
    def test_request_payload_shape(self, mock_post):
        mock_post.return_value = _make_response(201)

        brevo_client.send_doi_email(
            "user@example.com", "https://example.com/confirm?token=abc",
            "Brass: Birmingham", "89.99",
        )

        call_kwargs = mock_post.call_args
        payload = call_kwargs.kwargs["json"]
        assert payload["sender"] == {"email": "test@example.com", "name": "Test Sender"}
        assert payload["to"] == [{"email": "user@example.com"}]
        assert "Brass: Birmingham" in payload["htmlContent"]
        assert "89.99" in payload["htmlContent"]

    @patch("utils.brevo_client.httpx.post")
    def test_uses_api_key_header_not_bearer(self, mock_post):
        mock_post.return_value = _make_response(201)

        brevo_client.send_doi_email(
            "user@example.com", "https://example.com/confirm?token=abc",
            "Brass: Birmingham", "89.99",
        )

        call_kwargs = mock_post.call_args
        headers = call_kwargs.kwargs["headers"]
        assert headers["api-key"] == "test-api-key"
        assert "Authorization" not in headers


class TestSendDoiEmailFailure:
    @patch("utils.brevo_client.httpx.post")
    def test_returns_false_on_non_2xx_non_429(self, mock_post, caplog):
        mock_post.return_value = _make_response(400)

        with caplog.at_level("WARNING"):
            result = brevo_client.send_doi_email(
                "user@example.com", "https://example.com/confirm?token=abc",
                "Brass: Birmingham", "89.99",
            )

        assert result is False
        assert "failed" in caplog.text.lower()

    @patch("utils.brevo_client.httpx.post")
    def test_returns_false_on_500(self, mock_post, caplog):
        mock_post.return_value = _make_response(500)

        with caplog.at_level("WARNING"):
            result = brevo_client.send_doi_email(
                "user@example.com", "https://example.com/confirm?token=abc",
                "Brass: Birmingham", "89.99",
            )

        assert result is False
        assert "failed" in caplog.text.lower()

    @patch("utils.brevo_client.httpx.post")
    def test_network_error_propagates_uncaught(self, mock_post):
        mock_post.side_effect = httpx.ConnectError("boom")

        with pytest.raises(httpx.ConnectError):
            brevo_client.send_doi_email(
                "user@example.com", "https://example.com/confirm?token=abc",
                "Brass: Birmingham", "89.99",
            )


class TestSendDoiEmailRetry:
    @patch("utils.brevo_client.httpx.post")
    @patch("utils.brevo_client.time.sleep")
    def test_429_then_success_returns_true(self, mock_sleep, mock_post):
        mock_post.side_effect = [_make_response(429), _make_response(201)]

        result = brevo_client.send_doi_email(
            "user@example.com", "https://example.com/confirm?token=abc",
            "Brass: Birmingham", "89.99",
        )

        assert result is True
        assert mock_post.call_count == 2
        mock_sleep.assert_called_once_with(2)

    @patch("utils.brevo_client.httpx.post")
    @patch("utils.brevo_client.time.sleep")
    def test_429_then_429_returns_false(self, mock_sleep, mock_post, caplog):
        mock_post.side_effect = [_make_response(429), _make_response(429)]

        with caplog.at_level("WARNING"):
            result = brevo_client.send_doi_email(
                "user@example.com", "https://example.com/confirm?token=abc",
                "Brass: Birmingham", "89.99",
            )

        assert result is False
        assert mock_post.call_count == 2
        mock_sleep.assert_called_once_with(2)
        assert "failed" in caplog.text.lower()


class TestNoRawEmailInLogs:
    @patch("utils.brevo_client.httpx.post")
    def test_success_log_has_hash_prefix_not_raw_email(self, mock_post, caplog):
        mock_post.return_value = _make_response(201)
        email = "user@example.com"
        expected_prefix = hashlib.sha256(email.encode()).hexdigest()[:8]

        with caplog.at_level("INFO"):
            brevo_client.send_doi_email(
                email, "https://example.com/confirm?token=abc",
                "Brass: Birmingham", "89.99",
            )

        log_text = caplog.text
        assert email not in log_text
        assert expected_prefix in log_text

    @patch("utils.brevo_client.httpx.post")
    def test_failure_log_has_hash_prefix_not_raw_email(self, mock_post, caplog):
        mock_post.return_value = _make_response(400)
        email = "user@example.com"
        expected_prefix = hashlib.sha256(email.encode()).hexdigest()[:8]

        with caplog.at_level("WARNING"):
            brevo_client.send_doi_email(
                email, "https://example.com/confirm?token=abc",
                "Brass: Birmingham", "89.99",
            )

        log_text = caplog.text
        assert email not in log_text
        assert expected_prefix in log_text

    def test_no_print_calls_used(self):
        """Verify no print() in module — logging only (CLAUDE.md rule)."""
        import builtins

        original_print = builtins.print
        print_called = []

        def spy_print(*args, **kwargs):
            print_called.append(args)
            return original_print(*args, **kwargs)

        builtins.print = spy_print
        try:
            with patch("utils.brevo_client.httpx.post") as mock_post:
                mock_post.return_value = _make_response(201)
                brevo_client.send_doi_email(
                    "user@example.com", "https://example.com/confirm?token=abc",
                    "Brass: Birmingham", "89.99",
                )
        finally:
            builtins.print = original_print

        assert print_called == [], "print() was called — use logger instead (CLAUDE.md)"


class TestRender:
    def test_render_interpolates_all_placeholders(self):
        template = "<p>{{game_name}} — {{target_price}} zł — {{confirmation_url}}</p>"

        result = brevo_client._render(
            template,
            game_name="Gloomhaven",
            target_price="149.99",
            confirmation_url="https://example.com/c?t=xyz",
        )

        assert "Gloomhaven" in result
        assert "149.99" in result
        assert "https://example.com/c?t=xyz" in result
        assert "{{" not in result

    def test_load_template_reads_doi_email_html(self):
        content = brevo_client._load_template("doi_email.html")

        assert "{{game_name}}" in content
        assert "{{target_price}}" in content
        assert "{{confirmation_url}}" in content


class TestSendPriceDropEmail:
    """Minimal unblock for Story 6.5 — see brevo_client.send_price_drop_email docstring."""

    @patch("utils.brevo_client.httpx.post")
    def test_returns_true_on_2xx(self, mock_post):
        mock_post.return_value = _make_response(201)

        result = brevo_client.send_price_drop_email(
            "user@example.com", "Brass: Birmingham", "89.99", "99.00",
            "https://example.com/gra/brass-birmingham",
        )

        assert result is True

    @patch("utils.brevo_client.httpx.post")
    def test_request_payload_shape(self, mock_post):
        mock_post.return_value = _make_response(201)

        brevo_client.send_price_drop_email(
            "user@example.com", "Brass: Birmingham", "89.99", "99.00",
            "https://example.com/gra/brass-birmingham",
        )

        payload = mock_post.call_args.kwargs["json"]
        assert payload["subject"] == "Cena spadła!"
        assert "Brass: Birmingham" in payload["htmlContent"]
        assert "89.99" in payload["htmlContent"]
        assert "99.00" in payload["htmlContent"]
        assert "https://example.com/gra/brass-birmingham" in payload["htmlContent"]

    @patch("utils.brevo_client.httpx.post")
    def test_returns_false_on_non_2xx(self, mock_post, caplog):
        mock_post.return_value = _make_response(400)

        with caplog.at_level("WARNING"):
            result = brevo_client.send_price_drop_email(
                "user@example.com", "Brass: Birmingham", "89.99", "99.00",
                "https://example.com/gra/brass-birmingham",
            )

        assert result is False

    @patch("utils.brevo_client.httpx.post")
    @patch("utils.brevo_client.time.sleep")
    def test_429_then_success_returns_true(self, mock_sleep, mock_post):
        mock_post.side_effect = [_make_response(429), _make_response(201)]

        result = brevo_client.send_price_drop_email(
            "user@example.com", "Brass: Birmingham", "89.99", "99.00",
            "https://example.com/gra/brass-birmingham",
        )

        assert result is True
        assert mock_post.call_count == 2

    def test_load_template_reads_price_drop_email_html(self):
        content = brevo_client._load_template("price_drop_email.html")

        assert "{{game_name}}" in content
        assert "{{current_price}}" in content
        assert "{{target_price}}" in content
        assert "{{game_url}}" in content


class TestMissingEnvVarsFailFast:
    def _reload_with_env(self, monkeypatch, **env):
        for key in ("BREVO_API_KEY", "BREVO_SENDER_EMAIL", "BREVO_SENDER_NAME"):
            monkeypatch.delenv(key, raising=False)
        for key, value in env.items():
            monkeypatch.setenv(key, value)

    def test_missing_api_key_raises_environment_error_at_import(self, monkeypatch):
        self._reload_with_env(
            monkeypatch,
            BREVO_SENDER_EMAIL="test@example.com",
            BREVO_SENDER_NAME="Test Sender",
        )

        try:
            with patch("utils.brevo_client.load_dotenv"), pytest.raises(EnvironmentError):
                importlib.reload(brevo_client)
        finally:
            monkeypatch.setenv("BREVO_API_KEY", "test-api-key")
            monkeypatch.setenv("BREVO_SENDER_EMAIL", "test@example.com")
            monkeypatch.setenv("BREVO_SENDER_NAME", "Test Sender")
            importlib.reload(brevo_client)

    def test_missing_sender_email_raises_environment_error_at_import(self, monkeypatch):
        self._reload_with_env(
            monkeypatch,
            BREVO_API_KEY="test-api-key",
            BREVO_SENDER_NAME="Test Sender",
        )

        try:
            with patch("utils.brevo_client.load_dotenv"), pytest.raises(EnvironmentError):
                importlib.reload(brevo_client)
        finally:
            monkeypatch.setenv("BREVO_API_KEY", "test-api-key")
            monkeypatch.setenv("BREVO_SENDER_EMAIL", "test@example.com")
            monkeypatch.setenv("BREVO_SENDER_NAME", "Test Sender")
            importlib.reload(brevo_client)

    def test_missing_sender_name_raises_environment_error_at_import(self, monkeypatch):
        self._reload_with_env(
            monkeypatch,
            BREVO_API_KEY="test-api-key",
            BREVO_SENDER_EMAIL="test@example.com",
        )

        try:
            with patch("utils.brevo_client.load_dotenv"), pytest.raises(EnvironmentError):
                importlib.reload(brevo_client)
        finally:
            monkeypatch.setenv("BREVO_API_KEY", "test-api-key")
            monkeypatch.setenv("BREVO_SENDER_EMAIL", "test@example.com")
            monkeypatch.setenv("BREVO_SENDER_NAME", "Test Sender")
            importlib.reload(brevo_client)
