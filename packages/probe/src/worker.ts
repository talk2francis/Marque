import { sql, eq, and, inArray, desc } from 'drizzle-orm'
import { db, agent, agentService, probe, type ServiceKind } from '@marque/db'
import { probeService } from './liveness.js'

/**
 * The probe worker.
 *
 * Probes every declared service endpoint on a cycle and records what it found.
 * Two rules from AGENTS.md govern the design:
 *
 *  - **Never drop a dead endpoint.** The graveyard is a product feature
 *    (invariant 7). Consistently-dead endpoints get exponential backoff so they
 *    stop costing us requests, but they are never removed and never hidden.
 *  - **Our probe is the only source of displayed liveness** (gotcha 6).
 *    8004scan's own `health_checked_at` can be months stale.
 */

export interface ProbeCycleResult {
  attempted: number
  live: number
  unbound: number
  badSchema: number
  dead: number
  skippedBackoff: number
}

/**
 * Backoff schedule, in minutes, indexed by recent failure count.
 *
 * A dead endpoint is re-probed ever less often but is NEVER dropped — the
 * graveyard is a product feature. The SQL CASE that applies this is generated
 * from this array so the schedule lives in exactly one place.
 */
export const BACKOFF_MINUTES = [5, 5, 15, 30, 60, 180, 360, 720, 1440] as const

export function backoffFor(recentFailures: number): number {
  const idx = Math.min(Math.max(0, recentFailures), BACKOFF_MINUTES.length - 1)
  return BACKOFF_MINUTES[idx] as number
}

/** The schedule as a SQL CASE expression, so it can never drift from the array. */
function backoffCaseSql(): string {
  const branches = BACKOFF_MINUTES.slice(0, -1)
    .map((mins, i) => `when coalesce(st.recent_failures, 0) = ${i} then ${mins}`)
    .join('\n               ')
  return `case\n               ${branches}\n               else ${BACKOFF_MINUTES[BACKOFF_MINUTES.length - 1]} end`
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let cursor = 0
  const width = Math.max(1, Math.min(limit, items.length))
  await Promise.all(
    Array.from({ length: width }, async () => {
      for (;;) {
        const i = cursor++
        if (i >= items.length) return
        out[i] = await fn(items[i] as T)
      }
    }),
  )
  return out
}

/**
 * Per-host concurrency cap.
 *
 * Most BSC agents share a handful of hosts — one platform serves hundreds of
 * registrations — so a global concurrency of 20 lands as 20 simultaneous
 * requests on a single third party. That is both rude and self-defeating: it
 * gets us throttled, and a throttled endpoint is indistinguishable from a dead
 * one in our own results. Politeness here is measurement accuracy.
 */
const PER_HOST_CONCURRENCY = Number(process.env.PROBE_PER_HOST_CONCURRENCY ?? 3)

class HostLimiter {
  private readonly active = new Map<string, number>()
  private readonly queues = new Map<string, Array<() => void>>()

  private hostOf(url: string): string {
    try { return new URL(url).host } catch { return url }
  }

  async run<T>(url: string, fn: () => Promise<T>): Promise<T> {
    const host = this.hostOf(url)
    while ((this.active.get(host) ?? 0) >= PER_HOST_CONCURRENCY) {
      await new Promise<void>((resolve) => {
        const q = this.queues.get(host)
        if (q) q.push(resolve)
        else this.queues.set(host, [resolve])
      })
    }
    this.active.set(host, (this.active.get(host) ?? 0) + 1)
    try {
      return await fn()
    } finally {
      this.active.set(host, Math.max(0, (this.active.get(host) ?? 1) - 1))
      const q = this.queues.get(host)
      const next = q?.shift()
      if (next) next()
    }
  }
}

interface Candidate {
  serviceId: number
  agentId: string
  kind: ServiceKind
  url: string
}

/**
 * Services due for a probe.
 *
 * "Due" accounts for backoff: an endpoint that has failed N times in a row is
 * only re-probed after BACKOFF_MINUTES[N]. Implemented in SQL so the worker
 * never pulls a candidate it is going to skip.
 */
