import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/components/UnsubscribeAllControl', () => ({
  UnsubscribeAllControl: ({ token }: { token: string }) => (
    <div data-testid="unsubscribe-all-control" data-token={token} />
  ),
}))

import AlertUnsubscribedPage from './page'

async function renderPage(params: { token?: string; invalid?: string }) {
  render(await AlertUnsubscribedPage({ searchParams: Promise.resolve(params) }))
}

describe('/alerts/unsubscribed', () => {
  test('valid token: success heading + message, renders the unsubscribe-all control', async () => {
    await renderPage({ token: 'tok-active' })

    expect(screen.getByText('Wyłączono powiadomienia')).toBeInTheDocument()
    expect(
      screen.getByText('Nie będziesz już otrzymywał powiadomień dla tej gry.'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('unsubscribe-all-control')).toHaveAttribute('data-token', 'tok-active')
  })

  test('invalid=1: expired-link message only, no unsubscribe-all control', async () => {
    await renderPage({ invalid: '1' })

    expect(screen.getByText('Ten link wygasł')).toBeInTheDocument()
    expect(
      screen.getByText('Jeśli chcesz wyłączyć powiadomienia, skontaktuj się z nami.'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('unsubscribe-all-control')).not.toBeInTheDocument()
  })

  test('missing token and no invalid flag: falls back to the expired-link message, no control', async () => {
    await renderPage({})

    expect(screen.getByText('Ten link wygasł')).toBeInTheDocument()
    expect(screen.queryByTestId('unsubscribe-all-control')).not.toBeInTheDocument()
  })

  test('token present but invalid=1 also set: invalid wins, no control rendered', async () => {
    await renderPage({ token: 'tok-active', invalid: '1' })

    expect(screen.getByText('Ten link wygasł')).toBeInTheDocument()
    expect(screen.queryByTestId('unsubscribe-all-control')).not.toBeInTheDocument()
  })
})
