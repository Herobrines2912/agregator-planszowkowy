import { describe, test, expect, vi, beforeEach } from 'vitest'
import {
  subscribeAlert,
  confirmAlert,
  getAlertSummaryByToken,
  findActiveAlertsMissingConsent,
} from './alerts'
import { priceAlerts, consentLog, emailSuppressions } from '@/db/schema'
import { and, eq } from 'drizzle-orm'

type Chain = {
  from: ReturnType<typeof vi.fn>
  innerJoin: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  values: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  onConflictDoUpdate: ReturnType<typeof vi.fn>
  returning: ReturnType<typeof vi.fn>
  then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>
}

// Extracts the literal text of a drizzle sql`...` fragment's StringChunks, ignoring
// column/param chunks — avoids JSON.stringify's circular-reference crash on PgTable refs.
// Recurses into nested fragments: a sql`` interpolated into another sql`` keeps its own
// queryChunks, so without this a composed condition reads back as an empty gap.
function sqlText(value: unknown): string {
  const chunks = (value as { queryChunks?: unknown[] } | undefined)?.queryChunks ?? []
  return chunks
    .map(c => {
      const chunk = c as { value?: unknown; queryChunks?: unknown[] } | null
      if (Array.isArray(chunk?.value)) return chunk.value.join('')
      if (chunk?.queryChunks) return sqlText(chunk)
      return ''
    })
    .join(' ')
}

// Values interpolated into a drizzle sql`...` fragment, in order. They sit in queryChunks as
// bare primitives (Param wrapping happens later, at query-build time), whereas literal text,
// tables and columns are all objects — so keeping the primitives isolates the bound values.
// Nested fragments are flattened for the same reason as above.
function sqlParams(value: unknown): unknown[] {
  const chunks = (value as { queryChunks?: unknown[] } | undefined)?.queryChunks ?? []
  return chunks.flatMap(c => {
    if (c === null || typeof c !== 'object') return [c]
    if ((c as { queryChunks?: unknown[] }).queryChunks) return sqlParams(c)
    return []
  })
}

function chain(result: unknown): Chain {
  const obj: Partial<Chain> = {}
  obj.from = vi.fn(() => obj as Chain)
  obj.innerJoin = vi.fn(() => obj as Chain)
  obj.where = vi.fn(() => obj as Chain)
  obj.limit = vi.fn(() => Promise.resolve(result))
  obj.values = vi.fn(() => obj as Chain)
  obj.set = vi.fn(() => obj as Chain)
  obj.onConflictDoUpdate = vi.fn(() => obj as Chain)
  obj.returning = vi.fn(() => Promise.resolve(result))
  obj.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return obj as Chain
}

const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockExecute = vi.fn()

vi.mock('@/db/index', () => ({
  getDb: () => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    execute: mockExecute,
  }),
}))

