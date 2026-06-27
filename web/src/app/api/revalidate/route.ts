import { timingSafeEqual } from 'crypto'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { NextRequest } from 'next/server'
import type { ApiResponse } from '@/types/api'

export async function POST(request: NextRequest) {
  const secretBuf = Buffer.from(request.headers.get('x-revalidate-secret') ?? '')
  const expectedBuf = Buffer.from(process.env.REVALIDATION_SECRET ?? '')

  if (
    !secretBuf.length ||
    !expectedBuf.length ||
    secretBuf.length !== expectedBuf.length ||
    !timingSafeEqual(secretBuf, expectedBuf)
  ) {
    const body: ApiResponse<never> = { success: false, error: 'unauthorized' }
    return Response.json(body, { status: 401 })
  }

  revalidatePath('/gra/[slug]', 'page')
  revalidatePath('/')
  revalidateTag('hot-deals', {})
  revalidateTag('scrape-time', {})
  revalidateTag('game-passport', {})

  const body: ApiResponse<{ revalidated: true }> = { success: true, data: { revalidated: true } }
  return Response.json(body)
}
