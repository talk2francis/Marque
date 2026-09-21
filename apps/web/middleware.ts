import { NextResponse, type NextRequest } from 'next/server'

/** Public registry evidence is cross-origin readable; mutation APIs are not. */
export function middleware(request: NextRequest) {
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

export const config = { matcher: '/api/v1/:path*' }
