import { NextResponse, type NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * The Register, as an API.
 *
 * Default status is `working` — reachable AND callable — because a directory
 * that defaults to "everything" is a directory of dead links. The graveyard is
 * reachable through `status=all` or `status=unbound`, never hidden, and every
 * row carries the reason it is where it is.
 */

const STATUSES = ['working', 'unbound', 'dead', 'unprobed', 'all'] as const
type Status = (typeof STATUSES)[number]

const CATEGORIES = ['rebalancing', 'grid', 'yield', 'health_factor', 'security', 'unclassified'] as const

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const status = (params.get('status') ?? 'working') as Status
  const category = params.get('category')
  const protocol = params.get('protocol')
  const limit = Math.min(Number(params.get('limit') ?? 50) || 50, 200)
  const offset = Math.max(Number(params.get('offset') ?? 0) || 0, 0)

  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: 'bad_status', allowed: STATUSES }, { status: 400 })
  }
  if (category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return NextResponse.json({ error: 'bad_category', allowed: CATEGORIES }, { status: 400 })
  }

  const statusFilter =
    status === 'working' ? sql`and p.liveness = 'live'`
    : status === 'unbound' ? sql`and p.liveness in ('unbound','bad_schema')`
    : status === 'dead' ? sql`and p.liveness = 'dead'`
    : status === 'unprobed' ? sql`and p.liveness is null`
    : sql``

  const categoryFilter = category ? sql`and c.category = ${category}` : sql``
  const protocolFilter = protocol ? sql`and exists (select 1 from agent_service s2 where s2.agent_id = a.id and s2.kind = ${protocol})` : sql``

  try {
    const d = db()
    const rows = await d.execute(sql`
      with latest as (
        select distinct on (agent_id) agent_id, liveness, latency_ms, failure_class, skills, checked_at
        from probe order by agent_id, checked_at desc
      )
      select a.id, a.chain_id, a.token_id, a.name, a.description, a.owner_address,
             a.image_url, a.x402_supported, a.supported_protocols, a.tags,
             c.category, c.confidence, c.method, c.rationale,
             p.liveness, p.latency_ms, p.failure_class, p.skills, p.checked_at as probed_at,
             (select json_agg(json_build_object(
                'kind', s.kind, 'endpoint', s.endpoint,
                'resolvedEndpoint', s.resolved_endpoint, 'isTemplate', s.is_template,
                'version', s.version, 'declaredPrice', s.declared_price, 'source', s.source))
              from agent_service s where s.agent_id = a.id) as services
      from agent a
      left join agent_category c on c.agent_id = a.id
      left join latest p on p.agent_id = a.id
      where a.chain_id = 56
        ${statusFilter} ${categoryFilter} ${protocolFilter}
      order by (p.liveness = 'live') desc nulls last, a.registry_created_at desc nulls last
      limit ${limit} offset ${offset}
    `)

    const list = ((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])) as Array<Record<string, unknown>>
    return NextResponse.json({
      chainId: 56,
      takenAt: new Date().toISOString(),
      filters: { status, category, protocol, limit, offset },
      count: list.length,
      agents: list.map((r) => ({
        agentId: r['id'],
        chainId: r['chain_id'],
        tokenId: r['token_id'],
        name: r['name'],
        description: r['description'],
        ownerAddress: r['owner_address'],
        imageUrl: r['image_url'],
        x402Supported: r['x402_supported'],
        supportedProtocols: r['supported_protocols'],
        tags: r['tags'],
        classification: r['category']
          ? { category: r['category'], confidence: r['confidence'], method: r['method'], rationale: r['rationale'], provenance: 'MEASURED' }
          : null,
        liveness: r['liveness']
          ? {
              status: r['liveness'],
              latencyMs: r['latency_ms'],
              failureClass: r['failure_class'],
              skills: r['skills'],
              // Our own probe, never 8004scan's stale health field (gotcha 6).
              measuredAt: r['probed_at'],
              provenance: 'MEASURED',
            }
          : null,
        services: r['services'] ?? [],
      })),
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'register_unavailable', detail: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    )
  }
}
