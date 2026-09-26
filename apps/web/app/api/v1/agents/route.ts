import { NextResponse, type NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { db, cachedProjection } from '@marque/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * The Register, as an API.
 *
 * Default status is `working` (reachable AND callable) because a directory that
 * defaults to "everything" is a directory of dead links. The graveyard is reachable
 * through `status=all` or `status=unbound`, never hidden, and every row carries the
 * reason it is where it is.
 *
 * Latest-probe state comes from `probe_schedule.last_probe_id` (one primary-key join
 * per service) instead of a DISTINCT ON over the whole probe history. Responses are
 * cached for 60 s; if a refresh does not finish in 5 s the last good page is served
 * with its age (`cache.stale: true`).
 *
 * Pagination: `limit` (default 50, max 200) and `cursor` (opaque, from `nextCursor`).
 * `offset` is still accepted for old clients.
 */

const STATUSES = ['working', 'unbound', 'dead', 'unprobed', 'all'] as const
type Status = (typeof STATUSES)[number]

const CATEGORIES = ['rebalancing', 'grid', 'yield', 'health_factor', 'security', 'unclassified'] as const
const PROTOCOLS = ['a2a', 'mcp', 'x402', 'erc8183', 'rest', 'web'] as const

interface Cursor { t: string | null; id: string }

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url')
}
function decodeCursor(s: string | null): Cursor | null {
  if (!s) return null
  try {
    const c = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as Cursor
    return typeof c.id === 'string' && (c.t === null || typeof c.t === 'string') ? c : null
  } catch {
    return null
  }
}

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>

