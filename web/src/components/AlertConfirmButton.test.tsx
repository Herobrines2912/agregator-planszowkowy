import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AlertConfirmButton } from './AlertConfirmButton'

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

describe('AlertConfirmButton', () => {
  test('renders "Potwierdzam"', () => {
    render(<AlertConfirmButton token="tok-123" />)
    expect(screen.getByTestId('alert-token-action-button')).toHaveTextContent('Potwierdzam')
  })

  test('click POSTs to /api/alerts/confirm and navigates to /alerts/confirmed on success', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ success: true, data: { outcome: 'confirmed' } }),
    })

    render(<AlertConfirmButton token="tok-123" />)
    fireEvent.click(screen.getByTestId('alert-token-action-button'))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/alerts/confirmed?token=tok-123'))
    expect(mockFetch).toHaveBeenCalledWith('/api/alerts/confirm', expect.objectContaining({ method: 'POST' }))
  })
})
