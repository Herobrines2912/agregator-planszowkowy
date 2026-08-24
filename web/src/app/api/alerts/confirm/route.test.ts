import { describe, test, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import type { NextRequest } from 'next/server'

const mockConfirmAlert = vi.fn()

vi.mock('@/db/queries/alerts', () => ({
  confirmAlert: (...args: unknown[]) => mockConfirmAlert(...args),
}))

vi.mock('@/lib/crypto', () => ({
  sha256Hex: (s: string) => `hash(${s})`,
}))

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return {
    json: async () => {
      if (body === '__invalid_json__') throw new SyntaxError('Unexpected token')
      return body
    },
    headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
  } as unknown as NextRequest
}

beforeEach(() => {
  mockConfirmAlert.mockReset()
})

describe('POST /api/alerts/confirm', () => {
  test('fresh confirmation: 200 with outcome=confirmed, hashes the request ip', async () => {
    mockConfirmAlert.mockResolvedValue({ outcome: 'confirmed' })

    const res = await POST(makeRequest({ token: 'tok-valid' }, { 'x-forwarded-for': '203.0.113.7' }))

    expect(mockConfirmAlert).toHaveBeenCalledWith('tok-valid', 'hash(203.0.113.7)')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ success: true, data: { outcome: 'confirmed' } })
  })

  test('missing x-forwarded-for still confirms, recording an "unknown" ip hash', async () => {
    mockConfirmAlert.mockResolvedValue({ outcome: 'confirmed' })

    await POST(makeRequest({ token: 'tok-valid' }))

    expect(mockConfirmAlert).toHaveBeenCalledWith('tok-valid', 'hash(unknown)')
  })

  test('proxy chain in x-forwarded-for: only the originating client address is hashed', async () => {
    mockConfirmAlert.mockResolvedValue({ outcome: 'confirmed' })

    await POST(makeRequest({ token: 'tok-valid' }, { 'x-forwarded-for': '203.0.113.7, 70.41.3.18' }))

    expect(mockConfirmAlert).toHaveBeenCalledWith('tok-valid', 'hash(203.0.113.7)')
  })

  test('already-confirmed token: 200 with outcome=already_confirmed, not an error', async () => {
    mockConfirmAlert.mockResolvedValue({ outcome: 'already_confirmed' })

    const res = await POST(makeRequest({ token: 'tok-active' }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ success: true, data: { outcome: 'already_confirmed' } })
  })

  test('expired outcome: 400 error, no raw reason exposed', async () => {
    mockConfirmAlert.mockResolvedValue({ outcome: 'expired', gameSlug: 'brass-birmingham' })

    const res = await POST(makeRequest({ token: 'tok-old' }))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(typeof json.error).toBe('string')
  })

  test('missing token field -> 400, no DB call', async () => {
    const res = await POST(makeRequest({}))

    expect(mockConfirmAlert).not.toHaveBeenCalled()
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Nieprawidłowy token' })
  })

  test('empty string token -> 400, no DB call', async () => {
    const res = await POST(makeRequest({ token: '' }))

    expect(mockConfirmAlert).not.toHaveBeenCalled()
    expect(res.status).toBe(400)
  })

  test('non-string token -> 400, no DB call', async () => {
    const res = await POST(makeRequest({ token: 12345 }))

    expect(mockConfirmAlert).not.toHaveBeenCalled()
    expect(res.status).toBe(400)
  })

  test('malformed JSON body -> 400, no DB call', async () => {
    const res = await POST(makeRequest('__invalid_json__'))

    expect(mockConfirmAlert).not.toHaveBeenCalled()
    expect(res.status).toBe(400)
  })

  test('DB failure: 500, raw error never exposed to the client', async () => {
    mockConfirmAlert.mockRejectedValue(new Error('connection refused'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(makeRequest({ token: 'tok-boom' }))

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).not.toContain('connection refused')
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
