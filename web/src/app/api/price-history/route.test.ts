import { describe, test, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import type { NextRequest } from 'next/server'

const mockGetPriceHistory = vi.fn()

vi.mock('@/db/queries/price-history', () => ({
  getPriceHistory: (...args: unknown[]) => mockGetPriceHistory(...args),
}))

function makeRequest(url: string): NextRequest {
  return { url } as unknown as NextRequest
}

beforeEach(() => {
  mockGetPriceHistory.mockReset()
})

describe('GET /api/price-history', () => {
  test('valid request -> 200 with ApiResponse data passthrough', async () => {
    const data = [{ date: '2026-06-01', storeId: 1, storeName: 'AlePlanszowki', price: '129.00' }]
    mockGetPriceHistory.mockResolvedValue(data)
    const res = await GET(makeRequest('https://example.com/api/price-history?gameId=42&range=3M'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ success: true, data })
    expect(mockGetPriceHistory).toHaveBeenCalledWith(42, '3M')
  })

  test('missing gameId -> 400, no DB call', async () => {
    const res = await GET(makeRequest('https://example.com/api/price-history?range=3M'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Nieprawidłowe gameId' })
    expect(mockGetPriceHistory).not.toHaveBeenCalled()
  })

  test('non-numeric gameId -> 400, no DB call', async () => {
    const res = await GET(makeRequest('https://example.com/api/price-history?gameId=abc&range=3M'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Nieprawidłowe gameId' })
    expect(mockGetPriceHistory).not.toHaveBeenCalled()
  })

  test('gameId <= 0 -> 400, no DB call', async () => {
    const res = await GET(makeRequest('https://example.com/api/price-history?gameId=0&range=3M'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Nieprawidłowe gameId' })
    expect(mockGetPriceHistory).not.toHaveBeenCalled()
  })

  test('non-integer gameId -> 400, no DB call', async () => {
    const res = await GET(makeRequest('https://example.com/api/price-history?gameId=1.5&range=3M'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Nieprawidłowe gameId' })
    expect(mockGetPriceHistory).not.toHaveBeenCalled()
  })

  test('missing range -> 400, no DB call', async () => {
    const res = await GET(makeRequest('https://example.com/api/price-history?gameId=42'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Nieprawidłowy zakres czasu' })
    expect(mockGetPriceHistory).not.toHaveBeenCalled()
  })

  test('invalid range string -> 400, no DB call', async () => {
    const res = await GET(makeRequest('https://example.com/api/price-history?gameId=42&range=99Y'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Nieprawidłowy zakres czasu' })
    expect(mockGetPriceHistory).not.toHaveBeenCalled()
  })

  test('empty data -> 200 with empty array, not null', async () => {
    mockGetPriceHistory.mockResolvedValue([])
    const res = await GET(makeRequest('https://example.com/api/price-history?gameId=42&range=1T'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ success: true, data: [] })
  })

  test('gameId exceeding Postgres int4 range -> 400, no DB call', async () => {
    const res = await GET(makeRequest('https://example.com/api/price-history?gameId=9999999999&range=3M'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Nieprawidłowe gameId' })
    expect(mockGetPriceHistory).not.toHaveBeenCalled()
  })

  test('gameId as 1e10 scientific notation exceeding int4 range -> 400, no DB call', async () => {
    const res = await GET(makeRequest('https://example.com/api/price-history?gameId=1e10&range=3M'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Nieprawidłowe gameId' })
    expect(mockGetPriceHistory).not.toHaveBeenCalled()
  })

  test('getPriceHistory throws -> 500 with well-formed ApiResponse error, not an unhandled rejection', async () => {
    mockGetPriceHistory.mockRejectedValue(new Error('connection refused'))
    const res = await GET(makeRequest('https://example.com/api/price-history?gameId=42&range=3M'))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json).toEqual({ success: false, error: 'Wystąpił błąd. Spróbuj ponownie.' })
  })
})
