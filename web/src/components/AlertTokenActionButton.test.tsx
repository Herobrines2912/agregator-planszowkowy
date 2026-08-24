import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AlertTokenActionButton } from './AlertTokenActionButton'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockFetch = vi.fn()

beforeEach(() => {
  mockPush.mockReset()
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})

const defaultProps = {
  token: 'tok-123',
  endpoint: '/api/alerts/confirm',
  successPath: '/alerts/confirmed',
  label: 'Potwierdzam',
  tone: 'primary' as const,
}

describe('AlertTokenActionButton', () => {
  test('renders the given label', () => {
    render(<AlertTokenActionButton {...defaultProps} />)
    expect(screen.getByTestId('alert-token-action-button')).toHaveTextContent('Potwierdzam')
  })

  test('success: POSTs the token to the endpoint, navigates to successPath with the token', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ success: true, data: { outcome: 'confirmed' } }),
    })

    render(<AlertTokenActionButton {...defaultProps} />)
    fireEvent.click(screen.getByTestId('alert-token-action-button'))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/alerts/confirmed?token=tok-123'))
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/alerts/confirm',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'tok-123' }),
      }),
    )
  })

  test('API failure response: renders inline error, does not navigate', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ success: false, error: 'Nieprawidłowy token' }),
    })

    render(<AlertTokenActionButton {...defaultProps} />)
    fireEvent.click(screen.getByTestId('alert-token-action-button'))

    await waitFor(() =>
      expect(screen.getByTestId('alert-token-action-error')).toHaveTextContent('Nieprawidłowy token'),
    )
    expect(mockPush).not.toHaveBeenCalled()
  })

  test('network failure: renders generic inline error, does not navigate', async () => {
    mockFetch.mockRejectedValue(new Error('network down'))

    render(<AlertTokenActionButton {...defaultProps} />)
    fireEvent.click(screen.getByTestId('alert-token-action-button'))

    await waitFor(() => expect(screen.getByTestId('alert-token-action-error')).toBeInTheDocument())
    expect(mockPush).not.toHaveBeenCalled()
  })

  test('muted tone renders without crashing and uses the given label', () => {
    render(<AlertTokenActionButton {...defaultProps} tone="muted" label="Wyłącz powiadomienia" />)
    expect(screen.getByTestId('alert-token-action-button')).toHaveTextContent('Wyłącz powiadomienia')
  })
})
