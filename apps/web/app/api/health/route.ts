import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** Liveness endpoint for the uptime monitor and for Caddy health checks. */
export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'marque-web',
    at: new Date().toISOString(),
  })
}
