import { NextResponse, type NextRequest } from 'next/server'
import { safeRequestPath, validRouterStateHeader } from './lib/request-guard'

/** Public registry evidence is cross-origin readable; mutation APIs are not. */
export function middleware(request: NextRequest) {
  // Next strips Flight headers before middleware. Our loopback-only web server
  // receives this mirror from Caddy, which removes any client-supplied mirror.
  const mirrored = request.headers.get('x-marque-router-state')
  const routerState = mirrored?.startsWith('present:') ? mirrored.slice(8) : request.headers.get('next-router-state-tree')
  if (!safeRequestPath(request.nextUrl.pathname) || !validRouterStateHeader(routerState)) {
    return new NextResponse('Invalid request', { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
  // This application uses explicit API routes, not React Server Actions.
  if (request.headers.has('next-action')) return new NextResponse('Unsupported action', { status: 400 })
  if (!request.nextUrl.pathname.startsWith('/api/v1/')) return NextResponse.next()
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Max-Age': '86400',
      },
    })
  }
  const response = NextResponse.next()
  if (request.method === 'GET' || request.method === 'HEAD') {
    response.headers.set('Access-Control-Allow-Origin', '*')
  }
  return response
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
