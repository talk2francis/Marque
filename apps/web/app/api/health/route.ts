import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** Liveness endpoint for the uptime monitor and for Caddy health checks. */
export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'marque-web',
    release: /^[a-f0-9]{40}$/.test(process.env['MARQUE_RELEASE_SHA'] ?? '') ? process.env['MARQUE_RELEASE_SHA'] : null,
    at: new Date().toISOString(),
  })
}
