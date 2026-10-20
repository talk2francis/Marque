import 'server-only'
import { sql } from 'drizzle-orm'
import { boundedCommerceRead } from '@marque/commerce/reads'
import {
  evaluateAgentState,
  type CanonicalAgentState,
  type QualificationEvidence,
  type ServiceCapabilityEvidence,
  type TaskKind,
} from '@marque/execution'

export const TASK_FOR_CATEGORY: Readonly<Record<string, TaskKind | undefined>> = {
  rebalancing: 'rebalance',
  grid: 'grid',
  yield: 'yield',
  health_factor: 'health_factor',
}

export interface AgentStateView extends CanonicalAgentState {
  tokenId: string | null
  name: string
  ownerAddress: string | null
}

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  return (((result as { rows?: unknown[] })?.rows ?? result) as Array<Record<string, unknown>>)
}

/** The one canonical third-party state consumed by every transactional surface. */
export async function agentState(
  agentId: string,
  requestedTask: TaskKind | null,
  now = new Date(),
): Promise<AgentStateView | null> {
  return (await agentStates([agentId], requestedTask, now)).get(agentId) ?? null
}

/**
 * Canonically evaluate several identities from four bounded read queries.
 *
 * This is deliberately the implementation behind `agentState`, rather than a
 * second SQL approximation of hireability.  Inventory and exact deep links
 * therefore consume the same evaluator, evidence tuple and freshness clock.
 */
export async function agentStates(
  agentIds: readonly string[],
  requestedTask: TaskKind | null,
  now = new Date(),
): Promise<Map<string, AgentStateView>> {
  const ids = [...new Set(agentIds)].filter(Boolean)
  if (ids.length === 0) return new Map()
  const idList = sql.join(ids.map((id) => sql`${id}`), sql`, `)
  const [identityResult, serviceResult, qualificationResult, settledResult] = await Promise.all([
    boundedCommerceRead(sql`
      select a.id, a.token_id, coalesce(a.name, 'Unnamed agent') as name,
             a.owner_address, a.detail_fetched, c.category
      from agent a
      left join lateral (
        select category from agent_category c
        where c.agent_id = a.id
        order by (category <> 'unclassified') desc, confidence desc, assigned_at desc
        limit 1
      ) c on true
      where a.id in (${idList}) and a.chain_id = 56 and a.id <> 'canary:ssrf'
    `, 'exact'),
    boundedCommerceRead(agentServiceEvidenceQuery(ids), 'exact'),
    boundedCommerceRead(sql`
      select distinct on (agent_id) agent_id, test_id, pass, ran_at
      from conformance_result
      where agent_id in (${idList})
      order by agent_id, ran_at desc
    `, 'exact'),
    // Settleable evidence (P2-03): an indexed ERC-8183 job paid to this agent's wallet
    // that was delivered and then settled (JobCompleted or PaymentReleased).
    boundedCommerceRead(sql`
      select distinct s.id as service_id
      from agent_service s
      join agent a on a.id = s.agent_id
      join commerce_job j on j.provider = a.agent_wallet and j.state in ('COMPLETED', 'PAID')
      where s.agent_id in (${idList}) and s.kind = 'a2a'
    `, 'exact').catch(() => []),
  ])
  const settleableServiceIds = rowsOf(settledResult).map((r) => Number(r['service_id']))

  const serviceRows = rowsOf(serviceResult)
  const qualificationRows = rowsOf(qualificationResult)
  const result = new Map<string, AgentStateView>()
  for (const identity of rowsOf(identityResult)) {
    const agentId = String(identity['id'])
    const services: ServiceCapabilityEvidence[] = serviceRows
      .filter((row) => String(row['agent_id']) === agentId)
      .map((row) => ({
    serviceId: Number(row['service_id']),
    agentId: String(row['agent_id']),
    protocol: String(row['kind']),
    discoveryEndpoint: String(row['discovery_endpoint']),
    executableEndpoint: row['executable_endpoint'] == null ? null : String(row['executable_endpoint']),
    probeId: row['probe_id'] == null ? null : Number(row['probe_id']),
    probedAt: row['checked_at'] instanceof Date
      ? (row['checked_at'] as Date).toISOString()
      : row['checked_at'] == null ? null : String(row['checked_at']),
    liveness: row['liveness'] == null ? null : String(row['liveness']),
    failureClass: row['failure_class'] == null ? null : String(row['failure_class']),
    taskKinds: Array.isArray(row['task_kinds']) ? row['task_kinds'] as TaskKind[] : [],
    manifest: row['manifest'] && typeof row['manifest'] === 'object'
      ? row['manifest'] as Record<string, unknown>
      : null,
      }))

    const q = qualificationRows.find((row) => String(row['agent_id']) === agentId)
    const qualification: QualificationEvidence | null = q ? {
    testId: String(q['test_id']),
    passed: q['pass'] === true,
    measuredAt: q['ran_at'] instanceof Date ? (q['ran_at'] as Date).toISOString() : String(q['ran_at']),
    stale: now.getTime() - new Date(q['ran_at'] as string | Date).getTime() > 72 * 60 * 60_000,
    } : null

    const category = identity['category'] == null ? null : String(identity['category'])
    const state = evaluateAgentState({
      agentId,
      registered: true,
      metadataReadable: identity['detail_fetched'] === true,
      category,
      requestedTask,
      services,
      qualification,
      authorizable: requestedTask !== null && TASK_FOR_CATEGORY[category ?? ''] === requestedTask,
      quoteableProtocols: ['x402', 'erc8183'],
      settleableServiceIds,
      now,
    })

    result.set(agentId, {
      ...state,
      tokenId: identity['token_id'] == null ? null : String(identity['token_id']),
      name: String(identity['name']),
      ownerAddress: identity['owner_address'] == null ? null : String(identity['owner_address']),
    })
  }
  return result
}

/** Newest exact-service observation, including manual probes outside scheduling. */
export function agentServiceEvidenceQuery(agentIds: readonly string[]) {
  const idList = sql.join(agentIds.map(id => sql`${id}`), sql`, `)
  return sql`
      select s.id as service_id, s.agent_id, s.kind,
             coalesce(s.resolved_endpoint, s.endpoint) as discovery_endpoint,
             case when s.kind in ('a2a', 'termix') then l.executable_endpoint
                  else coalesce(l.executable_endpoint, s.resolved_endpoint, s.endpoint) end as executable_endpoint,
             l.probe_id, l.checked_at, l.liveness, l.failure_class,
             coalesce(l.task_kinds, '[]'::jsonb) as task_kinds, l.manifest
      from agent_service s
      left join lateral (
        select p.id as probe_id, p.checked_at, p.liveness, p.failure_class,
               p.executable_endpoint, p.task_kinds, p.manifest
        from probe p
        where p.service_id = s.id and p.agent_id = s.agent_id
        order by p.checked_at desc nulls last
        limit 1
      ) l on true
      where s.agent_id in (${idList}) and s.currently_declared is distinct from false
      order by s.id
  `
}
