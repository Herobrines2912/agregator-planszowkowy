import { getDb } from '@/db/index'
import { sql } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'

export type HotDeal = {
  slug: string
  game_name: string
  cover_image_url: string | null
  price: string
  price_orig: string
  store_name: string
  store_url: string
}

export type HotDealsFilters = {
  type?: 'base' | 'expansion'
  players?: number
}

function parseHotDealRow(row: unknown): HotDeal {
  if (!row || typeof row !== 'object') throw new Error('Invalid hot deal row')
  const r = row as Record<string, unknown>
  if (typeof r.slug !== 'string') throw new Error('Invalid hot deal row: slug')
  if (typeof r.game_name !== 'string') throw new Error('Invalid hot deal row: game_name')
  if (r.cover_image_url !== null && typeof r.cover_image_url !== 'string')
    throw new Error('Invalid hot deal row: cover_image_url')
  if (typeof r.price !== 'string') throw new Error('Invalid hot deal row: price')
  if (typeof r.price_orig !== 'string') throw new Error('Invalid hot deal row: price_orig')
  if (typeof r.store_name !== 'string') throw new Error('Invalid hot deal row: store_name')
  if (typeof r.store_url !== 'string') throw new Error('Invalid hot deal row: store_url')
  return {
    slug: r.slug,
    game_name: r.game_name,
    cover_image_url: r.cover_image_url as string | null,
    price: r.price,
    price_orig: r.price_orig,
    store_name: r.store_name,
    store_url: r.store_url,
  }
}

async function _getHotDeals(limit = 40, filters?: HotDealsFilters): Promise<HotDeal[]> {
  if (
    filters?.players !== undefined &&
    (!Number.isFinite(filters.players) || filters.players < 1 || filters.players > 20)
  ) {
    return []
  }

  const db = getDb()

  const typeClause =
    filters?.type === 'base'
      ? sql`AND g.is_expansion = FALSE`
      : filters?.type === 'expansion'
        ? sql`AND g.is_expansion = TRUE`
        : sql``

  const playersClause = filters?.players
    ? sql`AND g.min_players IS NOT NULL AND g.max_players IS NOT NULL AND g.min_players <= ${filters.players} AND g.max_players >= ${filters.players}`
    : sql``

  const result = await db.execute(sql`
    WITH candidates AS (
      SELECT
        g.id,
        g.slug,
        g.name             AS game_name,
        g.cover_image_url,
        p.price::text      AS price,
        p.price_orig::text AS price_orig,
        s.name             AS store_name,
        p.url              AS store_url,
        (p.price_orig::numeric - p.price::numeric) / p.price_orig::numeric AS discount_ratio
      FROM games g
      INNER JOIN products p ON p.game_id = g.id
      INNER JOIN stores   s ON s.id = p.store_id
      WHERE p.price IS NOT NULL
        AND p.price_orig IS NOT NULL
        AND p.price_orig::numeric > 0
        AND p.in_stock = TRUE
        ${typeClause}
        ${playersClause}
    ),
    best_deals AS (
      SELECT DISTINCT ON (id)
        slug, game_name, cover_image_url, price, price_orig, store_name, store_url, discount_ratio
      FROM candidates
      WHERE discount_ratio >= 0.15
      ORDER BY id, price ASC
    )
    SELECT slug, game_name, cover_image_url, price, price_orig, store_name, store_url
    FROM best_deals
    ORDER BY discount_ratio DESC
    LIMIT ${limit}
  `)

  return result.rows.map(parseHotDealRow)
}

export const getHotDeals = unstable_cache(_getHotDeals, ['hot-deals'], {
  revalidate: 7200,
  tags: ['hot-deals'],
})
