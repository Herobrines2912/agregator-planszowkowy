import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { GameMeta, type GameMetaGame } from '@/components/GameMeta'

// Mock implementation until Story 4.5 (Dev B) provides real queries.
// Replace this entire block when game-passport.ts query is ready.
type MockGame = GameMetaGame & { slug: string }

async function getGameBySlugMock(slug: string): Promise<MockGame | null> {
  const mockGames: Record<string, MockGame> = {
    'brass-birmingham': {
      name: 'Brass: Birmingham',
      slug: 'brass-birmingham',
      cover_image_url: null,
      is_expansion: false,
      designers: ['Martin Wallace'],
      publishers: ['Roxley Games'],
      year_published: 2018,
      bgg_rank: 2,
      bgg_category_rank: { category: 'Strategiczne', rank: 1 },
      bgg_avg_rating: '8.60',
      complexity: '3.89',
      mechanics: [
        'Network and Route Building',
        'Hand Management',
        'Loans',
        'Set Collection',
        'Tech Trees',
      ],
      min_players: 2,
      max_players: 4,
      min_playtime: 60,
      max_playtime: 120,
      min_age: 14,
      rules_pdf_url: null,
    },
    scythe: {
      name: 'Scythe',
      slug: 'scythe',
      cover_image_url: null,
      is_expansion: false,
      designers: ['Jamey Stegmaier'],
      publishers: ['Stonemaier Games'],
      year_published: 2016,
      bgg_rank: 10,
      bgg_category_rank: null,
      bgg_avg_rating: '8.20',
      complexity: '3.43',
      mechanics: ['Area Majority', 'Engine Building', 'Variable Player Powers'],
      min_players: 1,
      max_players: 5,
      min_playtime: 90,
      max_playtime: 115,
      min_age: 14,
      rules_pdf_url: null,
    },
  }
  return mockGames[slug] ?? null
}

export async function generateStaticParams() {
  // Story 4.5 will provide getAllGameSlugs() — stub for now
  return []
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const game = await getGameBySlugMock(slug)
  if (!game) return { title: 'Nie znaleziono gry | Agregator Planszówek' }

  const name = game.name.length > 57 ? game.name.slice(0, 57) + '…' : game.name
  return {
    title: `${name} — Ceny | Agregator Planszówek`,
  }
}

export default async function GamePassportPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const game = await getGameBySlugMock(slug)

  if (!game) {
    notFound()
  }

  return (
    <>
      <nav
        aria-label="Breadcrumb"
        style={{
          backgroundColor: 'var(--color-surface-header)',
          borderBottom: '1px solid var(--color-border)',
          padding: '8px 40px',
        }}
      >
        <ol
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            listStyle: 'none',
            margin: 0,
            padding: 0,
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
          }}
        >
          <li>
            <Link href="/" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}>
              Okazje
            </Link>
          </li>
          <li aria-hidden="true" style={{ color: 'var(--color-text-muted)' }}>
            ›
          </li>
          <li style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{game.name}</li>
        </ol>
      </nav>

      <div className="passport-grid">
        {/* Left column — GameMeta panel */}
        <div>
          <GameMeta game={game} />
        </div>

        {/* Right column — price data */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* BestDealBanner — Story 4.4 */}
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: '12px',
              padding: '20px',
              minHeight: '80px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
              fontSize: '13px',
            }}
          >
            BestDealBanner (Story 4.4)
          </div>

          {/* PriceTable — Story 4.3 */}
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: '12px',
              padding: '20px',
              minHeight: '160px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
              fontSize: '13px',
            }}
          >
            PriceTable (Story 4.3)
          </div>

          {/* PriceChart — Story 5.3 */}
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: '12px',
              padding: '20px',
              minHeight: '320px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
              fontSize: '13px',
            }}
          >
            PriceChart (Story 5.3)
          </div>
        </div>
      </div>
    </>
  )
}
