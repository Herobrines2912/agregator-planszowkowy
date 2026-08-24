import { confirmAlert } from '@/db/queries/alerts'
import { sha256Hex } from '@/lib/crypto'
import { assertNever } from '@/lib/utils'
import type { ApiResponse } from '@/types/api'
import type { NextRequest } from 'next/server'

// Correct-course (2026-07-26): the mail-clicked link is now GET /alerts/confirm, a
// side-effect-free page — not this route. This route is fetch()-ed from that page's
// AlertConfirmButton, so it follows the normal ApiResponse<T> rule like any other route.
// See docs/solutions/architecture/rodo-consent-integrity.md.

type ConfirmRequestBody = {
  token?: unknown
}

function errorResponse(error: string, status: number) {
  const body: ApiResponse<never> = { success: false, error }
  return Response.json(body, { status })
}

export async function POST(request: NextRequest) {
  let payload: ConfirmRequestBody
  try {
    payload = await request.json()
  } catch {
    return errorResponse('Nieprawidłowe dane żądania', 400)
  }

  const { token } = payload
  if (typeof token !== 'string' || token.length === 0) {
    return errorResponse('Nieprawidłowy token', 400)
  }

  // Same best-effort derivation as the subscribe route: x-forwarded-for is client-suppliable
  // and not validated against a trusted proxy hop, so this is audit context, never a control.
  // The confirmation click is the strongest evidence of consent we ever capture, so it is
  // recorded with the same request context as the opt-in request it completes — consent_log is
  // append-only, so a field left empty here can never be filled in later.
  const ipRaw = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ipHash = sha256Hex(ipRaw && ipRaw.length > 0 ? ipRaw : 'unknown')

  try {
    const result = await confirmAlert(token, ipHash)

    switch (result.outcome) {
      case 'confirmed':
      case 'already_confirmed': {
        const body: ApiResponse<{ outcome: typeof result.outcome }> = {
          success: true,
          data: { outcome: result.outcome },
        }
        return Response.json(body)
      }
      case 'expired':
        return errorResponse('Link wygasł lub jest nieprawidłowy', 400)
      default:
        return assertNever(result)
    }
  } catch (err) {
    console.error('[POST /api/alerts/confirm] confirmAlert failed', err)
    return errorResponse('Wystąpił błąd. Spróbuj ponownie.', 500)
  }
}
