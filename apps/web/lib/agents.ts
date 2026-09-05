import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'

/**
 * Agents that can actually be hired in a category.
 *
 * Counted by distinct HOST, not by registration. One operator registers the
 * same endpoint under dozens of ERC-8004 identities on this chain, and counting
 * registrations once produced a homepage claiming forty-two callable
 * rebalancing agents where there were seven counterparties.
 */
export interface CallableAgent {
  agentId: string
  tokenId: string
  name: string
  kind: string
  endpoint: string
  host: string
  latencyMs: number | null
  isReference: boolean
}

/** Hosts belonging to Marque. Always labelled as first-party (invariant 1). */
const REFERENCE_HINT = /marque/i

/**
 * Marque's own reference agents, per category.
 *
 * Listed first so a category is never empty while we have a working
 * counterparty, and marked so no screen can present one as a market. They are
 * not rows in the agent table: that table is derived state and must be
 * rebuildable from chain, and these are not registered on chain.
 */
function referenceAgents(category: string): CallableAgent[] {
  if (category !== 'health_factor') return []
  const base = process.env['KEEL_PUBLIC_URL']
  if (!base) return []
  return [{
    agentId: 'marque:keel',
    tokenId: 'keel',
    name: 'Keel',
    kind: 'a2a',
    endpoint: `${base.replace(/\/$/, '')}/.well-known/agent-card.json`,
    host: new URL(base).origin,
    latencyMs: null,
    isReference: true,
  }]
}

export async function callableAgents(category: string, limit = 12): Promise<CallableAgent[]> {
  const rows = await db().execute(sql`
    with latest as (
      select distinct on (service_id) service_id, agent_id, liveness, latency_ms, executable_endpoint
      from probe where service_id is not null
      order by service_id, checked_at desc
    )
    select distinct on (host)
      a.id as agent_id, a.token_id, coalesce(a.name, 'Unnamed agent') as name,
      s.kind, coalesce(l.executable_endpoint, s.resolved_endpoint, s.endpoint) as endpoint,
      regexp_replace(coalesce(l.executable_endpoint, s.resolved_endpoint, s.endpoint), '^(https?://[^/]+).*', '\\1') as host,
      l.latency_ms
    from latest l
    join agent_service s on s.id = l.service_id
    join agent a on a.id = l.agent_id
    join agent_category c on c.agent_id = a.id
    where l.liveness = 'live' and c.category = ${category} and a.id <> 'canary:ssrf'
    order by host, l.latency_ms asc nulls last
    limit ${limit}
  `)
  const list = ((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])) as Array<Record<string, unknown>>
  const indexed: CallableAgent[] = list.map((r) => ({
    agentId: String(r['agent_id']),
    tokenId: String(r['token_id']),
    name: String(r['name']),
    kind: String(r['kind']),
    endpoint: String(r['endpoint']),
    host: String(r['host']),
    latencyMs: r['latency_ms'] === null ? null : Number(r['latency_ms']),
    isReference: REFERENCE_HINT.test(String(r['host'])),
  }))
  return [...referenceAgents(category), ...indexed]
}
