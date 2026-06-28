'use client'

import { useEffect, useRef } from 'react'

interface AlertModalProps {
  open: boolean
  onClose: () => void
  title: string
  titleId: string
  children: React.ReactNode
  stateKey?: string
}

export function AlertModal({ open, onClose, title, titleId, children, stateKey }: AlertModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
      'button, input, [tabindex]:not([tabindex="-1"])'
    )
    firstFocusable?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(
          'button, input, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, stateKey])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(44,31,20,0.5)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          width: '368px',
          borderRadius: '16px',
          background: 'var(--color-surface)',
          boxShadow: '0 24px 64px rgba(44, 31, 20, 0.28)',
        }}
      >
        <div style={{ padding: '24px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '20px',
              gap: '12px',
            }}
          >
            <h2
              id={titleId}
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '20px',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              {title}
            </h2>
            <button
              data-testid="modal-close-btn"
              onClick={onClose}
              aria-label="Zamknij"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '22px',
                color: 'var(--color-text-secondary)',
                padding: '0 4px',
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
