import { redirect } from 'next/navigation'
import { AlertTokenActionButton } from '@/components/AlertTokenActionButton'
import { getUnsubscribePreviewByToken } from '@/db/queries/alerts'

const INVALID_PATH = '/alerts/unsubscribed?invalid=1'

export default async function AlertUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) redirect(INVALID_PATH)

  const preview = await getUnsubscribePreviewByToken(token)
  if (!preview) redirect(INVALID_PATH)

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
          fontSize: '22px',
          fontWeight: 800,
          color: 'var(--color-text-primary)',
          margin: '0 0 12px',
          maxWidth: '420px',
          lineHeight: 1.4,
        }}
      >
        Wyłączyć powiadomienia?
      </h1>

      <p
        data-testid="unsubscribe-preview-game"
        style={{ fontSize: '14px', color: 'var(--color-text-secondary)', margin: '0 0 24px' }}
      >
        {preview.gameName}
      </p>

      <AlertTokenActionButton
        token={token}
        endpoint="/api/alerts/unsubscribe"
        successPath="/alerts/unsubscribed"
        label="Wyłącz powiadomienia"
        tone="muted"
      />

      <p
        data-testid="unsubscribe-reassurance"
        style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '16px' }}
      >
        Możesz zapisać się ponownie w każdej chwili.
      </p>
    </div>
  )
}
