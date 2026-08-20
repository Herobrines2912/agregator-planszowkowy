import { unsubscribeAlert } from '@/db/queries/alerts'
import { assertNever } from '@/lib/utils'
import { NextResponse, type NextRequest } from 'next/server'

// Same redirect-only exception as /api/alerts/confirm: this route is the target of a link a
// human clicks from their email client, never fetch()-ed, so a redirect is the only useful
// response — see confirm/route.ts for the full rationale.

function redirectTo(path: string, request: NextRequest) {
  return NextResponse.redirect(new URL(path, request.url), 302)
}

const INVALID_PATH = '/alerts/unsubscribed?invalid=1'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return redirectTo(INVALID_PATH, request)

  let result
  try {
    result = await unsubscribeAlert(token)
  } catch (err) {
    console.error('[GET /api/alerts/unsubscribe] unsubscribeAlert failed', err)
    // A backend failure must never read as a silent no-op to the user — the invalid-link
    // message at least tells them to contact support instead of implying success or nothing.
    return redirectTo(INVALID_PATH, request)
  }

  switch (result.outcome) {
    case 'unsubscribed':
    case 'already_unsubscribed':
      return redirectTo(`/alerts/unsubscribed?token=${encodeURIComponent(token)}`, request)
    case 'not_found':
      return redirectTo(INVALID_PATH, request)
    default:
      return assertNever(result)
  }
}
