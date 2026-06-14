import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StalenessWarningBanner } from './StalenessWarningBanner'

const FIXED_NOW = new Date('2026-06-14T12:00:00Z').getTime()

describe('StalenessWarningBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('ukryty gdy lastScrapedAt jest null', () => {
    const { container } = render(<StalenessWarningBanner lastScrapedAt={null} />)
    expect(container.firstChild).toBeNull()
  })

  test('ukryty gdy dane mają mniej niż 12h', () => {
    const recent = new Date(FIXED_NOW - 2 * 60 * 60 * 1000).toISOString()
    const { container } = render(<StalenessWarningBanner lastScrapedAt={recent} />)
    expect(container.firstChild).toBeNull()
  })

  test('widoczny gdy dane mają ponad 12h', () => {
    const stale = new Date(FIXED_NOW - 14 * 60 * 60 * 1000).toISOString()
    render(<StalenessWarningBanner lastScrapedAt={stale} />)
    expect(screen.getByTestId('staleness-banner')).toBeInTheDocument()
    expect(screen.getByText(/Dane mogą być nieaktualne/)).toBeInTheDocument()
    expect(screen.getByText(/14h temu/)).toBeInTheDocument()
  })

  test('pokazuje prawidłową liczbę godzin', () => {
    const stale = new Date(FIXED_NOW - 20 * 60 * 60 * 1000).toISOString()
    render(<StalenessWarningBanner lastScrapedAt={stale} />)
    expect(screen.getByText(/20h temu/)).toBeInTheDocument()
  })

  test('zamknięcie bannera przyciskiem ×', () => {
    const stale = new Date(FIXED_NOW - 14 * 60 * 60 * 1000).toISOString()
    render(<StalenessWarningBanner lastScrapedAt={stale} />)
    expect(screen.getByTestId('staleness-banner')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij ostrzeżenie' }))
    expect(screen.queryByTestId('staleness-banner')).toBeNull()
  })
})