async function dueServices(limit: number): Promise<Candidate[]> {
  const d = db()
  const rows = await d.execute(sql`
    with latest as (
      select distinct on (service_id)
        service_id, checked_at, ok, liveness
      from probe
      where service_id is not null
      order by service_id, checked_at desc
    ),
    streak as (
      select p.service_id, count(*) filter (where not p.ok) as recent_failures
      from probe p
      where p.service_id is not null
        and p.checked_at > now() - interval '2 days'
      group by p.service_id
    )
    select s.id as service_id,
           s.agent_id,
           s.kind,
           coalesce(s.resolved_endpoint, s.endpoint) as url,
           coalesce(st.recent_failures, 0) as failures,
           l.checked_at
    from agent_service s
    left join latest l on l.service_id = s.id
    left join streak st on st.service_id = s.id
    where (s.is_template = false or s.resolved_endpoint is not null)
      and (
        l.checked_at is null
        or l.checked_at < now() - make_interval(mins => ${sql.raw(backoffCaseSql())})
      )
    order by l.checked_at asc nulls first
    limit ${limit}
  `)

  const list = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])
  return (list as Array<Record<string, unknown>>).map((r) => ({
    serviceId: Number(r['service_id']),
    agentId: String(r['agent_id']),
    kind: String(r['kind']) as ServiceKind,
    url: String(r['url']),
  }))
}

export async function runProbeCycle(opts: { limit?: number; concurrency?: number } = {}): Promise<ProbeCycleResult> {
  const limit = opts.limit ?? 400
  const concurrency = opts.concurrency ?? 12
  const d = db()

  const candidates = await dueServices(limit)
  const result: ProbeCycleResult = {
    attempted: candidates.length, live: 0, unbound: 0, badSchema: 0, dead: 0, skippedBackoff: 0,
  }
  if (candidates.length === 0) return result

  const limiter = new HostLimiter()
  const rows = await mapLimit(candidates, concurrency, async (c) => {
    const outcome = await limiter.run(c.url, () => probeService(c.kind, c.url))
    switch (outcome.liveness) {
      case 'live': result.live++; break
      case 'unbound': result.unbound++; break
      case 'bad_schema': result.badSchema++; break
      default: result.dead++; break
    }
    return {
      agentId: c.agentId,
      serviceId: c.serviceId,
      ok: outcome.ok,
      latencyMs: outcome.latencyMs,
      statusCode: outcome.statusCode,
      failureClass: outcome.failureClass,
      detail: outcome.detail.slice(0, 500),
      liveness: outcome.liveness,
      skills: outcome.skills.slice(0, 50),
      executableEndpoint: outcome.executableEndpoint,
    }
  })

  // Probe history is a first-party observation: append only, never updated.
  for (let i = 0; i < rows.length; i += 500) {
    await d.insert(probe).values(rows.slice(i, i + 500))
  }
  return result
}

/** The most recent probe per agent, used by the funnel and the API. */
export async function latestProbeByAgent(agentIds: readonly string[]) {
  if (agentIds.length === 0) return []
  const d = db()
  return d
    .selectDistinctOn([probe.agentId], {
      agentId: probe.agentId,
      ok: probe.ok,
      liveness: probe.liveness,
      latencyMs: probe.latencyMs,
      failureClass: probe.failureClass,
      skills: probe.skills,
      checkedAt: probe.checkedAt,
    })
    .from(probe)
    .where(inArray(probe.agentId, [...agentIds]))
    .orderBy(probe.agentId, desc(probe.checkedAt))
}

/**
 * Seed a deliberately hostile service row so the SSRF guard can be demonstrated
 * against the real worker and a real database record, rather than only in a
 * unit test. Returns the service id.
 */
export async function seedSsrfCanary(url = 'http://127.0.0.1:5432/agent-card'): Promise<number> {
  const d = db()
  const canaryAgent = 'canary:ssrf'
  await d.insert(agent).values({
    id: canaryAgent,
    chainId: 56,
    tokenId: 'ssrf-canary',
    contractAddress: '0x0000000000000000000000000000000000000000',
    name: 'SSRF canary (not a real agent)',
    description: 'Internal fixture. Points a service endpoint at loopback to prove the guard blocks it.',
  }).onConflictDoNothing()

  const inserted = await d.insert(agentService).values({
    agentId: canaryAgent,
    kind: 'a2a',
    endpoint: url,
    source: 'top_level',
    isTemplate: false,
  }).onConflictDoUpdate({
    target: [agentService.agentId, agentService.kind, agentService.endpoint],
    set: { lastSeen: sql`now()` },
  }).returning({ id: agentService.id })

  const id = inserted[0]?.id
  if (id === undefined) {
    const existing = await d.select({ id: agentService.id }).from(agentService)
      .where(and(eq(agentService.agentId, canaryAgent), eq(agentService.endpoint, url))).limit(1)
    return existing[0]?.id ?? -1
  }
  return id
}
