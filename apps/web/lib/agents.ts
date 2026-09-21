import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { agentState, agentStates, TASK_FOR_CATEGORY } from './agent-state'

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
  serviceId?: number
  executableEndpoint?: string | null
  probeId?: number | null
}

import { REFERENCE_AGENTS, isReferenceAgent } from './reference-agents'

/**
 * Marque's own reference agents, per category.
 *
 * Names and category come from the one source of truth in `reference-agents.ts`
 * (invariant 18). Listed first so a category is never empty while we have a
 * working counterparty, and marked so no screen can present one as a market.
 * They are not rows in the agent table: that table is derived state and must be
 * rebuildable from chain, and these are not registered on chain.
 *
 * An agent only appears if its public URL is configured — a reference agent we
 * cannot actually reach is not a counterparty and is not listed.
 */
function referenceAgents(category: string): CallableAgent[] {
  return REFERENCE_AGENTS.filter((a) => a.category === category).flatMap((a) => {
    const base = process.env[a.publicUrlEnv]
    if (!base) return []
    return [{
      agentId: a.id,
      tokenId: a.slug,
      name: a.name,
      kind: 'a2a',
      endpoint: `${base.replace(/\/$/, '')}/.well-known/agent-card.json`,
      host: new URL(base).origin,
      latencyMs: null,
      isReference: true,
    }]
  })
}

/**
 * One specific agent, by id, if it is callable right now.
 *
 * `callableAgents` answers "who can serve this category", which is the right
 * question for browsing the desk but the wrong one when a buyer arrived from
 * the marketplace having already chosen someone. That list is capped at twelve,
 * deduplicated by host and filtered to a single category, so a perfectly
 * callable agent can be absent from it — and the desk used to respond by
 * quietly selecting whoever was first, which on every category is a Marque
 * reference agent. Looking the requested agent up directly is what stops the
 * desk substituting a different counterparty for the one that was asked for.
 */
export async function callableAgentById(agentId: string, category: string): Promise<CallableAgent | null> {
  const ref = REFERENCE_AGENTS.find((a) => a.id === agentId)
  if (ref) return ref.category === category
    ? referenceAgents(ref.category).find((a) => a.agentId === agentId) ?? null
    : null

  const task = TASK_FOR_CATEGORY[category]
  if (!task) return null
  const state = await agentState(agentId, task)
  const service = state?.selectedService
  if (!state?.hireable || !service) return null
  const endpoint = service.protocol === 'a2a' || service.protocol === 'termix'
    ? service.discoveryEndpoint
    : service.executableEndpoint
  if (!endpoint) return null
  return {
    agentId: state.agentId,
    tokenId: state.tokenId ?? '',
    name: state.name,
    kind: service.protocol,
    endpoint,
    host: new URL(endpoint).origin,
    latencyMs: null,
    isReference: isReferenceAgent(state.agentId),
    serviceId: service.serviceId,
    executableEndpoint: service.executableEndpoint,
    probeId: service.probeId,
  }
}

export async function callableAgents(category: string, limit = 12): Promise<CallableAgent[]> {
  const task = TASK_FOR_CATEGORY[category]
  if (!task) return []
  const rows = await db().execute(sql`
    select distinct a.id as agent_id
    from agent a
    join agent_category c on c.agent_id = a.id
    join agent_service s on s.agent_id = a.id
    where c.category = ${category} and a.id <> 'canary:ssrf'
      and a.chain_id = 56 and s.kind in ('a2a', 'mcp', 'x402', 'erc8183')
    order by a.id
    limit ${Math.max(limit * 8, 48)}
  `)
  const list = ((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])) as Array<Record<string, unknown>>
  const ids = list.map((r) => String(r['agent_id']))
  const states = await agentStates(ids, task)
  const evaluated = ids.map((agentId): CallableAgent | null => {
    const state = states.get(agentId)
    const service = state?.selectedService
    if (!state?.hireable || !service) return null
    const endpoint = service.protocol === 'a2a' || service.protocol === 'termix'
      ? service.discoveryEndpoint
      : service.executableEndpoint
    if (!endpoint) return null
    return {
      agentId: state.agentId,
      tokenId: state.tokenId ?? '',
      name: state.name,
      kind: service.protocol,
      endpoint,
      host: new URL(endpoint).origin,
      latencyMs: null,
      isReference: false,
      serviceId: service.serviceId,
      executableEndpoint: service.executableEndpoint,
      probeId: service.probeId,
    }
  })
  const seenHosts = new Set<string>()
  const indexed: CallableAgent[] = []
  for (const candidate of evaluated) {
    if (!candidate || seenHosts.has(candidate.host)) continue
    seenHosts.add(candidate.host)
    indexed.push(candidate)
    if (indexed.length >= limit) break
  }
  return [...referenceAgents(category), ...indexed]
}
