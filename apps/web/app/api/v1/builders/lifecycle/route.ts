import { NextResponse } from 'next/server'
import { builderLoop } from '../../../../../lib/builder-loop-data'
import { checkWindow, clientKey } from '../../../../../lib/limits'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const agentId = new URL(request.url).searchParams.get('agentId') ?? ''
  if (!/^(56|97):0x[0-9a-fA-F]{40}:\d{1,12}$/.test(agentId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const limit = checkWindow('builder-loop', clientKey(request.headers), 120, 60_000, 'Wait before refreshing these observations.')
  if (!limit.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  try {
    const p = await builderLoop(agentId)
    return p.value ? NextResponse.json(p.value, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'not_found' }, { status: 404 })
  } catch { return NextResponse.json({ error: 'unavailable', detail: 'The recorded agent loop could not be read.' }, { status: 503 }) }
}
