'use client'

import { useState, useCallback } from 'react'
import { AlertModal } from './AlertModal'
import type { ApiResponse } from '@/types/api'

type FormState = 'form' | 'pending' | 'success'

interface AlertSubscribeFormProps {
  gameSlug: string
  gameName: string
  maxPrice?: number
  initialState?: FormState
}

export function AlertSubscribeForm({
  gameSlug,
  gameName,
  maxPrice = 500,
  initialState = 'form',
}: AlertSubscribeFormProps) {
  const [open, setOpen] = useState(initialState !== 'form')
  const [formState, setFormState] = useState<FormState>(initialState)

  const [email, setEmail] = useState('')
  const [targetPrice, setTargetPrice] = useState(150)
  const [typeBEnabled, setTypeBEnabled] = useState(true)
  const [consentGiven, setConsentGiven] = useState(false)
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleOpen() {
    setOpen(true)
  }

  const handleClose = useCallback(() => {
    setOpen(false)
    setFormState('form')
    setError('')
  }, [])

  async function handleSubmit() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Nieprawidłowy adres e-mail')
      return
    }
    if (!consentGiven) {
      setError('Zgoda na przetwarzanie danych jest wymagana')
      return
    }
    if (!ageConfirmed) {
      setError('Wymagane potwierdzenie wieku (16+)')
      return
    }
    if (!Number.isFinite(targetPrice) || targetPrice < 50 || targetPrice > maxPrice) {
      setError(`Cena musi być między 50 a ${maxPrice} zł`)
      return
    }

    setError('')
    setLoading(true)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch('/api/alerts/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          targetPrice: targetPrice.toFixed(2),
          typeBEnabled,
          consentGiven,
          ageConfirmed,
          gameSlug,
        }),
        signal: controller.signal,
      })
      const data: ApiResponse<{ message: string }> = await res.json()
      if (data.success) {
        setFormState('pending')
      } else {
        setError(data.error ?? 'Wystąpił błąd. Spróbuj ponownie.')
      }
    } catch {
      setError('Wystąpił błąd. Spróbuj ponownie.')
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }

  const modalTitle =
    formState === 'success'
      ? 'Powiadomienie aktywne!'
      : formState === 'pending'
        ? 'Sprawdź skrzynkę i potwierdź otrzymywanie powiadomień'
        : 'Ustaw alert cenowy'

  return (
    <>
      <button
        data-testid="ustaw-alert-btn"
        onClick={handleOpen}
        style={{
          backgroundColor: '#3D5C3A',
          color: 'white',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 700,
          padding: '10px 20px',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        Ustaw alert
      </button>

      <AlertModal
        open={open}
        onClose={handleClose}
        title={modalTitle}
        titleId={`alert-modal-title-${gameSlug}`}
        stateKey={formState}
      >
        {formState === 'form' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label
                htmlFor="alert-email"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  color: 'var(--color-text-secondary)',
                  marginBottom: '6px',
                }}
              >
                E-mail
              </label>
              <input
                id="alert-email"
                type="email"
                data-testid="email-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="twój@email.pl"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  background: 'var(--color-background)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="alert-price"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  color: 'var(--color-text-secondary)',
                  marginBottom: '6px',
                }}
              >
                Cena docelowa
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <input
                  id="alert-price"
                  type="number"
                  data-testid="price-input"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(Number(e.target.value))}
                  min={50}
                  max={maxPrice}
                  step={5}
                  style={{
                    width: '80px',
                    padding: '8px 10px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: 'var(--color-background)',
                    color: 'var(--color-text-primary)',
                  }}
                />
                <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>zł</span>
              </div>
              <input
                type="range"
                data-testid="price-slider"
                value={targetPrice}
                onChange={(e) => setTargetPrice(Number(e.target.value))}
                min={50}
                max={maxPrice}
                step={5}
                style={{ width: '100%' }}
              />
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                color: 'var(--color-text-primary)',
              }}
            >
              <input
                type="checkbox"
                data-testid="type-b-checkbox"
                checked={typeBEnabled}
                onChange={(e) => setTypeBEnabled(e.target.checked)}
              />
              Powiadamiaj też o przecenach &gt; 50%
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                color: 'var(--color-text-primary)',
              }}
            >
              <input
                type="checkbox"
                data-testid="consent-checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
              />
              Wyrażam zgodę na przetwarzanie adresu e-mail w celu wysyłki powiadomienia o cenie
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                color: 'var(--color-text-primary)',
              }}
            >
              <input
                type="checkbox"
                data-testid="age-checkbox"
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
              />
              Mam ukończone 16 lat
            </label>

            {error && (
              <p
                data-testid="form-error"
                style={{ color: '#C42B2B', fontSize: '13px', margin: '4px 0 0' }}
              >
                {error}
              </p>
            )}

            <button
              data-testid="submit-btn"
              onClick={handleSubmit}
              disabled={loading}
              style={{
                backgroundColor: '#3D5C3A',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 20px',
                fontSize: '15px',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                width: '100%',
              }}
            >
              {loading ? 'Wysyłam…' : 'Powiadom mnie'}
            </button>
          </div>
        )}

        {formState === 'pending' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--color-text-muted)',
                marginBottom: '8px',
              }}
            >
              Link ważny przez 48 godzin
            </p>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--color-text-muted)',
                marginBottom: '16px',
              }}
            >
              Nie widzisz? Sprawdź folder SPAM
            </p>
            <button
              data-testid="resend-link"
              disabled
              style={{
                background: 'none',
                border: 'none',
                color: '#3D5C3A',
                fontSize: '13px',
                cursor: 'not-allowed',
                textDecoration: 'underline',
                padding: 0,
                opacity: 0.5,
              }}
            >
              Wyślij ponownie
            </button>
          </div>
        )}

        {formState === 'success' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div
              style={{
                background: '#3D5C3A',
                borderRadius: '50%',
                width: '56px',
                height: '56px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
              aria-hidden="true"
            >
              <span style={{ color: 'white', fontSize: '24px' }}>✓</span>
            </div>
            <div
              style={{
                background: 'var(--color-background)',
                borderRadius: '12px',
                padding: '16px',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--color-text-secondary)',
                  marginBottom: '8px',
                }}
              >
                {gameName}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '15px', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                  Twój cel: {targetPrice} zł
                </span>
                <span
                  style={{
                    background: '#3D5C3A',
                    color: 'white',
                    borderRadius: '12px',
                    fontSize: '11px',
                    padding: '3px 8px',
                    fontWeight: 700,
                  }}
                >
                  AKTYWNY
                </span>
              </div>
            </div>
          </div>
        )}
      </AlertModal>
    </>
  )
}
