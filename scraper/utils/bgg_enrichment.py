import json
import logging
import os
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional

import httpx
import psycopg2
import psycopg2.pool
import psycopg2.extras
from dotenv import load_dotenv

from utils.bgg_client import BggClient, BggRateLimitError

logger = logging.getLogger(__name__)

# Register jsonb adapter so Python dicts → psycopg2 → PostgreSQL jsonb
psycopg2.extras.register_default_jsonb(globally=True)


def _safe_int(val: Optional[str]) -> Optional[int]:
    """Convert string to int; return None for None or non-numeric strings."""
    if val is None or val == "Not Ranked":
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _safe_decimal(val: Optional[str]) -> Optional[Decimal]:
    """Convert string to Decimal; return None for None or invalid strings."""
    if val is None:
        return None
    try:
        return Decimal(val)
    except (InvalidOperation, TypeError):
        return None


def _build_update_params(data: dict) -> tuple[dict, datetime]:
    """Map BggClient result dict to games table column values."""
    now = datetime.now(timezone.utc)
    params = {
        "name": data.get("name", "Nieznana gra"),
        "cover_image_url": data.get("cover_image_url"),
        "min_players": _safe_int(data.get("min_players")),
        "max_players": _safe_int(data.get("max_players")),
        "min_playtime": _safe_int(data.get("min_playtime")),
        "max_playtime": _safe_int(data.get("max_playtime")),
        "min_age": _safe_int(data.get("min_age")),
        "year_published": _safe_int(data.get("year_published")),
        "bgg_rank": _safe_int(data.get("bgg_rank")),
        "bgg_avg_rating": _safe_decimal(data.get("bgg_avg_rating")),
        "complexity": _safe_decimal(data.get("complexity")),
        "mechanics": data.get("mechanics") or [],
        "designers": data.get("designers") or [],
        "publishers": data.get("publishers") or [],
        "is_expansion": bool(data.get("is_expansion", False)),
        "bgg_category_rank": psycopg2.extras.Json(data["bgg_category_rank"]) if data.get("bgg_category_rank") is not None else None,
        "rules_pdf_url": None,  # BGG XML API v2 does not expose this
        "bgg_sync_status": "synced",
        "updated_at": now,
    }
    return params, now


def _resolve_parent_game_id(cur, base_game_bgg_id: Optional[int], game_id: int) -> Optional[int]:
    """Look up the local games.id for a base game by its BGG id; None if unresolvable
    or if it would resolve to the game's own row (self-reference guard)."""
    if base_game_bgg_id is None:
        return None
    cur.execute("SELECT id FROM games WHERE bgg_id = %s", (base_game_bgg_id,))
    row = cur.fetchone()
    if row is None:
        return None
    if row[0] == game_id:
        logger.warning(
            "BGG base_game_bgg_id resolves to the game's own row (game_id=%d) — ignoring", game_id
        )
        return None
    return row[0]


def _update_status(pool: psycopg2.pool.ThreadedConnectionPool, game_id: int, status: str) -> None:
    conn = None
    try:
        conn = pool.getconn()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE games SET bgg_sync_status = %s, updated_at = %s WHERE id = %s",
                (status, datetime.now(timezone.utc), game_id),
            )
        conn.commit()
    except Exception:
        if conn is not None:
            conn.rollback()
        raise
    finally:
        if conn is not None:
            pool.putconn(conn)


