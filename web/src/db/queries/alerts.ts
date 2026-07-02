import { createHash, randomBytes } from 'crypto'
import { getDb } from '@/db/index'
import { consentLog, emailSuppressions, games, priceAlerts } from '@/db/schema'
import { eq } from 'drizzle-orm'

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

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export async function subscribeAlert(input: SubscribeAlertInput): Promise<SubscribeAlertResult> {
  const db = getDb()
  const emailHash = sha256Hex(input.email.toLowerCase())

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
    .where(eq(emailSuppressions.email, input.email))
    .limit(1)
  if (suppressed.length > 0) return { outcome: 'suppressed' }

  const confirmationToken = randomBytes(32).toString('hex')

  const [alert] = await db
    .insert(priceAlerts)
    .values({
      game_id: game.id,
      email: input.email,
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
