import { randomBytes } from 'crypto'
import { getDb } from '@/db/index'
import { consentLog, emailSuppressions, games, priceAlerts } from '@/db/schema'
import { sha256Hex } from '@/lib/crypto'
import { assertNever } from '@/lib/utils'
import { and, eq, sql } from 'drizzle-orm'

/** Confirmation links stay valid for 48h — the window promised to the user in the DOI email. */
const CONFIRMATION_TOKEN_TTL_MS = 48 * 60 * 60 * 1000

export type SubscribeAlertInput = {
  email: string
  targetPrice: string
  typeBEnabled: boolean
  gameSlug: string
  ipHash: string
}

export type SubscribeAlertResult =
  | { outcome: 'subscribed' }
  | { outcome: 'suppressed' }
  | { outcome: 'unknown_game' }

export async function subscribeAlert(input: SubscribeAlertInput): Promise<SubscribeAlertResult> {
  const db = getDb()
  // Normalized once and reused everywhere an email identity is compared or stored
  // (hash, suppression lookup, price_alerts.email) so price_alerts.email and
  // email_suppressions.email stay on the same canonical casing — the exact-match
  // join `pa.email = es.email` (architecture.md L-2) depends on both sides using
  // the same normalization, not on skipping normalization.
  const normalizedEmail = input.email.toLowerCase()
  const emailHash = sha256Hex(normalizedEmail)

  const gameRows = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.slug, input.gameSlug))
    .limit(1)
  const game = gameRows[0]
  if (!game) return { outcome: 'unknown_game' }

  const suppressed = await db
    .select({ id: emailSuppressions.id })
    .from(emailSuppressions)
    .where(eq(emailSuppressions.email, normalizedEmail))
    .limit(1)
  // Suppressed and subscribed paths return an identical response body (anti-enumeration,
  // AC-3), but this path skips the two writes below and is measurably faster. Accepted
  // residual risk: exploiting the timing gap requires many repeated requests, and the
  // endpoint has no rate limiting yet to make that practical.
  if (suppressed.length > 0) return { outcome: 'suppressed' }

  const confirmationToken = randomBytes(32).toString('hex')

  // A re-subscribe gets a fresh token only when the existing one can no longer be used: the
  // alert was cancelled, or its pending token has aged out of the 48h window. Both cases are
  // otherwise dead ends — the row keeps a token that confirmAlert will always reject, so the
  // user could never complete the opt-in no matter how often they resubmit.
  //
  // A still-valid pending token is deliberately left alone. Rotating it on every threshold
  // tweak would silently kill the link in the email the user may already have open. An 'active'
  // alert is never touched at all (AC-4: resetting a confirmed subscriber to pending_doi would
  // stop their notifications). Unqualified column refs in an ON CONFLICT DO UPDATE SET clause
  // read the pre-conflict (existing) row, not the values being inserted.
  const tokenIsUnusable = sql`(
    ${priceAlerts.status} = 'cancelled'
    OR (
      ${priceAlerts.status} = 'pending_doi'
      AND ${priceAlerts.token_issued_at} < now() - ${CONFIRMATION_TOKEN_TTL_MS} * interval '1 millisecond'
    )
  )`

  const [alert] = await db
    .insert(priceAlerts)
    .values({
      game_id: game.id,
      email: normalizedEmail,
      email_hash: emailHash,
      alert_type: 'price_drop',
      type_b_enabled: input.typeBEnabled,
      target_price: input.targetPrice,
      status: 'pending_doi',
      confirmation_token: confirmationToken,
    })
    .onConflictDoUpdate({
      target: [priceAlerts.email_hash, priceAlerts.game_id],
      set: {
        target_price: input.targetPrice,
        type_b_enabled: input.typeBEnabled,
        status: sql`CASE WHEN ${tokenIsUnusable} THEN 'pending_doi' ELSE ${priceAlerts.status} END`,
        confirmation_token: sql`CASE WHEN ${tokenIsUnusable} THEN ${confirmationToken} ELSE ${priceAlerts.confirmation_token} END`,
        // The new token starts its own 48h clock; without this it would inherit the old one's
        // and arrive already expired.
        token_issued_at: sql`CASE WHEN ${tokenIsUnusable} THEN now() ELSE ${priceAlerts.token_issued_at} END`,
        // A revived row goes back to pending_doi, so the confirmation timestamp of its previous
        // life must go with it — otherwise an unconfirmed alert carries proof of a confirmation
        // that no longer applies, which is exactly the kind of claim consent_log exists to keep
        // honest.
        confirmed_at: sql`CASE WHEN ${tokenIsUnusable} THEN NULL ELSE ${priceAlerts.confirmed_at} END`,
      },
    })
    .returning({ id: priceAlerts.id })

  if (!alert) throw new Error('subscribeAlert: price_alerts upsert returned no row')

  try {
    await db.insert(consentLog).values({
      email_hash: emailHash,
      action: 'opt_in_requested',
      source: 'user',
      ip_hash: input.ipHash,
      token_id: alert.id,
    })
  } catch (err) {
    console.error(
      `[subscribeAlert] consent_log write failed for price_alerts.id=${alert.id} — RODO audit trail is now inconsistent`,
      err,
    )
    throw err
  }

  return { outcome: 'subscribed' }
}

export type ConfirmAlertResult =
  | { outcome: 'confirmed' }
  | { outcome: 'already_confirmed' }
  | { outcome: 'expired'; gameSlug: string | null }

