import { NextResponse } from 'next/server'
import { checkWindow, clientKey } from '../../../../../lib/limits'
import { PREVIEW_COOKIE, PREVIEW_MAX_AGE_S, previewCookieValue, previewTokenMatches } from '../../../../../lib/charters-access'

export const dynamic = 'force-dynamic'

const notFound = () => new NextResponse('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

/**
 * GET /api/v1/guards/preview?token=...  sets the Charters preview cookie and opens /charters.
 * GET /api/v1/guards/preview?end=1      clears it.
 * A wrong or missing token answers exactly like a route that does not exist.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get('end') === '1') {
    const res = NextResponse.redirect(new URL('/', url), 303)
    res.cookies.set(PREVIEW_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 })
    res.headers.set('Cache-Control', 'no-store')
    return res
  }
  const limit = checkWindow('charters-preview', clientKey(request.headers), 10, 60_000, 'Too many attempts.')
  if (!limit.ok) return notFound()
  const token = url.searchParams.get('token')
  if (!previewTokenMatches(token)) return notFound()
  const res = NextResponse.redirect(new URL('/charters', url), 303)
  res.cookies.set(PREVIEW_COOKIE, previewCookieValue(token!), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: PREVIEW_MAX_AGE_S })
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('Referrer-Policy', 'no-referrer')
  return res
}
