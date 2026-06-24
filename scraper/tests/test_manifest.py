"""Tests for scraper/scraper/spiders/__manifest__.py"""
from scraper.spiders.__manifest__ import SPIDERS


def test_manifest_is_nonempty_list_of_strings():
    assert isinstance(SPIDERS, list), "SPIDERS must be a list"
    assert len(SPIDERS) > 0, "SPIDERS must not be empty"
    assert all(isinstance(s, str) and s for s in SPIDERS), "Each spider name must be a non-empty string"


def test_spider_names_are_valid_identifiers():
    import re
    pattern = re.compile(r"^[a-z][a-z0-9_]*$")
    invalid = [s for s in SPIDERS if not pattern.match(s)]
    assert not invalid, f"Spider names with invalid characters: {invalid}"
