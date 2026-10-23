import { NextResponse, type NextRequest } from 'next/server'
import { currentTermsMany } from '@marque/commerce'
import { checkWindow, clientKey } from '../../../../lib/limits'
import { limited } from '../../../../lib/hire-api'

export const dynamic = 'force-dynamic'

const AGENT_ID = /^(56|97):0x[0-9a-f]{40}:\d{1,12}$/i

/**
 * GET /api/v1/terms?agents=<id>,<id>: current terms (fresh, dated or none) for up to 24
 * agents, from Marque's newest quote observations. The same reader feeds the profile rail,
 * so every price on the site agrees with this answer at the same moment (invariant 41).
 */
export async function GET(req: NextRequest) {
  const v = checkWindow('terms', clientKey(req.headers), 60, 60_000, 'Terms reads are limited to 60 a minute.')
  if (!v.ok) return limited(v.detail, v.retryAfterSeconds)
  const ids = (req.nextUrl.searchParams.get('agents') ?? '').split(',').map((s) => s.trim()).map((s) => s.toLowerCase()).filter((s) => AGENT_ID.test(s)).slice(0, 24)
  if (!ids.length) return NextResponse.json({ error: 'bad_request', detail: 'Name up to 24 agents as chainId:registry:tokenId.' }, { status: 400 })
  try {
    const now = Date.now()
    const m = await currentTermsMany(ids, now)
    return NextResponse.json({
      observedAt: new Date(now).toISOString(), provenance: 'MEASURED',
      agents: ids.map((id) => { const t = m.get(id); return { agentId: id, serviceId: t?.serviceId ?? null, terms: t?.terms ?? null } }),
    }, { headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } })
  } catch {
    return NextResponse.json({ error: 'terms_unavailable', detail: 'Prices could not be read just now. Try again in a minute.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
