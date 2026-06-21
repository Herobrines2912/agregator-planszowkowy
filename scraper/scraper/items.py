from decimal import Decimal

import scrapy
from pydantic import AwareDatetime, BaseModel


class ScraperItem(scrapy.Item):
    # Scrapy boilerplate — kept so Scrapy's ItemAdapter and pipeline machinery
    # can reference it. The Pydantic models below are the active data contract.
    pass


class ScrapedProduct(BaseModel):
    """Maps to the `products` table — produced by spiders, validated by pipeline.

    DB-generated fields (id, created_at, updated_at) are omitted; the database
    supplies them on INSERT.
    """
    name: str
    url: str
    store_id: int
    external_id: str | None = None
    price: Decimal | None = None
    price_orig: Decimal | None = None
    in_stock: bool = True
    bgg_id: int | None = None
    game_id: int | None = None  # assigned by the deduplication pipeline


class PriceRecord(BaseModel):
    """Maps to `price_history` table — created by database pipeline per scrape cycle.

    `in_stock` has no default here (required) to match the NOT NULL, no-default
    column in schema.ts — callers must pass it explicitly.
    """
    product_id: int
    price: Decimal | None = None
    price_orig: Decimal | None = None
    in_stock: bool
    scraped_at: AwareDatetime  # use datetime.now(timezone.utc) — CLAUDE.md rule
