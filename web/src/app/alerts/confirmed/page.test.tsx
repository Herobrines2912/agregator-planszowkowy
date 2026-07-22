import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

const mockGetAlertSummaryByToken = vi.fn()

vi.mock('@/db/queries/alerts', () => ({
  getAlertSummaryByToken: (...args: unknown[]) => mockGetAlertSummaryByToken(...args),
}))

import AlertConfirmedPage from './page'

const summary = {
  gameName: 'Brass: Birmingham',
  gameSlug: 'brass-birmingham',
  targetPrice: '89.99',
}

async function renderPage(params: { token?: string }) {
  render(await AlertConfirmedPage({ searchParams: Promise.resolve(params) }))
}

beforeEach(() => {
  mockGetAlertSummaryByToken.mockReset()
})

describe('/alerts/confirmed', () => {
  test('resolved token: confirmation message, game name, formatted target price and a link back to the game', async () => {
    mockGetAlertSummaryByToken.mockResolvedValue(summary)

    await renderPage({ token: 'tok-active' })

    expect(mockGetAlertSummaryByToken).toHaveBeenCalledWith('tok-active')
    expect(screen.getByText('Gotowe! Powiadomimy Cię gdy cena spadnie.')).toBeInTheDocument()
    expect(screen.getByText('Brass: Birmingham')).toBeInTheDocument()
    expect(screen.getByText('Twój cel: 89,99 zł')).toBeInTheDocument()
    expect(screen.getByTestId('back-to-game')).toHaveAttribute('href', '/gra/brass-birmingham')
  })

  test('null target price renders as an em-dash, never an empty or "N/A" value', async () => {
    mockGetAlertSummaryByToken.mockResolvedValue({ ...summary, targetPrice: null })

    await renderPage({ token: 'tok-active' })

    expect(screen.getByText('Twój cel: —')).toBeInTheDocument()
  })

  test('"Zarządzaj alertami" is a disabled placeholder — no destination page exists yet', async () => {
    mockGetAlertSummaryByToken.mockResolvedValue(summary)

    await renderPage({ token: 'tok-active' })

    const manage = screen.getByTestId('manage-alerts')
    expect(manage).toBeDisabled()
    expect(manage.tagName).toBe('BUTTON')
  })

  test('missing token: generic confirmation only, no summary card, no back-to-game link, no DB call', async () => {
    await renderPage({})

    expect(mockGetAlertSummaryByToken).not.toHaveBeenCalled()
    expect(screen.getByText('Gotowe! Powiadomimy Cię gdy cena spadnie.')).toBeInTheDocument()
    expect(screen.queryByTestId('alert-summary')).not.toBeInTheDocument()
    expect(screen.queryByTestId('back-to-game')).not.toBeInTheDocument()
  })

  test('summary lookup failure: still shows the confirmation, degrading to the generic view', async () => {
    mockGetAlertSummaryByToken.mockRejectedValue(new Error('connection refused'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderPage({ token: 'tok-active' })

    // The alert was already activated before the redirect landed here — a failed read must
    // never present that success as an error.
    expect(screen.getByText('Gotowe! Powiadomimy Cię gdy cena spadnie.')).toBeInTheDocument()
    expect(screen.queryByTestId('alert-summary')).not.toBeInTheDocument()
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  test('token that resolves to nothing: same generic confirmation, does not error', async () => {
    mockGetAlertSummaryByToken.mockResolvedValue(null)

    await renderPage({ token: 'tok-unknown' })

    expect(screen.getByText('Gotowe! Powiadomimy Cię gdy cena spadnie.')).toBeInTheDocument()
    expect(screen.queryByTestId('alert-summary')).not.toBeInTheDocument()
    expect(screen.queryByTestId('back-to-game')).not.toBeInTheDocument()
  })
})
