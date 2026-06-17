import type { GameMetaGame } from '@/components/GameMeta'
import { safeJsonLdStringify } from '@/lib/utils'

interface Props {
  game: GameMetaGame
}

export function GameJsonLd({ game }: Props) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: game.name,
  }

  if (game.cover_image_url) {
    schema.image = game.cover_image_url
  }

  if (game.publishers && game.publishers.length > 0) {
    schema.brand = { '@type': 'Brand', name: game.publishers[0] }
  }

  const rv = Number(game.bgg_avg_rating)
  if (game.bgg_avg_rating !== null && game.bgg_avg_rating !== undefined && isFinite(rv) && rv >= 1) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: rv,
      bestRating: 10,
      worstRating: 1,
    }
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(schema) }}
    />
  )
}
