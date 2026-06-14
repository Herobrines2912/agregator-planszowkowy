'use client'

import { useState } from 'react'

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000

export function StalenessWarningBanner({ lastScrapedAt }: { lastScrapedAt: string | null }) {
  const [dismissed, setDismissed] = useState(false)
  const [now] = useState(() => Date.now())

  if (!lastScrapedAt || dismissed) return null

  const date = new Date(lastScrapedAt)
  const ageMs = now - date.getTime()
  if (ageMs < TWELVE_HOURS_MS) return null

  const hoursAgo = Math.floor(ageMs / 3_600_000)

  return (
    <div
      data-testid="staleness-banner"
      style={{
        borderLeft: '3px solid #C07B18',
        backgroundColor: '#FDF3DC',
        padding: '12px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '13px',
        color: '#2C1F14',
      }}
    >
      <span>Dane mogą być nieaktualne — ostatnia aktualizacja {hoursAgo}h temu</span>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Zamknij ostrzeżenie"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '16px',
          color: '#6B5744',
          padding: '0 0 0 16px',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  )
}
