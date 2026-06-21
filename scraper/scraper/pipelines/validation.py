import logging

from itemadapter import ItemAdapter
from scrapy.exceptions import DropItem

from scraper.items import ScrapedProduct

logger = logging.getLogger(__name__)


class ValidationPipeline:
    def process_item(self, item, spider):
        adapter = ItemAdapter(item)
        data = dict(adapter)

        required = ["name", "url", "store_id"]
        for field in required:
            if not data.get(field):
                raise DropItem(f"Missing required field '{field}' in item from {spider.name}")

        # AC-4: price=None forces in_stock=False
        if data.get("price") is None:
            data["in_stock"] = False

        # Validate core fields via Pydantic — strips unknown fields (e.g. ean) from model
        # but return FULL dict to preserve 'ean' for DeduplicationPipeline (Story 2.2)
        pydantic_fields = {k: v for k, v in data.items() if k in ScrapedProduct.model_fields}
        try:
            ScrapedProduct(**pydantic_fields)
        except Exception as exc:
            logger.error("Pydantic validation failed for item %s: %s", data.get("url"), exc)
            raise DropItem(f"Pydantic validation failed: {exc}")

        return data
