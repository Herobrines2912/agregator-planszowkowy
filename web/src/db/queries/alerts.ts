import { randomBytes } from 'crypto'
import { getDb } from '@/db/index'
import { consentLog, emailSuppressions, games, priceAlerts } from '@/db/schema'
import { sha256Hex } from '@/lib/crypto'
import { eq, sql } from 'drizzle-orm'

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
        // An 'active' or still-'pending_doi' alert keeps its status/token untouched on a
        // threshold update (AC-4: resetting a confirmed subscriber to pending_doi on every
        // price tweak would silently stop their notifications). A 'cancelled' alert is
        // different — the user explicitly opted out, so resubmitting the form is a fresh
        // subscribe intent and must be treated like one: reactivate to pending_doi with a
        // new token. Unqualified column refs in an ON CONFLICT DO UPDATE SET clause read
        // the pre-conflict (existing) row, not the values being inserted.
        status: sql`CASE WHEN ${priceAlerts.status} = 'cancelled' THEN 'pending_doi' ELSE ${priceAlerts.status} END`,
        confirmation_token: sql`CASE WHEN ${priceAlerts.status} = 'cancelled' THEN ${confirmationToken} ELSE ${priceAlerts.confirmation_token} END`,
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
