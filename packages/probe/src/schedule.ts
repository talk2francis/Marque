import { sql } from 'drizzle-orm'
import { db, firstPartyAgents, type Liveness, type ServiceKind } from '@marque/db'

/**
 * Tiered probe scheduling (P2-00 probe incident).
 *
 * The old scheduler re-derived "latest probe per service" from millions of rows every
 * cycle and then spent ~90% of each 500-service cycle on dead endpoints burning their
 * full timeout, so live and classified services went stale behind them. This module
 * keeps a derived `probe_schedule` row per service (rebuildable from probe history)
 * and fills each cycle strictly by tier:
 *
 *   T0  first-party services (config/first-party.json)               every 5 min
 *   T1  services of agents classified into a category                every 30 min
 *   T1b services whose last verdict was live / unbound / bad_schema  every 12 h
 *   T2  services never probed                                        FIFO
 *   T3  dead services, backing off by consecutive dead verdicts      1 h, 3 h, 6 h, 24 h, 72 h
 *
 * A dead endpoint is never dropped (invariant 7); it is only re-probed less often.
 */
export type Tier = 'T0' | 'T1' | 'T1b' | 'T2' | 'T3'

export const TIER_RANK: Readonly<Record<Tier, number>> = { T0: 0, T1: 1, T1b: 2, T2: 3, T3: 4 }

export const INTERVAL_MINUTES = {
  T0: 5,
  T1: 30,
  T1b: 12 * 60,
  /** A classified or first-party service that has been dead 3+ times in a row. */
  priorityDead: 45,
  /** Indexed by consecutive dead verdicts (1, 2, 3, 4, 5+). */
  dead: [60, 180, 360, 1440, 4320],
} as const

/** Freshness bars the status page reports against, per tier. */
/** Seconds of lead a cycle takes on services about to fall due (see dueByTier). */
export const DUE_GRACE_SECONDS = 90

export const FRESH_WITHIN_MINUTES: Readonly<Record<'T0' | 'T1', number>> = { T0: 10, T1: 60 }

export interface ScheduleInput {
  firstParty: boolean
  classified: boolean
  liveness: Liveness | null
  consecutiveDead: number
}

/** The tier a service belongs to, from what we know about it now. Pure. */
export function tierOf(s: ScheduleInput): Tier {
  if (s.firstParty) return 'T0'
  if (s.classified) return 'T1'
  if (s.liveness === null) return 'T2'
  if (s.liveness === 'dead') return 'T3'
  return 'T1b'
}

/** Minutes until the next probe of a service after a verdict. Pure, jitter excluded. */
export function intervalMinutes(s: ScheduleInput): number {
  const tier = tierOf(s)
  if (tier === 'T0' || tier === 'T1') {
    return s.liveness === 'dead' && s.consecutiveDead >= 3 && tier === 'T1' ? INTERVAL_MINUTES.priorityDead : INTERVAL_MINUTES[tier]
  }
  if (tier === 'T1b') return INTERVAL_MINUTES.T1b
  if (tier === 'T2') return 0
  const idx = Math.min(Math.max(1, s.consecutiveDead), INTERVAL_MINUTES.dead.length) - 1
  return INTERVAL_MINUTES.dead[idx] as number
}

/** Spread load: +-10% jitter on anything slower than T0, deterministic per service. */
export function jitteredMinutes(s: ScheduleInput, serviceId: number): number {
  const base = intervalMinutes(s)
  if (base <= INTERVAL_MINUTES.T0) return base
  const frac = ((serviceId * 2654435761) % 1000) / 1000 // Knuth multiplicative hash, 0..1
  return base * (0.9 + 0.2 * frac)
}

export function nextStreak(prevDead: number, liveness: Liveness): number {
  return liveness === 'dead' ? prevDead + 1 : 0
}

export interface DueService {
  serviceId: number
  agentId: string
  kind: ServiceKind
  url: string
  tier: Tier
  firstParty: boolean
  classified: boolean
  consecutiveDead: number
}

const rowsOf = (r: unknown): Array<Record<string, unknown>> =>
  ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>

/** Agent ids of first-party rows, matched on chain id + token id from config. */
export async function firstPartyAgentIds(): Promise<string[]> {
  const fp = firstPartyAgents()
  if (!fp.length) return []
  const pairs = sql.join(fp.map((a) => sql`(${a.chainId}::int, ${String(a.tokenId)}::text)`), sql`, `)
  const r = await db().execute(sql`select id from agent where (chain_id, token_id) in (${pairs})`)
  return rowsOf(r).map((x) => String(x['id']))
}

/**
 * Make sure every probe-able service has a schedule row. New services arrive as T2
 * (due now). An empty table is backfilled from probe history: last verdict and the
 * dead streak from the newest six probes, so a long-dead endpoint keeps its backoff
 * instead of flooding the first cycle.
 */
