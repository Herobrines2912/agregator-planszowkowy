"""Live selector smoke tests — only run in selector-health CI (pytest -m live).

These tests make real HTTP requests to store websites to verify that CSS
selectors in the spiders still match the live HTML structure.

Run manually:
    cd scraper && .venv/Scripts/python.exe -m pytest -m live tests/test_live_selectors.py -v
"""
import logging
import time

import httpx
import pytest
from scrapy.http import HtmlResponse

from scraper.spiders.ale_planszowki import AlePlanszowkiSpider
from scraper.spiders.three_trolle import ThreeTrolleSpider

logger = logging.getLogger(__name__)

USER_AGENT = "agregator-planszowkowy-health-check/1.0 (non-commercial; github.com/agregator)"
_LISTING_SELECTOR = "article.product-miniature .product-title a::attr(href)"


def _fetch(url: str) -> HtmlResponse:
    for attempt in range(3):
        try:
            resp = httpx.get(
                url,
                headers={"User-Agent": USER_AGENT},
                follow_redirects=True,
                timeout=30,
            )
            resp.raise_for_status()
            return HtmlResponse(url=str(resp.url), body=resp.content)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code < 500 or attempt == 2:
                raise
            time.sleep(2)
        except httpx.RequestError:
            if attempt == 2:
                raise
            time.sleep(2)
    raise RuntimeError("unreachable")


@pytest.mark.live
class TestThreeTrolleLiveSelectors:
    def setup_method(self):
        self.spider = ThreeTrolleSpider()

    def test_listing_yields_product_urls(self):
        response = _fetch(self.spider.start_urls[0])
        hrefs = response.css(_LISTING_SELECTOR).getall()
        assert len(hrefs) >= 1, (
            f"No product hrefs found on 3Trolle listing page ({self.spider.start_urls[0]}). "
            "The listing CSS selector may be broken."
        )
        logger.info("3Trolle listing: found %d product URLs", len(hrefs))

    def test_product_page_has_price(self):
        listing = _fetch(self.spider.start_urls[0])
        first_href = listing.css(_LISTING_SELECTOR).get()
        assert first_href, "No product href available — listing selector already broken"

        product_response = _fetch(first_href)
        items = list(self.spider.parse_product(product_response))
        assert items, f"parse_product yielded nothing for {first_href}"
        assert items[0].get("price") is not None, (
            f"price is None on live 3Trolle product page ({first_href}). "
            "The price CSS selector may be broken."
        )
        logger.info("3Trolle product price OK: %s", items[0]["price"])


@pytest.mark.live
class TestAlePlanszowkiLiveSelectors:
    def setup_method(self):
        self.spider = AlePlanszowkiSpider()

    def test_listing_yields_product_urls(self):
        response = _fetch(self.spider.start_urls[0])
        hrefs = response.css(_LISTING_SELECTOR).getall()
        assert len(hrefs) >= 1, (
            f"No product hrefs found on AlePlanszowki listing page ({self.spider.start_urls[0]}). "
            "The listing CSS selector may be broken."
        )
        logger.info("AlePlanszowki listing: found %d product URLs", len(hrefs))

    def test_product_page_has_price(self):
        listing = _fetch(self.spider.start_urls[0])
        first_href = listing.css(_LISTING_SELECTOR).get()
        assert first_href, "No product href available — listing selector already broken"

        product_response = _fetch(first_href)
        items = list(self.spider.parse_product(product_response))
        assert items, f"parse_product yielded nothing for {first_href}"
        assert items[0].get("price") is not None, (
            f"price is None on live AlePlanszowki product page ({first_href}). "
            "The price CSS selector may be broken."
        )
        logger.info("AlePlanszowki product price OK: %s", items[0]["price"])
