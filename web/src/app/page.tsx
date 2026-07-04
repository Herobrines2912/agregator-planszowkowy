import type { Metadata } from 'next'
import { Suspense } from 'react'
import { siteUrl } from '@/lib/config'
import { DealCard } from '@/components/DealCard'
import { FilterBar } from '@/components/FilterBar'
import { ListRow } from '@/components/ListRow'
import { StalenessWarningBanner } from '@/components/StalenessWarningBanner'
import { calcMinPrice } from '@/lib/calc'
import { getHotDeals } from '@/db/queries/hot-deals'
import type { HotDealsFilters } from '@/db/queries/hot-deals'
import { getLastScrapeTime } from '@/db/queries/scrape-runs'

export const metadata: Metadata = {
  title: 'Agregator Cen Planszówek — Porównaj ceny planszówek w Polsce',
  description:
    'Znajdź najlepsze okazje na planszówki w polskich sklepach. Porównujemy ceny w AlePlanszowki, 3Trolle i innych. Aktualizowane codziennie.',
  openGraph: {
    title: 'Agregator Cen Planszówek',
    description: 'Porównaj ceny planszówek w polskich sklepach internetowych',
    images: [`${siteUrl}/opengraph-image.png`],
    locale: 'pl_PL',
    type: 'website',
  },
  robots: { index: true, follow: true },
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; type?: string; players?: string }>
}) {
  const { view, type, players } = await searchParams
  const isList = view === 'list'

  const filters: HotDealsFilters = {}
  if (type === 'base' || type === 'expansion') filters.type = type
  if (players) {
    const p = parseInt(players, 10)
    if (!isNaN(p) && p >= 1 && p <= 20) filters.players = p
  }

  const [deals, lastScrapedAt] = await Promise.all([
    getHotDeals(40, Object.keys(filters).length > 0 ? filters : undefined),
    getLastScrapeTime(),
  ])

  const minPrice = calcMinPrice(deals)

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
        <FilterBar resultCount={deals.length} />
      </Suspense>

      {deals.length === 0 ? (
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
      ) : isList ? (
        <ul style={{ padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {deals.map((deal, i) => (
            <ListRow
              key={deal.slug}
              slug={deal.slug}
              game_name={deal.game_name}
              cover_image_url={deal.cover_image_url}
              price={deal.price}
              price_orig={deal.price_orig}
              store_name={deal.store_name}
              store_url={deal.store_url}
              index={i}
              isBestDeal={Number(deal.price) === minPrice}
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
          {deals.map((deal, i) => (
            <DealCard
              key={deal.slug}
              slug={deal.slug}
              game_name={deal.game_name}
              cover_image_url={deal.cover_image_url}
              price={deal.price}
              price_orig={deal.price_orig}
              store_name={deal.store_name}
              store_url={deal.store_url}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  )
}