export async function syncSchedule(): Promise<{ inserted: number; backfilled: boolean }> {
  const d = db()
  const empty = rowsOf(await d.execute(sql`select not exists (select 1 from probe_schedule) as empty`))[0]?.['empty'] === true
  if (!empty) {
    const r = await d.execute(sql`
      insert into probe_schedule (service_id, agent_id, next_due_at)
      select s.id, s.agent_id, 'epoch'::timestamptz
      from agent_service s
      where (s.is_template = false or s.resolved_endpoint is not null)
        and not exists (select 1 from probe_schedule ps where ps.service_id = s.id)
      on conflict (service_id) do nothing
      returning service_id`)
    return { inserted: rowsOf(r).length, backfilled: false }
  }

  const fp = new Set(await firstPartyAgentIds())
  const hist = rowsOf(await d.execute(sql`
    select s.id as service_id, s.agent_id,
           h.lv as livenesses, h.at as last_checked_at, h.last_id,
           exists (select 1 from agent_category c where c.agent_id = s.agent_id and c.category <> 'unclassified') as classified
    from agent_service s
    left join lateral (
      select array_agg(coalesce(p.liveness, case when p.ok then 'live' else 'dead' end) order by p.checked_at desc) as lv,
             max(p.checked_at) as at,
             (array_agg(p.id order by p.checked_at desc))[1] as last_id
      from (select id, liveness, ok, checked_at from probe p
            where p.service_id = s.id order by p.checked_at desc limit 6) p
    ) h on true
    where (s.is_template = false or s.resolved_endpoint is not null)`))

  const now = Date.now()
  const values = hist.map((h) => {
    const lv = (h['livenesses'] as Liveness[] | null) ?? null
    const liveness = lv?.[0] ?? null
    let streak = 0
    if (lv) for (const v of lv) { if (v === 'dead') streak++; else break }
    const serviceId = Number(h['service_id'])
    const input: ScheduleInput = { firstParty: fp.has(String(h['agent_id'])), classified: h['classified'] === true, liveness, consecutiveDead: streak }
    const last = h['last_checked_at'] ? new Date(h['last_checked_at'] as string).getTime() : null
    const due = last === null ? 0 : last + jitteredMinutes(input, serviceId) * 60_000
    return { serviceId, agentId: String(h['agent_id']), last, liveness, streak, lastId: h['last_id'] == null ? null : Number(h['last_id']), due: Math.min(due, now + 72 * 3600_000) }
  })

  for (let i = 0; i < values.length; i += 1000) {
    const chunk = values.slice(i, i + 1000)
    await d.execute(sql`
      insert into probe_schedule (service_id, agent_id, last_checked_at, last_liveness, consecutive_dead, last_probe_id, next_due_at)
      values ${sql.join(chunk.map((v) => sql`(${v.serviceId}, ${v.agentId}, ${v.last === null ? null : new Date(v.last).toISOString()}::timestamptz, ${v.liveness}, ${v.streak}, ${v.lastId}::int, ${new Date(v.due).toISOString()}::timestamptz)`), sql`, `)}
      on conflict (service_id) do nothing`)
  }
  return { inserted: values.length, backfilled: true }
}

/**
 * Services due now, best tier first. Dead services (T3) are capped per cycle so a cycle
 * stays short and the next T0/T1 pass is never late behind a wall of timeouts.
 *
 * "Due" includes the next DUE_GRACE_SECONDS: cycles start about every 5 min, so a T0
 * service due a few seconds after a cycle began used to wait for the next one and was
 * checked every ~10 min, flapping the header's status pill against the 10 min T0
 * freshness window (found 26 Sep).
 */
