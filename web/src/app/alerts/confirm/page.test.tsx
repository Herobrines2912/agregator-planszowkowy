import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`)
})

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}))

const mockGetAlertPreviewByToken = vi.fn()

vi.mock('@/db/queries/alerts', () => ({
  getAlertPreviewByToken: (...args: unknown[]) => mockGetAlertPreviewByToken(...args),
  isConfirmPreviewExpired: (p: { status: string; tokenIssuedAt: Date }) =>
    p.status === 'pending_doi' && Date.now() - p.tokenIssuedAt.getTime() > 48 * 60 * 60 * 1000,
}))

vi.mock('@/components/AlertConfirmButton', () => ({
  AlertConfirmButton: ({ token }: { token: string }) => <button data-testid="confirm-btn">{token}</button>,
}))

import AlertConfirmPage from './page'

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
  mockGetAlertPreviewByToken.mockReset()
})

describe('GET /alerts/confirm (page)', () => {
  test('missing token: redirects to /alerts/expired, zero DB writes', async () => {
    const url = await redirectTarget(() =>
      AlertConfirmPage({ searchParams: Promise.resolve({}) }),
    )
    expect(url).toBe('/alerts/expired')
    expect(mockGetAlertPreviewByToken).not.toHaveBeenCalled()
  })

  test('unknown token: redirects to /alerts/expired with no slug', async () => {
    mockGetAlertPreviewByToken.mockResolvedValue(null)

    const url = await redirectTarget(() =>
      AlertConfirmPage({ searchParams: Promise.resolve({ token: 'tok-nope' }) }),
    )
    expect(url).toBe('/alerts/expired')
  })

  test('cancelled alert: redirects to /alerts/expired carrying the slug — never resurrects', async () => {
    mockGetAlertPreviewByToken.mockResolvedValue({
      status: 'cancelled',
      gameName: 'Gloomhaven',
      gameSlug: 'gloomhaven',
      targetPrice: null,
      tokenIssuedAt: new Date(),
    })

    const url = await redirectTarget(() =>
      AlertConfirmPage({ searchParams: Promise.resolve({ token: 'tok-cancelled' }) }),
    )
    expect(url).toBe('/alerts/expired?slug=gloomhaven')
  })

  test('pending_doi past 48h TTL: redirects to /alerts/expired with slug', async () => {
    mockGetAlertPreviewByToken.mockResolvedValue({
      status: 'pending_doi',
      gameName: 'Gloomhaven',
      gameSlug: 'gloomhaven',
      targetPrice: '80.00',
      tokenIssuedAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
    })

    const url = await redirectTarget(() =>
      AlertConfirmPage({ searchParams: Promise.resolve({ token: 'tok-old' }) }),
    )
    expect(url).toBe('/alerts/expired?slug=gloomhaven')
  })

  test('pending_doi within TTL: renders game name, price, and the confirm button — no redirect', async () => {
    mockGetAlertPreviewByToken.mockResolvedValue({
      status: 'pending_doi',
      gameName: 'Brass: Birmingham',
      gameSlug: 'brass-birmingham',
      targetPrice: '89.99',
      tokenIssuedAt: new Date(),
    })

    const jsx = await AlertConfirmPage({ searchParams: Promise.resolve({ token: 'tok-valid' }) })
    render(jsx as React.ReactElement)

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(screen.getByTestId('alert-preview')).toHaveTextContent('Brass: Birmingham')
    expect(screen.getByTestId('confirm-btn')).toBeInTheDocument()
  })

  test('active alert: idempotent replay still renders the button, no redirect', async () => {
    mockGetAlertPreviewByToken.mockResolvedValue({
      status: 'active',
      gameName: 'Brass: Birmingham',
      gameSlug: 'brass-birmingham',
      targetPrice: '89.99',
      tokenIssuedAt: new Date('2020-01-01'),
    })

    const jsx = await AlertConfirmPage({ searchParams: Promise.resolve({ token: 'tok-active' }) })
    render(jsx as React.ReactElement)

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(screen.getByTestId('confirm-btn')).toBeInTheDocument()
  })
})
