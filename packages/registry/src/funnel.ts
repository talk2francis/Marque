import { sql } from 'drizzle-orm'
import { db, cachedProjection } from '@marque/db'

/**
 * The supply funnel.
 *
 * Every number is a live COUNT over measured data. Nothing here is a stored
 * ratio, an estimate, or a constant (AGENTS.md invariant 4 and gotcha 7). The
 * UI divides two of these and prints the timestamp they were taken at.
 *
 * The `bound` stage exists because of docs/FINDINGS.md F-01: on BSC, 98% of
 * endpoints answer HTTP 200 and almost none are attached to a runtime. A funnel
 * that stops at "responding" tells a flattering lie.
 */

export interface FunnelRow {
  stage: string
  label: string
  count: number
  /** How this number was obtained, so it can be reproduced. */
  method: string
}

export interface CategoryFunnelRow {
  category: string
  registered: number
  hasServiceMetadata: number
  reachableNow: number
  classified: number
  /**
   * Distinct third-party SUPPLIERS that are live and callable — counted by
   * distinct endpoint host, not by registration.
   *
   * Registrations overstate supply badly on BSC: one operator registers the
   * same endpoint under many ERC-8004 identities, so 46 "callable" rebalancing
   * registrations turned out to be 7 actual suppliers. A marketplace that
   * counts registrations is quoting its own inventory 6x.
   */
  thirdPartyExecutable: number
  /** Registrations behind those suppliers. Published alongside, never instead. */
  thirdPartyRegistrations: number
  /** Marque's own agents. Never counted toward the third-party number. */
  referenceAgents: number
  supplyGap: boolean
}

/**
 * Marque's own reference agents are identified by owner address so that a
 * first-party agent can never be miscounted as third-party supply. Populated
 * in P8a; empty until then, which is the honest state.
 */
export const MARQUE_REFERENCE_OWNERS: readonly string[] = [
  // Filled in when the reference agents are registered (P8a).
]

/** True when the supply for a required category is too thin to be a market. */
export const MIN_THIRD_PARTY_PER_CATEGORY = 2

/**
 * The funnel aggregates, cached as last-good projections in Redis.
 *
 * Each aggregate costs several seconds over the whole registry. The numbers only
 * move when the ingest and probe workers finish a sweep, minutes apart, so a page
 * never waits for them: a fresh value (under 90 s) is returned as-is, a stale one is
 * returned at once and refreshed in the background, and because the value lives in
 * Redis a restart or a blue/green swap still answers instantly. Only a first-ever
 * read with nothing stored awaits the query.
 */
const MEMO_TTL_MS = 90_000

async function memoised<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const p = await cachedProjection(`registry:${key}`, fn, { freshMs: MEMO_TTL_MS, timeoutMs: 60_000, staleWhileRevalidate: true })
  return p.value
}

export async function funnel(chainId = 56): Promise<FunnelRow[]> {
  return memoised(`funnel:${chainId}`, () => funnelUncached(chainId))
}

