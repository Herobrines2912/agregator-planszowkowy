import { getDb } from '@/db/index'
import { sql } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import type { GameMetaGame } from '@/types/game'
import { isCategoryRank } from '@/types/game'

export type GameProduct = {
  id: number
  store_name: string
  price: string | null
  price_orig: string | null
  in_stock: boolean
  product_url: string
}

export type BaseGameRef = {
  name: string
  slug: string
  current_min_price: string | null
}

export type GamePassportData = GameMetaGame & {
  id: number
  slug: string
  bgg_id: number | null
  products: GameProduct[]
  best_product: GameProduct | null
  // TODO Story 4.6: always null until schema gains parent_game_id for DLC warning
  base_game: BaseGameRef | null
}

function parseProductRow(row: Record<string, unknown>): GameProduct {
  if (typeof row.product_id !== 'number') throw new Error('game-passport: invalid product_id')
  if (typeof row.store_name !== 'string') throw new Error('game-passport: invalid store_name')
  if (typeof row.product_url !== 'string') throw new Error('game-passport: invalid product_url')
  return {
    id: row.product_id,
    store_name: row.store_name,
    price: typeof row.price === 'string' ? row.price : null,
    price_orig: typeof row.price_orig === 'string' ? row.price_orig : null,
    in_stock: row.in_stock === true,
    product_url: row.product_url,
  }
}

function parseGameRow(row: Record<string, unknown>): Omit<GamePassportData, 'products' | 'best_product' | 'base_game'> {
  if (typeof row.id !== 'number') throw new Error('game-passport: invalid id')
  if (typeof row.slug !== 'string') throw new Error('game-passport: invalid slug')
  if (typeof row.name !== 'string') throw new Error('game-passport: invalid name')
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    cover_image_url: typeof row.cover_image_url === 'string' ? row.cover_image_url : null,
    is_expansion: row.is_expansion === true,
    designers: Array.isArray(row.designers) ? (row.designers as string[]) : null,
    publishers: Array.isArray(row.publishers) ? (row.publishers as string[]) : null,
    year_published: typeof row.year_published === 'number' ? row.year_published : null,
    bgg_id: typeof row.bgg_id === 'number' ? row.bgg_id : null,
    bgg_rank: typeof row.bgg_rank === 'number' ? row.bgg_rank : null,
    bgg_category_rank: isCategoryRank(row.bgg_category_rank) ? row.bgg_category_rank : null,
    bgg_avg_rating: typeof row.bgg_avg_rating === 'string' ? row.bgg_avg_rating : null,
    complexity: typeof row.complexity === 'string' ? row.complexity : null,
    mechanics: Array.isArray(row.mechanics) ? (row.mechanics as string[]) : null,
    min_players: typeof row.min_players === 'number' ? row.min_players : null,
    max_players: typeof row.max_players === 'number' ? row.max_players : null,
    min_playtime: typeof row.min_playtime === 'number' ? row.min_playtime : null,
    max_playtime: typeof row.max_playtime === 'number' ? row.max_playtime : null,
    min_age: typeof row.min_age === 'number' ? row.min_age : null,
    rules_pdf_url: typeof row.rules_pdf_url === 'string' ? row.rules_pdf_url : null,
  }
}

async function _getGameBySlug(slug: string): Promise<GamePassportData | null> {
  const db = getDb()

  const result = await db.execute(sql`
    SELECT
      g.id,
      g.slug,
      g.name,
      g.cover_image_url,
      g.is_expansion,
      g.designers,
      g.publishers,
      g.year_published,
      g.bgg_id,
      g.bgg_rank,
      g.bgg_category_rank,
      g.bgg_avg_rating::text  AS bgg_avg_rating,
      g.complexity::text      AS complexity,
      g.mechanics,
      g.min_players,
      g.max_players,
      g.min_playtime,
      g.max_playtime,
      g.min_age,
      g.rules_pdf_url,
      p.id                    AS product_id,
      p.price::text           AS price,
      p.price_orig::text      AS price_orig,
      p.in_stock,
      p.url                   AS product_url,
      s.name                  AS store_name
    FROM games g
    LEFT JOIN products p ON p.game_id = g.id
    LEFT JOIN stores   s ON s.id = p.store_id
    WHERE g.slug = ${slug}
    ORDER BY
      p.in_stock DESC NULLS LAST,
      p.price    ASC  NULLS LAST
  `)

  if (result.rows.length === 0) return null

  const rows = result.rows as Record<string, unknown>[]
  const game = parseGameRow(rows[0])

  // Filter out the null product row produced by LEFT JOIN when game has no products
  const products: GameProduct[] = rows
    .filter(r => r.product_id !== null)
    .map(parseProductRow)

  // Select cheapest in-stock product independently — does not rely on SQL ORDER BY
  const best_product =
    products
      .filter(p => p.in_stock)
      .sort((a, b) => {
        if (a.price === null) return 1
        if (b.price === null) return -1
        return parseFloat(a.price) - parseFloat(b.price)
      })[0] ?? null

  return { ...game, products, best_product, base_game: null }
}

export const getGameBySlug = unstable_cache(
  _getGameBySlug,
  ['game-passport'],
  { revalidate: 7200, tags: ['game-passport'] },
)

export async function getAllGameSlugs(): Promise<{ slug: string }[]> {
  const db = getDb()
  try {
    const result = await db.execute(sql`
      SELECT DISTINCT g.slug
      FROM games g
      INNER JOIN products p ON p.game_id = g.id
    `)
    return result.rows as { slug: string }[]
  } catch (err) {
    console.error('[getAllGameSlugs] DB error, returning empty slug list', err)
    return []
  }
}
