'use client'

import { useState } from 'react'
import type { ApiResponse } from '@/types/api'

type ControlState = 'collapsed' | 'expanded' | 'loading' | 'done'

interface UnsubscribeAllControlProps {
  token: string
}

export function UnsubscribeAllControl({ token }: UnsubscribeAllControlProps) {
  const [state, setState] = useState<ControlState>('collapsed')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleConfirm() {
    setState('loading')
    setError('')
    try {
      const res = await fetch('/api/alerts/unsubscribe-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data: ApiResponse<{ message: string }> = await res.json()
      if (data.success) {
        setMessage(data.data.message)
        setState('done')
      } else {
        setError(data.error ?? 'Wystąpił błąd. Spróbuj ponownie.')
        setState('expanded')
      }
    } catch {
      setError('Wystąpił błąd. Spróbuj ponownie.')
      setState('expanded')
    }
  }

  if (state === 'done') {
    return (
      <p data-testid="unsubscribe-all-done" style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
        {message}
      </p>
    )
  }

  if (state === 'collapsed') {
    return (
      <button
        data-testid="unsubscribe-all-open"
        onClick={() => setState('expanded')}
        style={{
          background: 'none',
          border: 'none',
          color: '#3D5C3A',
          fontSize: '13px',
          cursor: 'pointer',
          textDecoration: 'underline',
          padding: 0,
        }}
      >
        Wyłącz wszystkie powiadomienia
      </button>
    )
  }

  return (
    <div
      data-testid="unsubscribe-all-expanded"
      style={{
        background: 'var(--color-background)',
        borderRadius: '12px',
        padding: '16px',
        textAlign: 'left',
        maxWidth: '360px',
      }}
    >
      <p style={{ fontSize: '13px', color: 'var(--color-text-primary)', margin: '0 0 12px' }}>
        Na pewno chcesz wyłączyć wszystkie powiadomienia cenowe dla tego adresu e-mail?
      </p>
      {error && (
        <p data-testid="unsubscribe-all-error" style={{ color: '#C42B2B', fontSize: '13px', margin: '0 0 12px' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          data-testid="unsubscribe-all-confirm"
          onClick={handleConfirm}
          disabled={state === 'loading'}
          style={{
            backgroundColor: '#3D5C3A',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: state === 'loading' ? 'not-allowed' : 'pointer',
            opacity: state === 'loading' ? 0.7 : 1,
          }}
        >
          {state === 'loading' ? 'Wyłączam…' : 'Tak, wyłącz wszystkie'}
        </button>
        <button
          data-testid="unsubscribe-all-cancel"
          onClick={() => setState('collapsed')}
          disabled={state === 'loading'}
          style={{
            background: 'none',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '8px 16px',
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
        >
          Anuluj
        </button>
      </div>
    </div>
  )
}
