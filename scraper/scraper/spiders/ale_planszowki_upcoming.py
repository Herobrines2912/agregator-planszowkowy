import json
import logging

import scrapy

from utils.price_parser import parse_price
from utils.upcoming_date_parser import parse_release_date

logger = logging.getLogger(__name__)

STORE_ID = 2


class AlePlanszowkiUpcomingSpider(scrapy.Spider):
    """Scrapes AlePlanszowki's dedicated preorder category page (Story 8.2).

    Deliberately isolated from the daily `ale_planszowki` spider's pipeline chain —
    see this story's Dev Notes "Why this spider must NOT use the default pipeline
    chain." `custom_settings` below routes items to `UpcomingPipeline` only.
    """

    name = "ale_planszowki_upcoming"
    store_id = STORE_ID
    start_urls = ["https://aleplanszowki.pl/532-przedsprzedaz"]
    custom_settings = {
        "ITEM_PIPELINES": {
            "scraper.pipelines.upcoming.UpcomingPipeline": 400,
        },
    }

    def parse(self, response):
        for href in response.css("article.product-miniature .product-title a::attr(href)").getall():
            yield response.follow(href, callback=self.parse_product)

        next_page = response.css("a[rel='next']::attr(href)").get()
        if next_page:
            yield response.follow(next_page, callback=self.parse)

    def parse_product(self, response):
        name, cover_image_url, raw_price = self._extract_jsonld_product(response)
        description_text = " ".join(response.css(".product-description *::text").getall())
        _, release_date_text = parse_release_date(description_text)

        yield {
            "store_id": STORE_ID,
            "name": name or "",
            "pre_order_url": response.url,
            "cover_image_url": cover_image_url,
            # str() cast: JSON-LD price may come through as a JSON number (e.g. `0`
            # for a free promo pre-order) — parse_price() expects a string and would
            # otherwise treat a bare `0`/`0.0` the same as "missing" via its own
            # falsy check.
            "pre_order_price": parse_price(str(raw_price)) if raw_price not in (None, "") else None,
            "expected_release_date": None,
            "expected_release_date_text": release_date_text,
        }

    @staticmethod
    def _extract_jsonld_product(response) -> tuple[str | None, str | None, str | None]:
        for text in response.css('script[type="application/ld+json"]::text').getall():
            try:
                data = json.loads(text)
            except (json.JSONDecodeError, ValueError):
                continue
            items = data if isinstance(data, list) else [data]
            for item in items:
                if not isinstance(item, dict) or item.get("@type") != "Product":
                    continue
                name = item.get("name") or ""
                # schema.org permits `image`/`offers` as either a single object or
                # an array (multi-image/multi-offer products) — take the first entry.
                image = item.get("image")
                if isinstance(image, list):
                    image = image[0] if image else None
                offers = item.get("offers") or {}
                if isinstance(offers, list):
                    offers = offers[0] if offers else {}
                price = offers.get("price") if isinstance(offers, dict) else None
                return name, image, price
        return None, None, None
