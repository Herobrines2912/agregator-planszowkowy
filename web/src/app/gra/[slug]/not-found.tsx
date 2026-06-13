import Link from 'next/link'

export default function GameNotFound() {
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
      <p style={{ fontSize: '72px', margin: '0 0 16px', opacity: 0.4 }}>🎲</p>
      <h1
        style={{
          fontFamily: 'var(--font-playfair), Georgia, serif',
          fontSize: '32px',
          fontWeight: 800,
          color: 'var(--color-text-primary)',
          margin: '0 0 12px',
        }}
      >
        Nie znaleziono gry
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
        Ta gra nie jest jeszcze w naszej bazie lub adres się zmienił.
      </p>
      <Link
        href="/"
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
        ← Wróć do okazji
      </Link>
    </div>
  )
}
