import { redirect } from 'next/navigation'
import { AlertConfirmButton } from '@/components/AlertConfirmButton'
import { getAlertPreviewByToken, isConfirmPreviewExpired } from '@/db/queries/alerts'
import { formatPrice } from '@/lib/format'

function expiredPath(gameSlug: string | null) {
  return gameSlug ? `/alerts/expired?slug=${encodeURIComponent(gameSlug)}` : '/alerts/expired'
}

export default async function AlertConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) redirect(expiredPath(null))

  const preview = await getAlertPreviewByToken(token)
  if (!preview) redirect(expiredPath(null))

  // A cancelled alert must never be silently reactivated by replaying an old confirm link —
  // the one place a stale link could resurrect an unsubscribed user.
  if (preview.status === 'cancelled') redirect(expiredPath(preview.gameSlug))

  if (isConfirmPreviewExpired(preview)) {
    redirect(expiredPath(preview.gameSlug))
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
      <h1
        style={{
          fontFamily: 'var(--font-playfair), Georgia, serif',
          fontSize: '24px',
          fontWeight: 800,
          color: 'var(--color-text-primary)',
          margin: '0 0 16px',
          maxWidth: '420px',
          lineHeight: 1.4,
        }}
      >
        Potwierdź powiadomienia cenowe
      </h1>

      <div
        data-testid="alert-preview"
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
        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
          {preview.gameName}
        </div>
        <div style={{ fontSize: '15px', color: 'var(--color-text-primary)', fontWeight: 500 }}>
          Twój cel: {formatPrice(preview.targetPrice)}
        </div>
      </div>

      <AlertConfirmButton token={token} />

      <p
        data-testid="alert-confirm-disclaimer"
        style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '16px' }}
      >
        nie zapisywałeś się? zignoruj maila
      </p>
    </div>
  )
}
