'use client'

import { useEffect } from 'react'

export default function GamePassportError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40vh',
        gap: '16px',
        color: 'var(--color-text-secondary)',
      }}
    >
      <p style={{ fontSize: '16px', margin: 0 }}>Nie udało się załadować strony gry.</p>
      <button
        onClick={reset}
        style={{
          padding: '8px 20px',
          borderRadius: '8px',
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          color: 'var(--color-text-primary)',
          cursor: 'pointer',
          fontSize: '14px',
        }}
      >
        Spróbuj ponownie
      </button>
    </div>
  )
}
