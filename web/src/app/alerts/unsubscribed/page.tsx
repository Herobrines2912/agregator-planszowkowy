import { UnsubscribeAllControl } from '@/components/UnsubscribeAllControl'

export default async function AlertUnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; invalid?: string }>
}) {
  const { token, invalid } = await searchParams
  const hasToken = typeof token === 'string' && token.length > 0 && invalid !== '1'

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
        {hasToken ? 'Wyłączono powiadomienia' : 'Ten link wygasł'}
      </h1>

      <p
        style={{
          fontSize: '15px',
          color: 'var(--color-text-secondary)',
          margin: '0 0 24px',
          maxWidth: '360px',
          lineHeight: 1.5,
        }}
        data-testid="unsubscribed-message"
      >
        {hasToken
          ? 'Nie będziesz już otrzymywał powiadomień dla tej gry.'
          : 'Jeśli chcesz wyłączyć powiadomienia, skontaktuj się z nami.'}
      </p>

      {hasToken && <UnsubscribeAllControl token={token} />}
    </div>
  )
}
