'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ApiResponse } from '@/types/api'

interface AlertTokenActionButtonProps {
  token: string
  endpoint: string
  successPath: string
  label: string
  tone: 'primary' | 'muted'
}

/**
 * Shared by AlertConfirmButton (Story 6.2) and the unsubscribe page (Story 6.3) — both are a
 * side-effect-free GET page's single POST-on-click action, differing only in endpoint,
 * destination, label, and visual weight. See docs/solutions/architecture/rodo-consent-integrity.md
 * "DRY: po 6.2 wyekstrahować wspólny AlertTokenActionButton".
 */
export function AlertTokenActionButton({
  token,
  endpoint,
  successPath,
  label,
  tone,
}: AlertTokenActionButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleClick() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data: ApiResponse<{ outcome: string }> = await res.json()
      if (data.success) {
        router.push(`${successPath}?token=${encodeURIComponent(token)}`)
        return
      }
      setError(data.error || 'Wystąpił błąd. Spróbuj ponownie.')
      setLoading(false)
    } catch {
      setError('Wystąpił błąd. Spróbuj ponownie.')
      setLoading(false)
    }
  }

  const toneStyle =
    tone === 'primary'
      ? {
          backgroundColor: 'var(--color-primary)',
          color: '#fff',
          border: 'none',
          fontSize: '16px',
          fontWeight: 700,
          height: '52px',
          padding: '0 32px',
        }
      : {
          backgroundColor: 'var(--color-background)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)',
          fontSize: '14px',
          fontWeight: 600,
          height: '44px',
          padding: '0 24px',
        }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      {error && (
        <p
          data-testid="alert-token-action-error"
          style={{ color: '#C42B2B', fontSize: '13px', margin: 0 }}
        >
          {error}
        </p>
      )}
      <button
        data-testid="alert-token-action-button"
        onClick={handleClick}
        disabled={loading}
        style={{
          ...toneStyle,
          borderRadius: '24px',
          fontFamily: 'var(--font-dm-sans), sans-serif',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? '…' : label}
      </button>
    </div>
  )
}
