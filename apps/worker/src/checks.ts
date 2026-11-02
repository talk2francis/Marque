/**
 * The daily check call (V4.4 P1, Francis's decision of 2 Nov): every hireable agent is asked its category's question once
 * a day through its public free path (A2A message/send, or a read-only MCP tool), its answer is read in whatever layout it
 * chose (normalizeAnswer, the Result Lens reader) and the chain facts it states are compared with the chain (the Job
 * Room's own checks). The verdict is stored in agent_check with the request and response and their hashes.
 *
 * Read-only: one call, no payment, no transaction. At most one call per agent per day; an agent that did not agree is
 * asked again after 48 h, and weekly after three in a row. An operator opts out with `"marqueChecks": false` in its agent
 * card or registry metadata, or by asking (CHECK_OPTOUT, comma-separated agent ids). Never counted as a hire.
 */
import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { safeFetch } from '@marque/probe'
import { adapterFor, checkVerdict, checksFor, observeCheckCase, CHECK_TEST, type CheckVerdict } from '@marque/conformance'
import { normalizeAnswer } from '@marque/commerce'

const DAY = 86_400_000
const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>
const sha = (v: unknown) => `0x${createHash('sha256').update(JSON.stringify(v ?? null), 'utf8').digest('hex')}`

export interface CheckRow { agentId: string; name: string; category: string; verdict: CheckVerdict; reason: string | null; path: string | null }

/** Hireable now on either network (a successful priced quote in the last 24 h), with a category Marque can ask about. */
async function candidates(): Promise<Array<{ agentId: string; name: string; category: string; meta: unknown; services: Array<{ kind: string; endpoint: string }> }>> {
  const rows = rowsOf(await db().execute(sql`
    with priced as (
      select distinct agent_id from commerce_quote where ok and created_at > now() - interval '24 hours'
    ),
    cat as (
      select distinct on (agent_id) agent_id, category from agent_category
      where agent_id in (select agent_id from priced)
      order by agent_id, (category <> 'unclassified') desc, confidence desc, assigned_at desc
    )
    select a.id, a.name, cat.category, a.raw_metadata as meta,
           coalesce(jsonb_agg(jsonb_build_object('kind', s.kind, 'endpoint', coalesce(s.resolved_endpoint, s.endpoint)) order by s.id)
             filter (where s.kind in ('a2a', 'mcp') and s.currently_declared is distinct from false), '[]'::jsonb) as services
    from priced p join agent a on a.id = p.agent_id left join cat on cat.agent_id = a.id
    left join agent_service s on s.agent_id = a.id
    group by a.id, a.name, cat.category, a.raw_metadata`))
  return rows
    .filter((r) => r['category'] && CHECK_TEST[String(r['category'])])
    .map((r) => ({ agentId: String(r['id']), name: String(r['name'] ?? ''), category: String(r['category']), meta: r['meta'], services: (r['services'] as Array<{ kind: string; endpoint: string }>) ?? [] }))
}

/** When this agent is next due, from its own record: daily; after a non-agreeing verdict 48 h; weekly after three. */
async function dueAgents(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const rows = rowsOf(await db().execute(sql`
    select agent_id, verdict, ran_at from (
      select agent_id, verdict, ran_at, row_number() over (partition by agent_id order by ran_at desc) as n
      from agent_check where agent_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    ) x where n <= 3 order by agent_id, ran_at desc`))
  const byAgent = new Map<string, Array<{ verdict: string; at: number }>>()
  for (const r of rows) byAgent.set(String(r['agent_id']), [...(byAgent.get(String(r['agent_id'])) ?? []), { verdict: String(r['verdict']), at: new Date(r['ran_at'] as string).getTime() }])
  const due = new Set<string>()
  const now = Date.now()
  for (const id of ids) {
    const h = byAgent.get(id) ?? []
    const last = h[0]
    if (!last) { due.add(id); continue }
    const misses = h.findIndex((x) => x.verdict === 'agree')
    const streak = misses === -1 ? h.length : misses
    const wait = streak === 0 ? DAY - 3_600_000 : streak >= 3 ? 7 * DAY : 2 * DAY
    if (now - last.at >= wait) due.add(id)
  }
  return due
}

