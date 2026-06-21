"""Tests for ThreeTrolleSpider (Story 2.1 AC-6)."""
from decimal import Decimal
from pathlib import Path

import pytest
from scrapy.http import HtmlResponse

from scraper.spiders.three_trolle import ThreeTrolleSpider

FIXTURES = Path(__file__).parent / "fixtures"


def make_response(fixture_name: str, url: str) -> HtmlResponse:
    html = (FIXTURES / fixture_name).read_bytes()
    return HtmlResponse(url=url, body=html)


class TestThreeTrolleSpiderListing:
    def setup_method(self):
        self.spider = ThreeTrolleSpider()
        self.response = make_response(
            "three_trolle_listing.html",
            "https://3trolle.pl/12-gry-planszowe",
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
        assert "https://3trolle.pl/37961-unmatched-lee-vs-ali-.html" in urls


class TestThreeTrolleSpiderProduct:
    def setup_method(self):
        self.spider = ThreeTrolleSpider()

    def _parse_product(self, fixture: str, url: str) -> dict:
        response = make_response(fixture, url)
        results = list(self.spider.parse_product(response))
        assert len(results) == 1
        return results[0]

    def test_extracts_name(self):
        item = self._parse_product(
            "three_trolle_product.html",
            "https://3trolle.pl/37961-unmatched-lee-vs-ali-.html",
        )
        assert item["name"] == "Unmatched: Lee vs Ali"

    def test_extracts_price_as_decimal(self):
        item = self._parse_product(
            "three_trolle_product.html",
            "https://3trolle.pl/37961-unmatched-lee-vs-ali-.html",
        )
        assert item["price"] == Decimal("97.18")
        assert isinstance(item["price"], Decimal)

    def test_extracts_price_orig_as_decimal(self):
        item = self._parse_product(
            "three_trolle_product.html",
            "https://3trolle.pl/37961-unmatched-lee-vs-ali-.html",
        )
        assert item["price_orig"] == Decimal("109.99")

    def test_extracts_ean_from_jsonld(self):
        item = self._parse_product(
            "three_trolle_product.html",
            "https://3trolle.pl/37961-unmatched-lee-vs-ali-.html",
        )
        assert item["ean"] == "5904326903586"

    def test_extracts_external_id_from_jsonld(self):
        item = self._parse_product(
            "three_trolle_product.html",
            "https://3trolle.pl/37961-unmatched-lee-vs-ali-.html",
        )
        assert item["external_id"] == "3T36569"

    def test_preorder_is_not_in_stock(self):
        item = self._parse_product(
            "three_trolle_product.html",
            "https://3trolle.pl/37961-unmatched-lee-vs-ali-.html",
        )
        assert item["in_stock"] is False

    def test_instock_product_is_in_stock(self):
        item = self._parse_product(
            "three_trolle_product_instock.html",
            "https://3trolle.pl/99001-brass-lancashire.html",
        )
        assert item["in_stock"] is True

    def test_store_id_is_1(self):
        item = self._parse_product(
            "three_trolle_product.html",
            "https://3trolle.pl/37961-unmatched-lee-vs-ali-.html",
        )
        assert item["store_id"] == 1

    def test_url_is_response_url(self):
        url = "https://3trolle.pl/37961-unmatched-lee-vs-ali-.html"
        item = self._parse_product("three_trolle_product.html", url)
        assert item["url"] == url
