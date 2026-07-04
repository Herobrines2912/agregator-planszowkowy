import { describe, test, expect, vi, beforeEach } from 'vitest'
import { getHotDeals } from './hot-deals'
import type { HotDeal } from './hot-deals'

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

const makeDeal = (overrides: Partial<HotDeal> = {}): HotDeal => ({
  slug: 'brass-birmingham',
  game_name: 'Brass: Birmingham',
  cover_image_url: null,
  price: '129.00',
  price_orig: '219.00',
  store_name: 'AlePlanszowki',
  store_url: 'https://aleplanszowki.pl/brass',
  ...overrides,
})

describe('getHotDeals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns empty array when no deals in DB', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    const result = await getHotDeals()
    expect(result).toEqual([])
  })

  test('returns mapped HotDeal rows from DB', async () => {
    const deal = makeDeal()
    mockExecute.mockResolvedValue({ rows: [deal] })
    const result = await getHotDeals()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      slug: 'brass-birmingham',
      game_name: 'Brass: Birmingham',
      price: '129.00',
      price_orig: '219.00',
      store_name: 'AlePlanszowki',
      store_url: 'https://aleplanszowki.pl/brass',
    })
  })

  test('returns multiple deals preserving order', async () => {
    const deals = [
      makeDeal({ slug: 'scythe', price: '189.90', price_orig: '279.00' }),
      makeDeal({ slug: 'wingspan', price: '99.00', price_orig: '159.00' }),
    ]
    mockExecute.mockResolvedValue({ rows: deals })
    const result = await getHotDeals()
    expect(result[0].slug).toBe('scythe')
    expect(result[1].slug).toBe('wingspan')
  })

  test('handles null cover_image_url', async () => {
    mockExecute.mockResolvedValue({ rows: [makeDeal({ cover_image_url: null })] })
    const result = await getHotDeals()
    expect(result[0].cover_image_url).toBeNull()
  })

  test('calls db.execute once per invocation', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getHotDeals()
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  test('passes limit as bound parameter in query', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getHotDeals(10)
    const sqlArg = mockExecute.mock.calls[0][0] as { values: unknown[] }
    expect(sqlArg.values.at(-1)).toBe(10)
  })

  test('with type=base: SQL contains is_expansion = FALSE', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getHotDeals(40, { type: 'base' })
    const sqlArg = mockExecute.mock.calls[0][0] as { values: Array<{ strings: ArrayLike<string> }> }
    const typeClause = sqlArg.values[0]
    expect(Array.from(typeClause.strings).join('')).toContain('is_expansion = FALSE')
  })

  test('with type=expansion: SQL contains is_expansion = TRUE', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getHotDeals(40, { type: 'expansion' })
    const sqlArg = mockExecute.mock.calls[0][0] as { values: Array<{ strings: ArrayLike<string> }> }
    const typeClause = sqlArg.values[0]
    expect(Array.from(typeClause.strings).join('')).toContain('is_expansion = TRUE')
  })

  test('with no type filter: type clause is empty', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getHotDeals(40)
    const sqlArg = mockExecute.mock.calls[0][0] as { values: Array<{ strings: ArrayLike<string> }> }
    const typeClause = sqlArg.values[0]
    expect(Array.from(typeClause.strings).join('')).toBe('')
  })

  test('with players filter: value appears as bound parameter', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getHotDeals(40, { players: 2 })
    const sqlArg = mockExecute.mock.calls[0][0] as { values: Array<{ values: unknown[] }> }
    const playersClause = sqlArg.values[1]
    expect(playersClause.values).toContain(2)
  })

  test('with combined type and players filter: both clauses populated', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getHotDeals(40, { type: 'base', players: 4 })
    const sqlArg = mockExecute.mock.calls[0][0] as {
      values: Array<{ strings: ArrayLike<string>; values: unknown[] }>
    }
    expect(Array.from(sqlArg.values[0].strings).join('')).toContain('is_expansion = FALSE')
    expect(sqlArg.values[1].values).toContain(4)
  })

  test('rejects when DB throws', async () => {
    mockExecute.mockRejectedValue(new Error('connection refused'))
    await expect(getHotDeals()).rejects.toThrow('connection refused')
  })

  test('price and price_orig are returned as strings', async () => {
    mockExecute.mockResolvedValue({ rows: [makeDeal({ price: '129.00', price_orig: '219.00' })] })
    const result = await getHotDeals()
    expect(typeof result[0].price).toBe('string')
    expect(typeof result[0].price_orig).toBe('string')
  })

  test('players=0 returns empty without hitting DB', async () => {
    const result = await getHotDeals(40, { players: 0 })
    expect(result).toEqual([])
    expect(mockExecute).not.toHaveBeenCalled()
  })

  test('best-deal selection orders by numeric price, not text', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getHotDeals()
    const sqlArg = mockExecute.mock.calls[0][0] as { strings: ArrayLike<string> }
    const queryText = Array.from(sqlArg.strings).join('')
    // Regression guard: DISTINCT ON must order by the numeric price column.
    // Ordering by the text-cast `price` column sorts lexicographically
    // ("199.00" < "89.00"), which can select a more expensive offer as
    // the "cheapest" deal for a game.
    expect(queryText).toContain('ORDER BY id, price_numeric ASC')
    expect(queryText).not.toMatch(/ORDER BY id, price ASC/)
  })
})
