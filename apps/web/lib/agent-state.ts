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
      where a.id = ${agentId} and a.chain_id = 56 and a.id <> 'canary:ssrf'
      limit 1
    `),
    db().execute(sql`
      with latest as (
        select distinct on (service_id)
          id as probe_id, service_id, checked_at, liveness, failure_class,
          executable_endpoint, task_kinds, manifest
        from probe
        where agent_id = ${agentId} and service_id is not null
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
      where s.agent_id = ${agentId}
      order by s.id
    `),
    db().execute(sql`
      select test_id, pass, ran_at
      from conformance_result
      where agent_id = ${agentId}
      order by ran_at desc
      limit 1
    `),
  ])

  const identity = rowsOf(identityResult)[0]
  if (!identity) return null

  const services: ServiceCapabilityEvidence[] = rowsOf(serviceResult).map((row) => ({
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

  const q = rowsOf(qualificationResult)[0]
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

  return {
    ...state,
    tokenId: identity['token_id'] == null ? null : String(identity['token_id']),
    name: String(identity['name']),
    ownerAddress: identity['owner_address'] == null ? null : String(identity['owner_address']),
  }
}

