import Link from 'next/link'
import { formatPrice } from '@/lib/format'
import type { BaseGameRef } from '@/db/queries/game-passport'

export interface DlcWarningProps {
  isExpansion: boolean
  baseGame: BaseGameRef | null
}

export function DlcWarning({ isExpansion, baseGame }: DlcWarningProps) {
  if (!isExpansion || !baseGame) return null

  const hasPrice = baseGame.current_min_price !== null

  return (
    <div
      data-testid="dlc-warning"
      style={{
        background: 'linear-gradient(135deg, #F5E6C8, #EDD89C)',
        border: '1.5px solid #C07B18',
        borderLeft: '5px solid #C07B18',
        borderRadius: '10px',
        padding: '14px 20px',
        color: '#3D2A08',
        marginTop: '16px',
      }}
    >
      <div>
        Ten dodatek wymaga: <strong>{baseGame.name}</strong>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
        {hasPrice ? (
          <span data-testid="dlc-warning-price">Cena od {formatPrice(baseGame.current_min_price)}</span>
        ) : baseGame.bgg_id !== null ? (
          <a
            href={`https://boardgamegeek.com/boardgame/${baseGame.bgg_id}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="dlc-warning-bgg-link"
          >
            Brak ofert w sklepach — sprawdź BGG →
          </a>
        ) : (
          <span data-testid="dlc-warning-no-offers">Brak ofert w sklepach</span>
        )}
        <Link href={`/gra/${baseGame.slug}`} data-testid="dlc-warning-link" style={{ color: '#3D2A08', fontWeight: 700 }}>
          Zobacz grę bazową →
        </Link>
      </div>
    </div>
  )
}