beforeEach(() => {
  mockSelect.mockReset()
  mockInsert.mockReset()
  mockUpdate.mockReset()
  mockExecute.mockReset()
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

  test('existing alert (conflict): threshold always updated; token rotates only when the current one is unusable', async () => {
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
      'token_issued_at',
      'type_b_enabled',
    ])
    // target_price/type_b_enabled are plain pass-through values (unconditional update)
    expect(conflictArg.set.target_price).toBe('89.99')
    expect(conflictArg.set.type_b_enabled).toBe(true)

    // status/confirmation_token/token_issued_at are conditional CASE fragments, not plain
    // values. The condition has to cover BOTH dead ends: a cancelled alert, and a pending one
    // whose token has aged out — either would otherwise keep a token confirmAlert always
    // rejects, leaving the user unable to opt in no matter how often they resubmit.
    for (const key of ['status', 'confirmation_token', 'token_issued_at']) {
      const fragment = sqlText(conflictArg.set[key])
      expect(fragment, `${key} must be conditional on cancelled`).toContain('cancelled')
      expect(fragment, `${key} must also cover an aged-out pending token`).toContain('pending_doi')
      expect(fragment, `${key} must compare against the token issue time`).toContain('interval')
    }
    // The 48h window is bound as a parameter so the constant lives only in TypeScript and
    // cannot drift from the one confirmAlert enforces.
    expect(sqlParams(conflictArg.set.token_issued_at)).toContain(48 * 60 * 60 * 1000)
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

describe('confirmAlert', () => {
  const HOUR = 60 * 60 * 1000
  const IP_HASH = 'ip-hash-confirm'

  const makeRow = (overrides: Record<string, unknown> = {}) => ({
    id: 7,
    status: 'pending_doi',
    tokenIssuedAt: new Date(Date.now() - HOUR),
    gameSlug: 'brass-birmingham',
    ...overrides,
  })

  /** The activation statement, as passed to db.execute(). */
  const activationSql = () => mockExecute.mock.calls[0][0]

  test('valid pending_doi token within 48h: activates and records consent in a single atomic statement', async () => {
    const selectChain = chain([makeRow()])
    mockSelect.mockReturnValueOnce(selectChain)
    mockExecute.mockResolvedValue({ rows: [{ id: 99 }] })

    const result = await confirmAlert('tok-valid', IP_HASH)

    expect(result).toEqual({ outcome: 'confirmed' })
    // The lookup must be scoped to the supplied token, not just "some row" — the chain mock
    // returns canned data regardless of the query, so the predicate is asserted explicitly.
    expect(selectChain.where).toHaveBeenCalledWith(eq(priceAlerts.confirmation_token, 'tok-valid'))

    // The activation must stay ONE statement: two would leave a window where the alert is
    // active with no consent record, and consent_log is append-only so it could never be
    // repaired. Separate update()/insert() calls are the regression this guards against.
    expect(mockExecute).toHaveBeenCalledTimes(1)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()

    const text = sqlText(activationSql())
    expect(text).toContain('WITH updated AS')
    expect(text).toContain("SET status = 'active'")
    // The status re-check is what makes a concurrent second click a no-op rather than a
    // duplicate consent row.
    expect(text).toContain("= 'pending_doi'")
    expect(text).toContain("'opt_in_confirmed'")
    // The consent row draws its email_hash from the UPDATE's RETURNING, so it can only exist
    // for a row this statement actually activated.
    expect(text).toContain('SELECT email_hash')
    expect(text).toContain('FROM updated')
    expect(sqlParams(activationSql())).toEqual([7, IP_HASH])
  })

  test('unknown token: expired with gameSlug null (never leaks whether a token nearly matched), no writes', async () => {
    mockSelect.mockReturnValueOnce(chain([]))

    const result = await confirmAlert('tok-nope', IP_HASH)

    expect(result).toEqual({ outcome: 'expired', gameSlug: null })
    expect(mockExecute).not.toHaveBeenCalled()
  })

  test('already active alert: already_confirmed, no second consent_log row (idempotent replay of the email link)', async () => {
    mockSelect.mockReturnValueOnce(chain([makeRow({ status: 'active' })]))

    const result = await confirmAlert('tok-active', IP_HASH)

    expect(result).toEqual({ outcome: 'already_confirmed' })
    expect(mockExecute).not.toHaveBeenCalled()
  })

  test('cancelled alert: expired with the game slug — a stale link must never resurrect an unsubscribed user', async () => {
    mockSelect.mockReturnValueOnce(chain([makeRow({ status: 'cancelled' })]))

    const result = await confirmAlert('tok-cancelled', IP_HASH)

    expect(result).toEqual({ outcome: 'expired', gameSlug: 'brass-birmingham' })
    expect(mockExecute).not.toHaveBeenCalled()
  })

  test('pending_doi older than 48h: expired with the game slug, no writes', async () => {
    mockSelect.mockReturnValueOnce(chain([makeRow({ tokenIssuedAt: new Date(Date.now() - 49 * HOUR) })]))

    const result = await confirmAlert('tok-old', IP_HASH)

    expect(result).toEqual({ outcome: 'expired', gameSlug: 'brass-birmingham' })
    expect(mockExecute).not.toHaveBeenCalled()
  })

  // Both the row timestamp and the implementation's own Date.now() have to be measured
  // against the same instant. On real timers the millisecond that elapses between them
  // pushes the row past the boundary, so the assertion flips depending on machine speed.
  test('pending_doi exactly at the 48h boundary is still accepted', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'))
    try {
      mockSelect.mockReturnValueOnce(chain([makeRow({ tokenIssuedAt: new Date(Date.now() - 48 * HOUR) })]))
      mockExecute.mockResolvedValue({ rows: [{ id: 99 }] })

      const result = await confirmAlert('tok-boundary', IP_HASH)

      expect(result).toEqual({ outcome: 'confirmed' })
    } finally {
      vi.useRealTimers()
    }
  })

  test('pending_doi one millisecond past the 48h boundary is expired', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-21T12:00:00.000Z'))
    try {
      mockSelect.mockReturnValueOnce(
        chain([makeRow({ tokenIssuedAt: new Date(Date.now() - 48 * HOUR - 1) })]),
      )

      const result = await confirmAlert('tok-just-expired', IP_HASH)

      expect(result).toEqual({ outcome: 'expired', gameSlug: 'brass-birmingham' })
      expect(mockExecute).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  // A row created long ago but re-subscribed recently must confirm: the TTL follows the token,
  // not the row. Measuring from created_at is what made a re-issued token arrive dead on
  // arrival, with no way out for the user however many times they resubmitted.
  test('old alert re-subscribed recently: the freshly issued token is accepted', async () => {
    mockSelect.mockReturnValueOnce(
      chain([
        makeRow({
          createdAt: new Date(Date.now() - 90 * 24 * HOUR),
          tokenIssuedAt: new Date(Date.now() - HOUR),
        }),
      ]),
    )
    mockExecute.mockResolvedValue({ rows: [{ id: 99 }] })

    expect(await confirmAlert('tok-reissued', IP_HASH)).toEqual({ outcome: 'confirmed' })
  })

  test('concurrent double-confirm: the guarded UPDATE matches no row, so the statement inserts no consent row', async () => {
    mockSelect.mockReturnValueOnce(chain([makeRow()]))
    // Another request flipped the row to active first, so the CTE's UPDATE matches nothing and
    // the INSERT selecting from it produces no row either — hence zero rows returned.
    mockExecute.mockResolvedValue({ rows: [] })

    const result = await confirmAlert('tok-race', IP_HASH)

    expect(result).toEqual({ outcome: 'already_confirmed' })
  })

  test('activation failure: rethrows, logs, and reports no confirmation (alert stays pending_doi for a clean retry)', async () => {
    mockSelect.mockReturnValueOnce(chain([makeRow()]))
    const dbError = new Error('connection reset')
    mockExecute.mockRejectedValue(dbError)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(confirmAlert('tok-boom', IP_HASH)).rejects.toThrow(dbError)
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})

describe('findActiveAlertsMissingConsent', () => {
  test('returns the ids of active alerts that have no opt_in_confirmed entry', async () => {
    mockExecute.mockResolvedValue({ rows: [{ id: 11 }, { id: 12 }] })

    expect(await findActiveAlertsMissingConsent()).toEqual([11, 12])

    const text = sqlText(mockExecute.mock.calls[0][0])
    expect(text).toContain("alert.status = 'active'")
    expect(text).toContain('NOT EXISTS')
    expect(text).toContain("entry.action = 'opt_in_confirmed'")
    expect(text).toContain('entry.token_id = alert.id')
  })

  test('returns an empty array when the consent invariant holds', async () => {
    mockExecute.mockResolvedValue({ rows: [] })

    expect(await findActiveAlertsMissingConsent()).toEqual([])
  })
})

describe('getAlertSummaryByToken', () => {
  test('active alert: returns the game name, slug and target price', async () => {
    const selectChain = chain([
      { gameName: 'Brass: Birmingham', gameSlug: 'brass-birmingham', targetPrice: '89.99' },
    ])
    mockSelect.mockReturnValueOnce(selectChain)

    const summary = await getAlertSummaryByToken('tok-active')

    expect(summary).toEqual({
      gameName: 'Brass: Birmingham',
      gameSlug: 'brass-birmingham',
      targetPrice: '89.99',
    })
    // The status='active' half of this predicate is the only thing keeping a pending_doi or
    // cancelled subscriber's game and price from being echoed back on the confirmed page.
    expect(selectChain.where).toHaveBeenCalledWith(
      and(eq(priceAlerts.confirmation_token, 'tok-active'), eq(priceAlerts.status, 'active')),
    )
  })

  test('no matching active alert: returns null and performs no writes', async () => {
    mockSelect.mockReturnValueOnce(chain([]))

    const summary = await getAlertSummaryByToken('tok-unknown')

    expect(summary).toBeNull()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
