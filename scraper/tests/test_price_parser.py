"""Tests for utils/price_parser.py (Story 2.1 AC-2)."""
from decimal import Decimal

import pytest

from utils.price_parser import parse_price


class TestParsePrice:
    def test_comma_decimal_with_zloty(self):
        assert parse_price("99,90 zł") == Decimal("99.90")

    def test_dot_decimal_with_zloty(self):
        assert parse_price("99.90 zł") == Decimal("99.90")

    def test_od_prefix(self):
        assert parse_price("od 99 zł") == Decimal("99")

    def test_zero_price(self):
        assert parse_price("0 zł") == Decimal("0")

    def test_empty_string_returns_none(self):
        assert parse_price("") is None

    def test_none_returns_none(self):
        assert parse_price(None) is None

    def test_whitespace_only_returns_none(self):
        assert parse_price("   ") is None

    def test_space_thousands_separator(self):
        assert parse_price("1 299,00 zł") == Decimal("1299.00")

    def test_integer_price(self):
        assert parse_price("149 zł") == Decimal("149")

    def test_price_without_currency(self):
        assert parse_price("49.99") == Decimal("49.99")

    def test_returns_decimal_not_float(self):
        result = parse_price("99,90 zł")
        assert isinstance(result, Decimal), "parse_price must return Decimal, not float"

    def test_uppercase_od_prefix(self):
        assert parse_price("OD 99 zł") == Decimal("99")
