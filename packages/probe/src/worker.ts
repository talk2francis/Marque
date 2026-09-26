import { sql, eq, and, inArray, desc } from 'drizzle-orm'
import { db, agent, agentCategory, agentService, probe, type Category } from '@marque/db'
import { probeService } from './liveness.js'
import { syncSchedule, dueByTier, recordVerdicts, firstPartyAgentIds, type DueService, type Tier } from './schedule.js'

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
  byTier?: Record<Tier, number>
  scheduleInserted?: number
  scheduleBackfilled?: boolean
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
const CATEGORY_FOR_TASK: Readonly<Record<string, Category | undefined>> = {
  rebalance: 'rebalancing', grid: 'grid', yield: 'yield', health_factor: 'health_factor',
}

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

export async function runProbeCycle(opts: { limit?: number; concurrency?: number; deadCap?: number } = {}): Promise<ProbeCycleResult> {
  const limit = opts.limit ?? 400
  const concurrency = opts.concurrency ?? 12
  const deadCap = opts.deadCap ?? Number(process.env.PROBE_DEAD_CAP ?? 150)
  const d = db()

  const sync = await syncSchedule()
  const fpIds = await firstPartyAgentIds()
  const candidates = await dueByTier(limit, deadCap, fpIds)
  const byTier: Record<Tier, number> = { T0: 0, T1: 0, T1b: 0, T2: 0, T3: 0 }
  for (const c of candidates) byTier[c.tier]++
  const result: ProbeCycleResult = {
    attempted: candidates.length, live: 0, unbound: 0, badSchema: 0, dead: 0, skippedBackoff: 0,
    byTier, scheduleInserted: sync.inserted, scheduleBackfilled: sync.backfilled,
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
      checkedAt: new Date(),
      ok: outcome.ok,
      latencyMs: outcome.latencyMs,
      statusCode: outcome.statusCode,
      failureClass: outcome.failureClass,
      detail: outcome.detail.slice(0, 500),
      liveness: outcome.liveness,
      skills: outcome.skills.slice(0, 50),
      executableEndpoint: outcome.executableEndpoint,
      protocolVersion: outcome.protocolVersion ?? null,
      taskKinds: (outcome.taskKinds ?? []).slice(0, 20),
      manifest: outcome.manifest ?? null,
    }
  })

  // Probe history is a first-party observation: append only, never updated.
  const probeIds = new Map<number, number>()
  for (let i = 0; i < rows.length; i += 500) {
    const ins = await d.insert(probe).values(rows.slice(i, i + 500)).returning({ id: probe.id, serviceId: probe.serviceId })
    for (const r of ins) if (r.serviceId !== null) probeIds.set(r.serviceId, r.id)
  }
  await recordVerdicts(rows.map((r, i) => ({ due: candidates[i] as DueService, liveness: r.liveness, checkedAt: r.checkedAt, probeId: probeIds.get(r.serviceId) ?? null })))
  // A single schema-proven task kind is stronger category evidence than copy.
  // Add the derived label without deleting the historical unclassified row.
  for (const row of rows) {
    if (row.taskKinds.length !== 1) continue
    const category = CATEGORY_FOR_TASK[row.taskKinds[0] ?? '']
    if (!category) continue
    await d.insert(agentCategory).values({
      agentId: row.agentId, category, confidence: 1, method: 'owner_declared',
      rationale: `service ${row.serviceId} schema supports ${row.taskKinds[0]}`,
    }).onConflictDoUpdate({
      target: [agentCategory.agentId, agentCategory.category],
      set: { confidence: 1, method: 'owner_declared', rationale: `service ${row.serviceId} schema supports ${row.taskKinds[0]}`, assignedAt: sql`now()` },
    })
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
