import { Suspense } from 'react'
import { DealCard } from '@/components/DealCard'
import { DealCardSkeleton } from '@/components/DealCardSkeleton'
import { FilterBar } from '@/components/FilterBar'
import { ListRow } from '@/components/ListRow'
import { ListRowSkeleton } from '@/components/ListRowSkeleton'
import { StalenessWarningBanner } from '@/components/StalenessWarningBanner'

const mockDeals = [
  {
    slug: 'brass-birmingham',
    game_name: 'Brass: Birmingham',
    cover_image_url: null,
    price: '129.00',
    price_orig: '219.00',
    store_name: 'AlePlanszowki',
    store_url: 'https://aleplanszowki.pl',
  },
  {
    slug: 'scythe',
    game_name: 'Scythe',
    cover_image_url: null,
    price: '189.90',
    price_orig: '279.00',
    store_name: '3Trolle',
    store_url: 'https://3trolle.pl',
  },
  {
    slug: 'wingspan',
    game_name: 'Wingspan',
    cover_image_url: null,
    price: '99.00',
    price_orig: '159.00',
    store_name: 'AlePlanszowki',
    store_url: 'https://aleplanszowki.pl',
  },
  {
    slug: 'twilight-imperium-4',
    game_name: 'Twilight Imperium IV',
    cover_image_url: null,
    price: '399.00',
    price_orig: '649.00',
    store_name: '3Trolle',
    store_url: 'https://3trolle.pl',
  },
]

// TODO Story 3.3: replace with real query from db/queries/scrape-runs.ts
async function getLastScrapeTime(): Promise<Date | null> {
  return null
}

function SkeletonFeed({ isList, count }: { isList: boolean; count: number }) {
  if (isList) {
    return (
      <ul style={{ padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {Array.from({ length: count }).map((_, i) => <ListRowSkeleton key={i} />)}
      </ul>
    )
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
      {Array.from({ length: count }).map((_, i) => <DealCardSkeleton key={i} />)}
    </div>
  )
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const { view } = await searchParams
  const isList = view === 'list'
  const lastScrapedAt = await getLastScrapeTime()

  const minPrice = Math.min(
    ...mockDeals
      .filter((d) => d.price_orig !== null)
      .map((d) => parseFloat(d.price))
  )

  return (
    <div style={{ padding: '40px' }}>
      <StalenessWarningBanner lastScrapedAt={lastScrapedAt?.toISOString() ?? null} />

      <h2
        style={{
          fontFamily: 'var(--font-playfair), Georgia, serif',
          fontSize: '28px',
          fontWeight: 800,
          color: '#2C1F14',
          marginBottom: '24px',
        }}
      >
        Gorące okazje
      </h2>

      <Suspense fallback={<div style={{ height: '40px', marginBottom: '24px' }} aria-hidden />}>
        <FilterBar resultCount={mockDeals.length} />
      </Suspense>

      {mockDeals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0' }}>
          <p style={{ fontSize: '16px', color: '#6B5744', marginBottom: '16px' }}>
            Brak okazji spełniających filtry — spróbuj rozszerzyć kryteria
          </p>
          <a
            href="?"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '10px 20px',
              borderRadius: '8px',
              backgroundColor: '#3D5C3A',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Wyczyść filtry
          </a>
        </div>
      ) : (
        <Suspense fallback={<SkeletonFeed isList={isList} count={isList ? 6 : 8} />}>
          {isList ? (
            <ul style={{ padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {mockDeals.map((deal, i) => (
                <ListRow
                  key={deal.slug}
                  {...deal}
                  index={i}
                  isBestDeal={parseFloat(deal.price) === minPrice}
                />
              ))}
            </ul>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '20px',
              }}
            >
              {mockDeals.map((deal, i) => (
                <DealCard key={deal.slug} {...deal} index={i} />
              ))}
            </div>
          )}
        </Suspense>
      )}
    </div>
  )
}
