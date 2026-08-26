"""Tests for AlePlanszowkiUpcomingSpider (Story 8.2)."""
from decimal import Decimal
from pathlib import Path

from scrapy.http import HtmlResponse

from scraper.spiders.ale_planszowki_upcoming import AlePlanszowkiUpcomingSpider

FIXTURES = Path(__file__).parent / "fixtures"


def make_response(fixture_name: str, url: str) -> HtmlResponse:
    html = (FIXTURES / fixture_name).read_bytes()
    return HtmlResponse(url=url, body=html)


class TestAlePlanszowkiUpcomingSpiderListing:
    def setup_method(self):
        self.spider = AlePlanszowkiUpcomingSpider()
        self.response = make_response(
            "ale_planszowki_upcoming_listing.html",
            "https://aleplanszowki.pl/532-przedsprzedaz",
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
        assert "https://aleplanszowki.pl/przedsprzedaz/31855-dixit-signature-zloczyncy-przedsprzedaz.html" in urls

    def test_custom_settings_routes_to_upcoming_pipeline(self):
        assert self.spider.custom_settings["ITEM_PIPELINES"] == {
            "scraper.pipelines.upcoming.UpcomingPipeline": 400,
        }


class TestAlePlanszowkiUpcomingSpiderProduct:
    def setup_method(self):
        self.spider = AlePlanszowkiUpcomingSpider()

    def _parse_product(self) -> dict:
        response = make_response(
            "ale_planszowki_upcoming_product.html",
            "https://aleplanszowki.pl/przedsprzedaz/31855-dixit-signature-zloczyncy-przedsprzedaz.html",
        )
        results = list(self.spider.parse_product(response))
        assert len(results) == 1
        return results[0]

    def test_extracts_name(self):
        assert self._parse_product()["name"] == "Dixit Signature: Złoczyńcy"

    def test_extracts_price_as_decimal(self):
        item = self._parse_product()
        assert item["pre_order_price"] == Decimal("44.95")
        assert isinstance(item["pre_order_price"], Decimal)

    def test_extracts_cover_image_from_jsonld(self):
        item = self._parse_product()
        assert item["cover_image_url"] == "https://aleplanszowki.pl/89587-home_default/dixit-signature-zloczyncy.jpg"

    def test_pre_order_url_is_response_url(self):
        url = "https://aleplanszowki.pl/przedsprzedaz/31855-dixit-signature-zloczyncy-przedsprzedaz.html"
        response = make_response("ale_planszowki_upcoming_product.html", url)
        item = list(self.spider.parse_product(response))[0]
        assert item["pre_order_url"] == url

    def test_store_id_is_2(self):
        assert self._parse_product()["store_id"] == 2

    def test_extracts_release_date_text_from_description(self):
        item = self._parse_product()
        assert item["expected_release_date_text"] == "ok. 9 października 2026r."
        assert item["expected_release_date"] is None
