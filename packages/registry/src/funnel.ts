import { sql } from 'drizzle-orm'
import { db } from '@marque/db'

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
  /** Live, callable, and NOT a Marque reference agent. */
  thirdPartyExecutable: number
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

export async function funnel(chainId = 56): Promise<FunnelRow[]> {
  const d = db()
  const rows = await d.execute(sql`
    with base as (select * from agent where chain_id = ${chainId}),
    svc as (
      select distinct agent_id from agent_service
    ),
    latest_probe as (
      select distinct on (agent_id) agent_id, ok, liveness
      from probe order by agent_id, checked_at desc
    )
    select
      (select count(*) from base) as registered,
      (select count(*) from base b join svc s on s.agent_id = b.id) as with_parseable_service,
      (select count(*) from base b join latest_probe p on p.agent_id = b.id
         where p.liveness in ('live','unbound','bad_schema')) as responding_now,
      (select count(*) from base b join latest_probe p on p.agent_id = b.id
         where p.liveness = 'live') as bound_now,
      (select count(*) from base b join agent_category c on c.agent_id = b.id
         where c.category <> 'unclassified') as classified,
      (select count(*) from base b
         join agent_category c on c.agent_id = b.id
         join latest_probe p on p.agent_id = b.id
         where c.category <> 'unclassified' and p.liveness = 'live') as classified_and_live
  `)
  const r = (((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]))[0] ?? {}) as Record<string, unknown>
  const n = (k: string): number => Number(r[k] ?? 0)

  return [
    { stage: 'registered_bsc', label: 'Registered on BSC', count: n('registered'), method: 'count of indexed agents on chain 56' },
    { stage: 'with_parseable_service', label: 'Declares a service we can parse', count: n('with_parseable_service'), method: 'agents with at least one agent_service row' },
    { stage: 'responding_now', label: 'Endpoint responds', count: n('responding_now'), method: 'latest probe returned a well-formed response' },
    { stage: 'bound_now', label: 'Bound and callable', count: n('bound_now'), method: 'latest probe found an executable endpoint or declared skills' },
    { stage: 'classified', label: 'Classified into a category', count: n('classified'), method: 'has a non-unclassified category label' },
    { stage: 'marked', label: 'Classified and callable', count: n('classified_and_live'), method: 'classified AND latest probe liveness = live' },
  ]
}

/**
 * Per-category supply, with first-party and third-party counted separately.
 *
 * Reference agents NEVER contribute to `thirdPartyExecutable`. That separation
 * is the difference between measuring a market and flattering one.
 */
export async function categoryFunnel(chainId = 56): Promise<CategoryFunnelRow[]> {
  const d = db()
  const owners = MARQUE_REFERENCE_OWNERS.length > 0
    ? sql`lower(a.owner_address) in (${sql.join(MARQUE_REFERENCE_OWNERS.map((o) => sql`${o.toLowerCase()}`), sql`, `)})`
    : sql`false`

  const rows = await d.execute(sql`
    with base as (select * from agent where chain_id = ${chainId}),
    latest_probe as (
      select distinct on (agent_id) agent_id, ok, liveness
      from probe order by agent_id, checked_at desc
    ),
    labelled as (
      select c.category, b.id, b.owner_address,
             (${owners}) as is_reference,
             exists (select 1 from agent_service s where s.agent_id = b.id) as has_service,
             p.liveness
      from base b
      join agent_category c on c.agent_id = b.id
      left join latest_probe p on p.agent_id = b.id
      where c.category <> 'unclassified'
    )
    select category,
           count(*) as registered,
           count(*) filter (where has_service) as has_service_metadata,
           count(*) filter (where liveness in ('live','unbound','bad_schema')) as reachable_now,
           count(*) as classified,
           count(*) filter (where liveness = 'live' and not is_reference) as third_party_executable,
           count(*) filter (where is_reference) as reference_agents
    from labelled
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
      referenceAgents: Number(r['reference_agents'] ?? 0),
      supplyGap: thirdParty < MIN_THIRD_PARTY_PER_CATEGORY,
    }
  })
}

/** How BSC agents actually die. Drives the graveyard view. */
export async function failureHistogram(): Promise<Array<{ failureClass: string; count: number; share: number }>> {
  const d = db()
  const rows = await d.execute(sql`
    with latest as (
      select distinct on (service_id) service_id, ok, failure_class
      from probe where service_id is not null
      order by service_id, checked_at desc
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
