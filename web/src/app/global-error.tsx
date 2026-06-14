'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <html lang="pl">
      <body>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            gap: '16px',
            backgroundColor: '#F2EAD8',
            color: '#2C1F14',
            padding: '40px',
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              fontSize: '24px',
              fontWeight: 700,
              fontFamily: 'Georgia, serif',
              margin: 0,
            }}
          >
            Coś poszło nie tak
          </h2>
          <p
            style={{
              fontSize: '15px',
              color: '#6B5744',
              maxWidth: '400px',
              margin: 0,
            }}
          >
            Spróbuj odświeżyć stronę lub wróć za chwilę.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              backgroundColor: '#3D5C3A',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Spróbuj ponownie
          </button>
        </div>
      </body>
    </html>
  )
}
