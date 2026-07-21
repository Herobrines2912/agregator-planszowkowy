import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ href, children, style }: { href: string; children: React.ReactNode; style?: React.CSSProperties }) => (
    <a href={href} style={style}>{children}</a>
  ),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

const mockGetGameBySlug = vi.fn()
const mockGetAllGameSlugs = vi.fn()
const mockGetPriceHistory = vi.fn()

vi.mock('@/db/queries/game-passport', () => ({
  getGameBySlug: (...args: unknown[]) => mockGetGameBySlug(...args),
  getAllGameSlugs: (...args: unknown[]) => mockGetAllGameSlugs(...args),
}))

vi.mock('@/db/queries/price-history', () => ({
  getPriceHistory: (...args: unknown[]) => mockGetPriceHistory(...args),
}))

import GameNotFound from './not-found'
import GamePassportLoading from './loading'
import GamePassportPage, { generateStaticParams, generateMetadata } from './page'
import { POST } from '../../api/revalidate/route'
import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'

const makeGameData = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  slug: 'brass-birmingham',
  name: 'Brass: Birmingham',
  cover_image_url: null,
  is_expansion: false,
  designers: ['Martin Wallace'],
  publishers: ['Roxley Games'],
  year_published: 2018,
  bgg_id: 224517,
  bgg_rank: 1,
  bgg_category_rank: null,
  bgg_avg_rating: '8.60',
  complexity: '3.89',
  mechanics: ['Network and Route Building', 'Hand Management'],
  min_players: 2,
  max_players: 4,
  min_playtime: 60,
  max_playtime: 120,
  min_age: 14,
  rules_pdf_url: null,
  products: [],
  best_product: null,
  base_game: null,
  ...overrides,
})

// ── not-found.tsx ─────────────────────────────────────────────────────────────

