import 'server-only'
import { sql } from 'drizzle-orm'
import { cachedProjection, db, firstPartyIdListSql, oneAgentIdSql } from '@marque/db'
import { coverage, formatAmount, QUEST_CATEGORIES, teamWallets, assetAt, type ChainId } from '@marque/commerce'
import { funnel } from '@marque/registry'
import { marketplaceAgents, type MarketRow } from './marketplace'
import { readLedger } from './ledger'
import { referenceAgent } from './reference-agents'
import type { TapeItem } from '../app/_components/ui'

/**
 * Everything the home page shows (DESIGN-SYSTEM.md 8.1), measured at request time
 * or from a projection under a minute old. A section whose data is unavailable says
 * so or does not render; nothing here has a fallback number.
 */

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>
const CAT_LABEL: Record<string, string> = { yield: 'Yield', grid: 'Grid', rebalancing: 'Rebalancing', health_factor: 'Health factor', security: 'Security' }

function ageWords(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (s < 90) return `${s}s`
  if (s < 5400) return `${Math.round(s / 60)}m`
  if (s < 172800) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

/**
 * The Tape: real Marque hires (paid into escrow through a Marque hire intent) and
 * ratings on BSC mainnet, newest first. Hires and ratings by wallets on the published
 * team list are real chain events and stay on the Tape, marked as team tests.
 */
export async function tapeItems(limit = 14): Promise<TapeItem[]> {
  const team = new Set(teamWallets())
  const [hires, ratings] = await Promise.all([
    db().execute(sql`
      select j.job_id, j.client, j.funded_raw, j.token, i.category, a.name, e.tx_hash, e.block_time
      from commerce_job j
      join hire_intent i on i.id = j.intent_id
      left join agent a on a.id = i.agent_id
      join commerce_event e on e.chain_id = j.chain_id and e.job_id = j.job_id and e.name = 'JobFunded'
      where j.chain_id = 56 and e.block_time is not null
      order by e.block_time desc limit ${limit}`),
    db().execute(sql`
      select r.agent_token_id, r.client, r.value, r.value_decimals, r.tx_hash, r.block_time, a.name,
             (select category from agent_category c where c.agent_id = a.id order by (category <> 'unclassified') desc, confidence desc limit 1) as category
      from rating r left join agent a on a.chain_id = r.chain_id and a.token_id = r.agent_token_id
      where r.chain_id = 56 and not r.revoked and r.tag1 = 'starred' and r.block_time is not null
      order by r.block_time desc limit ${limit}`),
  ])
  const items: Array<TapeItem & { at: number }> = []
  for (const h of rowsOf(hires)) {
    const tok = h['token'] ? assetAt(56 as ChainId, String(h['token'])) : null
    const at = new Date(String(h['block_time'])).toISOString()
    items.push({
      id: `h-${h['job_id']}`, kind: 'hire', agent: String(h['name'] ?? 'An agent'),
      category: CAT_LABEL[String(h['category'] ?? '')] ?? 'Agent',
      value: tok && h['funded_raw'] ? `${formatAmount(String(h['funded_raw']), tok.decimals)} ${tok.symbol}` : 'paid',
      tx: String(h['tx_hash']), href: `/jobs/56/${h['job_id']}`, age: ageWords(at),
      team: team.has(String(h['client'])), at: Date.parse(at),
    })
  }
  for (const r of rowsOf(ratings)) {
    const at = new Date(String(r['block_time'])).toISOString()
    const stars = Math.round(Number(r['value']) / 10 ** Number(r['value_decimals'] ?? 0) / 20)
    items.push({
      id: `r-${r['tx_hash']}`, kind: 'rating', agent: String(r['name'] ?? `Agent #${r['agent_token_id']}`),
      category: CAT_LABEL[String(r['category'] ?? '')] ?? 'Agent', value: `rated ${stars} of 5`,
      tx: String(r['tx_hash']), href: `https://bscscan.com/tx/${r['tx_hash']}`, age: ageWords(at),
      team: team.has(String(r['client'])), at: Date.parse(at),
    })
  }
  return items.sort((a, b) => b.at - a.at).slice(0, limit).map(({ at: _at, ...t }) => t)
}

export interface CategoryTile {
  category: string
  hireable: number
  operators: number
  thirdPartyOperators: number
  cheapest: string | null
  bestRating: { stars: number; count: number; agent: string } | null
}

/** Per quest category: live hireable count, operators, cheapest live quote, best verified rating. */
export async function categoryTiles(ready: MarketRow[]): Promise<CategoryTile[] | null> {
  const cov = await cachedProjection('home:coverage:v1', () => coverage(), { freshMs: 60_000, timeoutMs: 8_000, staleWhileRevalidate: true })
    .then((p) => p.value).catch(() => null)
  if (!cov) return null
  return QUEST_CATEGORIES.map((category) => {
    const c = cov.categories.find((x) => x.category === category)
    const cheapest = c?.cheapest ? `${formatAmount(c.cheapest.priceRaw, c.cheapest.decimals)} ${c.cheapest.token}` : null
    const rated = ready
      .filter((r) => r.category === category && r.track.verified.averageStars !== null)
      .sort((a, b) => (b.track.verified.averageStars ?? 0) - (a.track.verified.averageStars ?? 0))[0]
    return {
      category, hireable: c?.hireable ?? 0, operators: c?.operators ?? 0, thirdPartyOperators: c?.thirdPartyOperators ?? 0, cheapest,
      bestRating: rated ? { stars: rated.track.verified.averageStars!, count: rated.track.verified.count, agent: rated.name } : null,
    }
  })
}

/** Six hireable agents, mixing categories: best of each category first, then the next best. */
export async function readyToHire(): Promise<{ all: MarketRow[]; picks: MarketRow[] }> {
  const { rows } = await marketplaceAgents({ tab: 'ready', sort: 'best', limit: 60 })
  const byCat = new Map<string, MarketRow[]>()
  for (const r of rows) {
    const k = r.category ?? 'other'
    byCat.set(k, [...(byCat.get(k) ?? []), r])
  }
  const picks: MarketRow[] = []
  for (let round = 0; picks.length < 6 && round < 6; round++) {
    for (const cat of [...QUEST_CATEGORIES, 'security', 'other']) {
      const r = byCat.get(cat)?.[round]
      if (r && picks.length < 6) picks.push(r)
    }
  }
  return { all: rows, picks }
}

export interface FunnelLine { registered: number | null; answering: number | null; hireable: number; warranted: number | null }

/** The Phase 1 funnel reduced to one line (the full one lives on /why). */
export async function funnelLine(ready: MarketRow[]): Promise<FunnelLine> {
  const stages = await funnel(56).catch(() => null)
  const stage = (k: string) => stages?.find((s) => s.stage === k)?.count ?? null
  const warranted = await db().execute(sql`
    select count(distinct ${oneAgentIdSql(sql`agent_id`)})::int as n from conformance_result where pass = true and agent_id not like 'stub:%'`)
    .then((r) => Number(rowsOf(r)[0]?.['n'] ?? 0)).catch(() => null)
  return { registered: stage('registered_bsc'), answering: stage('reachable'), hireable: ready.filter((r) => r.commerce.chainId === 56).length, warranted }
}

export interface PassFail {
  pass: { agent: string; testId: string; fields: string[] } | null
  fail: { agent: string; testId: string; failedFields: number; thirdPartyRuns: number; thirdPartyPasses: number } | null
}

/** One real pass and one real named failure, side by side. */
export async function passFail(): Promise<PassFail> {
  const [p, f, counts] = await Promise.all([
    db().execute(sql`
      select ${oneAgentIdSql(sql`cr.agent_id`)} as agent_id, cr.test_id, cr.diffs, a.name from conformance_result cr
      left join agent a on a.id = ${oneAgentIdSql(sql`cr.agent_id`)}
      where cr.pass = true and cr.agent_id in ${firstPartyIdListSql()} order by cr.ran_at desc limit 1`).then(rowsOf).catch(() => []),
    db().execute(sql`
      select cr.test_id, a.name, jsonb_array_length(cr.failed_fields) as n
      from conformance_result cr join agent a on a.id = cr.agent_id
      where cr.pass = false and cr.error is null and cr.agent_id not like 'stub:%'
        and cr.agent_id not in ${firstPartyIdListSql()} and jsonb_array_length(cr.failed_fields) > 0
      order by jsonb_array_length(cr.failed_fields) desc, cr.ran_at desc limit 1`).then(rowsOf).catch(() => []),
    db().execute(sql`
      select count(*)::int as runs, count(*) filter (where pass)::int as passes from conformance_result
      where agent_id not like 'stub:%' and agent_id not in ${firstPartyIdListSql()}`).then(rowsOf).catch(() => []),
  ])
  const pr = p[0]
  const fr = f[0]
  const diffs = Array.isArray(pr?.['diffs']) ? (pr!['diffs'] as Array<Record<string, unknown>>) : []
  return {
    pass: pr ? { agent: String(pr['name'] ?? referenceAgent(String(pr['agent_id']))?.name ?? String(pr['agent_id']).replace('marque:', '')), testId: String(pr['test_id']), fields: diffs.slice(0, 5).map((d) => String(d['field'])) } : null,
    fail: fr ? {
      agent: String(fr['name']), testId: String(fr['test_id']), failedFields: Number(fr['n']),
      thirdPartyRuns: Number(counts[0]?.['runs'] ?? 0), thirdPartyPasses: Number(counts[0]?.['passes'] ?? 0),
    } : null,
  }
}

export interface LedgerHeadline { complete: number; total: number; agentMs: number; humanMs: number; agentScore: number | null; humanScore: number | null }

/** Across complete benchmarks: mean agent time vs mean human time, and blind-graded quality. */
export async function ledgerHeadline(): Promise<LedgerHeadline | null> {
  const benches = await readLedger().catch(() => null)
  if (!benches?.length) return null
  const done = benches.filter((b) => b.complete)
  if (!done.length) return null
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const arm = (k: 'agent' | 'manual') => done.flatMap((b) => b.runs.filter((r) => r.arm === k))
  const pct = (runs: ReturnType<typeof arm>) => mean(runs.filter((r) => r.scoreTotal !== null && r.scoreOutOf).map((r) => (r.scoreTotal! / r.scoreOutOf!) * 100))
  const agentMs = mean(arm('agent').map((r) => r.elapsedMs))
  const humanMs = mean(arm('manual').map((r) => r.elapsedMs))
  if (agentMs === null || humanMs === null) return null
  return { complete: done.length, total: benches.length, agentMs, humanMs, agentScore: pct(arm('agent')), humanScore: pct(arm('manual')) }
}

export interface LatestHire {
  jobId: string
  agent: string
  category: string
  price: string | null
  team: boolean
  steps: Array<{ label: string; tx: string | null; at: string | null }>
  deliveredSeconds: number | null
  stars: number | null
}

/**
 * The newest delivered Marque hire on BSC mainnet, step by step from chain events:
 * the hero's proof that the flow is real. Null when there is none yet.
 */
export async function latestHire(): Promise<LatestHire | null> {
  const [j] = rowsOf(await db().execute(sql`
    select j.job_id, j.client, j.provider, j.funded_raw, j.token, i.category, a.name, a.token_id,
           (select json_object_agg(e.name, json_build_object('tx', e.tx_hash, 'at', e.block_time))
              from commerce_event e where e.chain_id = j.chain_id and e.job_id = j.job_id) as ev
    from commerce_job j
    join hire_intent i on i.id = j.intent_id
    left join agent a on a.id = i.agent_id
    where j.chain_id = 56 and j.state in ('SUBMITTED', 'DISPUTED', 'COMPLETED', 'PAID')
    order by j.updated_block desc nulls last limit 1`).catch(() => []))
  if (!j) return null
  const ev = (j['ev'] ?? {}) as Record<string, { tx: string; at: string | null }>
  const [r] = rowsOf(await db().execute(sql`
    select value, value_decimals, tx_hash, block_time from rating
    where chain_id = 56 and client = ${String(j['client'])} and agent_token_id = ${String(j['token_id'] ?? '')} and not revoked
    order by block_number desc limit 1`).catch(() => []))
  const tok = j['token'] ? assetAt(56 as ChainId, String(j['token'])) : null
  const funded = ev['JobFunded']?.at ? Date.parse(ev['JobFunded'].at) : null
  const submitted = ev['JobSubmitted']?.at ? Date.parse(ev['JobSubmitted'].at) : null
  const iso = (v: string | null | undefined) => (v ? new Date(v).toISOString() : null)
  return {
    jobId: String(j['job_id']),
    agent: String(j['name'] ?? 'An agent'),
    category: CAT_LABEL[String(j['category'] ?? '')] ?? 'Agent',
    price: tok && j['funded_raw'] ? `${formatAmount(String(j['funded_raw']), tok.decimals)} ${tok.symbol}` : null,
    team: teamWallets().includes(String(j['client'])),
    steps: [
      { label: 'Live quote, signed by the agent', tx: null, at: null },
      { label: 'Paid into escrow', tx: ev['JobFunded']?.tx ?? null, at: iso(ev['JobFunded']?.at) },
      { label: 'Delivered on chain', tx: ev['JobSubmitted']?.tx ?? null, at: iso(ev['JobSubmitted']?.at) },
      { label: r ? 'Rated by the buyer' : 'Rating open to the buyer', tx: r ? String(r['tx_hash']) : null, at: r ? iso(String(r['block_time'])) : null },
    ],
    deliveredSeconds: funded !== null && submitted !== null ? Math.max(0, Math.round((submitted - funded) / 1000)) : null,
    stars: r ? Math.round(Number(r['value']) / 10 ** Number(r['value_decimals'] ?? 0) / 20) : null,
  }
}
