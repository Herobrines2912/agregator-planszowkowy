import type { NextRequest } from 'next/server'
import { getPriceHistory, type PriceDataPoint } from '@/db/queries/price-history'
import { ALL_RANGES, type Range } from '@/lib/price-range'
import type { ApiResponse } from '@/types/api'

const POSTGRES_INT4_MAX = 2147483647

function errorResponse(error: string, status: number) {
  const body: ApiResponse<never> = { success: false, error }
  return Response.json(body, { status })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const gameId = Number(searchParams.get('gameId'))
  const range = searchParams.get('range')

  if (!Number.isInteger(gameId) || gameId <= 0 || gameId > POSTGRES_INT4_MAX) {
    return errorResponse('Nieprawidłowe gameId', 400)
  }

  if (!range || !ALL_RANGES.includes(range as Range)) {
    return errorResponse('Nieprawidłowy zakres czasu', 400)
  }

  try {
    const data = await getPriceHistory(gameId, range as Range)
    const body: ApiResponse<PriceDataPoint[]> = { success: true, data }
    return Response.json(body)
  } catch (err) {
    console.error('[GET /api/price-history] getPriceHistory failed', err)
    return errorResponse('Wystąpił błąd. Spróbuj ponownie.', 500)
  }
}
