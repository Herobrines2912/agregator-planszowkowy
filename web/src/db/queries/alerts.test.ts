import { describe, test, expect, vi, beforeEach } from 'vitest'
import { subscribeAlert, sha256Hex } from './alerts'
import { priceAlerts, consentLog } from '@/db/schema'

type Chain = {
  from: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  values: ReturnType<typeof vi.fn>
  onConflictDoUpdate: ReturnType<typeof vi.fn>
  returning: ReturnType<typeof vi.fn>
  then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>
}

function chain(result: unknown): Chain {
  const obj: Partial<Chain> = {}
  obj.from = vi.fn(() => obj as Chain)
  obj.where = vi.fn(() => obj as Chain)
  obj.limit = vi.fn(() => Promise.resolve(result))
  obj.values = vi.fn(() => obj as Chain)
  obj.onConflictDoUpdate = vi.fn(() => obj as Chain)
  obj.returning = vi.fn(() => Promise.resolve(result))
  obj.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return obj as Chain
}

const mockSelect = vi.fn()
const mockInsert = vi.fn()

vi.mock('@/db/index', () => ({
  getDb: () => ({
    select: mockSelect,
    insert: mockInsert,
  }),
}))

beforeEach(() => {
  mockSelect.mockReset()
  mockInsert.mockReset()
})

describe('sha256Hex', () => {
  test('produces a stable, correct SHA-256 hex digest', () => {
    expect(sha256Hex('test@example.com')).toBe(
      '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b',
    )
    expect(sha256Hex('test@example.com')).toBe(sha256Hex('test@example.com'))
  })
})

describe('subscribeAlert', () => {
  const validInput = {
    email: 'user@example.com',
    targetPrice: '89.99',
    typeBEnabled: true,
    gameSlug: 'brass-birmingham',
    ipHash: 'ip-hash-abc',
  }

  test('new alert: inserts price_alerts with status=pending_doi and one consent_log row (action=opt_in_requested)', async () => {
    mockSelect
      .mockReturnValueOnce(chain([{ id: 42 }])) // games lookup
      .mockReturnValueOnce(chain([])) // email_suppressions lookup — no hit
    mockInsert.mockImplementation((table: unknown) => {
      if (table === priceAlerts) return chain([{ id: 7 }])
      if (table === consentLog) return chain(undefined)
      throw new Error(`unexpected insert table: ${String(table)}`)
    })

    const result = await subscribeAlert(validInput)

    expect(result).toEqual({ outcome: 'subscribed' })
    expect(mockInsert).toHaveBeenCalledWith(priceAlerts)
    expect(mockInsert).toHaveBeenCalledWith(consentLog)

    // Verify the values passed into the price_alerts insert
    const priceAlertsCallIndex = mockInsert.mock.calls.findIndex(c => c[0] === priceAlerts)
    const priceAlertsChainObj = mockInsert.mock.results[priceAlertsCallIndex].value as Chain
    expect(priceAlertsChainObj.values).toHaveBeenCalledWith(
      expect.objectContaining({
        game_id: 42,
        status: 'pending_doi',
        target_price: '89.99',
        type_b_enabled: true,
      }),
    )

    const consentLogCallIndex = mockInsert.mock.calls.findIndex(c => c[0] === consentLog)
    const consentLogChainObj = mockInsert.mock.results[consentLogCallIndex].value as Chain
    expect(consentLogChainObj.values).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'opt_in_requested',
        source: 'user',
        ip_hash: 'ip-hash-abc',
        token_id: 7,
      }),
    )
  })

  test('existing alert (conflict): onConflictDoUpdate only sets target_price/type_b_enabled — never status or confirmation_token', async () => {
    mockSelect.mockReturnValueOnce(chain([{ id: 42 }])).mockReturnValueOnce(chain([]))
    mockInsert.mockImplementation((table: unknown) => {
      if (table === priceAlerts) return chain([{ id: 7 }])
      return chain(undefined)
    })

    await subscribeAlert(validInput)

    const priceAlertsCallIndex = mockInsert.mock.calls.findIndex(c => c[0] === priceAlerts)
    const priceAlertsChainObj = mockInsert.mock.results[priceAlertsCallIndex].value as Chain
    expect(priceAlertsChainObj.onConflictDoUpdate).toHaveBeenCalledTimes(1)
    const conflictArg = priceAlertsChainObj.onConflictDoUpdate.mock.calls[0][0] as { set: Record<string, unknown> }
    expect(Object.keys(conflictArg.set).sort()).toEqual(['target_price', 'type_b_enabled'])
  })

  test('email_suppressions hit: returns suppressed, zero writes to price_alerts or consent_log', async () => {
    mockSelect
      .mockReturnValueOnce(chain([{ id: 42 }])) // games lookup
      .mockReturnValueOnce(chain([{ id: 1 }])) // suppression hit

    const result = await subscribeAlert(validInput)

    expect(result).toEqual({ outcome: 'suppressed' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  test('unknown gameSlug: returns unknown_game, no suppression check, no writes', async () => {
    mockSelect.mockReturnValueOnce(chain([])) // games lookup — no match

    const result = await subscribeAlert(validInput)

    expect(result).toEqual({ outcome: 'unknown_game' })
    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
