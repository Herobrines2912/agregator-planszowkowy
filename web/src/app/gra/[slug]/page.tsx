import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'

// Mock implementation until Story 4.5 (Dev B) provides real queries
// Replace this entire block when game.ts query is ready
async function getGameBySlugMock(slug: string) {
  const mockGames: Record<string, { name: string; slug: string }> = {
    'brass-birmingham': { name: 'Brass: Birmingham', slug: 'brass-birmingham' },
    scythe: { name: 'Scythe', slug: 'scythe' },
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
        <div>
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: '12px',
              padding: '20px',
              minHeight: '300px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
              fontSize: '13px',
            }}
          >
            GameMeta (Story 4.2)
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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
        </div>
      </div>
    </>
  )
}