export async function dueByTier(limit: number, deadCap: number, fpIds: readonly string[]): Promise<DueService[]> {
  const fpList = fpIds.length ? sql.join(fpIds.map((id) => sql`${id}`), sql`, `) : sql`''`
  const r = await db().execute(sql`
    select ps.service_id, ps.agent_id, s.kind, coalesce(s.resolved_endpoint, s.endpoint) as url,
           ps.last_liveness, ps.consecutive_dead,
           (ps.agent_id in (${fpList})) as first_party,
           exists (select 1 from agent_category c where c.agent_id = ps.agent_id and c.category <> 'unclassified') as classified
    from probe_schedule ps
    join agent_service s on s.id = ps.service_id
    where ps.next_due_at <= now() + make_interval(secs => ${DUE_GRACE_SECONDS}::int)
      and (s.is_template = false or s.resolved_endpoint is not null)
    order by
      case
        when ps.agent_id in (${fpList}) then 0
        when exists (select 1 from agent_category c where c.agent_id = ps.agent_id and c.category <> 'unclassified') then 1
        when ps.last_checked_at is null then 3
        when ps.last_liveness in ('live', 'unbound', 'bad_schema') then 2
        else 4
      end,
      ps.next_due_at asc
    limit ${limit}`)
  const out: DueService[] = []
  let dead = 0
  for (const row of rowsOf(r)) {
    const input: ScheduleInput = {
      firstParty: row['first_party'] === true,
      classified: row['classified'] === true,
      liveness: (row['last_liveness'] as Liveness | null) ?? null,
      consecutiveDead: Number(row['consecutive_dead'] ?? 0),
    }
    const tier = tierOf(input)
    if (tier === 'T3' && ++dead > deadCap) continue
    out.push({
      serviceId: Number(row['service_id']), agentId: String(row['agent_id']), kind: String(row['kind']) as ServiceKind,
      url: String(row['url']), tier, firstParty: input.firstParty, classified: input.classified, consecutiveDead: input.consecutiveDead,
    })
  }
  return out
}

/** Record each verdict on the schedule: new streak, next due time. */
export async function recordVerdicts(results: ReadonlyArray<{ due: DueService; liveness: Liveness; checkedAt: Date; probeId: number | null }>): Promise<void> {
  if (!results.length) return
  const rows = results.map(({ due, liveness, checkedAt, probeId }) => {
    const streak = nextStreak(due.consecutiveDead, liveness)
    const input: ScheduleInput = { firstParty: due.firstParty, classified: due.classified, liveness, consecutiveDead: streak }
    const next = new Date(checkedAt.getTime() + jitteredMinutes(input, due.serviceId) * 60_000)
    return sql`(${due.serviceId}, ${due.agentId}, ${checkedAt.toISOString()}::timestamptz, ${liveness}, ${streak}, ${probeId}::int, ${next.toISOString()}::timestamptz, now())`
  })
  for (let i = 0; i < rows.length; i += 1000) {
    await db().execute(sql`
      insert into probe_schedule (service_id, agent_id, last_checked_at, last_liveness, consecutive_dead, last_probe_id, next_due_at, updated_at)
      values ${sql.join(rows.slice(i, i + 1000), sql`, `)}
      on conflict (service_id) do update set
        last_checked_at = excluded.last_checked_at, last_liveness = excluded.last_liveness,
        consecutive_dead = excluded.consecutive_dead, last_probe_id = coalesce(excluded.last_probe_id, probe_schedule.last_probe_id),
        next_due_at = excluded.next_due_at, updated_at = now()`)
  }
}

/** Push services back without a verdict (their host was down this cycle). */
export async function deferServices(services: readonly DueService[], minutes: number): Promise<void> {
  if (!services.length) return
  const ids = sql.join(services.map((s) => sql`${s.serviceId}`), sql`, `)
  await db().execute(sql`
    update probe_schedule set next_due_at = now() + make_interval(mins => ${minutes}::int), updated_at = now()
    where service_id in (${ids})`)
}

export interface TierFreshness {
  tier: 'T0' | 'T1'
  services: number
  fresh: number
  freshWithinMinutes: number
  oldestCheckAt: string | null
}

/** How fresh T0 and T1 are right now, for /status and the P2-00 acceptance line. */
export async function tierFreshness(): Promise<TierFreshness[]> {
  const fpIds = await firstPartyAgentIds()
  const fpList = fpIds.length ? sql.join(fpIds.map((id) => sql`${id}`), sql`, `) : sql`''`
  const r = rowsOf(await db().execute(sql`
    with t as (
      select ps.service_id, ps.last_checked_at,
             case when ps.agent_id in (${fpList}) then 'T0'
                  when exists (select 1 from agent_category c where c.agent_id = ps.agent_id and c.category <> 'unclassified') then 'T1'
             end as tier
      from probe_schedule ps join agent_service s on s.id = ps.service_id
      where (s.is_template = false or s.resolved_endpoint is not null)
    )
    select tier, count(*)::int as services,
           count(*) filter (where last_checked_at > now() - make_interval(mins => case when tier = 'T0' then ${FRESH_WITHIN_MINUTES.T0}::int else ${FRESH_WITHIN_MINUTES.T1}::int end))::int as fresh,
           min(last_checked_at) as oldest
    from t where tier is not null group by tier order by tier`))
  return r.map((x) => ({
    tier: x['tier'] as 'T0' | 'T1',
    services: Number(x['services']),
    fresh: Number(x['fresh']),
    freshWithinMinutes: FRESH_WITHIN_MINUTES[x['tier'] as 'T0' | 'T1'],
    oldestCheckAt: x['oldest'] ? new Date(x['oldest'] as string).toISOString() : null,
  }))
}
