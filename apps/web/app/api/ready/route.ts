import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { GET as catalog } from '../v1/marketplace/route'
import { POST as comparison } from '../v1/recheck/route'

export const dynamic = 'force-dynamic'
const instance = randomUUID()
let initialized: Promise<void> | null = null

/** Per-worker initialization, separate from liveness. No task or comparison is sent. */
export async function GET(request: Request) {
  if (new URL(request.url).search) return NextResponse.json({ ready: false, detail: 'Readiness takes no query parameters.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  if (!initialized) {
    initialized = (async () => {
      if (typeof comparison !== 'function') throw Error('comparison_not_loaded')
      const response = await catalog(new NextRequest('http://localhost/api/v1/marketplace?tab=ready&lane=all&failed=group&limit=1&offset=0'))
      await response.text()
      if (!response.ok) throw Error('catalog_not_ready')
    })()
    initialized.catch(() => { initialized = null })
  }
  const headers = { 'Cache-Control': 'no-store' }
  try {
    await initialized
    return NextResponse.json({ ready: true, instance, release: process.env['MARQUE_RELEASE_SHA'] ?? null, at: new Date().toISOString() }, { headers })
  } catch {
    return NextResponse.json({ ready: false, detail: 'The public read modules are still initializing.' }, { status: 503, headers })
  }
}
