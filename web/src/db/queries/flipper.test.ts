import { describe, test, expect, vi, beforeEach } from 'vitest'
import { getFlipperDeals } from './flipper'
import type { FlipperDeal } from './flipper'

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

const makeDeal = (overrides: Partial<FlipperDeal> = {}): FlipperDeal => ({
  slug: 'brass-birmingham',
  game_name: 'Brass: Birmingham',
  cover_image_url: null,
  current_min_price: '129.00',
  historical_max_price: '219.00',
  margin_pct: '69.8',
  profit_estimate: '90.00',
  store_name: 'AlePlanszowki',
  store_url: 'https://aleplanszowki.pl/brass',
  ...overrides,
})

function queryText(): string {
  const sqlArg = mockExecute.mock.calls[0][0] as { strings: ArrayLike<string> }
  return Array.from(sqlArg.strings).join('')
}

describe('getFlipperDeals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns empty array when no deals in DB', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    const result = await getFlipperDeals()
    expect(result).toEqual([])
  })

  test('returns mapped FlipperDeal rows from DB', async () => {
    const deal = makeDeal()
    mockExecute.mockResolvedValue({ rows: [deal] })
    const result = await getFlipperDeals()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      slug: 'brass-birmingham',
      game_name: 'Brass: Birmingham',
      current_min_price: '129.00',
      historical_max_price: '219.00',
      margin_pct: '69.8',
      profit_estimate: '90.00',
      store_name: 'AlePlanszowki',
      store_url: 'https://aleplanszowki.pl/brass',
    })
  })

  test('returns multiple deals preserving order (margin desc, as returned by DB)', async () => {
    const deals = [
      makeDeal({ slug: 'scythe', margin_pct: '120.0' }),
      makeDeal({ slug: 'wingspan', margin_pct: '40.0' }),
    ]
    mockExecute.mockResolvedValue({ rows: deals })
    const result = await getFlipperDeals()
    expect(result[0].slug).toBe('scythe')
    expect(result[1].slug).toBe('wingspan')
  })

  test('handles null cover_image_url', async () => {
    mockExecute.mockResolvedValue({ rows: [makeDeal({ cover_image_url: null })] })
    const result = await getFlipperDeals()
    expect(result[0].cover_image_url).toBeNull()
  })

  test('calls db.execute once per invocation', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getFlipperDeals()
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  test('with type=base: SQL contains is_expansion = FALSE', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getFlipperDeals({ type: 'base' })
    const sqlArg = mockExecute.mock.calls[0][0] as { values: Array<{ strings: ArrayLike<string> }> }
    const typeClause = sqlArg.values.find(
      (v) => v && typeof v === 'object' && 'strings' in v
    ) as { strings: ArrayLike<string> }
    expect(Array.from(typeClause.strings).join('')).toContain('is_expansion = FALSE')
  })

  test('with type=expansion: SQL contains is_expansion = TRUE', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getFlipperDeals({ type: 'expansion' })
    const sqlArg = mockExecute.mock.calls[0][0] as { values: Array<{ strings: ArrayLike<string> }> }
    const typeClause = sqlArg.values.find(
      (v) => v && typeof v === 'object' && 'strings' in v
    ) as { strings: ArrayLike<string> }
    expect(Array.from(typeClause.strings).join('')).toContain('is_expansion = TRUE')
  })

  test('with no type filter: type clause is empty', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getFlipperDeals()
    const sqlArg = mockExecute.mock.calls[0][0] as { values: Array<{ strings: ArrayLike<string> }> }
    const typeClause = sqlArg.values.find(
      (v) => v && typeof v === 'object' && 'strings' in v
    ) as { strings: ArrayLike<string> }
    expect(Array.from(typeClause.strings).join('')).toBe('')
  })

  test('rejects when DB throws', async () => {
    mockExecute.mockRejectedValue(new Error('connection refused'))
    await expect(getFlipperDeals()).rejects.toThrow('connection refused')
  })

  test('current_min_price CTE orders by numeric price column, not text-cast', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getFlipperDeals()
    const text = queryText()
    // Regression guard (same class of bug hot-deals.ts's own test guards against):
    // ordering DISTINCT ON by the text-cast price column sorts lexicographically
    // ("199.00" < "89.00"), silently picking the wrong "cheapest" offer.
    expect(text).toMatch(/ORDER BY\s+p\.game_id,\s*price\s+ASC/)
  })

  test('final SELECT orders by the numeric margin expression, not the text-cast margin_pct alias', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getFlipperDeals()
    const text = queryText()
    // Regression guard: `margin_pct` is `::text`-cast in the SELECT list, so
    // `ORDER BY margin_pct DESC` would sort lexicographically ("9.0" > "80.0").
    // Must order by the raw numeric expression instead.
    expect(text).not.toMatch(/ORDER BY\s+margin_pct\s+DESC/)
    expect(text).toContain(
      'ORDER BY (hm.historical_max_price_numeric - cp.current_min_price_numeric)'
    )
    expect(text).toContain('/ cp.current_min_price_numeric DESC')
  })

  test('current_prices CTE excludes zero-price products (avoids division by zero in margin_pct)', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getFlipperDeals()
    const text = queryText()
    expect(text).toContain('AND p.price > 0')
  })

  test('excludes games where historical_max_price <= current_min_price', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getFlipperDeals()
    const text = queryText()
    expect(text).toContain('historical_max_price_numeric > cp.current_min_price_numeric')
  })

  test('numeric columns are cast to text in final SELECT', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getFlipperDeals()
    const text = queryText()
    expect(text).toContain('::text')
  })
})
