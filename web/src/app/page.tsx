import { Suspense } from 'react'
import { DealCard } from '@/components/DealCard'
import { FilterBar } from '@/components/FilterBar'
import { ListRow } from '@/components/ListRow'

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

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const { view } = await searchParams
  const isList = view === 'list'

  return (
    <div style={{ padding: '40px' }}>
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

      <Suspense>
        <FilterBar resultCount={mockDeals.length} />
      </Suspense>

      {isList ? (
        <ul style={{ padding: 0, margin: 0, borderTop: '1px solid #D4C4AE', borderRadius: '8px', overflow: 'hidden' }}>
          {mockDeals.map((deal, i) => (
            <ListRow key={deal.slug} {...deal} index={i} />
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
    </div>
  )
}
