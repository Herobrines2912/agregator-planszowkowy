import { sha256Hex, subscribeAlert } from '@/db/queries/alerts'
import type { ApiResponse } from '@/types/api'
import type { NextRequest } from 'next/server'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
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

  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return errorResponse('Nieprawidłowy adres e-mail', 400)
  }
  if (consentGiven !== true) {
    return errorResponse('Zgoda na przetwarzanie danych jest wymagana', 400)
  }
  if (ageConfirmed !== true) {
    return errorResponse('Wymagane potwierdzenie wieku (16+)', 400)
  }
  const priceValue = typeof targetPrice === 'string' ? Number(targetPrice) : NaN
  if (typeof targetPrice !== 'string' || !Number.isFinite(priceValue) || priceValue <= 0) {
    return errorResponse('Nieprawidłowa cena progowa', 400)
  }
  if (typeof gameSlug !== 'string' || gameSlug.length === 0) {
    return errorResponse('Nieprawidłowa gra', 400)
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const ipHash = sha256Hex(ip)

  const result = await subscribeAlert({
    email,
    targetPrice,
    typeBEnabled: typeBEnabled === true,
    gameSlug,
    ipHash,
  })

  if (result.outcome === 'unknown_game') {
    return errorResponse('Nieprawidłowa gra', 400)
  }

  const body: ApiResponse<{ message: string }> = { success: true, data: { message: SUCCESS_MESSAGE } }
  return Response.json(body)
}