async function page(opts: { status: Status; category: string | null; protocol: string | null; limit: number; offset: number; cursor: Cursor | null }) {
  const { status, category, protocol, limit, offset, cursor } = opts
  const statusFilter =
    status === 'working' ? sql`and st.callable = true`
    : status === 'unbound' ? sql`and st.reachable = true and coalesce(st.callable, false) = false`
    : status === 'dead' ? sql`and st.agent_id is not null and st.probed = true and coalesce(st.reachable, false) = false`
    : status === 'unprobed' ? sql`and coalesce(st.probed, false) = false`
    : sql``
  const categoryFilter = category ? sql`and c.category = ${category}` : sql``
  const protocolFilter = protocol ? sql`and exists (select 1 from agent_service s2 where s2.agent_id = a.id and s2.kind = ${protocol})` : sql``
  const cursorFilter = cursor
    ? cursor.t === null
      ? sql`and a.registry_created_at is null and a.id < ${cursor.id}`
      : sql`and (a.registry_created_at < ${cursor.t}::timestamptz or (a.registry_created_at = ${cursor.t}::timestamptz and a.id < ${cursor.id}) or a.registry_created_at is null)`
    : sql``

  const d = db()
  const list = rowsOf(await d.execute(sql`
    with st as (
      select s.agent_id,
             bool_or(p.liveness = 'live' and p.executable_endpoint is not null) as callable,
             bool_or(p.liveness in ('live', 'unbound', 'bad_schema')) as reachable,
             bool_or(p.id is not null) as probed,
             min(p.latency_ms) filter (where p.liveness = 'live') as latency_ms,
             max(p.checked_at) as checked_at
      from agent_service s
      left join probe_schedule ps on ps.service_id = s.id
      left join probe p on p.id = ps.last_probe_id
      group by s.agent_id
    )
    select a.id, a.chain_id, a.token_id, a.name, a.description, a.owner_address,
           a.image_url, a.x402_supported, a.supported_protocols, a.tags, a.registry_created_at,
           c.category, c.confidence, c.method, c.rationale,
           case when st.callable then 'live' when st.reachable then 'unbound' else null end as liveness,
           st.latency_ms, st.checked_at as probed_at
    from agent a
    left join lateral (
      select category, confidence, method, rationale from agent_category ac
      where ac.agent_id = a.id
      order by (ac.category = 'unclassified') asc, ac.confidence desc
      limit 1
    ) c on true
    left join st on st.agent_id = a.id
    where a.chain_id = 56
      ${statusFilter} ${categoryFilter} ${protocolFilter} ${cursorFilter}
    order by a.registry_created_at desc nulls last, a.id desc
    limit ${limit + 1} offset ${cursor ? 0 : offset}
  `))

  const hasMore = list.length > limit
  const rows = list.slice(0, limit)
  const ids = rows.map((r) => String(r['id']))
  const services = new Map<string, unknown[]>()
  if (ids.length) {
    const svc = rowsOf(await d.execute(sql`
      select s.agent_id, json_build_object(
               'id', s.id, 'kind', s.kind, 'endpoint', s.endpoint,
               'resolvedEndpoint', s.resolved_endpoint, 'isTemplate', s.is_template,
               'version', s.version, 'declaredPrice', s.declared_price, 'source', s.source,
               'liveness', p.liveness, 'failureClass', p.failure_class,
               'skills', p.skills, 'measuredAt', p.checked_at,
               'executableEndpoint', p.executable_endpoint,
               'protocolVersion', p.protocol_version, 'taskKinds', p.task_kinds
             ) as service
      from agent_service s
      left join probe_schedule ps on ps.service_id = s.id
      left join probe p on p.id = ps.last_probe_id
      where s.agent_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
      order by s.id`))
    for (const r of svc) {
      const k = String(r['agent_id'])
      const arr = services.get(k) ?? []
      arr.push(r['service'])
      services.set(k, arr)
    }
  }

  const last = rows[rows.length - 1]
  const nextCursor = hasMore && last
    ? encodeCursor({ t: last['registry_created_at'] ? new Date(last['registry_created_at'] as string).toISOString() : null, id: String(last['id']) })
    : null

  return {
    pageSize: rows.length,
    nextCursor,
    agents: rows.map((r) => ({
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
      registeredAt: r['registry_created_at'],
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
      services: services.get(String(r['id'])) ?? [],
    })),
  }
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const status = (params.get('status') ?? 'working') as Status
  const category = params.get('category')
  const protocol = params.get('protocol')
  const limit = Math.max(1, Math.min(Number(params.get('limit') ?? 50) || 50, 200))
  const offset = Math.max(Number(params.get('offset') ?? 0) || 0, 0)
  const cursorRaw = params.get('cursor')
  const cursor = decodeCursor(cursorRaw)

  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: 'bad_status', allowed: STATUSES }, { status: 400 })
  }
  if (category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return NextResponse.json({ error: 'bad_category', allowed: CATEGORIES }, { status: 400 })
  }
  if (protocol && !PROTOCOLS.includes(protocol as (typeof PROTOCOLS)[number])) {
    return NextResponse.json({ error: 'bad_protocol', allowed: PROTOCOLS }, { status: 400 })
  }
  if (cursorRaw && !cursor) {
    return NextResponse.json({ error: 'bad_cursor' }, { status: 400 })
  }

  const key = `agents:v2:${status}:${category ?? '-'}:${protocol ?? '-'}:${limit}:${cursor ? cursorRaw : `o${offset}`}`
  try {
    const p = await cachedProjection(key, () => page({ status, category, protocol, limit, offset, cursor }), { freshMs: 60_000, timeoutMs: 5_000 })
    return NextResponse.json(
      {
        chainId: 56,
        takenAt: p.computedAt,
        cache: { ageSeconds: Math.round(p.ageMs / 1000), stale: p.stale },
        filters: { status, category, protocol, limit, offset: cursor ? null : offset, cursor: cursorRaw },
        // This page's size, NOT a population total. Real per-status counts are at
        // /api/v1/agents/counts (invariant 19).
        pageSize: p.value.pageSize,
        nextCursor: p.value.nextCursor,
        agents: p.value.agents,
      },
      { headers: { 'Cache-Control': 'public, max-age=15', 'Access-Control-Allow-Origin': '*' } },
    )
  } catch (err) {
    // Never echo database or driver text to the public (AGENTS invariant 31).
    console.error('[api/v1/agents]', err instanceof Error ? err.message : String(err))
    return NextResponse.json(
      { error: 'register_unavailable', detail: 'The Register could not be read just now. Try again in a minute.' },
      { status: 503, headers: { 'Retry-After': '30' } },
    )
  }
}