describe('GameNotFound', () => {
  test('renders Nie znaleziono gry heading', () => {
    render(<GameNotFound />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Nie znaleziono gry')
  })

  test('renders Wróć do okazji link pointing to /', () => {
    render(<GameNotFound />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/')
    expect(link).toHaveTextContent('Wróć do okazji')
  })

  test('no stack trace visible (no <pre> or <code> elements)', () => {
    const { container } = render(<GameNotFound />)
    expect(container.querySelector('pre')).toBeNull()
    expect(container.querySelector('code')).toBeNull()
  })
})

// ── loading.tsx ───────────────────────────────────────────────────────────────

describe('GamePassportLoading', () => {
  test('renders breadcrumb skeleton bar', () => {
    const { container } = render(<GamePassportLoading />)
    const breadcrumbBar = container.firstElementChild as HTMLElement
    expect(breadcrumbBar).toBeTruthy()
    expect(breadcrumbBar.style.height).toBe('37px')
  })

  test('renders 240×240px cover skeleton', () => {
    const { container } = render(<GamePassportLoading />)
    const allDivs = Array.from(container.querySelectorAll('div'))
    const coverSkeleton = allDivs.find(
      (d) => (d as HTMLElement).style.width === '240px' && (d as HTMLElement).style.height === '240px'
    )
    expect(coverSkeleton).toBeTruthy()
  })

  test('renders exactly 3 table row skeleton boxes (44px height)', () => {
    const { container } = render(<GamePassportLoading />)
    const allDivs = Array.from(container.querySelectorAll('div'))
    const tableRows = allDivs.filter(
      (d) => (d as HTMLElement).style.height === '44px'
    )
    expect(tableRows).toHaveLength(3)
  })

  test('renders 2 text skeleton lines (28px and 18px)', () => {
    const { container } = render(<GamePassportLoading />)
    const allDivs = Array.from(container.querySelectorAll('div'))
    const titleLine = allDivs.find((d) => (d as HTMLElement).style.height === '28px')
    const subtitleLine = allDivs.find((d) => (d as HTMLElement).style.height === '18px')
    expect(titleLine).toBeTruthy()
    expect(subtitleLine).toBeTruthy()
  })

  test('all skeleton boxes have shimmer animation', () => {
    const { container } = render(<GamePassportLoading />)
    const animatedDivs = Array.from(container.querySelectorAll('div')).filter(
      (d) => (d as HTMLElement).style.animation?.includes('shimmer')
    )
    expect(animatedDivs.length).toBeGreaterThanOrEqual(6)
  })
})

// ── page.tsx — GamePassportPage ───────────────────────────────────────────────

describe('GamePassportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPriceHistory.mockResolvedValue([])
  })

  test('renders breadcrumb with aria-label and game name for known slug', async () => {
    mockGetGameBySlug.mockResolvedValue(makeGameData())
    const output = await GamePassportPage({ params: Promise.resolve({ slug: 'brass-birmingham' }) })
    render(output)
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeTruthy()
    expect(screen.getAllByText('Brass: Birmingham').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Okazje' })).toHaveAttribute('href', '/')
  })

  // AC-1: server-side fetch wired to real data
  test('calls getPriceHistory(game.id, "3M") and renders PriceChart instead of the placeholder', async () => {
    mockGetGameBySlug.mockResolvedValue(makeGameData({ id: 42 }))
    mockGetPriceHistory.mockResolvedValue([
      { date: '2026-06-01', storeId: 1, storeName: 'AlePlanszowki', price: '89.90' },
      { date: '2026-06-15', storeId: 1, storeName: 'AlePlanszowki', price: '84.90' },
    ])
    const output = await GamePassportPage({ params: Promise.resolve({ slug: 'brass-birmingham' }) })
    render(output)
    expect(mockGetPriceHistory).toHaveBeenCalledWith(42, '3M')
    expect(screen.queryByText('PriceChart (Story 5.3)')).toBeNull()
    expect(screen.getByRole('img', { name: /wykres historii cen/i })).toBeTruthy()
  })

  test('calls notFound() for unknown slug', async () => {
    mockGetGameBySlug.mockResolvedValue(null)
    await expect(
      GamePassportPage({ params: Promise.resolve({ slug: 'not-a-real-game' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })

  // AC-6: BestDealBanner receives game.best_product ?? game.products[0] ?? null
  test('BestDealBanner shows the cheapest in-stock product when one exists', async () => {
    mockGetGameBySlug.mockResolvedValue(makeGameData({
      products: [
        { id: 1, store_name: '3Trolle', price: '99.00', price_orig: null, in_stock: true, product_url: 'https://3trolle.pl/gra' },
      ],
      best_product: { id: 1, store_name: '3Trolle', price: '99.00', price_orig: null, in_stock: true, product_url: 'https://3trolle.pl/gra' },
    }))
    const output = await GamePassportPage({ params: Promise.resolve({ slug: 'brass-birmingham' }) })
    render(output)
    expect(screen.getByTestId('best-deal-store')).toHaveTextContent('3Trolle')
    expect(screen.getByTestId('best-deal-cta')).toBeTruthy()
  })

  // AC-2/AC-6: all products out of stock → best_product is null, falls back to products[0]
  test('BestDealBanner falls back to products[0] (dimmed) when nothing is in stock', async () => {
    mockGetGameBySlug.mockResolvedValue(makeGameData({
      products: [
        { id: 2, store_name: 'AlePlanszowki', price: '120.00', price_orig: null, in_stock: false, product_url: 'https://aleplanszowki.pl/gra' },
      ],
      best_product: null,
    }))
    const output = await GamePassportPage({ params: Promise.resolve({ slug: 'brass-birmingham' }) })
    render(output)
    expect(screen.getByTestId('best-deal-store')).toHaveTextContent('AlePlanszowki')
    expect(screen.queryByTestId('best-deal-cta')).toBeNull()
    expect(screen.getByTestId('best-deal-unavailable-label')).toBeTruthy()
  })

  // AC-5/AC-6: zero products → BestDealBanner renders nothing
  test('BestDealBanner renders nothing when the game has zero products', async () => {
    mockGetGameBySlug.mockResolvedValue(makeGameData({ products: [], best_product: null }))
    const output = await GamePassportPage({ params: Promise.resolve({ slug: 'brass-birmingham' }) })
    render(output)
    expect(screen.queryByTestId('best-deal-banner')).toBeNull()
  })
})

// ── page.tsx — generateMetadata ───────────────────────────────────────────────

describe('generateMetadata', () => {
  beforeEach(() => vi.clearAllMocks())

  test('returns formatted title for known slug', async () => {
    mockGetGameBySlug.mockResolvedValue(makeGameData())
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'brass-birmingham' }) })
    expect(meta.title).toBe('Brass: Birmingham — najlepsza cena | Agregator Planszówek')
  })

  test('returns fallback title for unknown slug', async () => {
    mockGetGameBySlug.mockResolvedValue(null)
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'unknown-slug' }) })
    expect(meta.title).toBe('Nie znaleziono gry | Agregator Planszówek')
  })

  test('returns description for known slug', async () => {
    mockGetGameBySlug.mockResolvedValue(makeGameData())
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'brass-birmingham' }) })
    expect(typeof meta.description).toBe('string')
    expect((meta.description as string).length).toBeLessThanOrEqual(155)
    expect((meta.description as string).length).toBeGreaterThan(0)
  })

  test('returns canonical URL for known slug', async () => {
    mockGetGameBySlug.mockResolvedValue(makeGameData())
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'brass-birmingham' }) })
    expect((meta as { alternates?: { canonical?: string } }).alternates?.canonical).toMatch(/\/gra\/brass-birmingham$/)
  })

  test('returns openGraph with locale pl_PL', async () => {
    mockGetGameBySlug.mockResolvedValue(makeGameData())
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'brass-birmingham' }) })
    expect((meta as { openGraph?: { locale?: string } }).openGraph?.locale).toBe('pl_PL')
  })

  test('returns robots index:true follow:true', async () => {
    mockGetGameBySlug.mockResolvedValue(makeGameData())
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'brass-birmingham' }) })
    expect(meta.robots).toEqual({ index: true, follow: true })
  })

  test('unknown slug returns only title (no OG fields)', async () => {
    mockGetGameBySlug.mockResolvedValue(null)
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'unknown-slug' }) })
    expect((meta as { openGraph?: unknown }).openGraph).toBeUndefined()
  })
})

