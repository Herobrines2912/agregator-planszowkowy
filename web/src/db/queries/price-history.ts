import { getDb } from '@/db/index'
import { sql } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { RANGE_DAYS, type Range } from '@/lib/price-range'

export type PriceDataPoint = {
  date: string
  storeId: number
  storeName: string
  price: string
}

function parsePriceHistoryRow(row: Record<string, unknown>): PriceDataPoint {
  if (typeof row.date !== 'string') throw new Error('price-history: invalid date')
  if (typeof row.store_id !== 'number') throw new Error('price-history: invalid store_id')
  if (typeof row.store_name !== 'string') throw new Error('price-history: invalid store_name')
  if (typeof row.price !== 'string') throw new Error('price-history: invalid price')
  return {
    date: row.date,
    storeId: row.store_id,
    storeName: row.store_name,
    price: row.price,
  }
}

async function _getPriceHistory(gameId: number, range: Range): Promise<PriceDataPoint[]> {
  const db = getDb()
  const days = RANGE_DAYS[range]

  const result = await db.execute(sql`
    SELECT
      ph.scraped_at::date::text AS date,
      s.id                      AS store_id,
      s.name                    AS store_name,
      ph.price::text            AS price
    FROM price_history ph
    INNER JOIN products p ON p.id = ph.product_id
    INNER JOIN stores   s ON s.id = p.store_id
    WHERE p.game_id = ${gameId}
      AND ph.price IS NOT NULL
      AND ph.scraped_at >= NOW() - (${days} * INTERVAL '1 day')
    ORDER BY ph.scraped_at ASC
  `)

  return (result.rows as Record<string, unknown>[]).map(parsePriceHistoryRow)
}

export const getPriceHistory = unstable_cache(_getPriceHistory, ['price-history'], {
  revalidate: 7200,
  tags: ['price-history'],
})
