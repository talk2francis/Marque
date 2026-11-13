import 'server-only'
import { sql } from 'drizzle-orm'
import { cachedProjection } from '@marque/db'
import { boundedCommerceRead } from '@marque/commerce/reads'
import { exclusiveProviderIdentity } from './agent-job-scope'

/**
 * The evidence behind an agent's standing (V4.4), for both networks, keyed by ERC-8004 row id. Read by the marketplace
 * rows and so by every count (supply-truth.ts).
 *
 * checked: within 30 days, an answer whose stated chain facts all agreed with the chain and none disagreed. From a paid
 * job (the Result Lens check, lens_result) or the daily check call (agent_check).
 * wrong: within 14 days, a stated chain fact outside tolerance (a Lens check pinned to the block the answer named, or a
 * check call judged "wrong"), with no agreeing answer since. A missing field is never wrong. A Lens check of an answer
 * that named no block ran at a later block than the answer, so its disagreement is not counted as wrong.
 * undelivered: the agent's latest paid job closed in the last 14 days, refunded or expired, without a delivery.
 */
export interface StandingEvidence {
  checked: { at: string; via: 'job' | 'check'; ref: string } | null
  wrong: { at: string; via: 'job' | 'check'; ref: string; detail: string | null } | null
  undelivered: { at: string; jobId: string; state: string } | null
}

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString())

type Ev = { at: number; kind: 'agree' | 'wrong'; via: 'job' | 'check'; ref: string; detail: string | null }

async function compute(): Promise<Record<string, StandingEvidence>> {
  const jobAgent = sql`coalesce(i.agent_id, a.id)`
  const jobJoin = sql`
    left join hire_intent i on i.id = j.intent_id and i.chain_id = j.chain_id and i.job_id = j.job_id
    left join agent a on j.intent_id is null and a.chain_id = j.chain_id and lower(a.agent_wallet) = lower(j.provider)
      and ${exclusiveProviderIdentity(sql`a.id`, sql`a.agent_wallet`, sql`a.chain_id`)}`
  const [lens, checks, undelivered] = await Promise.all([
    boundedCommerceRead(sql`
      select ${jobAgent} as agent_id, l.chain_id, l.job_id, l.block, coalesce(s.block_time, j.updated_at) as at,
             count(*) filter (where c->>'how' = 'chain' and c->>'state' = 'match')::int as agreed,
             count(*) filter (where c->>'how' = 'chain' and c->>'state' = 'differs')::int as differs,
             min(c->>'label') filter (where c->>'how' = 'chain' and c->>'state' = 'differs') as differs_label
      from lens_result l
      join commerce_job j on j.chain_id = l.chain_id and j.job_id = l.job_id
      ${jobJoin}
      left join commerce_event s on s.chain_id = j.chain_id and s.job_id = j.job_id and s.name = 'JobSubmitted'
      left join lateral jsonb_array_elements(l.checks) c on true
      where coalesce(s.block_time, j.updated_at) > now() - interval '30 days'
      group by 1, 2, 3, 4, 5`, 'exact'),
    boundedCommerceRead(sql`
      select agent_id, id, verdict, ran_at,
             (select min(c->>'label') from jsonb_array_elements(checks) c where c->>'state' = 'differs') as differs_label
      from agent_check
      where ran_at > now() - interval '30 days' and verdict in ('agree', 'wrong')`, 'exact'),
    boundedCommerceRead(sql`
      select distinct on (${jobAgent}) ${jobAgent} as agent_id, j.chain_id, j.job_id, j.state, j.updated_at, j.expired_at,
             exists (select 1 from commerce_event s where s.chain_id = j.chain_id and s.job_id = j.job_id and s.name = 'JobSubmitted') as submitted
      from commerce_job j
      ${jobJoin}
      where j.funded_raw is not null and j.funded_raw <> '0' and ${jobAgent} is not null
        and j.created_at > now() - interval '45 days'
      order by ${jobAgent}, j.created_at desc nulls last`, 'exact'),
  ])
  const events = new Map<string, Ev[]>()
  const add = (id: string, e: Ev) => events.set(id, [...(events.get(id) ?? []), e])
  for (const r of rowsOf(lens)) {
    if (!r['agent_id']) continue
    const at = new Date(r['at'] as string).getTime()
    const ref = `${r['chain_id']}/${r['job_id']}`
    // Only a check pinned to the answer's own block can call a stated fact wrong.
    if (Number(r['differs']) > 0 && r['block']) add(String(r['agent_id']), { at, kind: 'wrong', via: 'job', ref, detail: r['differs_label'] ? String(r['differs_label']) : null })
    else if (Number(r['agreed']) > 0 && Number(r['differs']) === 0) add(String(r['agent_id']), { at, kind: 'agree', via: 'job', ref, detail: null })
  }
  for (const r of rowsOf(checks)) {
    add(String(r['agent_id']), { at: new Date(r['ran_at'] as string).getTime(), kind: r['verdict'] === 'wrong' ? 'wrong' : 'agree', via: 'check', ref: String(r['id']), detail: r['differs_label'] ? String(r['differs_label']) : null })
  }
  const now = Date.now()
  const out: Record<string, StandingEvidence> = {}
  const get = (id: string) => (out[id] ??= { checked: null, wrong: null, undelivered: null })
  for (const [id, list] of events) {
    list.sort((x, y) => y.at - x.at)
    const agree = list.find((e) => e.kind === 'agree')
    const wrong = list.find((e) => e.kind === 'wrong')
    const s = get(id)
    if (agree) s.checked = { at: new Date(agree.at).toISOString(), via: agree.via, ref: agree.ref }
    if (wrong && now - wrong.at <= 14 * 86_400_000 && (!agree || agree.at < wrong.at)) {
      s.wrong = { at: new Date(wrong.at).toISOString(), via: wrong.via, ref: wrong.ref, detail: wrong.detail }
      // A wrong answer after the agreeing one: the agreement no longer stands.
      s.checked = null
    }
  }
  for (const r of rowsOf(undelivered)) {
    if (r['submitted'] === true) continue
    const state = String(r['state'])
    const expiredAt = r['expired_at'] == null ? null : Number(r['expired_at']) * 1000
    const closed = state === 'REFUNDED' || state === 'EXPIRED' ? new Date(r['updated_at'] as string).getTime()
      : state === 'FUNDED' && expiredAt !== null && expiredAt < now ? expiredAt : null
    if (closed === null || now - closed > 14 * 86_400_000) continue
    get(String(r['agent_id'])).undelivered = { at: iso(new Date(closed)), jobId: `${r['chain_id']}/${r['job_id']}`, state: state === 'FUNDED' ? 'EXPIRED' : state }
  }
  return out
}

/** Cached two minutes: jobs, Lens results and check calls change at the indexer's and the daily sweep's pace. */
export async function standingEvidence(): Promise<Record<string, StandingEvidence>> {
  try {
    const p = await cachedProjection('agent:standing:v1', compute, { freshMs: 120_000, timeoutMs: 8_000, staleWhileRevalidate: true, staleRefreshLeaseMs: 90_000, coordinateCold: true })
    return p.value
  } catch {
    return {}
  }
}
