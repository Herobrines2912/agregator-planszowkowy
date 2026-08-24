import { describe, test, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import type { NextRequest } from 'next/server'

const mockUnsubscribeAlert = vi.fn()

vi.mock('@/db/queries/alerts', () => ({
  unsubscribeAlert: (...args: unknown[]) => mockUnsubscribeAlert(...args),
}))

function makeRequest(body: unknown) {
  return {
    json: async () => {
      if (body === '__invalid_json__') throw new SyntaxError('Unexpected token')
      return body
    },
  } as unknown as NextRequest
}

beforeEach(() => {
  mockUnsubscribeAlert.mockReset()
})

describe('POST /api/alerts/unsubscribe', () => {
  test('fresh unsubscribe: 200 with outcome=unsubscribed', async () => {
    mockUnsubscribeAlert.mockResolvedValue({ outcome: 'unsubscribed' })

    const res = await POST(makeRequest({ token: 'tok-valid' }))

    expect(mockUnsubscribeAlert).toHaveBeenCalledWith('tok-valid')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ success: true, data: { outcome: 'unsubscribed' } })
  })

  test('already-cancelled token: 200 with outcome=already_unsubscribed, not an error', async () => {
    mockUnsubscribeAlert.mockResolvedValue({ outcome: 'already_unsubscribed' })

    const res = await POST(makeRequest({ token: 'tok-cancelled' }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ success: true, data: { outcome: 'already_unsubscribed' } })
  })

  test('not-found token: 400 error', async () => {
    mockUnsubscribeAlert.mockResolvedValue({ outcome: 'not_found' })

    const res = await POST(makeRequest({ token: 'tok-nope' }))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
  })

  test('missing token field -> 400, no DB call', async () => {
    const res = await POST(makeRequest({}))

    expect(mockUnsubscribeAlert).not.toHaveBeenCalled()
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Nieprawidłowy token' })
  })

  test('empty string token -> 400, no DB call', async () => {
    const res = await POST(makeRequest({ token: '' }))

    expect(mockUnsubscribeAlert).not.toHaveBeenCalled()
    expect(res.status).toBe(400)
  })

  test('malformed JSON body -> 400, no DB call', async () => {
    const res = await POST(makeRequest('__invalid_json__'))

    expect(mockUnsubscribeAlert).not.toHaveBeenCalled()
    expect(res.status).toBe(400)
  })

  test('DB failure: 500, raw error never exposed to the client', async () => {
    mockUnsubscribeAlert.mockRejectedValue(new Error('connection refused'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(makeRequest({ token: 'tok-boom' }))

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).not.toContain('connection refused')
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
