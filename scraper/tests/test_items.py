"""Tests for scraper/scraper/items.py (Story 1.2b)."""
from decimal import Decimal
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from scraper.items import PriceRecord, ScrapedProduct


class TestScrapedProduct:
    def test_valid_full_construction(self):
        p = ScrapedProduct(
            name="Brass: Birmingham",
            url="https://example.com/brass",
            store_id=1,
            external_id="SKU-123",
            price=Decimal("99.90"),
            price_orig=Decimal("129.90"),
            in_stock=True,
            bgg_id=224517,
            game_id=42,
        )
        assert p.name == "Brass: Birmingham"
        assert p.price == Decimal("99.90")
        assert isinstance(p.price, Decimal)

    def test_valid_minimal_construction(self):
        p = ScrapedProduct(name="Catan", url="https://example.com", store_id=2)
        assert p.price is None
        assert p.price_orig is None
        assert p.external_id is None
        assert p.bgg_id is None
        assert p.game_id is None
        assert p.in_stock is True

    def test_price_is_decimal_not_float(self):
        p = ScrapedProduct(name="X", url="u", store_id=1, price=Decimal("49.99"))
        assert isinstance(p.price, Decimal), "price must be Decimal, not float"

    def test_price_orig_is_decimal_not_float(self):
        p = ScrapedProduct(name="X", url="u", store_id=1, price_orig=Decimal("79.99"))
        assert isinstance(p.price_orig, Decimal)

    def test_in_stock_defaults_to_true(self):
        p = ScrapedProduct(name="X", url="u", store_id=1)
        assert p.in_stock is True

    def test_in_stock_can_be_false(self):
        p = ScrapedProduct(name="X", url="u", store_id=1, in_stock=False)
        assert p.in_stock is False

    def test_name_is_required(self):
        with pytest.raises(ValidationError):
            ScrapedProduct(url="u", store_id=1)

    def test_url_is_required(self):
        with pytest.raises(ValidationError):
            ScrapedProduct(name="X", store_id=1)

    def test_store_id_is_required(self):
        with pytest.raises(ValidationError):
            ScrapedProduct(name="X", url="u")


class TestPriceRecord:
    def test_valid_construction_with_aware_datetime(self):
        rec = PriceRecord(
            product_id=1,
            price=Decimal("99.90"),
            price_orig=Decimal("129.90"),
            in_stock=True,
            scraped_at=datetime.now(timezone.utc),
        )
        assert rec.product_id == 1
        assert isinstance(rec.price, Decimal)

    def test_naive_datetime_raises_validation_error(self):
        with pytest.raises(ValidationError):
            PriceRecord(
                product_id=1,
                in_stock=True,
                scraped_at=datetime.now(),
            )

    def test_optional_price_fields_default_none(self):
        rec = PriceRecord(
            product_id=5,
            in_stock=False,
            scraped_at=datetime.now(timezone.utc),
        )
        assert rec.price is None
        assert rec.price_orig is None

    def test_product_id_is_required(self):
        with pytest.raises(ValidationError):
            PriceRecord(in_stock=True, scraped_at=datetime.now(timezone.utc))

    def test_in_stock_is_required(self):
        with pytest.raises(ValidationError):
            PriceRecord(product_id=1, scraped_at=datetime.now(timezone.utc))

    def test_scraped_at_is_required(self):
        with pytest.raises(ValidationError):
            PriceRecord(product_id=1, in_stock=True)

    def test_price_record_decimal_types(self):
        rec = PriceRecord(
            product_id=1,
            price=Decimal("49.99"),
            price_orig=Decimal("69.99"),
            in_stock=True,
            scraped_at=datetime.now(timezone.utc),
        )
        assert isinstance(rec.price, Decimal)
        assert isinstance(rec.price_orig, Decimal)
