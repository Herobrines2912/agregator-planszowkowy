import { describe, test, expect, vi, beforeEach } from 'vitest'
import { getLastScrapeTime } from './scrape-runs'

// Build a chainable mock that collapses to a Promise at .limit()
function buildChain(resolveWith: unknown) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'from', 'where', 'orderBy']
  for (const m of methods) {
    chain[m] = vi.fn(() => chain)
  }
  chain.limit = vi.fn(() => Promise.resolve(resolveWith))
  return chain
}

const mockChain = buildChain([])

vi.mock('@/db/index', () => ({
  getDb: () => mockChain,
}))

vi.mock('next/cache', () => ({
  unstable_cache: <T>(fn: T) => fn,
}))

vi.mock('@/db/schema', () => ({
  scrapeRuns: { finished_at: 'finished_at', status: 'status' },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions) => ({ __and: conditions })),
  desc: vi.fn((col) => ({ __desc: col })),
  eq: vi.fn((col, val) => ({ __eq: [col, val] })),
  isNotNull: vi.fn((col) => ({ __isNotNull: col })),
}))

describe('getLastScrapeTime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns null when no successful scrape runs exist', async () => {
    ;(mockChain.limit as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const result = await getLastScrapeTime()
    expect(result).toBeNull()
  })

  test('returns the finished_at date of the last successful run', async () => {
    const date = new Date('2024-06-01T06:00:00Z')
    ;(mockChain.limit as ReturnType<typeof vi.fn>).mockResolvedValue([{ finished_at: date }])
    const result = await getLastScrapeTime()
    expect(result).toEqual(date)
  })

  test('returns null when finished_at is null (crashed mid-run)', async () => {
    ;(mockChain.limit as ReturnType<typeof vi.fn>).mockResolvedValue([{ finished_at: null }])
    const result = await getLastScrapeTime()
    expect(result).toBeNull()
  })

  test('queries only successful scrape runs', async () => {
    ;(mockChain.limit as ReturnType<typeof vi.fn>).mockResolvedValue([])
    await getLastScrapeTime()
    expect(mockChain.where).toHaveBeenCalledTimes(1)
    // eq() called with status = 'success'
    const { eq } = await import('drizzle-orm')
    expect(eq).toHaveBeenCalledWith(expect.anything(), 'success')
  })

  test('applies desc ordering', async () => {
    ;(mockChain.limit as ReturnType<typeof vi.fn>).mockResolvedValue([])
    await getLastScrapeTime()
    expect(mockChain.orderBy).toHaveBeenCalledTimes(1)
    const { desc } = await import('drizzle-orm')
    expect(desc).toHaveBeenCalledTimes(1)
  })

  test('limits to 1 result', async () => {
    ;(mockChain.limit as ReturnType<typeof vi.fn>).mockResolvedValue([])
    await getLastScrapeTime()
    expect(mockChain.limit).toHaveBeenCalledWith(1)
  })

  test('excludes success rows with null finished_at (NULLS FIRST guard)', async () => {
    ;(mockChain.limit as ReturnType<typeof vi.fn>).mockResolvedValue([])
    await getLastScrapeTime()
    const { isNotNull } = await import('drizzle-orm')
    expect(isNotNull).toHaveBeenCalledTimes(1)
  })
})
