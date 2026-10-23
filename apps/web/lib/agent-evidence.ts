import 'server-only'
import { sql } from 'drizzle-orm'
import { cachedProjection, db } from '@marque/db'

/**
 * The Evidence section of an agent page (SPEC-WORKSPACE 3.1): 30 days of Marque's own probes as a
 * daily answer rate and median latency, and the newest probes as a log. MEASURED, dated, never
 * extrapolated: a day without probes is a gap, not a zero.
 */
export interface EvidenceDay { day: string; total: number; live: number; reachable: number; p50Ms: number | null }
export interface EvidenceProbe { at: string; liveness: string; status: number | null; latencyMs: number | null; failure: string | null; detail: string | null }
export interface AgentEvidence { days: EvidenceDay[]; probes: EvidenceProbe[]; computedAt: string }

type Row = Record<string, unknown>
const rowsOf = (r: unknown): Row[] => (Array.isArray(r) ? (r as Row[]) : ((r as { rows?: Row[] }).rows ?? []))
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? new Date(String(v)).toISOString() : null)

async function compute(agentId: string): Promise<AgentEvidence> {
  const [days, probes] = await Promise.all([
    db().execute(sql`
      select to_char(date_trunc('day', checked_at at time zone 'UTC'), 'YYYY-MM-DD') as day,
        count(*)::int as total, count(*) filter (where liveness = 'live')::int as live,
        count(*) filter (where status_code between 200 and 299)::int as reachable,
        percentile_cont(0.5) within group (order by latency_ms) filter (where latency_ms is not null) as p50
      from probe where agent_id = ${agentId} and checked_at > now() - interval '30 days'
      group by 1 order by 1`).then(rowsOf),
    db().execute(sql`
      select checked_at, liveness, status_code, latency_ms, failure_class, detail from probe
      where agent_id = ${agentId} order by checked_at desc limit 24`).then(rowsOf),
  ])
  return {
    days: days.map((d) => ({ day: String(d['day']), total: Number(d['total']), live: Number(d['live']), reachable: Number(d['reachable']), p50Ms: d['p50'] == null ? null : Math.round(Number(d['p50'])) })),
    probes: probes.map((p) => ({
      at: iso(p['checked_at'])!, liveness: String(p['liveness']), status: p['status_code'] == null ? null : Number(p['status_code']),
      latencyMs: p['latency_ms'] == null ? null : Number(p['latency_ms']), failure: p['failure_class'] ? String(p['failure_class']) : null, detail: p['detail'] ? String(p['detail']).slice(0, 160) : null,
    })),
    computedAt: new Date().toISOString(),
  }
}

export async function agentEvidence(agentId: string): Promise<AgentEvidence | null> {
  try {
    return (await cachedProjection(`evidence:v1:${agentId}`, () => compute(agentId), { freshMs: 5 * 60_000, timeoutMs: 10_000, staleWhileRevalidate: true })).value
  } catch {
    return null
  }
}
