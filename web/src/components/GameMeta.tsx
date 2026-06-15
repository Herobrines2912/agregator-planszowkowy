import { formatNull } from '@/lib/format'

export interface GameMetaGame {
  name: string
  cover_image_url: string | null
  is_expansion: boolean
  designers: string[] | null
  publishers: string[] | null
  year_published: number | null
  bgg_rank: number | null
  bgg_category_rank: { category: string; rank: number } | null
  bgg_avg_rating: string | null
  complexity: string | null
  mechanics: string[] | null
  min_players: number | null
  max_players: number | null
  min_playtime: number | null
  max_playtime: number | null
  min_age: number | null
  rules_pdf_url: string | null
}

export interface GameMetaProps {
  game: GameMetaGame
}

// Safely parses a Drizzle NUMERIC string. Returns null for null, empty, NaN, or Infinity.
function parseNumericField(val: string | null): number | null {
  if (val == null || val === '') return null
  const n = parseFloat(val)
  return isFinite(n) ? n : null
}

// Runtime guard for bgg_category_rank jsonb shape — Drizzle returns jsonb as unknown.
function isCategoryRank(v: unknown): v is { category: string; rank: number } {
  return (
    v !== null &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    typeof (v as Record<string, unknown>).category === 'string' &&
    typeof (v as Record<string, unknown>).rank === 'number'
  )
}

function formatPlayers(min: number | null, max: number | null): string {
  if (min === null) return '—'
  if (max === null) return `${min}+ graczy`
  if (min === max) return `${min} graczy`
  return `${min}–${max} graczy`
}

function formatPlaytime(min: number | null, max: number | null): string {
  if (min === null) return '—'
  if (max === null) return `${min}+ min`
  if (min === max) return `${min} min`
  return `${min}–${max} min`
}

export function GameMeta({ game }: GameMetaProps) {
  const visibleMechanics = (game.mechanics ?? []).slice(0, 5)
  const overflowCount = (game.mechanics?.length ?? 0) - visibleMechanics.length
  const ratingNum = parseNumericField(game.bgg_avg_rating)
  const complexityNum = parseNumericField(game.complexity)

  const publisherLine = [
    game.publishers?.join(', ') || null,
    game.year_published ? String(game.year_published) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Cover image */}
      <div className="game-meta-cover">
        {game.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={game.cover_image_url}
            alt={game.name}
            style={{
              width: '240px',
              height: '240px',
              objectFit: 'cover',
              borderRadius: '12px',
              display: 'block',
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: '240px',
              height: '240px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #C5B49A 0%, #A89480 100%)',
            }}
          />
        )}
      </div>

      {/* Game name + expansion badge */}
      <div>
        <h1
          style={{
            fontFamily: 'var(--font-playfair), Georgia, serif',
            fontSize: '24px',
            fontWeight: 800,
            color: 'var(--color-text-primary)',
            margin: 0,
            lineHeight: 1.25,
          }}
        >
          {game.name}
        </h1>
        {game.is_expansion && (
          <span
            data-testid="expansion-badge"
            style={{
              display: 'inline-block',
              marginTop: '6px',
              border: '1.5px solid #6B5744',
              color: '#6B5744',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '4px',
              padding: '2px 8px',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}
          >
            DODATEK
          </span>
        )}
      </div>

      {/* Publisher + year */}
      {publisherLine && (
        <div
          data-testid="publisher-line"
          style={{
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
          }}
        >
          {publisherLine}
        </div>
      )}

      {/* BGG rating row */}
      <div>
        {ratingNum !== null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>⭐</span>
              <span
                data-testid="bgg-rating-value"
                style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}
              >
                {ratingNum.toFixed(1)}
              </span>
            </span>
            {game.bgg_rank !== null && (
              <span
                style={{
                  fontSize: '13px',
                  color: 'var(--color-text-secondary)',
                  backgroundColor: 'var(--color-surface-header)',
                  borderRadius: '4px',
                  padding: '2px 8px',
                }}
              >
                BGG #{game.bgg_rank}
              </span>
            )}
            {isCategoryRank(game.bgg_category_rank) && (
              <span
                style={{
                  fontSize: '13px',
                  color: 'var(--color-text-secondary)',
                  backgroundColor: 'var(--color-surface-header)',
                  borderRadius: '4px',
                  padding: '2px 8px',
                }}
              >
                {game.bgg_category_rank.category} #{game.bgg_category_rank.rank}
              </span>
            )}
          </div>
        ) : (
          <span
            data-testid="bgg-no-rating"
            style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}
          >
            Brak oceny BGG
          </span>
        )}
      </div>

      {/* Meta grid — Gracze / Czas gry / Trudność / Wiek */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
        }}
      >
        {[
          { label: 'Gracze', value: formatPlayers(game.min_players, game.max_players), testId: 'meta-players' },
          { label: 'Czas gry', value: formatPlaytime(game.min_playtime, game.max_playtime), testId: 'meta-playtime' },
          {
            label: 'Trudność',
            value: complexityNum !== null ? `${complexityNum.toFixed(1)} / 5` : '—',
            testId: 'meta-complexity',
          },
          {
            label: 'Wiek',
            value: game.min_age !== null ? `od ${game.min_age} lat` : '—',
            testId: 'meta-age',
          },
        ].map(({ label, value, testId }) => (
          <div
            key={label}
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: '8px',
              padding: '10px 12px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--color-text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '4px',
              }}
            >
              {label}
            </div>
            <div
              data-testid={testId}
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Designers */}
      <div>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--color-text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '4px',
          }}
        >
          Projektant
        </div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          {formatNull(game.designers?.join(', ') || null)}
        </div>
      </div>

      {/* Mechanics chips */}
      {visibleMechanics.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '8px',
            }}
          >
            Mechaniki
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            {visibleMechanics.map((mechanic) => (
              <span
                key={mechanic}
                style={{
                  background: 'var(--color-surface-header)',
                  borderRadius: '20px',
                  padding: '3px 10px',
                  fontSize: '12px',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {mechanic}
              </span>
            ))}
            {overflowCount > 0 && (
              <span
                data-testid="mechanics-overflow"
                style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}
              >
                i {overflowCount} więcej
              </span>
            )}
          </div>
        </div>
      )}

      {/* Rules PDF link */}
      {game.rules_pdf_url && (
        <a
          href={game.rules_pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--color-primary)',
            textDecoration: 'none',
          }}
        >
          Zasady PDF →
        </a>
      )}
    </div>
  )
}
