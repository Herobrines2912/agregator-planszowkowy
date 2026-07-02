import { describe, test, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import type { NextRequest } from 'next/server'

const mockSubscribeAlert = vi.fn()

vi.mock('@/db/queries/alerts', () => ({
  sha256Hex: (s: string) => `hash(${s})`,
  subscribeAlert: (...args: unknown[]) => mockSubscribeAlert(...args),
}))

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return {
    json: async () => body,
    headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
  } as unknown as NextRequest
}

const validBody = {
  email: 'user@example.com',
  targetPrice: '89.99',
  typeBEnabled: true,
  consentGiven: true,
  ageConfirmed: true,
  gameSlug: 'brass-birmingham',
}

beforeEach(() => {
  mockSubscribeAlert.mockReset()
})

describe('POST /api/alerts/subscribe', () => {
  test('invalid email -> 400 with Polish error, no DB call', async () => {
    const res = await POST(makeRequest({ ...validBody, email: 'not-an-email' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Nieprawidłowy adres e-mail' })
    expect(mockSubscribeAlert).not.toHaveBeenCalled()
  })

  test('consentGiven missing/false -> 400', async () => {
    const res = await POST(makeRequest({ ...validBody, consentGiven: false }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Zgoda na przetwarzanie danych jest wymagana' })
    expect(mockSubscribeAlert).not.toHaveBeenCalled()
  })

  test('ageConfirmed missing/false -> 400', async () => {
    const res = await POST(makeRequest({ ...validBody, ageConfirmed: false }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Wymagane potwierdzenie wieku (16+)' })
    expect(mockSubscribeAlert).not.toHaveBeenCalled()
  })

  test('invalid/non-positive targetPrice -> 400', async () => {
    const res = await POST(makeRequest({ ...validBody, targetPrice: '0' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Nieprawidłowa cena progowa' })
    expect(mockSubscribeAlert).not.toHaveBeenCalled()
  })

  test('unknown gameSlug -> 400', async () => {
    mockSubscribeAlert.mockResolvedValue({ outcome: 'unknown_game' })
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Nieprawidłowa gra' })
  })

  test('valid request -> 200 with generic success message', async () => {
    mockSubscribeAlert.mockResolvedValue({ outcome: 'subscribed' })
    const res = await POST(makeRequest(validBody, { 'x-forwarded-for': '1.2.3.4' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      success: true,
      data: { message: 'Sprawdź skrzynkę i potwierdź otrzymywanie powiadomień' },
    })
    expect(mockSubscribeAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        targetPrice: '89.99',
        typeBEnabled: true,
        gameSlug: 'brass-birmingham',
      }),
    )
  })

  test('suppressed email -> same 200 + same message as success (no distinguishing behavior)', async () => {
    mockSubscribeAlert.mockResolvedValue({ outcome: 'suppressed' })
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      success: true,
      data: { message: 'Sprawdź skrzynkę i potwierdź otrzymywanie powiadomień' },
    })
  })
})
