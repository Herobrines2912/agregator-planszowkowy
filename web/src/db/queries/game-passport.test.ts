import { describe, test, expect, vi, beforeEach } from 'vitest'
import { getGameBySlug, getAllGameSlugs } from './game-passport'
import type { GamePassportData } from './game-passport'

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

const makeGameRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  slug: 'brass-birmingham',
  name: 'Brass: Birmingham',
  cover_image_url: 'https://cdn.example.com/brass.jpg',
  is_expansion: false,
  designers: ['Gavan Brown', 'Matt Tolman'],
  publishers: ['Roxley Games'],
  year_published: 2018,
  bgg_id: 224517,
  bgg_rank: 1,
  bgg_category_rank: null,
  bgg_avg_rating: '8.67',
  complexity: '3.89',
  mechanics: ['Network Building', 'Hand Management'],
  min_players: 2,
  max_players: 4,
  min_playtime: 60,
  max_playtime: 120,
  min_age: 14,
  rules_pdf_url: null,
  // product columns (null when no products via LEFT JOIN)
  product_id: null,
  price: null,
  price_orig: null,
  in_stock: null,
  product_url: null,
  store_name: null,
  ...overrides,
})

const makeProductRow = (overrides: Record<string, unknown> = {}) =>
  makeGameRow({
    product_id: 101,
    price: '129.00',
    price_orig: '219.00',
    in_stock: true,
    product_url: 'https://aleplanszowki.pl/brass',
    store_name: 'AlePlanszowki',
    ...overrides,
  })

describe('getGameBySlug', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns null when game not found', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    const result = await getGameBySlug('unknown-slug')
    expect(result).toBeNull()
  })

  test('returns game with empty products when LEFT JOIN yields null product_id', async () => {
    mockExecute.mockResolvedValue({ rows: [makeGameRow()] })
    const result = await getGameBySlug('brass-birmingham')
    expect(result).not.toBeNull()
    expect(result!.products).toEqual([])
    expect(result!.best_product).toBeNull()
  })

  test('returns game with products mapped correctly', async () => {
    const row = makeProductRow()
    mockExecute.mockResolvedValue({ rows: [row] })
    const result = await getGameBySlug('brass-birmingham')
    expect(result!.products).toHaveLength(1)
    expect(result!.products[0]).toMatchObject({
      id: 101,
      store_name: 'AlePlanszowki',
      price: '129.00',
      price_orig: '219.00',
      in_stock: true,
      product_url: 'https://aleplanszowki.pl/brass',
    })
  })

  test('best_product is cheapest in-stock product', async () => {
    const rows = [
      makeProductRow({ product_id: 10, price: '99.00', in_stock: true, store_name: 'Cheap' }),
      makeProductRow({ product_id: 11, price: '129.00', in_stock: true, store_name: 'Pricey' }),
    ]
    mockExecute.mockResolvedValue({ rows })
    const result = await getGameBySlug('brass-birmingham')
    // DB returns rows sorted in-stock-asc-price, so first in-stock is cheapest
    expect(result!.best_product!.id).toBe(10)
    expect(result!.best_product!.store_name).toBe('Cheap')
  })

  test('best_product is null when all products are out of stock', async () => {
    const rows = [
      makeProductRow({ product_id: 10, price: '99.00', in_stock: false }),
    ]
    mockExecute.mockResolvedValue({ rows })
    const result = await getGameBySlug('brass-birmingham')
    expect(result!.products).toHaveLength(1)
    expect(result!.best_product).toBeNull()
  })

  test('base_game is always null (schema gap — Story 4.6)', async () => {
    mockExecute.mockResolvedValue({ rows: [makeProductRow()] })
    const result = await getGameBySlug('brass-birmingham')
    expect(result!.base_game).toBeNull()
  })

  test('prices are returned as strings not numbers', async () => {
    mockExecute.mockResolvedValue({ rows: [makeProductRow({ price: '49.99', price_orig: '89.00' })] })
    const result = await getGameBySlug('brass-birmingham')
    expect(typeof result!.products[0].price).toBe('string')
    expect(typeof result!.products[0].price_orig).toBe('string')
  })

  test('price_orig can be null', async () => {
    mockExecute.mockResolvedValue({ rows: [makeProductRow({ price_orig: null })] })
    const result = await getGameBySlug('brass-birmingham')
    expect(result!.products[0].price_orig).toBeNull()
  })

  test('maps all game scalar fields from first row', async () => {
    mockExecute.mockResolvedValue({ rows: [makeGameRow()] })
    const result = await getGameBySlug('brass-birmingham') as GamePassportData
    expect(result.id).toBe(1)
    expect(result.slug).toBe('brass-birmingham')
    expect(result.name).toBe('Brass: Birmingham')
    expect(result.bgg_id).toBe(224517)
    expect(result.bgg_rank).toBe(1)
    expect(result.bgg_avg_rating).toBe('8.67')
    expect(result.complexity).toBe('3.89')
    expect(result.year_published).toBe(2018)
    expect(result.is_expansion).toBe(false)
  })

  test('nullable game fields can be null', async () => {
    mockExecute.mockResolvedValue({
      rows: [makeGameRow({ cover_image_url: null, bgg_id: null, rules_pdf_url: null })],
    })
    const result = await getGameBySlug('brass-birmingham')!
    expect(result!.cover_image_url).toBeNull()
    expect(result!.bgg_id).toBeNull()
    expect(result!.rules_pdf_url).toBeNull()
  })

  test('handles multiple products — only first row used for game fields', async () => {
    const rows = [
      makeProductRow({ product_id: 1, price: '100.00', in_stock: true, store_name: 'A' }),
      makeProductRow({ product_id: 2, price: '150.00', in_stock: false, store_name: 'B' }),
    ]
    mockExecute.mockResolvedValue({ rows })
    const result = await getGameBySlug('brass-birmingham')
    expect(result!.products).toHaveLength(2)
    expect(result!.slug).toBe('brass-birmingham')
  })

  test('calls db.execute once per invocation', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getGameBySlug('any-slug')
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  test('slug is passed as bound parameter in query', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getGameBySlug('my-slug')
    const sqlArg = mockExecute.mock.calls[0][0] as { values: unknown[] }
    expect(sqlArg.values).toContain('my-slug')
  })

  test('rejects when DB throws', async () => {
    mockExecute.mockRejectedValue(new Error('connection refused'))
    await expect(getGameBySlug('brass-birmingham')).rejects.toThrow('connection refused')
  })
})

describe('getAllGameSlugs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns array of slug objects', async () => {
    mockExecute.mockResolvedValue({ rows: [{ slug: 'brass-birmingham' }, { slug: 'wingspan' }] })
    const result = await getAllGameSlugs()
    expect(result).toEqual([{ slug: 'brass-birmingham' }, { slug: 'wingspan' }])
  })

  test('returns empty array when no games with products', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    const result = await getAllGameSlugs()
    expect(result).toEqual([])
  })

  test('calls db.execute once', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    await getAllGameSlugs()
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  test('returns empty array when DB throws', async () => {
    mockExecute.mockRejectedValue(new Error('db down'))
    const result = await getAllGameSlugs()
    expect(result).toEqual([])
  })
})
