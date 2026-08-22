import { getDb } from '@/db/index'
import { sql } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'

export type FlipperDeal = {
  slug: string
  game_name: string
  cover_image_url: string | null
  current_min_price: string
  historical_max_price: string
  margin_pct: string
  profit_estimate: string
  store_name: string
  store_url: string
}

export type FlipperDealsFilters = {
  type?: 'base' | 'expansion'
}

function parseFlipperDealRow(row: unknown): FlipperDeal {
  if (!row || typeof row !== 'object') throw new Error('Invalid flipper deal row')
  const r = row as Record<string, unknown>
  if (typeof r.slug !== 'string') throw new Error('Invalid flipper deal row: slug')
  if (typeof r.game_name !== 'string') throw new Error('Invalid flipper deal row: game_name')
  if (r.cover_image_url !== null && typeof r.cover_image_url !== 'string')
    throw new Error('Invalid flipper deal row: cover_image_url')
  if (typeof r.current_min_price !== 'string')
    throw new Error('Invalid flipper deal row: current_min_price')
  if (typeof r.historical_max_price !== 'string')
    throw new Error('Invalid flipper deal row: historical_max_price')
  if (typeof r.margin_pct !== 'string') throw new Error('Invalid flipper deal row: margin_pct')
  if (typeof r.profit_estimate !== 'string')
    throw new Error('Invalid flipper deal row: profit_estimate')
  if (typeof r.store_name !== 'string') throw new Error('Invalid flipper deal row: store_name')
  if (typeof r.store_url !== 'string') throw new Error('Invalid flipper deal row: store_url')
  return {
    slug: r.slug,
    game_name: r.game_name,
    cover_image_url: r.cover_image_url as string | null,
    current_min_price: r.current_min_price,
    historical_max_price: r.historical_max_price,
    margin_pct: r.margin_pct,
    profit_estimate: r.profit_estimate,
    store_name: r.store_name,
    store_url: r.store_url,
  }
}

async function _getFlipperDeals(filters?: FlipperDealsFilters): Promise<FlipperDeal[]> {
  const db = getDb()

  const typeClause =
    filters?.type === 'base'
      ? sql`AND g.is_expansion = FALSE`
      : filters?.type === 'expansion'
        ? sql`AND g.is_expansion = TRUE`
        : sql``

  const result = await db.execute(sql`
    WITH current_prices AS (
      SELECT DISTINCT ON (p.game_id)
        p.game_id,
        g.slug,
        g.name             AS game_name,
        g.cover_image_url,
        p.price            AS current_min_price_numeric,
        p.url              AS store_url,
        s.name              AS store_name
      FROM products p
      INNER JOIN games g  ON g.id = p.game_id
      INNER JOIN stores s ON s.id = p.store_id
      WHERE p.in_stock = TRUE
        AND p.price IS NOT NULL
        AND p.price > 0
        AND p.game_id IS NOT NULL
        ${typeClause}
      ORDER BY p.game_id, price ASC
    ),
    historical_max AS (
      SELECT p.game_id, MAX(ph.price) AS historical_max_price_numeric
      FROM price_history ph
      INNER JOIN products p ON p.id = ph.product_id
      WHERE ph.price IS NOT NULL
      GROUP BY p.game_id
    )
    SELECT
      cp.slug,
      cp.game_name,
      cp.cover_image_url,
      cp.current_min_price_numeric::text AS current_min_price,
      hm.historical_max_price_numeric::text AS historical_max_price,
      ROUND(
        (hm.historical_max_price_numeric - cp.current_min_price_numeric)
          / cp.current_min_price_numeric * 100,
        1
      )::text AS margin_pct,
      ROUND(hm.historical_max_price_numeric - cp.current_min_price_numeric, 2)::text AS profit_estimate,
      cp.store_name,
      cp.store_url
    FROM current_prices cp
    INNER JOIN historical_max hm ON hm.game_id = cp.game_id
    WHERE hm.historical_max_price_numeric > cp.current_min_price_numeric
    ORDER BY (hm.historical_max_price_numeric - cp.current_min_price_numeric)
      / cp.current_min_price_numeric DESC
  `)

  return result.rows.map(parseFlipperDealRow)
}

export const getFlipperDeals = unstable_cache(_getFlipperDeals, ['flipper-deals'], {
  revalidate: 7200,
  tags: ['flipper-deals'],
})
