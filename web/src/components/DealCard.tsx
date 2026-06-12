'use client'

import { useRouter } from 'next/navigation'
import { formatPrice } from '@/lib/format'
import { calcDiscount } from '@/lib/calc'

export interface DealCardProps {
  slug: string
  game_name: string
  cover_image_url: string | null
  price: string
  price_orig: string | null
  store_name: string
  store_url: string
  index?: number
}

function badgeColor(discount: number): string {
  if (discount < 40) return '#3D5C3A'
  if (discount <= 70) return '#C07B18'
  return '#C42B2B'
}

export function DealCard({
  slug,
  game_name,
  cover_image_url,
  price,
  price_orig,
  store_name,
  store_url,
  index = 0,
}: DealCardProps) {
  const router = useRouter()

  if (!price_orig) return null

  const discount = calcDiscount(parseFloat(price), parseFloat(price_orig))
  const isHot = discount > 40
  const animationDelay = `${50 + index * 70}ms`

  return (
    <div
      className="deal-card"
      onClick={() => router.push(`/gra/${slug}`)}
      style={{
        position: 'relative',
        borderRadius: '12px',
        backgroundColor: '#DDD0BC',
        boxShadow: '0 2px 8px rgba(44,31,20,0.08)',
        cursor: 'pointer',
        overflow: 'visible',
        animation: 'cardFadeIn 0.5s ease both',
        animationDelay,
      }}
    >
      {/* Image area */}
      <div
        style={{
          height: '148px',
          borderRadius: '12px 12px 0 0',
          overflow: 'hidden',
          background: cover_image_url
            ? undefined
            : 'linear-gradient(135deg, #C5B49A 0%, #A89480 100%)',
        }}
      >
        {cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover_image_url}
            alt={game_name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </div>

      {/* HOT sticker */}
      {isHot && (
        <div
          className="hot-sticker"
          data-testid="hot-sticker"
          style={{
            position: 'absolute',
            top: '12px',
            left: '-4px',
            backgroundColor: '#C4622D',
            color: '#fff',
            fontSize: '11px',
            fontWeight: 800,
            padding: '4px 8px',
            borderRadius: '4px',
            transform: 'rotate(-4deg)',
            boxShadow: '2px 3px 8px rgba(196,98,45,0.45)',
            letterSpacing: '0.5px',
            zIndex: 1,
          }}
        >
          HOT
        </div>
      )}

      {/* Discount badge */}
      <div
        data-testid="discount-badge"
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          backgroundColor: badgeColor(discount),
          color: '#fff',
          fontSize: '12px',
          fontWeight: 700,
          padding: '3px 8px',
          borderRadius: '6px',
          zIndex: 1,
        }}
      >
        -{discount}%
      </div>

      {/* Content */}
      <div style={{ padding: '12px 14px 14px' }}>
        <h3
          style={{
            fontFamily: 'var(--font-playfair), Georgia, serif',
            fontSize: '16px',
            fontWeight: 700,
            color: '#2C1F14',
            margin: '0 0 8px',
            lineHeight: 1.3,
          }}
        >
          {game_name}
        </h3>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontSize: '20px', fontWeight: 700, color: '#2C1F14' }}>
            {formatPrice(price)}
          </span>
          <span style={{ fontSize: '14px', color: '#A89480', textDecoration: 'line-through' }}>
            {formatPrice(price_orig)}
          </span>
        </div>

        <div style={{ fontSize: '12px', color: '#6B5744', marginBottom: '12px' }}>
          {store_name}
        </div>

        <a
          href={store_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'block',
            textAlign: 'center',
            padding: '8px',
            borderRadius: '8px',
            backgroundColor: '#3D5C3A',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Zobacz ofertę →
        </a>
      </div>
    </div>
  )
}
