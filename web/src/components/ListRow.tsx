'use client'

import { useRouter } from 'next/navigation'
import { formatPrice } from '@/lib/format'
import { calcDiscount } from '@/lib/calc'
import type { DealCardProps } from './DealCard'

function badgeColor(discount: number): string {
  if (discount < 40) return '#3D5C3A'
  if (discount <= 70) return '#C07B18'
  return '#C42B2B'
}

export interface ListRowProps extends DealCardProps {
  isBestDeal?: boolean
}

export function ListRow({
  slug,
  game_name,
  cover_image_url,
  price,
  price_orig,
  store_name,
  store_url,
  index = 0,
  isBestDeal = false,
}: ListRowProps) {
  const router = useRouter()

  if (!price_orig) return null

  const discount = calcDiscount(parseFloat(price), parseFloat(price_orig))
  const isHot = discount > 40
  const animationDelay = `${index * 50}ms`

  return (
    <li
      className="list-row"
      onClick={() => router.push(`/gra/${slug}`)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: '#DDD0BC',
        border: '1px solid #D4C4AE',
        borderLeft: isBestDeal ? '3px solid #3D5C3A' : '1px solid #D4C4AE',
        borderRadius: '10px',
        cursor: 'pointer',
        animation: 'fadeInUp 0.35s ease both',
        animationDelay,
        listStyle: 'none',
      }}
    >
      {/* Cover image */}
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '8px',
          overflow: 'hidden',
          flexShrink: 0,
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

      {/* Name + store */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontFamily: 'var(--font-playfair), Georgia, serif',
              fontSize: '15px',
              fontWeight: 700,
              color: '#2C1F14',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {game_name}
          </span>
          {isHot && (
            <span
              data-testid="hot-sticker"
              style={{
                backgroundColor: '#C4622D',
                color: '#fff',
                fontSize: '10px',
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: '4px',
                flexShrink: 0,
                letterSpacing: '0.4px',
                transform: 'rotate(-2deg)',
                display: 'inline-block',
              }}
            >
              HOT
            </span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: '#6B5744', marginTop: '2px' }}>
          {store_name}
        </div>
      </div>

      {/* Right: badge + prices + link */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <span
          data-testid="discount-badge"
          style={{
            backgroundColor: badgeColor(discount),
            color: '#fff',
            fontSize: '12px',
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: '5px',
          }}
        >
          -{discount}%
        </span>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#2C1F14', lineHeight: 1.2 }}>
            {formatPrice(price)}
          </div>
          <div style={{ fontSize: '13px', color: '#A89480', textDecoration: 'line-through' }}>
            {formatPrice(price_orig)}
          </div>
        </div>

        <a
          href={store_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: '7px 12px',
            borderRadius: '7px',
            backgroundColor: '#3D5C3A',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 700,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Zobacz →
        </a>
      </div>
    </li>
  )
}
