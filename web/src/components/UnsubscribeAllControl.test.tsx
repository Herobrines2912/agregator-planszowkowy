import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UnsubscribeAllControl } from './UnsubscribeAllControl'

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})

describe('UnsubscribeAllControl', () => {
  test('starts collapsed, showing only the open link', () => {
    render(<UnsubscribeAllControl token="tok-active" />)

    expect(screen.getByTestId('unsubscribe-all-open')).toBeInTheDocument()
    expect(screen.queryByTestId('unsubscribe-all-expanded')).not.toBeInTheDocument()
  })

  test('clicking the open link expands to an inline confirm — not a modal', () => {
    render(<UnsubscribeAllControl token="tok-active" />)

    fireEvent.click(screen.getByTestId('unsubscribe-all-open'))

    expect(screen.getByTestId('unsubscribe-all-expanded')).toBeInTheDocument()
    expect(screen.getByTestId('unsubscribe-all-confirm')).toBeInTheDocument()
  })

  test('cancel collapses back without calling the API', () => {
    render(<UnsubscribeAllControl token="tok-active" />)
    fireEvent.click(screen.getByTestId('unsubscribe-all-open'))

    fireEvent.click(screen.getByTestId('unsubscribe-all-cancel'))

    expect(screen.queryByTestId('unsubscribe-all-expanded')).not.toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('confirm posts the token and shows the success message', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ success: true, data: { message: 'Wyłączono wszystkie powiadomienia.' } }),
    })
    render(<UnsubscribeAllControl token="tok-active" />)
    fireEvent.click(screen.getByTestId('unsubscribe-all-open'))

    fireEvent.click(screen.getByTestId('unsubscribe-all-confirm'))

    await waitFor(() => expect(screen.getByTestId('unsubscribe-all-done')).toBeInTheDocument())
    expect(screen.getByText('Wyłączono wszystkie powiadomienia.')).toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/alerts/unsubscribe-all',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'tok-active' }),
      }),
    )
  })

  test('API error response: shows the error, stays expanded for retry', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ success: false, error: 'Nieprawidłowy token' }),
    })
    render(<UnsubscribeAllControl token="tok-bad" />)
    fireEvent.click(screen.getByTestId('unsubscribe-all-open'))

    fireEvent.click(screen.getByTestId('unsubscribe-all-confirm'))

    await waitFor(() => expect(screen.getByTestId('unsubscribe-all-error')).toBeInTheDocument())
    expect(screen.getByText('Nieprawidłowy token')).toBeInTheDocument()
    expect(screen.getByTestId('unsubscribe-all-confirm')).toBeInTheDocument()
  })

  test('network failure: shows a generic Polish error, stays expanded for retry', async () => {
    mockFetch.mockRejectedValue(new Error('network down'))
    render(<UnsubscribeAllControl token="tok-active" />)
    fireEvent.click(screen.getByTestId('unsubscribe-all-open'))

    fireEvent.click(screen.getByTestId('unsubscribe-all-confirm'))

    await waitFor(() => expect(screen.getByTestId('unsubscribe-all-error')).toBeInTheDocument())
    expect(screen.getByText('Wystąpił błąd. Spróbuj ponownie.')).toBeInTheDocument()
  })
})
