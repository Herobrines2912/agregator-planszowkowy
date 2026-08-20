import { describe, test, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import type { NextRequest } from 'next/server'

const mockUnsubscribeAlert = vi.fn()

vi.mock('@/db/queries/alerts', () => ({
  unsubscribeAlert: (...args: unknown[]) => mockUnsubscribeAlert(...args),
}))

function makeRequest(query: string) {
  const url = `https://example.com/api/alerts/unsubscribe${query}`
  return {
    url,
    nextUrl: new URL(url),
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
  mockUnsubscribeAlert.mockReset()
})

describe('GET /api/alerts/unsubscribe', () => {
  test('valid token: 302 to /alerts/unsubscribed carrying the same token', async () => {
    mockUnsubscribeAlert.mockResolvedValue({ outcome: 'unsubscribed' })

    const res = await GET(makeRequest('?token=tok-valid'))

    expect(mockUnsubscribeAlert).toHaveBeenCalledWith('tok-valid')
    expect(res.status).toBe(302)
    expect(locationOf(res)).toBe('/alerts/unsubscribed?token=tok-valid')
  })

  test('already-unsubscribed token: same destination, not an error', async () => {
    mockUnsubscribeAlert.mockResolvedValue({ outcome: 'already_unsubscribed' })

    const res = await GET(makeRequest('?token=tok-cancelled'))

    expect(res.status).toBe(302)
    expect(locationOf(res)).toBe('/alerts/unsubscribed?token=tok-cancelled')
  })

  test('unknown token: /alerts/unsubscribed?invalid=1', async () => {
    mockUnsubscribeAlert.mockResolvedValue({ outcome: 'not_found' })

    const res = await GET(makeRequest('?token=tok-nope'))

    expect(res.status).toBe(302)
    expect(locationOf(res)).toBe('/alerts/unsubscribed?invalid=1')
  })

  test('missing token param: /alerts/unsubscribed?invalid=1 without touching the DB', async () => {
    const res = await GET(makeRequest(''))

    expect(mockUnsubscribeAlert).not.toHaveBeenCalled()
    expect(res.status).toBe(302)
    expect(locationOf(res)).toBe('/alerts/unsubscribed?invalid=1')
  })

  test('empty token param: /alerts/unsubscribed?invalid=1 without touching the DB', async () => {
    const res = await GET(makeRequest('?token='))

    expect(mockUnsubscribeAlert).not.toHaveBeenCalled()
    expect(locationOf(res)).toBe('/alerts/unsubscribed?invalid=1')
  })

  test('token is URL-encoded in the redirect target', async () => {
    mockUnsubscribeAlert.mockResolvedValue({ outcome: 'unsubscribed' })

    const res = await GET(makeRequest('?token=a%20b%26c'))

    expect(mockUnsubscribeAlert).toHaveBeenCalledWith('a b&c')
    expect(res.headers.get('location')).toContain('token=a%20b%26c')
  })

  test('DB failure: dead-ends at /alerts/unsubscribed?invalid=1, never surfaces the error', async () => {
    mockUnsubscribeAlert.mockRejectedValue(new Error('connection refused'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET(makeRequest('?token=tok-boom'))

    expect(res.status).toBe(302)
    expect(locationOf(res)).toBe('/alerts/unsubscribed?invalid=1')
    expect(consoleErrorSpy).toHaveBeenCalled()
    expect(res.headers.get('location')).not.toContain('connection refused')

    consoleErrorSpy.mockRestore()
  })
})
