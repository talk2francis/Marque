import { sql, eq, and, inArray, desc } from 'drizzle-orm'
import { db, agent, agentCategory, agentService, probe, type Category } from '@marque/db'
import { probeService } from './liveness.js'
import { syncSchedule, dueByTier, recordVerdicts, deferServices, firstPartyAgentIds, type DueService, type Tier } from './schedule.js'

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
  discovered: number
  unbound: number
  badSchema: number
  dead: number
  skippedBackoff: number
  byTier?: Record<Tier, number>
  /** Not started before the cycle deadline; still due, picked up next cycle. */
  skippedDeadline?: number
  /** Host failed at the connection level 3 times in a row this cycle; deferred (10 min for classified, 60 min otherwise), not recorded as a verdict. */
  deferredHostDown?: number
  /** Reachable services whose first attempt failed at the connection level and were asked once more. */
  confirmed?: number
  /** Of those, the ones that answered the second time (a false "dead" avoided). */
  recovered?: number
  scheduleInserted?: number
  scheduleBackfilled?: boolean
}

/**
 * Per-host limits.
 *
 * Most BSC agents share a handful of hosts: one platform serves hundreds of registrations. A global concurrency of
 * 32 would land as 32 simultaneous requests on a single third party. That is both rude and self-defeating: it gets
 * us throttled, and a throttled endpoint is indistinguishable from a dead one in our own results. Politeness here is
 * measurement accuracy. So each host gets at most PER_HOST_CONCURRENCY requests in flight and at most
 * PER_HOST_RPS request starts a second.
 */
// 16 Nov: the largest platform answered every card with nothing else from us in flight and stalled past the timeout
// with three, so each host now gets two requests in flight and one start a second.
const PER_HOST_CONCURRENCY = Number(process.env.PROBE_PER_HOST_CONCURRENCY ?? 2)
const PER_HOST_RPS = Number(process.env.PROBE_PER_HOST_RPS ?? 1)
const CATEGORY_FOR_TASK: Readonly<Record<string, Category | undefined>> = {
  rebalance: 'rebalancing', grid: 'grid', yield: 'yield', health_factor: 'health_factor',
}
/** A service whose last verdict was one of these is shown as reachable; it is not declared dead on one failed connection. */
const REACHABLE = new Set<string>(['live', 'discovered', 'unbound', 'bad_schema'])
const CONFIRM_PAUSE_MS = 1_500
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export const hostOfUrl = (u: string): string => { try { return new URL(u).host } catch { return u } }

/**
 * Run `fn` over every item with at most `concurrency` in flight overall, `perHost` in flight per host and
 * `perHostRps` starts a second per host. Results keep the input order.
 *
 * Each host has its own short line of runners, and a runner takes a global slot only for the moment it probes.
 * The earlier version took the global slot first and then waited in the host's queue, so a cycle full of one slow
 * platform's services left every other host's probes waiting behind it (16 Nov).
 */
export async function runByHost<T, R>(items: readonly T[], hostOf: (item: T) => string, limits: { concurrency: number; perHost: number; perHostRps: number; /** True when `fn` will return at once without a request (deadline passed, host deferred): it then takes no pacing turn and no slot. */ skip?: (item: T) => boolean }, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  const byHost = new Map<string, number[]>()
  items.forEach((item, i) => { const host = hostOf(item); const list = byHost.get(host); if (list) list.push(i); else byHost.set(host, [i]) })
  let active = 0
  const waiting: Array<() => void> = []
  const acquire = async (): Promise<void> => { while (active >= limits.concurrency) await new Promise<void>((resolve) => waiting.push(resolve)); active++ }
  const release = (): void => { active--; waiting.shift()?.() }
  const gapMs = limits.perHostRps > 0 ? 1000 / limits.perHostRps : 0
  await Promise.all([...byHost.values()].flatMap((indexes) => {
    let cursor = 0
    // Starts on one host take turns through `gate` and are spaced from the previous actual start, so a late timer on a
    // busy machine cannot release two of them back to back.
    let lastStart = -Infinity
    let gate: Promise<void> = Promise.resolve()
    const pace = (): Promise<void> => {
      gate = gate.then(async () => { const wait = lastStart + gapMs - Date.now(); if (wait > 0) await sleep(wait); lastStart = Date.now() })
      return gate
    }
    return Array.from({ length: Math.max(1, Math.min(limits.perHost, indexes.length)) }, async () => {
      for (;;) {
        const k = cursor++
        if (k >= indexes.length) return
        const i = indexes[k] as number
        // 16 Nov: 213 items past the deadline each waited a 1 s pacing turn before being skipped, and the cycle ran
        // 470 s against its 240 s deadline. Work that sends no request takes no turn.
        if (limits.skip?.(items[i] as T)) { out[i] = await fn(items[i] as T); continue }
        if (gapMs > 0) await pace()
        await acquire()
        try { out[i] = await fn(items[i] as T) } finally { release() }
      }
    })
  }))
  return out
}

