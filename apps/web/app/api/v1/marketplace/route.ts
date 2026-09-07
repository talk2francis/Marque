import { NextResponse, type NextRequest } from 'next/server'
import { marketplaceAgents, type MarketQuery } from '../../../../lib/marketplace'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * The Marketplace view of the Register (P10.5B): deduplicated by operator,
 * sorted by qualification (warranted first), reference agents merged in and
 * labelled. The graveyard stays at /api/v1/agents?status=unbound|dead.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const bool = (k: string) => p.get(k) === '1' || p.get(k) === 'true'
  const q: MarketQuery = {
    category: p.get('category'),
    search: p.get('q'),
    liveNow: bool('live'),
    warranted: bool('warranted'),
    thirdPartyOnly: bool('thirdParty'),
    hasPrice: bool('hasPrice'),
    iface: p.get('iface'),
    sort: (p.get('sort') as MarketQuery['sort']) ?? 'best',
    limit: Number(p.get('limit') ?? 120) || 120,
  }
  try {
    const { rows, generatedAt } = await marketplaceAgents(q)
    return NextResponse.json({ chainId: 56, generatedAt, provenance: 'MEASURED', count: rows.length, agents: rows })
  } catch (err) {
    return NextResponse.json(
      { error: 'marketplace_unavailable', detail: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    )
  }
}
