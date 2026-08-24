import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`)
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}))

const mockGetUnsubscribePreviewByToken = vi.fn()

vi.mock('@/db/queries/alerts', () => ({
  getUnsubscribePreviewByToken: (...args: unknown[]) => mockGetUnsubscribePreviewByToken(...args),
}))

vi.mock('@/components/AlertTokenActionButton', () => ({
  AlertTokenActionButton: ({ token, label }: { token: string; label: string }) => (
    <button data-testid="unsubscribe-btn">
      {label}:{token}
    </button>
  ),
}))

import AlertUnsubscribePage from './page'

async function redirectTarget(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn()
  } catch (err) {
    const msg = (err as Error).message
    if (msg.startsWith('NEXT_REDIRECT:')) return msg.slice('NEXT_REDIRECT:'.length)
    throw err
  }
  throw new Error('expected a redirect, none happened')
}

beforeEach(() => {
  mockRedirect.mockClear()
  mockGetUnsubscribePreviewByToken.mockReset()
})

describe('GET /alerts/unsubscribe (page)', () => {
  test('missing token: redirects to /alerts/unsubscribed?invalid=1, zero DB writes', async () => {
    const url = await redirectTarget(() =>
      AlertUnsubscribePage({ searchParams: Promise.resolve({}) }),
    )
    expect(url).toBe('/alerts/unsubscribed?invalid=1')
    expect(mockGetUnsubscribePreviewByToken).not.toHaveBeenCalled()
  })

  test('unknown token: redirects to /alerts/unsubscribed?invalid=1', async () => {
    mockGetUnsubscribePreviewByToken.mockResolvedValue(null)

    const url = await redirectTarget(() =>
      AlertUnsubscribePage({ searchParams: Promise.resolve({ token: 'tok-nope' }) }),
    )
    expect(url).toBe('/alerts/unsubscribed?invalid=1')
  })

  test('active alert: renders game name and the unsubscribe button, no redirect', async () => {
    mockGetUnsubscribePreviewByToken.mockResolvedValue({
      status: 'active',
      gameName: 'Brass: Birmingham',
      gameSlug: 'brass-birmingham',
    })

    const jsx = await AlertUnsubscribePage({ searchParams: Promise.resolve({ token: 'tok-active' }) })
    render(jsx as React.ReactElement)

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(screen.getByTestId('unsubscribe-preview-game')).toHaveTextContent('Brass: Birmingham')
    expect(screen.getByTestId('unsubscribe-btn')).toHaveTextContent('Wyłącz powiadomienia:tok-active')
  })

  test('already-cancelled alert: still renders the page (idempotent replay is fine)', async () => {
    mockGetUnsubscribePreviewByToken.mockResolvedValue({
      status: 'cancelled',
      gameName: 'Gloomhaven',
      gameSlug: 'gloomhaven',
    })

    const jsx = await AlertUnsubscribePage({ searchParams: Promise.resolve({ token: 'tok-cancelled' }) })
    render(jsx as React.ReactElement)

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(screen.getByTestId('unsubscribe-btn')).toBeInTheDocument()
  })

  test('pending_doi alert: still renders the page — unsubscribe_token never expires', async () => {
    mockGetUnsubscribePreviewByToken.mockResolvedValue({
      status: 'pending_doi',
      gameName: 'Gloomhaven',
      gameSlug: 'gloomhaven',
    })

    const jsx = await AlertUnsubscribePage({ searchParams: Promise.resolve({ token: 'tok-pending' }) })
    render(jsx as React.ReactElement)

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(screen.getByTestId('unsubscribe-btn')).toBeInTheDocument()
  })
})
