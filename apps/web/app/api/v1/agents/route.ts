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
    status === 'working' ? sql`and ss.callable = true`
    : status === 'unbound' ? sql`and ss.reachable = true and coalesce(ss.callable, false) = false`
    : status === 'dead' ? sql`and ss.agent_id is not null and coalesce(ss.reachable, false) = false`
    : status === 'unprobed' ? sql`and ss.checked_at is null`
    : sql``

  const categoryFilter = category ? sql`and c.category = ${category}` : sql``
  const protocolFilter = protocol ? sql`and exists (select 1 from agent_service s2 where s2.agent_id = a.id and s2.kind = ${protocol})` : sql``

  try {
    const d = db()
    const rows = await d.execute(sql`
      with latest_service as (
        select distinct on (service_id) service_id, liveness, latency_ms, failure_class, skills,
               checked_at, executable_endpoint, protocol_version, task_kinds
        from probe where service_id is not null order by service_id, checked_at desc
      ), service_state as (
        select s.agent_id,
               bool_or(p.liveness = 'live' and p.executable_endpoint is not null) as callable,
               bool_or(p.liveness in ('live','unbound','bad_schema')) as reachable,
               min(p.latency_ms) filter (where p.liveness = 'live') as latency_ms,
               max(p.checked_at) as checked_at,
               json_agg(json_build_object(
                 'id', s.id, 'kind', s.kind, 'endpoint', s.endpoint,
                 'resolvedEndpoint', s.resolved_endpoint, 'isTemplate', s.is_template,
                 'version', s.version, 'declaredPrice', s.declared_price, 'source', s.source,
                 'liveness', p.liveness, 'failureClass', p.failure_class,
                 'skills', p.skills, 'measuredAt', p.checked_at,
                 'executableEndpoint', p.executable_endpoint,
                 'protocolVersion', p.protocol_version, 'taskKinds', p.task_kinds
               ) order by s.id) as services
        from agent_service s left join latest_service p on p.service_id = s.id
        group by s.agent_id
      )
      select a.id, a.chain_id, a.token_id, a.name, a.description, a.owner_address,
             a.image_url, a.x402_supported, a.supported_protocols, a.tags,
             c.category, c.confidence, c.method, c.rationale,
             case when ss.callable then 'live' when ss.reachable then 'unbound' else null end as liveness,
             ss.latency_ms, ss.checked_at as probed_at, ss.services
      from agent a
      left join agent_category c on c.agent_id = a.id
      left join service_state ss on ss.agent_id = a.id
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
      // This page's size, NOT a population total — the real per-status counts
      // are at /api/v1/agents/counts (P10.5A item 1).
      pageSize: list.length,
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
