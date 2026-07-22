import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

import AlertExpiredPage from './page'

async function renderPage(params: { slug?: string }) {
  render(await AlertExpiredPage({ searchParams: Promise.resolve(params) }))
}

describe('/alerts/expired', () => {
  test('with a slug: links back to that game page', async () => {
    await renderPage({ slug: 'brass-birmingham' })

    expect(screen.getByText('Link wygasł lub jest nieprawidłowy')).toBeInTheDocument()
    const link = screen.getByTestId('retry-link')
    expect(link).toHaveAttribute('href', '/gra/brass-birmingham')
    expect(link).toHaveTextContent('Wróć do strony gry i spróbuj ponownie')
  })

  test('without a slug: falls back to the home page', async () => {
    await renderPage({})

    expect(screen.getByText('Link wygasł lub jest nieprawidłowy')).toBeInTheDocument()
    const link = screen.getByTestId('retry-link')
    expect(link).toHaveAttribute('href', '/')
    expect(link).toHaveTextContent('Wróć do strony głównej i spróbuj ponownie')
  })

  test('empty slug param is treated as absent', async () => {
    await renderPage({ slug: '' })

    expect(screen.getByTestId('retry-link')).toHaveAttribute('href', '/')
  })
})
