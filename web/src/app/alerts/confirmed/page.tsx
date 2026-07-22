import Link from 'next/link'
import { getAlertSummaryByToken, type AlertSummary } from '@/db/queries/alerts'
import { formatPrice } from '@/lib/format'

export default async function AlertConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  // The page is reached straight from an email client with no client state, so the token is
  // the only handle on which alert to echo back. A direct visit without one still renders —
  // just without the game-specific card.
  let summary: AlertSummary | null = null
  if (token) {
    try {
      summary = await getAlertSummaryByToken(token)
    } catch (err) {
      // The alert was already activated before this page was reached, so a failed summary
      // lookup must not turn a successful opt-in into an error screen. Degrade to the
      // summary-less rendering AC-5 already defines.
      console.error('[/alerts/confirmed] getAlertSummaryByToken failed', err)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: '40px 20px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          background: '#3D5C3A',
          borderRadius: '50%',
          width: '56px',
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}
        aria-hidden="true"
      >
        <span style={{ color: 'white', fontSize: '24px' }}>✓</span>
      </div>

      <h1
        style={{
          fontFamily: 'var(--font-playfair), Georgia, serif',
          fontSize: '24px',
          fontWeight: 800,
          color: '#3D5C3A',
          margin: '0 0 24px',
          maxWidth: '420px',
          lineHeight: 1.4,
        }}
      >
        Gotowe! Powiadomimy Cię gdy cena spadnie.
      </h1>

      {summary && (
        <div
          data-testid="alert-summary"
          style={{
            background: 'var(--color-background)',
            borderRadius: '12px',
            padding: '16px',
            textAlign: 'left',
            width: '100%',
            maxWidth: '360px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              fontSize: '13px',
              color: 'var(--color-text-secondary)',
              marginBottom: '8px',
            }}
          >
            {summary.gameName}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '15px', color: 'var(--color-text-primary)', fontWeight: 500 }}>
              Twój cel: {formatPrice(summary.targetPrice)}
            </span>
            <span
              style={{
                background: '#3D5C3A',
                color: 'white',
                borderRadius: '12px',
                fontSize: '11px',
                padding: '3px 8px',
                fontWeight: 700,
              }}
            >
              AKTYWNY
            </span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
        {summary && (
          <Link
            data-testid="back-to-game"
            href={`/gra/${summary.gameSlug}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: '44px',
              padding: '0 24px',
              borderRadius: '24px',
              backgroundColor: 'var(--color-primary)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 700,
              textDecoration: 'none',
              fontFamily: 'var(--font-dm-sans), sans-serif',
            }}
          >
            Wróć do gry →
          </Link>
        )}

        {/* Non-functional placeholder — no manage-alerts page exists in any epic yet.
            Same treatment as the "Wyślij ponownie" button in AlertSubscribeForm. */}
        <button
          data-testid="manage-alerts"
          disabled
          style={{
            background: 'none',
            border: 'none',
            color: '#3D5C3A',
            fontSize: '13px',
            cursor: 'not-allowed',
            textDecoration: 'underline',
            padding: 0,
            opacity: 0.5,
          }}
        >
          Zarządzaj alertami →
        </button>
      </div>
    </div>
  )
}
