import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
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
 * Canonically evaluate several identities from three bounded queries.
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
  const [identityResult, serviceResult, qualificationResult] = await Promise.all([
    db().execute(sql`
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
    `),
    db().execute(sql`
      with latest as (
        select distinct on (service_id)
          id as probe_id, service_id, checked_at, liveness, failure_class,
          executable_endpoint, task_kinds, manifest
        from probe
        where agent_id in (${idList}) and service_id is not null
        order by service_id, checked_at desc
      )
      select s.id as service_id, s.agent_id, s.kind,
             coalesce(s.resolved_endpoint, s.endpoint) as discovery_endpoint,
             case when s.kind in ('a2a', 'termix') then l.executable_endpoint
                  else coalesce(l.executable_endpoint, s.resolved_endpoint, s.endpoint) end as executable_endpoint,
             l.probe_id, l.checked_at, l.liveness, l.failure_class,
             coalesce(l.task_kinds, '[]'::jsonb) as task_kinds, l.manifest
      from agent_service s
      left join latest l on l.service_id = s.id
      where s.agent_id in (${idList})
      order by s.id
    `),
    db().execute(sql`
      select distinct on (agent_id) agent_id, test_id, pass, ran_at
      from conformance_result
      where agent_id in (${idList})
      order by agent_id, ran_at desc
    `),
  ])

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
      settleableServiceIds: [],
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