export async function confirmAlert(token: string, ipHash: string): Promise<ConfirmAlertResult> {
  const db = getDb()

  const rows = await db
    .select({
      id: priceAlerts.id,
      status: priceAlerts.status,
      tokenIssuedAt: priceAlerts.token_issued_at,
      gameSlug: games.slug,
    })
    .from(priceAlerts)
    .innerJoin(games, eq(priceAlerts.game_id, games.id))
    .where(eq(priceAlerts.confirmation_token, token))
    .limit(1)

  const alert = rows[0]
  // An unknown token dead-ends like an expired one, just without a slug — there is no row to
  // take one from. The resulting difference on /alerts/expired is an accepted trade, not a
  // leak: reaching it at all requires already holding a 32-byte random token, and a live one
  // reveals more via /alerts/confirmed anyway. See the story's Dev Notes.
  if (!alert) return { outcome: 'expired', gameSlug: null }

  switch (alert.status) {
    case 'active':
      // Idempotent replay of the email link, not an error: the alert is already on and
      // the original opt_in_confirmed entry already exists, so nothing is written.
      return { outcome: 'already_confirmed' }

    case 'cancelled':
      // The user explicitly unsubscribed. Replaying an old confirm link is the one path
      // that could silently resurrect them, so it dead-ends like an expired token.
      return { outcome: 'expired', gameSlug: alert.gameSlug }

    case 'pending_doi': {
      // Measured from when this token was issued, not when the row was created — a re-subscribe
      // rotates the token and restarts this clock (see subscribeAlert).
      if (Date.now() - alert.tokenIssuedAt.getTime() > CONFIRMATION_TOKEN_TTL_MS) {
        return { outcome: 'expired', gameSlug: alert.gameSlug }
      }

      // Activation and its consent_log entry are ONE statement on purpose. The neon-http
      // driver has no transactions (db.transaction() throws), so two statements would leave a
      // window where the alert is active with no proof of consent — and because consent_log is
      // append-only (CLAUDE.md, architecture L-4) that gap could never be repaired afterwards.
      // A single data-modifying CTE is atomic by definition: both rows land or neither does,
      // and a failure leaves the alert pending_doi so the next click retries cleanly.
      //
      // The same statement also settles concurrency. The UPDATE re-checks the status, takes the
      // row lock and re-evaluates its WHERE after a competing commit; the loser matches no row,
      // `updated` comes back empty, and the INSERT selecting from it writes nothing. No separate
      // guard is needed. See docs/solutions/architecture/rodo-consent-integrity.md.
      let confirmed
      try {
        confirmed = await db.execute(sql`
          WITH updated AS (
            UPDATE ${priceAlerts}
            SET status = 'active', confirmed_at = now()
            WHERE ${priceAlerts.id} = ${alert.id} AND ${priceAlerts.status} = 'pending_doi'
            RETURNING id, email_hash
          )
          INSERT INTO ${consentLog} (email_hash, action, source, ip_hash, token_id)
          SELECT email_hash, 'opt_in_confirmed', 'user', ${ipHash}, id FROM updated
          RETURNING id
        `)
      } catch (err) {
        console.error(
          `[confirmAlert] activation failed for price_alerts.id=${alert.id} — alert left pending_doi, no consent recorded`,
          err,
        )
        throw err
      }

      // Zero rows means the UPDATE matched nothing, i.e. another request confirmed this alert
      // first. Idempotent replay, not an error.
      if (confirmed.rows.length === 0) return { outcome: 'already_confirmed' }

      return { outcome: 'confirmed' }
    }

    default:
      return assertNever(alert.status)
  }
}

/**
 * Reconciliation check for the RODO invariant in architecture L-4: an active alert must always
 * have a matching opt_in_confirmed entry proving the subscriber consented.
 *
 * This is the safety layer for the paired write in confirmAlert — a detector, not a second
 * writer. Adding another INSERT "just in case" would duplicate rows in an append-only table on
 * every successful confirmation; a single atomic statement cannot leave half a write behind, so
 * there is nothing for a compensating write to catch. What IS worth having is proof of that,
 * which is what this query provides.
 *
 * Expected to return an empty array. A non-empty result means some path activated an alert
 * without recording consent and needs investigating — it cannot be auto-repaired, because a
 * consent entry written after the fact would not be evidence of anything.
 */
export async function findActiveAlertsMissingConsent(): Promise<number[]> {
  const db = getDb()

  const result = await db.execute<{ id: number }>(sql`
    SELECT alert.id
    FROM ${priceAlerts} AS alert
    WHERE alert.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM ${consentLog} AS entry
        WHERE entry.token_id = alert.id AND entry.action = 'opt_in_confirmed'
      )
    ORDER BY alert.id
  `)

  return result.rows.map((row) => row.id)
}

export type AlertSummary = {
  gameName: string
  gameSlug: string
  targetPrice: string | null
}

/**
 * Read-only lookup backing the /alerts/confirmed page, which reloads from an email client
 * with zero client state and only the token to go on. Scoped to active alerts so a token
 * that has not been confirmed (or was cancelled) shows nothing game-specific.
 */
export async function getAlertSummaryByToken(token: string): Promise<AlertSummary | null> {
  const db = getDb()

  const rows = await db
    .select({
      gameName: games.name,
      gameSlug: games.slug,
      targetPrice: priceAlerts.target_price,
    })
    .from(priceAlerts)
    .innerJoin(games, eq(priceAlerts.game_id, games.id))
    .where(and(eq(priceAlerts.confirmation_token, token), eq(priceAlerts.status, 'active')))
    .limit(1)

  return rows[0] ?? null
}
