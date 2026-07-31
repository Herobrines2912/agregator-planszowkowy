import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { GameMeta } from '@/components/GameMeta'
import { DlcWarning } from '@/components/DlcWarning'
import { GameJsonLd } from '@/components/GameJsonLd'
import { OfferJsonLd } from '@/components/OfferJsonLd'
import { AlertSubscribeForm } from '@/components/AlertSubscribeForm'
import { BestDealBanner } from '@/components/BestDealBanner'
import { PriceTable } from '@/components/PriceTable'
import { PriceChart } from '@/components/PriceChart'
import { siteUrl } from '@/lib/config'
import { getGameBySlug, getAllGameSlugs } from '@/db/queries/game-passport'
import { getPriceHistory } from '@/db/queries/price-history'

export async function generateStaticParams() {
  return getAllGameSlugs()
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const game = await getGameBySlug(slug)

  if (!game) return { title: 'Nie znaleziono gry | Agregator Planszówek' }

  const name = game.name.length > 57 ? game.name.slice(0, 57) + '…' : game.name
  const title = `${name} — najlepsza cena | Agregator Planszówek`

  const rawDesc = `Sprawdź aktualną cenę ${game.name} w polskich sklepach. Porównaj oferty AlePlanszowki, 3Trolle i innych.`
  const description = rawDesc.length > 155 ? rawDesc.slice(0, 152) + '…' : rawDesc

  const image = game.cover_image_url ?? `${siteUrl}/opengraph-image.png`

  return {
    title,
    description,
    alternates: { canonical: `${siteUrl}/gra/${slug}` },
    openGraph: {
      title,
      description,
      images: [image],
      type: 'website',
      locale: 'pl_PL',
    },
    robots: { index: true, follow: true },
  }
}

export default async function GamePassportPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const game = await getGameBySlug(slug)

  if (!game) {
    notFound()
  }

  const priceHistory = await getPriceHistory(game.id, '3M')

  return (
    <>
      <GameJsonLd game={game} />
      <OfferJsonLd products={game.products} />

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
          <DlcWarning isExpansion={game.is_expansion} baseGame={game.base_game} />
        </div>

        {/* Right column — price data */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <AlertSubscribeForm gameSlug={slug} gameName={game.name} />

          <BestDealBanner product={game.best_product ?? game.products[0] ?? null} />

          {/* PriceTable — Story 4.3 */}
          {game.products.length > 0 ? (
            <PriceTable products={game.products} bestProductId={game.best_product?.id ?? null} />
          ) : (
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
              Brak aktywnych ofert
            </div>
          )}

          <PriceChart data={priceHistory} gameId={game.id} initialRange="3M" />
        </div>
      </div>
    </>
  )
}
