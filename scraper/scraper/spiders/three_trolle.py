import json
import logging

import scrapy

from utils.price_parser import parse_price

logger = logging.getLogger(__name__)

STORE_ID = 1
_INSTOCK = "https://schema.org/InStock"


class ThreeTrolleSpider(scrapy.Spider):
    name = "three_trolle"
    store_id = STORE_ID
    start_urls = ["https://3trolle.pl/12-gry-planszowe"]

    def parse(self, response):
        for href in response.css("article.product-miniature .product-title a::attr(href)").getall():
            yield response.follow(href, callback=self.parse_product)

        next_page = response.css("a[rel='next']::attr(href)").get()
        if next_page:
            yield response.follow(next_page, callback=self.parse)

    def parse_product(self, response):
        name = response.css("h1.page-title::text").get("").strip()
        raw_price = response.css("span.current-price::text").get("").strip()
        raw_price_orig = response.css("span.regular-price.text-muted::text").get()

        ean, sku, availability_url = self._extract_jsonld(response)
        in_stock = availability_url == _INSTOCK if availability_url else True

        yield {
            "name": name,
            "url": response.url,
            "store_id": STORE_ID,
            "external_id": sku,
            "price": parse_price(raw_price) if raw_price else None,
            "price_orig": parse_price(raw_price_orig),
            "in_stock": in_stock,
            "ean": ean,
        }

    @staticmethod
    def _extract_jsonld(response) -> tuple[str | None, str | None, str | None]:
        for text in response.css('script[type="application/ld+json"]::text').getall():
            try:
                data = json.loads(text)
            except (json.JSONDecodeError, ValueError):
                continue
            items = data if isinstance(data, list) else [data]
            for item in items:
                if item.get("@type") == "Product":
                    ean = item.get("gtin13") or item.get("gtin")
                    sku = item.get("sku")
                    offers = item.get("offers") or {}
                    availability = offers.get("availability")
                    return ean, sku, availability
        return None, None, None
