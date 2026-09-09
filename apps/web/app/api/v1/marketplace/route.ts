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
    // The page size belongs to the caller, not to this endpoint. The table
    // sends its own limit; an agent reading the marketplace without one still
    // gets the full first page it has always got, so adding pagination here
    // does not silently truncate anyone who was already consuming this.
    limit: Number(p.get('limit') ?? 120),
    offset: Number(p.get('offset') ?? 0),
  }
  try {
    const { rows, generatedAt, total, offset, hasMore } = await marketplaceAgents(q)
    return NextResponse.json({ chainId: 56, generatedAt, provenance: 'MEASURED', count: rows.length, total, offset, hasMore, agents: rows })
  } catch (err) {
    return NextResponse.json(
      { error: 'marketplace_unavailable', detail: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    )
  }
}
