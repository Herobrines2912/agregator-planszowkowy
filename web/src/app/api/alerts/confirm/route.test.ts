import { describe, test, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import type { NextRequest } from 'next/server'

const mockConfirmAlert = vi.fn()

vi.mock('@/db/queries/alerts', () => ({
  confirmAlert: (...args: unknown[]) => mockConfirmAlert(...args),
}))

vi.mock('@/lib/crypto', () => ({
  sha256Hex: (s: string) => `hash(${s})`,
}))

function makeRequest(query: string, headers: Record<string, string> = {}) {
  const url = `https://example.com/api/alerts/confirm${query}`
  return {
    url,
    nextUrl: new URL(url),
    headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
  } as unknown as NextRequest
}

/** Redirect targets are compared as paths — the origin comes from the incoming request. */
function locationOf(res: Response): string {
  const location = res.headers.get('location')
  expect(location).not.toBeNull()
  const url = new URL(location as string)
  return `${url.pathname}${url.search}`
}

beforeEach(() => {
  mockConfirmAlert.mockReset()
})

describe('GET /api/alerts/confirm', () => {
  test('valid token: 302 to /alerts/confirmed carrying the same token', async () => {
    mockConfirmAlert.mockResolvedValue({ outcome: 'confirmed' })

    const res = await GET(makeRequest('?token=tok-valid', { 'x-forwarded-for': '203.0.113.7' }))

    // The confirmation click is the strongest consent evidence captured, so its request
    // context is hashed through to the append-only consent_log entry.
    expect(mockConfirmAlert).toHaveBeenCalledWith('tok-valid', 'hash(203.0.113.7)')
    expect(res.status).toBe(302)
    expect(locationOf(res)).toBe('/alerts/confirmed?token=tok-valid')
  })

  test('missing x-forwarded-for still confirms, recording an "unknown" ip hash', async () => {
    mockConfirmAlert.mockResolvedValue({ outcome: 'confirmed' })

    await GET(makeRequest('?token=tok-valid'))

    expect(mockConfirmAlert).toHaveBeenCalledWith('tok-valid', 'hash(unknown)')
  })

  test('proxy chain in x-forwarded-for: only the originating client address is hashed', async () => {
    mockConfirmAlert.mockResolvedValue({ outcome: 'confirmed' })

    await GET(makeRequest('?token=tok-valid', { 'x-forwarded-for': '203.0.113.7, 70.41.3.18' }))

    expect(mockConfirmAlert).toHaveBeenCalledWith('tok-valid', 'hash(203.0.113.7)')
  })

  test('already-confirmed token: same /alerts/confirmed destination, not an error', async () => {
    mockConfirmAlert.mockResolvedValue({ outcome: 'already_confirmed' })

    const res = await GET(makeRequest('?token=tok-active'))

    expect(res.status).toBe(302)
    expect(locationOf(res)).toBe('/alerts/confirmed?token=tok-active')
  })

  test('expired token with a known game: /alerts/expired carrying the slug', async () => {
    mockConfirmAlert.mockResolvedValue({ outcome: 'expired', gameSlug: 'brass-birmingham' })

    const res = await GET(makeRequest('?token=tok-old'))

    expect(res.status).toBe(302)
    expect(locationOf(res)).toBe('/alerts/expired?slug=brass-birmingham')
  })

  test('unknown token: /alerts/expired with no slug', async () => {
    mockConfirmAlert.mockResolvedValue({ outcome: 'expired', gameSlug: null })

    const res = await GET(makeRequest('?token=tok-nope'))

    expect(res.status).toBe(302)
    expect(locationOf(res)).toBe('/alerts/expired')
  })

  test('missing token param: /alerts/expired without touching the DB', async () => {
    const res = await GET(makeRequest(''))

    expect(mockConfirmAlert).not.toHaveBeenCalled()
    expect(res.status).toBe(302)
    expect(locationOf(res)).toBe('/alerts/expired')
  })

  test('empty token param: /alerts/expired without touching the DB', async () => {
    const res = await GET(makeRequest('?token='))

    expect(mockConfirmAlert).not.toHaveBeenCalled()
    expect(locationOf(res)).toBe('/alerts/expired')
  })

  test('token and slug are URL-encoded in the redirect target', async () => {
    mockConfirmAlert.mockResolvedValue({ outcome: 'expired', gameSlug: 'gra & spółka' })

    const res = await GET(makeRequest('?token=a%20b%26c'))

    expect(mockConfirmAlert).toHaveBeenCalledWith('a b&c', 'hash(unknown)')
    expect(res.headers.get('location')).toContain('slug=gra%20%26%20sp%C3%B3%C5%82ka')
  })

  test('DB failure: dead-ends at /alerts/expired instead of surfacing an error to the user', async () => {
    mockConfirmAlert.mockRejectedValue(new Error('connection refused'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET(makeRequest('?token=tok-boom'))

    expect(res.status).toBe(302)
    expect(locationOf(res)).toBe('/alerts/expired')
    expect(consoleErrorSpy).toHaveBeenCalled()
    // The user must never see the raw failure reason (AC-2)
    expect(res.headers.get('location')).not.toContain('connection refused')

    consoleErrorSpy.mockRestore()
  })
})
