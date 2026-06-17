import { safeJsonLdStringify } from '@/lib/utils'
import type { OfferProduct } from '@/types/offer'

export type { OfferProduct }

interface Props {
  products: OfferProduct[]
}

export function OfferJsonLd({ products }: Props) {
  if (products.length === 0) return null

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Offer',
        price: p.price,
        priceCurrency: 'PLN',
        availability: p.in_stock
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
        seller: { '@type': 'Organization', name: p.store_name },
        url: p.affiliate_url ?? p.product_url,
      },
    })),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(schema) }}
    />
  )
}
