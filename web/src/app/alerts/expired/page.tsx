import Link from 'next/link'

export default async function AlertExpiredPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}) {
  const { slug } = await searchParams
  // The slug arrives already resolved from /api/alerts/confirm (display data only, no
  // lookup needed here) and is absent whenever the token matched nothing at all.
  const hasSlug = typeof slug === 'string' && slug.length > 0

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: '40px',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: '72px', margin: '0 0 16px', opacity: 0.4 }}>⏳</p>
      <h1
        style={{
          fontFamily: 'var(--font-playfair), Georgia, serif',
          fontSize: '32px',
          fontWeight: 800,
          color: 'var(--color-text-primary)',
          margin: '0 0 12px',
        }}
      >
        Link wygasł lub jest nieprawidłowy
      </h1>
      <p
        style={{
          fontSize: '15px',
          color: 'var(--color-text-secondary)',
          margin: '0 0 32px',
          maxWidth: '360px',
          lineHeight: 1.5,
        }}
      >
        Link potwierdzający jest ważny przez 48 godzin. Ustaw powiadomienie jeszcze raz — zajmie to
        chwilę.
      </p>
      <Link
        data-testid="retry-link"
        href={hasSlug ? `/gra/${slug}` : '/'}
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
        {hasSlug ? 'Wróć do strony gry i spróbuj ponownie' : 'Wróć do strony głównej i spróbuj ponownie'}
      </Link>
    </div>
  )
}
