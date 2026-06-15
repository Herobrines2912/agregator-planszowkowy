from decimal import Decimal
from datetime import datetime
from typing import Optional
import scrapy


class ScraperItem(scrapy.Item):
    pass


# Pydantic models are defined in scraper/utils/models.py (Story 2.1).
# This stub ensures schema.ts fields have a matching Python representation.
#
# games table sync (schema.ts → items.py, CLAUDE.md L-1 rule):
#   name: str
#   slug: str
#   bgg_id: Optional[int]
#   is_expansion: bool
#   cover_image_url: Optional[str]
#   designers: Optional[list[str]]
#   publishers: Optional[list[str]]
#   year_published: Optional[int]          # added Story 4.2
#   bgg_rank: Optional[int]
#   bgg_category_rank: Optional[dict]
#   bgg_avg_rating: Optional[Decimal]      # added Story 4.2
#   complexity: Optional[Decimal]
#   mechanics: Optional[list[str]]
#   min_players: Optional[int]
#   max_players: Optional[int]
#   min_playtime: Optional[int]
#   max_playtime: Optional[int]
#   min_age: Optional[int]
#   rules_pdf_url: Optional[str]
