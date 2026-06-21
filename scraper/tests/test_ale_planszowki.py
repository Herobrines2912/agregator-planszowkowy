"""Tests for AlePlanszowkiSpider (Story 2.1 AC-6)."""
from decimal import Decimal
from pathlib import Path

import pytest
from scrapy.http import HtmlResponse

from scraper.spiders.ale_planszowki import AlePlanszowkiSpider

FIXTURES = Path(__file__).parent / "fixtures"


def make_response(fixture_name: str, url: str) -> HtmlResponse:
    html = (FIXTURES / fixture_name).read_bytes()
    return HtmlResponse(url=url, body=html)


class TestAlePlanszowkiSpiderListing:
    def setup_method(self):
        self.spider = AlePlanszowkiSpider()
        self.response = make_response(
            "ale_planszowki_listing.html",
            "https://aleplanszowki.pl/368-gry-planszowe-i-towarzyskie",
        )

    def test_yields_requests_for_each_product(self):
        results = list(self.spider.parse(self.response))
        # 2 product requests + 1 pagination request = 3 total
        requests = [r for r in results if hasattr(r, "url")]
        product_requests = [r for r in requests if "page=" not in r.url]
        assert len(product_requests) == 2

    def test_yields_pagination_request(self):
        results = list(self.spider.parse(self.response))
        urls = [r.url for r in results if hasattr(r, "url")]
        assert any("page=2" in url for url in urls)

    def test_product_urls_are_correct(self):
        results = list(self.spider.parse(self.response))
        urls = [r.url for r in results if hasattr(r, "url")]
        assert "https://aleplanszowki.pl/30836-marvel-champions.html" in urls


class TestAlePlanszowkiSpiderProduct:
    def setup_method(self):
        self.spider = AlePlanszowkiSpider()

    def _parse_product(self, fixture: str, url: str) -> dict:
        response = make_response(fixture, url)
        results = list(self.spider.parse_product(response))
        assert len(results) == 1
        return results[0]

    def test_extracts_name(self):
        item = self._parse_product(
            "ale_planszowki_product.html",
            "https://aleplanszowki.pl/30836-marvel-champions.html",
        )
        assert item["name"] == "Marvel Champions: Gra Karciana"

    def test_extracts_price_as_decimal(self):
        item = self._parse_product(
            "ale_planszowki_product.html",
            "https://aleplanszowki.pl/30836-marvel-champions.html",
        )
        assert item["price"] == Decimal("199.00")
        assert isinstance(item["price"], Decimal)

    def test_extracts_price_orig_as_decimal(self):
        item = self._parse_product(
            "ale_planszowki_product.html",
            "https://aleplanszowki.pl/30836-marvel-champions.html",
        )
        assert item["price_orig"] == Decimal("249.00")

    def test_extracts_ean_from_jsonld(self):
        item = self._parse_product(
            "ale_planszowki_product.html",
            "https://aleplanszowki.pl/30836-marvel-champions.html",
        )
        assert item["ean"] == "841333135904"

    def test_extracts_external_id_from_jsonld(self):
        item = self._parse_product(
            "ale_planszowki_product.html",
            "https://aleplanszowki.pl/30836-marvel-champions.html",
        )
        assert item["external_id"] == "30836"

    def test_instock_is_true_when_schema_instock(self):
        item = self._parse_product(
            "ale_planszowki_product.html",
            "https://aleplanszowki.pl/30836-marvel-champions.html",
        )
        assert item["in_stock"] is True

    def test_store_id_is_2(self):
        item = self._parse_product(
            "ale_planszowki_product.html",
            "https://aleplanszowki.pl/30836-marvel-champions.html",
        )
        assert item["store_id"] == 2

    def test_url_is_response_url(self):
        url = "https://aleplanszowki.pl/30836-marvel-champions.html"
        item = self._parse_product("ale_planszowki_product.html", url)
        assert item["url"] == url
