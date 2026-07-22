import { confirmAlert } from '@/db/queries/alerts'
import { sha256Hex } from '@/lib/crypto'
import { assertNever } from '@/lib/utils'
import { NextResponse, type NextRequest } from 'next/server'

// This route is the deliberate exception to the "every API Route returns ApiResponse<T>"
// rule in CLAUDE.md: it is never fetch()-ed, it is the target of a link a human clicks in
// their email client, so the only useful response is a redirect the browser follows.
// JSON here would show the user a raw payload instead of taking them anywhere.

function redirectTo(path: string, request: NextRequest) {
  return NextResponse.redirect(new URL(path, request.url), 302)
}

function expiredPath(gameSlug: string | null) {
  return gameSlug ? `/alerts/expired?slug=${encodeURIComponent(gameSlug)}` : '/alerts/expired'
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return redirectTo(expiredPath(null), request)

  // Same best-effort derivation as the subscribe route: x-forwarded-for is client-suppliable
  // and not validated against a trusted proxy hop, so this is audit context, never a control.
  // The confirmation click is the strongest evidence of consent we ever capture, so it is
  // recorded with the same request context as the opt-in request it completes — consent_log is
  // append-only, so a field left empty here can never be filled in later.
  const ipRaw = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ipHash = sha256Hex(ipRaw && ipRaw.length > 0 ? ipRaw : 'unknown')

  let result
  try {
    result = await confirmAlert(token, ipHash)
  } catch (err) {
    console.error('[GET /api/alerts/confirm] confirmAlert failed', err)
    // A backend failure is indistinguishable from a dead link for the user, and the expired
    // page tells them to retry from the game page — which is the right next step either way.
    return redirectTo(expiredPath(null), request)
  }

  switch (result.outcome) {
    case 'confirmed':
    case 'already_confirmed':
      return redirectTo(`/alerts/confirmed?token=${encodeURIComponent(token)}`, request)
    case 'expired':
      return redirectTo(expiredPath(result.gameSlug), request)
    default:
      return assertNever(result)
  }
}
