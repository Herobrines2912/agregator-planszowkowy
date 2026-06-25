'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Error]', error)
  }, [error])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: '16px',
        color: '#2C1F14',
        padding: '40px',
        textAlign: 'center',
      }}
    >
      <h2
        style={{
          fontSize: '22px',
          fontWeight: 700,
          fontFamily: 'Georgia, serif',
          margin: 0,
        }}
      >
        Nie udało się załadować ofert
      </h2>
      <p
        style={{
          fontSize: '15px',
          color: '#6B5744',
          maxWidth: '380px',
          margin: 0,
        }}
      >
        Sprawdź połączenie z internetem lub wróć za chwilę.
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
  )
}