// ── page.tsx — generateStaticParams ──────────────────────────────────────────

describe('generateStaticParams', () => {
  beforeEach(() => vi.clearAllMocks())

  test('returns mapped slugs from getAllGameSlugs', async () => {
    mockGetAllGameSlugs.mockResolvedValue([{ slug: 'brass-birmingham' }, { slug: 'wingspan' }])
    const result = await generateStaticParams()
    expect(result).toEqual([{ slug: 'brass-birmingham' }, { slug: 'wingspan' }])
  })

  test('returns empty array when no games with products', async () => {
    mockGetAllGameSlugs.mockResolvedValue([])
    const result = await generateStaticParams()
    expect(result).toEqual([])
  })
})

// ── revalidate route ──────────────────────────────────────────────────────────

describe('POST /api/revalidate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('REVALIDATION_SECRET', 'test-secret-value')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function makeRequest(secret: string | null) {
    return new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: secret ? { 'x-revalidate-secret': secret } : {},
    })
  }

  test('returns 401 when no secret header', async () => {
    const res = await POST(makeRequest(null) as never)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ success: false, error: 'unauthorized' })
  })

  test('returns 401 when wrong secret', async () => {
    const res = await POST(makeRequest('wrong-secret') as never)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ success: false, error: 'unauthorized' })
  })

  test('returns 401 when REVALIDATION_SECRET not set', async () => {
    vi.unstubAllEnvs()
    const res = await POST(makeRequest('test-secret-value') as never)
    expect(res.status).toBe(401)
  })

  test('returns 200 with ApiResponse envelope on valid secret', async () => {
    const res = await POST(makeRequest('test-secret-value') as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true, data: { revalidated: true } })
  })

  test('calls revalidatePath for /gra/[slug] and / on success', async () => {
    await POST(makeRequest('test-secret-value') as never)
    expect(revalidatePath).toHaveBeenCalledWith('/gra/[slug]', 'page')
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })
})