function optedOut(agentId: string, meta: unknown, card: unknown): boolean {
  const list = (process.env.CHECK_OPTOUT ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (list.includes(agentId)) return true
  const says = (v: unknown) => Boolean(v && typeof v === 'object' && JSON.stringify(v).includes('"marqueChecks":false'))
  return says(meta) || says(card)
}

async function store(agentId: string, category: string, verdict: CheckVerdict, fields: { block?: string | null; checks?: unknown; reason?: string | null; path?: string | null; request?: unknown; response?: unknown; latencyMs?: number | null }): Promise<void> {
  const chainId = Number(agentId.split(':')[0])
  await db().execute(sql`
    insert into agent_check (agent_id, chain_id, category, verdict, block, checks, reason, path, request, response, request_hash, response_hash, latency_ms)
    values (${agentId}, ${chainId}, ${category}, ${verdict}, ${fields.block ?? null}, ${JSON.stringify(fields.checks ?? [])}::jsonb, ${fields.reason ?? null}, ${fields.path ?? null},
            ${fields.request === undefined ? null : JSON.stringify(fields.request)}::jsonb, ${fields.response === undefined ? null : JSON.stringify(fields.response)}::jsonb,
            ${fields.request === undefined ? null : sha(fields.request)}, ${fields.response === undefined ? null : sha(fields.response)}, ${fields.latencyMs ?? null})`)
}

type Attempt = { verdict: CheckVerdict; reason: string | null; path: string; block?: string | null; checks?: unknown; request?: unknown; response?: unknown; latencyMs?: number | null }

/** One question through one free path. */
async function attempt(a: Awaited<ReturnType<typeof candidates>>[number], service: { kind: string; endpoint: string }): Promise<Attempt> {
  const testCase = await observeCheckCase(a.category)
  if (!testCase) return { verdict: 'not_comparable', reason: 'no check exists for this category', path: service.kind }
  const adapter = adapterFor(service.kind, a.agentId, a.name, service.endpoint)!
  const request = { path: service.kind, endpoint: service.endpoint, prompt: testCase.prompt, block: testCase.blockNumber.toString(), subject: testCase.subject }
  const started = Date.now()
  const answer = await adapter.ask(testCase, testCase.prompt).catch((e: unknown) => ({ response: null, latencyMs: Date.now() - started, error: `unreachable: ${e instanceof Error ? e.name : 'error'}` }))
  if (answer.error && !answer.response) {
    const verdict: CheckVerdict = answer.error.startsWith('unusable_response') ? 'unreadable' : 'not_comparable'
    const reason = answer.error.startsWith('payment required') ? 'its free path asks for payment' : answer.error.split(':')[0]!.replace(/_/g, ' ')
    return { verdict, reason, path: service.kind, request, latencyMs: answer.latencyMs }
  }
  const lens = normalizeAnswer(a.category, answer.response)
  const stated = lens.meta.block && /^\d{6,12}$/.test(lens.meta.block) ? BigInt(lens.meta.block) : null
  const subject = Object.values(testCase.subject).find((v) => /^0x[0-9a-fA-F]{40}$/.test(v)) ?? null
  const checks = await checksFor(lens, subject, stated ?? testCase.blockNumber)
  const spacing = lens.kind === 'rebalancing' ? (lens.positions[0]?.tickSpacing ?? null) : null
  const { verdict, checks: judged } = checkVerdict(checks, { pinned: stated !== null, ageSeconds: 0, tickSpacing: spacing ?? 50, readable: lens.kind !== 'generic' })
  const reason = verdict === 'unreadable' ? 'nothing in the answer could be read for its category'
    : verdict === 'not_comparable' ? 'the answer stated no chain fact Marque could compare' : null
  return { verdict, reason, path: service.kind, block: (stated ?? testCase.blockNumber).toString(), checks: judged, request, response: answer.response, latencyMs: answer.latencyMs }
}

const RANK: Record<CheckVerdict, number> = { wrong: 0, agree: 0, not_comparable: 1, unreadable: 2 }

/** Ask one agent through its free paths (A2A first, then MCP) until one gives a decided answer, and store that verdict. */
export async function checkAgent(a: Awaited<ReturnType<typeof candidates>>[number]): Promise<CheckRow> {
  const paths = [...a.services.filter((s) => s.kind === 'a2a'), ...a.services.filter((s) => s.kind === 'mcp')].slice(0, 3)
  if (!paths.length) {
    await store(a.agentId, a.category, 'not_comparable', { reason: 'no public free path (A2A or MCP) is declared' })
    return { agentId: a.agentId, name: a.name, category: a.category, verdict: 'not_comparable', reason: 'no public free path (A2A or MCP) is declared', path: null }
  }
  const a2a = paths.find((s) => s.kind === 'a2a')
  let card: unknown = null
  if (a2a) {
    const res = await safeFetch(a2a.endpoint, { timeoutMs: 15_000 })
    if (res.ok && res.status < 400) { try { card = JSON.parse(res.body) } catch { /* the adapter reports it */ } }
  }
  if (optedOut(a.agentId, a.meta, card)) return { agentId: a.agentId, name: a.name, category: a.category, verdict: 'not_comparable', reason: 'operator opted out of Marque checks', path: null }
  let best: Attempt | null = null
  for (const service of paths) {
    const r = await attempt(a, service)
    if (!best || RANK[r.verdict] < RANK[best.verdict]) best = r
    if (RANK[r.verdict] === 0) break
  }
  const { verdict, reason, path, ...fields } = best!
  await store(a.agentId, a.category, verdict, { ...fields, reason, path })
  return { agentId: a.agentId, name: a.name, category: a.category, verdict, reason, path }
}

/**
 * Paid jobs count as checks too: the Job Room computes Marque's chain checks of a delivered answer and keeps the first
 * decided result (lens_result). Open the Job Room of every job delivered in the last 30 days that has none yet, so every
 * delivered answer is checked whether or not anyone has looked at it.
 */
export async function checkDeliveredJobs(log?: (event: string, data: Record<string, unknown>) => void): Promise<number> {
  const base = process.env.MARQUE_PUBLIC_URL ?? 'https://marque.trade'
  const rows = rowsOf(await db().execute(sql`
    select j.chain_id, j.job_id from commerce_job j
    where j.state in ('SUBMITTED', 'DISPUTED', 'COMPLETED', 'PAID') and j.updated_at > now() - interval '30 days'
      and not exists (select 1 from lens_result l where l.chain_id = j.chain_id and l.job_id = j.job_id)
    order by j.updated_at desc limit 200`))
  let opened = 0
  for (const r of rows) {
    const res = await fetch(`${base}/jobs/${r['chain_id']}/${r['job_id']}`, { signal: AbortSignal.timeout(45_000) }).catch(() => null)
    if (res?.ok) opened++
    await res?.arrayBuffer().catch(() => undefined)
  }
  log?.('delivered_jobs_checked', { candidates: rows.length, opened })
  return opened
}

/** One pass over every due agent. `force` asks every candidate regardless of schedule (the first run). */
export async function checkSweep(opts: { force?: boolean; only?: string[]; log?: (event: string, data: Record<string, unknown>) => void } = {}): Promise<CheckRow[]> {
  const all = (await candidates()).filter((a) => !opts.only?.length || opts.only.includes(a.agentId))
  const due = opts.force ? new Set(all.map((a) => a.agentId)) : await dueAgents(all.map((a) => a.agentId))
  const out: CheckRow[] = []
  for (const a of all) {
    if (!due.has(a.agentId)) continue
    try {
      const r = await checkAgent(a)
      out.push(r)
      opts.log?.('check_result', { ...r })
    } catch (err) {
      opts.log?.('check_error', { agentId: a.agentId, error: err instanceof Error ? err.name : 'error' })
    }
  }
  return out
}
