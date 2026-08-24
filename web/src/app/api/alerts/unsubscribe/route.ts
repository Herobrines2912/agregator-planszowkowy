import { unsubscribeAlert } from '@/db/queries/alerts'
import { assertNever } from '@/lib/utils'
import type { ApiResponse } from '@/types/api'
import type { NextRequest } from 'next/server'

// Correct-course (2026-08-24): the mail-clicked link is now GET /alerts/unsubscribe, a
// side-effect-free page — not this route. This route is fetch()-ed from that page's
// AlertTokenActionButton, so it follows the normal ApiResponse<T> rule like any other route.
// See docs/solutions/architecture/rodo-consent-integrity.md.

type UnsubscribeRequestBody = {
  token?: unknown
}

function errorResponse(error: string, status: number) {
  const body: ApiResponse<never> = { success: false, error }
  return Response.json(body, { status })
}

export async function POST(request: NextRequest) {
  let payload: UnsubscribeRequestBody
  try {
    payload = await request.json()
  } catch {
    return errorResponse('Nieprawidłowe dane żądania', 400)
  }

  const { token } = payload
  if (typeof token !== 'string' || token.length === 0) {
    return errorResponse('Nieprawidłowy token', 400)
  }

  try {
    const result = await unsubscribeAlert(token)

    switch (result.outcome) {
      case 'unsubscribed':
      case 'already_unsubscribed': {
        const body: ApiResponse<{ outcome: typeof result.outcome }> = {
          success: true,
          data: { outcome: result.outcome },
        }
        return Response.json(body)
      }
      case 'not_found':
        return errorResponse('Nieprawidłowy token', 400)
      default:
        return assertNever(result)
    }
  } catch (err) {
    console.error('[POST /api/alerts/unsubscribe] unsubscribeAlert failed', err)
    return errorResponse('Wystąpił błąd. Spróbuj ponownie.', 500)
  }
}
