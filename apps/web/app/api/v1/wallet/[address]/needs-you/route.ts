import { NextResponse } from 'next/server'
import { cachedProjection } from '@marque/db'
import { needsYou } from '../../../../../../lib/workspace'

export const dynamic = 'force-dynamic'
const H = { 'Access-Control-Allow-Origin': '*' }

/** GET /api/v1/wallet/{address}/needs-you (SPEC-WORKSPACE 1.2): what this wallet should act on, soonest deadline first. */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ error: 'bad_request', detail: 'Send a 0x address.' }, { status: 400, headers: H })
  try {
    const p = await cachedProjection(`needs:v1:${address.toLowerCase()}`, () => needsYou(address), { freshMs: 30_000, timeoutMs: 15_000 })
    return NextResponse.json(p.value, { headers: { ...H, 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[api/v1/wallet/needs-you]', e instanceof Error ? e.message.slice(0, 200) : e)
    return NextResponse.json({ error: 'unavailable', detail: 'This could not be read just now.' }, { status: 503, headers: H })
  }
}
