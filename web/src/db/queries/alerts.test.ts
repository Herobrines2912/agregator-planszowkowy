import { describe, test, expect, vi, beforeEach } from 'vitest'
import { subscribeAlert } from './alerts'
import { priceAlerts, consentLog, emailSuppressions } from '@/db/schema'
import { eq } from 'drizzle-orm'

type Chain = {
  from: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  values: ReturnType<typeof vi.fn>
  onConflictDoUpdate: ReturnType<typeof vi.fn>
  returning: ReturnType<typeof vi.fn>
  then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>
}

// Extracts the literal text of a drizzle sql`...` fragment's StringChunks, ignoring
// column/param chunks — avoids JSON.stringify's circular-reference crash on PgTable refs.
function sqlText(value: unknown): string {
  const chunks = (value as { queryChunks?: { value?: unknown }[] } | undefined)?.queryChunks ?? []
  return chunks
    .map(c => (Array.isArray(c.value) ? c.value.join('') : ''))
    .join(' ')
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

  test('existing alert (conflict): target_price/type_b_enabled always updated; status/confirmation_token only change if the existing row was cancelled', async () => {
    mockSelect.mockReturnValueOnce(chain([{ id: 42 }])).mockReturnValueOnce(chain([]))
    mockInsert.mockImplementation((table: unknown) => {
      if (table === priceAlerts) return chain([{ id: 7 }])
      return chain(undefined)
    })

    await subscribeAlert(validInput)

    const priceAlertsCallIndex = mockInsert.mock.calls.findIndex(c => c[0] === priceAlerts)
    const priceAlertsChainObj = mockInsert.mock.results[priceAlertsCallIndex].value as Chain
    expect(priceAlertsChainObj.onConflictDoUpdate).toHaveBeenCalledTimes(1)
    const conflictArg = priceAlertsChainObj.onConflictDoUpdate.mock.calls[0][0] as {
      set: Record<string, unknown>
    }
    expect(Object.keys(conflictArg.set).sort()).toEqual([
      'confirmation_token',
      'status',
      'target_price',
      'type_b_enabled',
    ])
    // target_price/type_b_enabled are plain pass-through values (unconditional update)
    expect(conflictArg.set.target_price).toBe('89.99')
    expect(conflictArg.set.type_b_enabled).toBe(true)
    // status/confirmation_token are conditional SQL fragments (CASE ... WHEN existing status
    // = 'cancelled'), not plain values — the whole point is they only take effect for a
    // cancelled row, leaving an active/pending_doi row's status/token untouched (AC-4).
    const statusSql = sqlText(conflictArg.set.status)
    expect(statusSql).toContain('cancelled')
    expect(statusSql).toContain('pending_doi')
    const tokenSql = sqlText(conflictArg.set.confirmation_token)
    expect(tokenSql).toContain('cancelled')
  })

  test('email_suppressions hit: returns suppressed, zero writes to price_alerts or consent_log', async () => {
    mockSelect
      .mockReturnValueOnce(chain([{ id: 42 }])) // games lookup
      .mockReturnValueOnce(chain([{ id: 1 }])) // suppression hit

    const result = await subscribeAlert(validInput)

    expect(result).toEqual({ outcome: 'suppressed' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  test('consent_log insert failure: rethrows and does not report success', async () => {
    mockSelect.mockReturnValueOnce(chain([{ id: 42 }])).mockReturnValueOnce(chain([]))
    const consentLogError = new Error('consent_log insert failed')
    mockInsert.mockImplementation((table: unknown) => {
      if (table === priceAlerts) return chain([{ id: 7 }])
      const failingChain = chain(undefined)
      failingChain.then = (resolve, reject) => Promise.reject(consentLogError).then(resolve, reject)
      return failingChain
    })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(subscribeAlert(validInput)).rejects.toThrow(consentLogError)
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  test('mixed-case email is normalized consistently: suppression lookup and price_alerts.email both use the lowercased form', async () => {
    const suppressionChain = chain([])
    mockSelect
      .mockReturnValueOnce(chain([{ id: 42 }])) // games lookup
      .mockReturnValueOnce(suppressionChain) // email_suppressions lookup
    mockInsert.mockImplementation((table: unknown) => {
      if (table === priceAlerts) return chain([{ id: 7 }])
      return chain(undefined)
    })

    await subscribeAlert({ ...validInput, email: 'User@Example.com' })

    expect(suppressionChain.where).toHaveBeenCalledWith(eq(emailSuppressions.email, 'user@example.com'))

    const priceAlertsCallIndex = mockInsert.mock.calls.findIndex(c => c[0] === priceAlerts)
    const priceAlertsChainObj = mockInsert.mock.results[priceAlertsCallIndex].value as Chain
    expect(priceAlertsChainObj.values).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com' }),
    )
  })

  test('unknown gameSlug: returns unknown_game, no suppression check, no writes', async () => {
    mockSelect.mockReturnValueOnce(chain([])) // games lookup — no match

    const result = await subscribeAlert(validInput)

    expect(result).toEqual({ outcome: 'unknown_game' })
    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
