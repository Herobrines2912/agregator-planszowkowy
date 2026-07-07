import { describe, test, expect, vi, beforeEach } from 'vitest'
import { getPriceHistory } from './price-history'
import type { PriceDataPoint } from './price-history'

const mockExecute = vi.fn()

vi.mock('@/db/index', () => ({
  getDb: () => ({
    execute: mockExecute,
  }),
}))

vi.mock('next/cache', () => ({
  unstable_cache: <T>(fn: T) => fn,
}))

vi.mock('drizzle-orm', () => ({
  sql: new Proxy(
    function sql(strings: TemplateStringsArray, ...values: unknown[]) {
      return { strings, values, _isSql: true }
    },
    {
      get(target, prop) {
        if (prop === Symbol.toPrimitive || prop === 'toString') return () => '[sql]'
        return target[prop as keyof typeof target]
      },
    }
  ),
}))

const makeRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  date: '2026-06-01',
  store_id: 1,
  store_name: 'AlePlanszowki',
  price: '129.00',
  ...overrides,
})

describe('getPriceHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns empty array when no price history in DB', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    const result = await getPriceHistory(1, '1T')
    expect(result).toEqual([])
  })

  test('returns mapped rows in PriceDataPoint shape', async () => {
    mockExecute.mockResolvedValue({ rows: [makeRow()] })
    const result: PriceDataPoint[] = await getPriceHistory(1, '3M')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      date: '2026-06-01',
      storeId: 1,
      storeName: 'AlePlanszowki',
      price: '129.00',
    })
  })

  test('preserves DB row order (query already sorts ascending)', async () => {
    const rows = [
      makeRow({ date: '2026-05-01', price: '150.00' }),
      makeRow({ date: '2026-06-01', price: '129.00' }),
    ]
    mockExecute.mockResolvedValue({ rows })
    const result = await getPriceHistory(1, '3M')
    expect(result[0].date).toBe('2026-05-01')
    expect(result[1].date).toBe('2026-06-01')
  })

  test('price is returned as a string, never a number', async () => {
    mockExecute.mockResolvedValue({ rows: [makeRow({ price: '89.99' })] })
    const result = await getPriceHistory(1, '1T')
    expect(typeof result[0].price).toBe('string')
  })

  test('multi-store rows keep distinct storeId/storeName', async () => {
    const rows = [
      makeRow({ store_id: 1, store_name: 'AlePlanszowki', price: '129.00' }),
      makeRow({ store_id: 2, store_name: '3Trolle', price: '119.00' }),
    ]
    mockExecute.mockResolvedValue({ rows })
    const result = await getPriceHistory(1, '3M')
    expect(result.map(r => r.storeName)).toEqual(['AlePlanszowki', '3Trolle'])
  })

  test('calls db.execute exactly once (single round-trip, no N+1)', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getPriceHistory(1, '6M')
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  test('passes gameId as a bound parameter in the query', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getPriceHistory(42, '1T')
    const sqlArg = mockExecute.mock.calls[0][0] as { values: unknown[] }
    expect(sqlArg.values).toContain(42)
  })

  test.each([
    ['1T', 7],
    ['2T', 14],
    ['1M', 30],
    ['3M', 90],
    ['6M', 180],
  ] as const)('range %s passes %d as the day-count bound parameter', async (range, days) => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getPriceHistory(1, range)
    const sqlArg = mockExecute.mock.calls[0][0] as { values: unknown[] }
    expect(sqlArg.values).toContain(days)
  })

  test('query text filters out NULL prices ("not seen" cycles)', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getPriceHistory(1, '1T')
    const sqlArg = mockExecute.mock.calls[0][0] as { strings: ArrayLike<string> }
    const queryText = Array.from(sqlArg.strings).join('')
    expect(queryText).toContain('ph.price IS NOT NULL')
  })

  test('query text casts scraped_at to date (day-only, no time component)', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getPriceHistory(1, '1T')
    const sqlArg = mockExecute.mock.calls[0][0] as { strings: ArrayLike<string> }
    const queryText = Array.from(sqlArg.strings).join('')
    expect(queryText).toContain('ph.scraped_at::date::text')
  })

  test('query text joins on products.game_id, not a single productId', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getPriceHistory(1, '1T')
    const sqlArg = mockExecute.mock.calls[0][0] as { strings: ArrayLike<string> }
    const queryText = Array.from(sqlArg.strings).join('')
    expect(queryText).toContain('p.game_id')
  })

  test('rejects when DB throws', async () => {
    mockExecute.mockRejectedValue(new Error('connection refused'))
    await expect(getPriceHistory(1, '1T')).rejects.toThrow('connection refused')
  })
})
