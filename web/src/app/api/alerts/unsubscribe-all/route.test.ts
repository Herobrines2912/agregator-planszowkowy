import { describe, test, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import type { NextRequest } from 'next/server'

const mockUnsubscribeAllAlertsByToken = vi.fn()

vi.mock('@/db/queries/alerts', () => ({
  unsubscribeAllAlertsByToken: (...args: unknown[]) => mockUnsubscribeAllAlertsByToken(...args),
}))

function makeRequest(body: unknown) {
  return {
    json: async () => body,
  } as unknown as NextRequest
}

beforeEach(() => {
  mockUnsubscribeAllAlertsByToken.mockReset()
})

describe('POST /api/alerts/unsubscribe-all', () => {
  test('valid token: 200 with success message', async () => {
    mockUnsubscribeAllAlertsByToken.mockResolvedValue({ outcome: 'suppressed' })

    const res = await POST(makeRequest({ token: 'tok-valid' }))

    expect(mockUnsubscribeAllAlertsByToken).toHaveBeenCalledWith('tok-valid')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(typeof json.data.message).toBe('string')
  })

  test('missing token -> 400, no DB call', async () => {
    const res = await POST(makeRequest({}))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Nieprawidłowy token' })
    expect(mockUnsubscribeAllAlertsByToken).not.toHaveBeenCalled()
  })

  test('non-string token -> 400, no DB call', async () => {
    const res = await POST(makeRequest({ token: 12345 }))

    expect(res.status).toBe(400)
    expect(mockUnsubscribeAllAlertsByToken).not.toHaveBeenCalled()
  })

  test('empty string token -> 400, no DB call', async () => {
    const res = await POST(makeRequest({ token: '' }))

    expect(res.status).toBe(400)
    expect(mockUnsubscribeAllAlertsByToken).not.toHaveBeenCalled()
  })

  test('malformed JSON body -> 400 with Polish error, no DB call', async () => {
    const req = {
      json: async () => {
        throw new SyntaxError('bad json')
      },
    } as unknown as NextRequest
    const res = await POST(req)

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Nieprawidłowe dane żądania' })
    expect(mockUnsubscribeAllAlertsByToken).not.toHaveBeenCalled()
  })

  test('unknown token -> 400', async () => {
    mockUnsubscribeAllAlertsByToken.mockResolvedValue({ outcome: 'not_found' })

    const res = await POST(makeRequest({ token: 'tok-nope' }))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Nieprawidłowy token' })
  })

  test('DB failure: 500 with generic Polish message, error logged server-side', async () => {
    mockUnsubscribeAllAlertsByToken.mockRejectedValue(new Error('connection refused'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(makeRequest({ token: 'tok-boom' }))

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Wystąpił błąd. Spróbuj ponownie.' })
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