def _write_game(pool: psycopg2.pool.ThreadedConnectionPool, game_id: int, params: dict) -> None:
    conn = None
    try:
        conn = pool.getconn()
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE games SET
                    name = %(name)s,
                    cover_image_url = %(cover_image_url)s,
                    min_players = %(min_players)s,
                    max_players = %(max_players)s,
                    min_playtime = %(min_playtime)s,
                    max_playtime = %(max_playtime)s,
                    min_age = %(min_age)s,
                    year_published = %(year_published)s,
                    bgg_rank = %(bgg_rank)s,
                    bgg_avg_rating = %(bgg_avg_rating)s,
                    complexity = %(complexity)s,
                    mechanics = %(mechanics)s,
                    designers = %(designers)s,
                    publishers = %(publishers)s,
                    is_expansion = %(is_expansion)s,
                    parent_game_id = %(parent_game_id)s,
                    bgg_category_rank = %(bgg_category_rank)s,
                    rules_pdf_url = %(rules_pdf_url)s,
                    bgg_sync_status = %(bgg_sync_status)s,
                    updated_at = %(updated_at)s
                WHERE id = %(game_id)s""",
                {**params, "game_id": game_id},
            )
        conn.commit()
    except Exception:
        if conn is not None:
            conn.rollback()
        raise
    finally:
        if conn is not None:
            pool.putconn(conn)


def run_enrichment() -> None:
    """Fetch BGG metadata for all pending/stale games and write results to the DB."""
    load_dotenv()

    token = os.environ.get("BGG_API_TOKEN")
    if not token:
        raise RuntimeError("BGG_API_TOKEN env var not set — cannot run enrichment")

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL env var not set")

    client = BggClient(token=token)
    pool = None
    synced = not_found = rate_limited = errors = 0

    try:
        pool = psycopg2.pool.ThreadedConnectionPool(minconn=1, maxconn=3, dsn=database_url)
        conn = pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, bgg_id, name FROM games "
                    "WHERE bgg_sync_status = 'pending' AND bgg_id IS NOT NULL"
                )
                pending = cur.fetchall()

                cur.execute(
                    "SELECT id, bgg_id, name FROM games "
                    "WHERE bgg_sync_status = 'synced' "
                    "AND updated_at < NOW() - INTERVAL '30 days'"
                )
                stale = cur.fetchall()
        finally:
            pool.putconn(conn)

        games = pending + stale
        logger.info(
            "BGG enrichment: %d pending, %d stale to refresh (%d total)",
            len(pending),
            len(stale),
            len(games),
        )

        for game_id, bgg_id, current_name in games:
            try:
                data = client.get_thing_with_retry(bgg_id)
            except BggRateLimitError:
                logger.error("BGG ID %d: rate_limited after retries", bgg_id)
                _update_status(pool, game_id, "rate_limited")
                rate_limited += 1
                continue
            except httpx.HTTPError as exc:
                logger.error("BGG ID %d: HTTP error: %s", bgg_id, type(exc).__name__)
                errors += 1
                continue
            except Exception as exc:
                logger.error("BGG ID %d: fetch error: %s", bgg_id, exc)
                errors += 1
                continue

            if data is None:
                logger.warning("BGG ID %d not found (404), marking not_found", bgg_id)
                _update_status(pool, game_id, "not_found")
                not_found += 1
                continue

            try:
                parent_game_id = None
                base_game_bgg_id = data.get("base_game_bgg_id") if data.get("is_expansion") else None
                if base_game_bgg_id is not None:
                    conn = pool.getconn()
                    try:
                        with conn.cursor() as cur:
                            parent_game_id = _resolve_parent_game_id(cur, base_game_bgg_id, game_id)
                    finally:
                        pool.putconn(conn)

                params, _ = _build_update_params(data)
                params["parent_game_id"] = parent_game_id
                _write_game(pool, game_id, params)
                logger.info("BGG ID %d synced: %r", bgg_id, data.get("name"))
                synced += 1
            except Exception as exc:
                logger.error(
                    "DB write failed for game_id=%d bgg_id=%d: %s",
                    game_id,
                    bgg_id,
                    exc,
                    exc_info=True,
                )
                errors += 1

    finally:
        if pool is not None:
            pool.closeall()

    logger.info(
        "BGG enrichment complete: %d synced, %d not_found, %d rate_limited, %d errors",
        synced,
        not_found,
        rate_limited,
        errors,
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    try:
        run_enrichment()
    except RuntimeError as exc:
        logger.error("%s", exc)
        raise SystemExit(1) from exc
