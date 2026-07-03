import { subscribeAlert, type SubscribeAlertResult } from '@/db/queries/alerts'
import { sha256Hex } from '@/lib/crypto'
import { assertNever } from '@/lib/utils'
import { CONTROL_CHAR_RE, EMAIL_RE, MAX_NUMERIC_10_2 } from '@/lib/validation'
import type { ApiResponse } from '@/types/api'
import type { NextRequest } from 'next/server'

const SUCCESS_MESSAGE = 'Sprawdź skrzynkę i potwierdź otrzymywanie powiadomień'

type SubscribeRequestBody = {
  email?: unknown
  targetPrice?: unknown
  typeBEnabled?: unknown
  consentGiven?: unknown
  ageConfirmed?: unknown
  gameSlug?: unknown
}

function errorResponse(error: string, status: number) {
  const body: ApiResponse<never> = { success: false, error }
  return Response.json(body, { status })
}

export async function POST(request: NextRequest) {
  let payload: SubscribeRequestBody
  try {
    payload = await request.json()
  } catch {
    return errorResponse('Nieprawidłowe dane żądania', 400)
  }

  const { email, targetPrice, typeBEnabled, consentGiven, ageConfirmed, gameSlug } = payload

  if (typeof email !== 'string' || CONTROL_CHAR_RE.test(email) || !EMAIL_RE.test(email)) {
    return errorResponse('Nieprawidłowy adres e-mail', 400)
  }
  if (consentGiven !== true) {
    return errorResponse('Zgoda na przetwarzanie danych jest wymagana', 400)
  }
  if (ageConfirmed !== true) {
    return errorResponse('Wymagane potwierdzenie wieku (16+)', 400)
  }
  const priceValue = typeof targetPrice === 'string' ? Number(targetPrice) : NaN
  if (
    typeof targetPrice !== 'string' ||
    !Number.isFinite(priceValue) ||
    priceValue <= 0 ||
    priceValue > MAX_NUMERIC_10_2
  ) {
    return errorResponse('Nieprawidłowa cena progowa', 400)
  }
  if (typeof gameSlug !== 'string' || gameSlug.length === 0) {
    return errorResponse('Nieprawidłowa gra', 400)
  }

  // x-forwarded-for is client-suppliable and not validated against a trusted proxy hop;
  // ip_hash is written into the append-only consent_log purely for RODO audit context,
  // never for access control or rate limiting, so a spoofed value has low impact, but
  // it means this field is best-effort, not authoritative evidence.
  const ipRaw = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = ipRaw && ipRaw.length > 0 ? ipRaw : 'unknown'
  const ipHash = sha256Hex(ip)

  try {
    const result: SubscribeAlertResult = await subscribeAlert({
      email,
      targetPrice,
      typeBEnabled: typeBEnabled === true,
      gameSlug,
      ipHash,
    })

    switch (result.outcome) {
      case 'unknown_game':
        return errorResponse('Nieprawidłowa gra', 400)
      case 'suppressed':
      case 'subscribed': {
        const body: ApiResponse<{ message: string }> = { success: true, data: { message: SUCCESS_MESSAGE } }
        return Response.json(body)
      }
      default:
        return assertNever(result)
    }
  } catch (err) {
    console.error('[POST /api/alerts/subscribe] subscribeAlert failed', err)
    return errorResponse('Wystąpił błąd. Spróbuj ponownie.', 500)
  }
}
