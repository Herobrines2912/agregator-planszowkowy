"""Tests for ThreeTrolleUpcomingSpider (Story 8.2)."""
from decimal import Decimal
from pathlib import Path

from scrapy.http import HtmlResponse

from scraper.spiders.three_trolle_upcoming import ThreeTrolleUpcomingSpider

FIXTURES = Path(__file__).parent / "fixtures"


def make_response(fixture_name: str, url: str) -> HtmlResponse:
    html = (FIXTURES / fixture_name).read_bytes()
    return HtmlResponse(url=url, body=html)


class TestThreeTrolleUpcomingSpiderListing:
    def setup_method(self):
        self.spider = ThreeTrolleUpcomingSpider()
        self.response = make_response(
            "three_trolle_upcoming_listing.html",
            "https://3trolle.pl/21-przedsprzedaz",
        )

    def test_yields_requests_for_each_product(self):
        results = list(self.spider.parse(self.response))
        product_requests = [r for r in results if hasattr(r, "url") and "page=" not in r.url]
        assert len(product_requests) == 2

    def test_yields_pagination_request(self):
        results = list(self.spider.parse(self.response))
        urls = [r.url for r in results if hasattr(r, "url")]
        assert any("page=2" in url for url in urls)

    def test_product_urls_are_correct(self):
        results = list(self.spider.parse(self.response))
        urls = [r.url for r in results if hasattr(r, "url")]
        assert "https://3trolle.pl/38126-boss-fighters-qr.html" in urls

    def test_custom_settings_routes_to_upcoming_pipeline(self):
        assert self.spider.custom_settings["ITEM_PIPELINES"] == {
            "scraper.pipelines.upcoming.UpcomingPipeline": 400,
        }


class TestThreeTrolleUpcomingSpiderProduct:
    def setup_method(self):
        self.spider = ThreeTrolleUpcomingSpider()

    def _parse_product(self) -> dict:
        response = make_response(
            "three_trolle_upcoming_product.html",
            "https://3trolle.pl/38126-boss-fighters-qr.html",
        )
        results = list(self.spider.parse_product(response))
        assert len(results) == 1
        return results[0]

    def test_extracts_name(self):
        assert self._parse_product()["name"] == "Boss Fighters QR"

    def test_extracts_price_as_decimal(self):
        item = self._parse_product()
        assert item["pre_order_price"] == Decimal("125.09")
        assert isinstance(item["pre_order_price"], Decimal)

    def test_extracts_cover_image_from_jsonld(self):
        item = self._parse_product()
        assert item["cover_image_url"] == "https://3trolle.pl/81370-home_default/boss-fighters-qr.jpg"

    def test_store_id_is_1(self):
        assert self._parse_product()["store_id"] == 1

    def test_extracts_release_date_text_from_banner(self):
        item = self._parse_product()
        assert item["expected_release_date_text"] == "ok. wrzesień 2026"
        assert item["expected_release_date"] is None
