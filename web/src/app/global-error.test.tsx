import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GlobalError from './global-error'

describe('GlobalError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('renderuje heading "Coś poszło nie tak"', () => {
    render(<GlobalError error={new Error('test')} reset={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Coś poszło nie tak' })).toBeInTheDocument()
  })

  test('renderuje opis błędu', () => {
    render(<GlobalError error={new Error('test')} reset={vi.fn()} />)
    expect(screen.getByText(/Spróbuj odświeżyć stronę/)).toBeInTheDocument()
  })

  test('renderuje przycisk "Spróbuj ponownie"', () => {
    render(<GlobalError error={new Error('test')} reset={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Spróbuj ponownie' })).toBeInTheDocument()
  })

  test('kliknięcie przycisku wywołuje reset()', () => {
    const reset = vi.fn()
    render(<GlobalError error={new Error('test')} reset={reset} />)
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
    expect(reset).toHaveBeenCalledOnce()
  })

  test('loguje błąd przy montowaniu', () => {
    const error = new Error('test error')
    render(<GlobalError error={error} reset={vi.fn()} />)
    expect(console.error).toHaveBeenCalledWith('[GlobalError]', error)
  })
})