async function funnelUncached(chainId = 56): Promise<FunnelRow[]> {
  const d = db()
  const rows = await d.execute(sql`
    with base as (select id, detail_fetched, owner_address from agent where chain_id = ${chainId}),
    svc as (
      select distinct agent_id from agent_service
    ),
    latest_service_probe as (
      select ps.service_id, p.liveness, p.executable_endpoint, p.task_kinds, p.checked_at
      from probe_schedule ps join probe p on p.id = ps.last_probe_id
    ),
    service_state as (
      select s.agent_id,
        bool_or(p.liveness in ('live','unbound','bad_schema') and p.checked_at > now() - interval '24 hours') as reachable,
        bool_or(p.liveness = 'live' and p.executable_endpoint is not null
          and p.checked_at > now() - interval '24 hours' and s.kind in ('a2a','mcp')) as callable,
        bool_or(p.liveness = 'live' and p.executable_endpoint is not null
          and p.checked_at > now() - interval '24 hours' and s.kind in ('a2a','mcp')
          and jsonb_array_length(coalesce(p.task_kinds, '[]'::jsonb)) > 0) as compatible
      from agent_service s left join latest_service_probe p on p.service_id = s.id
      group by s.agent_id
    ),
    latest_category as (
      select distinct on (agent_id) agent_id, category
      from agent_category order by agent_id, (category <> 'unclassified') desc, confidence desc, assigned_at desc
    ),
    qualified as (
      select distinct agent_id from conformance_result where pass = true
    ),
    hireable as (
      select distinct s.agent_id
      from agent_service s
      join latest_service_probe p on p.service_id = s.id
      join latest_category c on c.agent_id = s.agent_id
      where p.liveness = 'live' and p.executable_endpoint is not null
        and p.checked_at > now() - interval '24 hours' and s.kind in ('a2a','mcp')
        and p.task_kinds ? case c.category
          when 'rebalancing' then 'rebalance'
          when 'grid' then 'grid'
          when 'yield' then 'yield'
          when 'health_factor' then 'health_factor'
          else '__unsupported__' end
    )
    select
      (select count(*) from base) as registered,
      (select count(*) from base where detail_fetched = true) as metadata_readable,
      (select count(*) from base b join svc s on s.agent_id = b.id) as with_parseable_service,
      (select count(*) from base b join service_state s on s.agent_id = b.id where s.reachable) as reachable,
      (select count(*) from base b join service_state s on s.agent_id = b.id where s.callable) as callable,
      (select count(*) from base b join service_state s on s.agent_id = b.id where s.compatible) as compatible,
      (select count(*) from base b join qualified q on q.agent_id = b.id) as qualified,
      (select count(*) from base b join hireable h on h.agent_id = b.id) as hireable
  `)
  const r = (((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]))[0] ?? {}) as Record<string, unknown>
  const n = (k: string): number => Number(r[k] ?? 0)

  return [
    { stage: 'registered_bsc', label: 'Registered on BSC', count: n('registered'), method: 'count of indexed agents on chain 56' },
    { stage: 'metadata_readable', label: 'Metadata readable', count: n('metadata_readable'), method: 'identity detail was fetched and parsed' },
    { stage: 'service_declared', label: 'Declares a service', count: n('with_parseable_service'), method: 'identity has at least one normalized service row' },
    { stage: 'reachable', label: 'Reachable', count: n('reachable'), method: 'at least one exact service returned protocol-shaped evidence within 24 hours' },
    { stage: 'callable', label: 'Callable', count: n('callable'), method: 'fresh exact A2A/MCP service declares an executable endpoint' },
    { stage: 'compatible', label: 'Task compatible', count: n('compatible'), method: 'fresh callable service exposes at least one schema-addressable Marque task kind' },
    { stage: 'qualified', label: 'Qualified', count: n('qualified'), method: 'identity has at least one stored passing MCS result' },
    { stage: 'hireable', label: 'Hireable', count: n('hireable'), method: 'fresh compatible service matches the identity current category and Charter task' },
  ]
}

/**
 * Per-category supply, with first-party and third-party counted separately.
 *
 * Reference agents NEVER contribute to `thirdPartyExecutable`. That separation
 * is the difference between measuring a market and flattering one.
 */
export async function categoryFunnel(chainId = 56): Promise<CategoryFunnelRow[]> {
  return memoised(`categoryFunnel:${chainId}`, () => categoryFunnelUncached(chainId))
}

