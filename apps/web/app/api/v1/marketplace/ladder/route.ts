import { NextResponse, type NextRequest } from 'next/server'
import { parseLane } from '@marque/commerce'
import { marketLadder, type LadderQuery } from '../../../../../lib/market-ladder'
import { checkWindow, clientKey } from '../../../../../lib/limits'
import { withDeadline } from '../../../../../lib/deadline'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/marketplace/ladder: the evidence ladder for a marketplace view (network, category, search, filters),
 * from a one-minute shared memo. Each count is the number of agents the matching stage filter opens.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const rate = checkWindow('marketplace-read', clientKey(req.headers), 120, 60_000, 'Catalog reads are limited to 120 a minute per connection.')
  if (!rate.ok) return NextResponse.json({ error: 'rate_limited', detail: rate.detail }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds ?? 60) } })
  const bool = (k: string) => p.get(k) === '1' || p.get(k) === 'true'
  const num = (k: string) => (p.get(k) && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : null)
  const q: LadderQuery = {
    // No lane means mainnet, as on /api/v1/marketplace.
    lane: p.get('lane') === 'all' ? 'all' : parseLane(p.get('lane')),
    category: p.get('category'), search: p.get('q'),
    liveNow: bool('live'), warranted: bool('warranted'), tested: bool('tested'),
    thirdPartyOnly: bool('thirdParty'), firstPartyOnly: bool('firstParty'), hasPrice: bool('hasPrice'),
    iface: p.get('iface'), token: p.get('token') && /^[A-Za-z0-9]{1,12}$/.test(p.get('token')!) ? p.get('token') : null,
    maxPrice: num('maxPrice'), minRating: num('minRating'),
  }
  try {
    const ladder = await withDeadline(marketLadder(q), 20_000)
    return NextResponse.json({ ladder, provenance: 'MEASURED' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'ladder_unavailable', detail: 'The ladder could not be counted just now.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
