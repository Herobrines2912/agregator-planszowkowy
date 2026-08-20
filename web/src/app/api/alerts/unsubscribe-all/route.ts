import { unsubscribeAllAlertsByToken } from '@/db/queries/alerts'
import { assertNever } from '@/lib/utils'
import type { ApiResponse } from '@/types/api'
import type { NextRequest } from 'next/server'

const SUCCESS_MESSAGE = 'Wyłączono wszystkie powiadomienia dla tego adresu e-mail.'

type UnsubscribeAllRequestBody = {
  token?: unknown
}

function errorResponse(error: string, status: number) {
  const body: ApiResponse<never> = { success: false, error }
  return Response.json(body, { status })
}

export async function POST(request: NextRequest) {
  let payload: UnsubscribeAllRequestBody
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
    const result = await unsubscribeAllAlertsByToken(token)

    switch (result.outcome) {
      case 'suppressed': {
        const body: ApiResponse<{ message: string }> = {
          success: true,
          data: { message: SUCCESS_MESSAGE },
        }
        return Response.json(body)
      }
      case 'not_found':
        return errorResponse('Nieprawidłowy token', 400)
      default:
        return assertNever(result)
    }
  } catch (err) {
    console.error('[POST /api/alerts/unsubscribe-all] unsubscribeAllAlertsByToken failed', err)
    return errorResponse('Wystąpił błąd. Spróbuj ponownie.', 500)
  }
}