export async function runProbeCycle(opts: { limit?: number; concurrency?: number; deadCap?: number; deadlineMs?: number; /** Only one chain's services (operator runs). */ chainId?: number } = {}): Promise<ProbeCycleResult> {
  const limit = opts.limit ?? 400
  const concurrency = opts.concurrency ?? 12
  const deadCap = opts.deadCap ?? Number(process.env.PROBE_DEAD_CAP ?? 150)
  const d = db()

  const sync = await syncSchedule()
  const fpIds = await firstPartyAgentIds()
  const candidates = await dueByTier(limit, deadCap, fpIds, opts.chainId)
  const byTier: Record<Tier, number> = { T0: 0, T1: 0, T1b: 0, T2: 0, T3: 0 }
  for (const c of candidates) byTier[c.tier]++
  const result: ProbeCycleResult = {
    attempted: candidates.length, live: 0, discovered: 0, unbound: 0, badSchema: 0, dead: 0, skippedBackoff: 0,
    byTier, scheduleInserted: sync.inserted, scheduleBackfilled: sync.backfilled,
  }
  if (candidates.length === 0) return result

  // A cycle never runs past its deadline, so the 5-minute tier is never late behind a
  // wall of timeouts. Unstarted candidates stay due and lead the next cycle.
  const deadline = Date.now() + (opts.deadlineMs ?? Number(process.env.PROBE_CYCLE_DEADLINE_MS ?? 240_000))
  // Per-cycle host breaker: after 3 connection-level failures in a row on one host, the
  // rest of that host's services this cycle are deferred, not probed and not recorded.
  // An unobserved endpoint gets no verdict; it is simply asked again later.
  const hostFails = new Map<string, number>()
  const CONNECTION_FAILURES = new Set(['timeout', 'refused', 'dns', 'tls'])
  const connectionFailure = (o: { failureClass?: string | null }): boolean => Boolean(o.failureClass && CONNECTION_FAILURES.has(o.failureClass))
  const deferred: DueService[] = []
  let skippedDeadline = 0
  const results = await runByHost(candidates, (c) => hostOfUrl(c.url), {
    concurrency, perHost: PER_HOST_CONCURRENCY, perHostRps: PER_HOST_RPS,
    skip: (c) => Date.now() > deadline || (c.tier !== 'T0' && (hostFails.get(hostOfUrl(c.url)) ?? 0) >= 3),
  }, async (c) => {
    const host = hostOfUrl(c.url)
    // Checked when the probe is about to start: the deadline or the breaker may have tripped while it waited.
    if (Date.now() > deadline) { skippedDeadline++; return null }
    if (c.tier !== 'T0' && (hostFails.get(host) ?? 0) >= 3) { deferred.push(c); return null }
    let outcome = await probeService(c.kind, c.url)
    // One failed connection is not a verdict on a service that was answering. Ask once more, a moment later, before
    // a listed agent is recorded dead: a stall on either side of the wire costs one retry, not a false "dead".
    if (connectionFailure(outcome) && c.lastLiveness !== null && REACHABLE.has(c.lastLiveness) && Date.now() + CONFIRM_PAUSE_MS < deadline) {
      result.confirmed = (result.confirmed ?? 0) + 1
      await sleep(CONFIRM_PAUSE_MS)
      const again = await probeService(c.kind, c.url)
      if (!connectionFailure(again)) { outcome = again; result.recovered = (result.recovered ?? 0) + 1 }
    }
    if (connectionFailure(outcome)) hostFails.set(host, (hostFails.get(host) ?? 0) + 1)
    else hostFails.set(host, 0)
    switch (outcome.liveness) {
      case 'live': result.live++; break
      case 'discovered': result.discovered++; break
      case 'unbound': result.unbound++; break
      case 'bad_schema': result.badSchema++; break
      default: result.dead++; break
    }
    return {
      due: c,
      row: {
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
      },
    }
  })
  const done = results.filter((r): r is NonNullable<typeof r> => r !== null)
  const rows = done.map((r) => r.row)
  result.attempted = rows.length
  result.skippedDeadline = skippedDeadline
  result.deferredHostDown = deferred.length
  // A classified agent's service is on a 30-minute schedule: a host that failed this cycle is asked again in ten
  // minutes, not sixty, so one bad cycle cannot age hundreds of listed agents out of the 24-hour reachable window.
  await deferServices(deferred.filter((c) => c.tier === 'T1'), 10)
  await deferServices(deferred.filter((c) => c.tier !== 'T1'), 60)

  // Probe history is a first-party observation: append only, never updated.
  const probeIds = new Map<number, number>()
  for (let i = 0; i < rows.length; i += 500) {
    const ins = await d.insert(probe).values(rows.slice(i, i + 500)).returning({ id: probe.id, serviceId: probe.serviceId })
    for (const r of ins) if (r.serviceId !== null) probeIds.set(r.serviceId, r.id)
  }
  await recordVerdicts(done.map(({ due, row }) => ({ due, liveness: row.liveness, checkedAt: row.checkedAt, probeId: probeIds.get(row.serviceId) ?? null })))
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
