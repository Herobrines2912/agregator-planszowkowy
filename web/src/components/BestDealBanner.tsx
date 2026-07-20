import { formatPrice } from '@/lib/format'
import { calcDiscount } from '@/lib/calc'
import type { GameProduct } from '@/db/queries/game-passport'

export interface BestDealBannerProps {
  product: GameProduct | null
}

function badgeColor(discount: number): string {
  if (discount < 40) return '#3D5C3A'
  if (discount <= 70) return '#C07B18'
  return '#C42B2B'
}

export function BestDealBanner({ product }: BestDealBannerProps) {
  if (!product) return null

  const discount =
    product.price && product.price_orig
      ? calcDiscount(parseFloat(product.price), parseFloat(product.price_orig))
      : null
  const hasDiscount = discount !== null && discount > 0

  return (
    <div
      className="best-deal-banner"
      data-testid="best-deal-banner"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        backgroundColor: '#DDD0BC',
        borderRadius: '12px',
        borderLeft: '4px solid #3D5C3A',
        padding: '20px',
        opacity: product.in_stock ? 1 : 0.55,
      }}
    >
      <div>
        <div data-testid="best-deal-store" style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          {product.store_name}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span
            data-testid="best-deal-price"
            style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: '28px', fontWeight: 800, color: '#3D5C3A' }}
          >
            {formatPrice(product.price)}
          </span>
          {product.price_orig && (
            <span style={{ fontSize: '14px', color: 'var(--color-text-muted)', textDecoration: 'line-through' }}>
              {formatPrice(product.price_orig)}
            </span>
          )}
          {hasDiscount && (
            <span
              data-testid="discount-badge"
              style={{ backgroundColor: badgeColor(discount as number), color: '#fff', fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px' }}
            >
              -{discount}%
            </span>
          )}
        </div>
      </div>

      {product.in_stock ? (
        <a
          href={product.product_url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="best-deal-cta"
          className="best-deal-banner-cta"
          style={{ padding: '12px 20px', borderRadius: '8px', backgroundColor: '#3D5C3A', color: '#fff', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          Kup za {formatPrice(product.price)} w {product.store_name} →
        </a>
      ) : (
        <span data-testid="best-deal-unavailable-label" style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
          Aktualnie niedostępne — sprawdź sklepy poniżej
        </span>
      )}
    </div>
  )
}