async function categoryFunnelUncached(chainId = 56): Promise<CategoryFunnelRow[]> {
  const d = db()
  const owners = MARQUE_REFERENCE_OWNERS.length > 0
    ? sql`lower(b.owner_address) in (${sql.join(MARQUE_REFERENCE_OWNERS.map((o) => sql`${o.toLowerCase()}`), sql`, `)})`
    : sql`false`

  const rows = await d.execute(sql`
    with base as (select id, detail_fetched, owner_address from agent where chain_id = ${chainId}),
    latest_service_probe as (
      select ps.service_id, p.liveness, p.executable_endpoint, p.task_kinds, p.checked_at
      from probe_schedule ps join probe p on p.id = ps.last_probe_id
    ),
    labelled_services as (
      select c.category, b.id, b.owner_address,
             (${owners}) as is_reference,
             s.id as service_id, s.kind, p.liveness, p.executable_endpoint, p.task_kinds, p.checked_at,
             regexp_replace(coalesce(s.resolved_endpoint, s.endpoint), '^(https?://[^/]+).*', '\\1') as host
      from base b
      join agent_category c on c.agent_id = b.id
      left join agent_service s on s.agent_id = b.id
      left join latest_service_probe p on p.service_id = s.id
      where c.category <> 'unclassified'
    )
    select category,
           count(distinct id) as registered,
           count(distinct id) filter (where service_id is not null) as has_service_metadata,
           count(distinct host) filter (where liveness in ('live','unbound','bad_schema')
             and checked_at > now() - interval '24 hours') as reachable_now,
           count(distinct id) as classified,
           count(distinct host) filter (where liveness = 'live' and executable_endpoint is not null
             and checked_at > now() - interval '24 hours' and kind in ('a2a','mcp') and not is_reference
             and task_kinds ? case category
               when 'rebalancing' then 'rebalance' when 'grid' then 'grid'
               when 'yield' then 'yield' when 'health_factor' then 'health_factor'
               else '__unsupported__' end) as third_party_executable,
           count(distinct id) filter (where liveness = 'live' and executable_endpoint is not null
             and checked_at > now() - interval '24 hours' and kind in ('a2a','mcp') and not is_reference
             and task_kinds ? case category
               when 'rebalancing' then 'rebalance' when 'grid' then 'grid'
               when 'yield' then 'yield' when 'health_factor' then 'health_factor'
               else '__unsupported__' end) as third_party_registrations,
           count(distinct owner_address) filter (where is_reference) as reference_agents
    from labelled_services
    group by category
    order by category
  `)

  const list = ((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])) as Array<Record<string, unknown>>
  return list.map((r) => {
    const thirdParty = Number(r['third_party_executable'] ?? 0)
    return {
      category: String(r['category']),
      registered: Number(r['registered'] ?? 0),
      hasServiceMetadata: Number(r['has_service_metadata'] ?? 0),
      reachableNow: Number(r['reachable_now'] ?? 0),
      classified: Number(r['classified'] ?? 0),
      thirdPartyExecutable: thirdParty,
      thirdPartyRegistrations: Number(r['third_party_registrations'] ?? 0),
      referenceAgents: Number(r['reference_agents'] ?? 0),
      supplyGap: thirdParty < MIN_THIRD_PARTY_PER_CATEGORY,
    }
  })
}

/** How BSC agents actually die. Drives the graveyard view. */
export async function failureHistogram(): Promise<Array<{ failureClass: string; count: number; share: number }>> {
  return memoised('failureHistogram', failureHistogramUncached)
}

async function failureHistogramUncached(): Promise<Array<{ failureClass: string; count: number; share: number }>> {
  const d = db()
  const rows = await d.execute(sql`
    with latest as (
      select ps.service_id, p.ok, p.failure_class
      from probe_schedule ps join probe p on p.id = ps.last_probe_id
    )
    select coalesce(failure_class, 'none') as failure_class, count(*) as n
    from latest group by 1 order by n desc
  `)
  const list = ((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])) as Array<Record<string, unknown>>
  const total = list.reduce((s, r) => s + Number(r['n'] ?? 0), 0)
  return list.map((r) => ({
    failureClass: String(r['failure_class']),
    count: Number(r['n'] ?? 0),
    share: total > 0 ? Number(r['n'] ?? 0) / total : 0,
  }))
}
