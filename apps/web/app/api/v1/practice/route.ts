import { NextResponse } from 'next/server'
import { cachedProjection } from '@marque/db'
import { clientKey, checkWindow } from '../../../../lib/limits'
import { questProjection, QUEST_ADDRESS } from '../../../../lib/quest-api'
import { practicePicks } from '../../../../lib/practice'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/practice?address=0x… The practice hires that would add a new agent to this wallet's Set and Earn count:
 * BSC testnet agents hireable now that it has not hired, outside builds first, rotating fairly. Without an address,
 * the same list for a new wallet. Read-only; nothing is sent or reserved.
 */
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get('address')
  if (address !== null && !QUEST_ADDRESS.test(address)) return NextResponse.json({ error: 'bad_request', detail: 'Send a 0x address of 40 hex characters.' }, { status: 400 })
  const limit = checkWindow('practice', clientKey(req.headers), 60, 60_000, 'The practice API allows 60 requests a minute per client.')
  if (!limit.ok) return NextResponse.json({ error: 'rate_limited', detail: limit.detail }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds ?? 60) } })
  try {
    const q = address ? (await questProjection(address)).value : null
    const hired = q ? q.hire.hires.filter((h) => h.fundedTx).map((h) => h.agent.key) : []
    const p = await cachedProjection(`practice:v1:${[...hired].sort().join(',')}`, () => practicePicks(hired), { freshMs: 60_000, timeoutMs: 10_000 })
    return NextResponse.json({
      address: q?.address ?? null,
      team: q?.excluded.team ?? false,
      hires: q ? { agents: Math.min(q.hire.distinctAgents, 3), required: q.hire.required, marketplaces: q.hire.marketplaces.named } : null,
      picks: p.value.picks, available: p.value.available, computedAt: p.computedAt,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'unavailable', detail: 'The practice list could not be read just now. Try again in a minute.' }, { status: 503 })
  }
}
