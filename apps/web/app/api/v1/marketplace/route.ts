import { NextResponse, type NextRequest } from 'next/server'
import { type MarketQuery, type MarketStage } from '../../../../lib/marketplace'
import { marketplaceAgentsCached as marketplaceAgents } from '../../../../lib/market-cache'
import { parseCatalogQuery } from '@marque/commerce/catalog'
import { chainOf, parseLane } from '@marque/commerce'
import { machineCatalog } from '../../../../lib/machine-catalog'
import { checkWindow, clientKey } from '../../../../lib/limits'
import { withDeadline } from '../../../../lib/deadline'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * The Marketplace view of the Register (P10.5B): deduplicated by operator,
 * sorted by qualification (warranted first), reference agents merged in and
 * labelled. The graveyard stays at /api/v1/agents?status=unbound|dead.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const machine = p.get('format') === 'machine'
  const baseHeaders = { 'Cache-Control': 'no-store', ...(machine ? { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Retry-After, X-Marque-Projection-Computed-At, X-Marque-Projection-Age-Ms, X-Marque-Projection-Stale' } : {}) }
  const rate = checkWindow('marketplace-read', clientKey(req.headers), 120, 60_000, 'Catalog reads are limited to 120 a minute per connection.')
  if (!rate.ok) return NextResponse.json({ error: 'rate_limited', detail: rate.detail }, { status: 429, headers: { ...baseHeaders, 'Retry-After': String(rate.retryAfterSeconds ?? 60) } })
  const f = machine ? parseCatalogQuery(p) : null
  if (machine && (!f || p.getAll('format').length !== 1)) return NextResponse.json({ error: 'invalid_catalog_query', detail: 'Use documented categories, networks, filters and pagination.' }, { status: 400, headers: baseHeaders })
  const bool = (k: string) => p.get(k) === '1' || p.get(k) === 'true'
  const q: MarketQuery = f ? {
    category: f.category ?? null, search: f.q ?? null, liveNow: f.live, warranted: f.warranted,
    thirdPartyOnly: f.thirdParty, hireableOnly: f.hireable, includeUnclassified: f.includeUnclassified,
    hasPrice: f.hasPrice, iface: f.iface ?? null, tab: f.tab ?? null, firstPartyOnly: f.firstParty,
    network: f.network ?? null, token: f.token ?? null, maxPrice: f.maxPrice ?? null, minRating: f.minRating ?? null,
    sort: f.sort ?? 'best', limit: f.limit ?? 120, offset: f.offset ?? 0,
  } : {
    category: p.get('category'),
    search: p.get('q'),
    liveNow: bool('live'),
    warranted: bool('warranted'),
    tested: bool('tested'),
    thirdPartyOnly: bool('thirdParty'),
    hireableOnly: bool('hireable'),
    includeUnclassified: bool('includeUnclassified'),
    hasPrice: bool('hasPrice'),
    iface: p.get('iface'),
    tab: (['ready', 'free', 'tested', 'all'] as const).find((t) => t === p.get('tab')) ?? null,
    stage: (['answering', 'priced', 'passed', 'delivered'] as const satisfies readonly MarketStage[]).find((x) => x === p.get('stage')) ?? null,
    firstPartyOnly: bool('firstParty'),
    failed: p.get('failed') === 'group' ? 'group' : 'include',
    lane: p.get('lane') === 'all' ? 'all' : p.get('lane') ? parseLane(p.get('lane')) : null,
    network: p.get('network') === '56' ? 56 : p.get('network') === '97' ? 97 : null,
    token: p.get('token') && /^[A-Za-z0-9]{1,12}$/.test(p.get('token')!) ? p.get('token') : null,
    maxPrice: p.get('maxPrice') && Number.isFinite(Number(p.get('maxPrice'))) ? Number(p.get('maxPrice')) : null,
    minRating: p.get('minRating') && Number.isFinite(Number(p.get('minRating'))) ? Number(p.get('minRating')) : null,
    sort: (['best', 'proven', 'price', 'fast', 'recent', 'rated'] as const).find((x) => x === p.get('sort')) ?? 'best',
    // The page size belongs to the caller, not to this endpoint. The table
    // sends its own limit; an agent reading the marketplace without one still
    // gets the full first page it has always got, so adding pagination here
    // does not silently truncate anyone who was already consuming this.
    limit: Number(p.get('limit') ?? 120),
    offset: Number(p.get('offset') ?? 0),
  }
  try {
    const result = await withDeadline(marketplaceAgents(q), 12_000)
    // The evidence ladder has its own memoised endpoint (/api/v1/marketplace/ladder); this contract is unchanged.
    const { rows, generatedAt, total, offset, hasMore, facets, lane, failedGroup } = result
    const age = Date.now() - Date.parse(generatedAt)
    const headers = { ...baseHeaders, 'X-Marque-Projection-Computed-At': generatedAt, 'X-Marque-Projection-Age-Ms': Number.isFinite(age) && age >= 0 ? String(age) : 'UNKNOWN', 'X-Marque-Projection-Stale': String(!Number.isFinite(age) || age < 0 || age > 180_000) }
    if (machine) {
      const body = machineCatalog(result, q.limit ?? 120)
      return NextResponse.json(body, { headers: { ...headers, 'Cache-Control': body.cacheMaxAgeSeconds ? `public, max-age=${body.cacheMaxAgeSeconds}` : 'no-store', Link: '</api/v1/openapi.json>; rel="describedby"' } })
    }
    return NextResponse.json({ chainId: lane === 'all' ? null : chainOf(lane ?? 'mainnet'), lane: lane ?? 'mainnet', generatedAt, provenance: 'MEASURED', count: rows.length, total, offset, hasMore, facets, agents: rows, ...((failedGroup ?? []).length || p.get('failed') === 'group' ? { failedGroup: failedGroup ?? [] } : {}) }, { headers })
  } catch (error) {
    // Classify failures for operators without logging query values or credentials.
    console.warn('[marketplace]', error instanceof Error && error.message === 'Check timed out'
      ? 'request_deadline' : error instanceof TypeError ? 'type_error' : 'read_failure',
      // The Postgres error code only (57014 is a statement timeout): never query text or values.
      (error as { code?: unknown } | null)?.code ?? '')
    return NextResponse.json(
      { error: 'marketplace_unavailable', detail: 'The catalog could not be read just now. Retry after a short pause.' },
      { status: 503, headers: baseHeaders },
    )
  }
}
