import 'server-only'
import { sql } from 'drizzle-orm'
import { db, firstPartyIdListSql, oneAgentIdSql } from '@marque/db'
import { formatAmount, QUEST_CATEGORIES, teamWallets, assetAt, type ChainId } from '@marque/commerce'
import { funnel } from '@marque/registry'
import { type MarketRow } from './marketplace'
import { marketplaceAgentsCached as marketplaceAgents } from './market-cache'
import { pickShowcase } from './ready-picks'
import { readLedger } from './ledger'
import type { SupplyCount, SupplyNow } from './supply-truth'
import { operatorWalletsHere } from './operators-here'
import { standingEvidence, type StandingEvidence } from './agent-standing'
import { referenceAgent } from './reference-agents'
import { registryImageUrl } from './avatar-source'
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
        -- On Marque: only a rating from a wallet that hired this agent through Marque (2 Nov). Any other rating on chain
        -- is not Marque activity.
        and exists (select 1 from commerce_job j join hire_intent i on i.id = j.intent_id join agent ha on ha.id = i.agent_id
          where j.chain_id = 56 and j.client = r.client and ha.token_id = r.agent_token_id)
      order by r.block_time desc limit ${limit}`),
  ])
  const items: Array<TapeItem & { at: number }> = []
  // One entry per transaction: a batch of ratings in one transaction is one event, not several (2 Nov).
  const seenTx = new Set<string>()
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
    if (seenTx.has(String(r['tx_hash']))) continue
    seenTx.add(String(r['tx_hash']))
    const at = new Date(String(r['block_time'])).toISOString()
    const stars = Math.round(Number(r['value']) / 10 ** Number(r['value_decimals'] ?? 0) / 20)
    items.push({
      id: `r-${r['tx_hash']}`, kind: 'rating', agent: String(r['name'] ?? `Agent #${r['agent_token_id']}`),
      category: CAT_LABEL[String(r['category'] ?? '')] ?? 'Agent', value: `rated ${stars} of 5`,
      tx: String(r['tx_hash']), href: `https://bscscan.com/tx/${r['tx_hash']}`, age: ageWords(at),
      team: team.has(String(r['client'])), at: Date.parse(at),
    })
  }
  // D10: outside activity leads. With at least five outside events in seven days, they come
  // first (newest first) and team tests follow; with fewer, everything runs by time, so the
  // Tape never reads as a list of team activity when outside activity exists.
  const weekAgo = Date.now() - 7 * 86_400_000
  const outsideRecent = items.filter((i) => !i.team && i.at >= weekAgo).length
  const byTime = (a: { at: number }, b: { at: number }) => b.at - a.at
  const ordered = outsideRecent >= 5
    ? [...items.filter((i) => !i.team).sort(byTime), ...items.filter((i) => i.team).sort(byTime)]
    : items.sort(byTime)
  return ordered.slice(0, limit).map(({ at: _at, ...t }) => t)
}

export interface CategoryTile {
  measuredAt: string
  category: string
  /** Hireable on BSC mainnet (supplyNow): a live signed price, not pulled. The tile's number. */
  hireable: number
  /** Of those: checked against the chain in the last 30 days, and holding a Marque Warrant (a test pass in 14 days). */
  checked: number
  warranted: number
  /** Distinct recorded owners of the hireable agents. */
  operators: number
  cheapest: string | null
  bestRating: { stars: number; count: number; agent: string } | null
  /** Priced on mainnet (hireable plus pulled), and hireable on testnet; never added together. */
  pricedMainnet: number
  pricedTestnet: number
}

/**
 * Per quest category, from the one supply count (supplyNow): hireable, checked and warranted on mainnet, the agents
 * hireable on testnet beside it (never added), the cheapest live mainnet quote and the best verified rating.
 */
export async function categoryTiles(ready: MarketRow[], supply: Awaited<ReturnType<typeof marketplaceAgents>>['supply'], measuredAt: string, mainnet: SupplyNow, testnet: SupplyNow | null): Promise<CategoryTile[]> {
  return QUEST_CATEGORIES.map((category) => {
    const c = supply.find((x) => x.category === category)
    const m = mainnet.byCategory[category]
    const cheapest = c?.cheapest ? `${formatAmount(c.cheapest.priceRaw, c.cheapest.decimals)} ${c.cheapest.token}` : null
    const rated = ready
      .filter((r) => r.category === category && r.track.verified.averageStars !== null)
      .sort((a, b) => (b.track.verified.averageStars ?? 0) - (a.track.verified.averageStars ?? 0))[0]
    return {
      measuredAt, category, cheapest,
      hireable: m?.hireable ?? 0,
      checked: m?.checked ?? 0,
      warranted: m?.warranted ?? 0,
      operators: m?.operators ?? 0,
      pricedMainnet: m?.priced ?? 0,
      pricedTestnet: testnet?.byCategory[category]?.hireable ?? 0,
      bestRating: rated ? { stars: rated.track.verified.averageStars!, count: rated.track.verified.count, agent: rated.name } : null,
    }
  })
}

/** Six hireable agents for "Ready to hire now": Marque's six reference agents, outside agents only where one has no live price (pickShowcase). */
export async function readyToHire(): Promise<{ all: MarketRow[]; picks: MarketRow[]; supply: Awaited<ReturnType<typeof marketplaceAgents>>['supply']; generatedAt: string; total: number }> {
  const { rows, supply, generatedAt, quoteObservedAt, total } = await marketplaceAgents({ tab: 'ready', lane: 'mainnet', sort: 'best', limit: 60, failed: 'group' })
  return { all: rows, picks: pickShowcase(rows), supply, generatedAt: quoteObservedAt ?? generatedAt, total }
}

export interface FunnelLine extends SupplyCount { registered: number | null; answering: number | null; measuredAt: string }

/** The Phase 1 funnel reduced to one line (the full one lives on /why); the supply numbers are supplyNow's. */
export async function funnelLine(supply: SupplyNow): Promise<FunnelLine> {
  const stages = await funnel(56).catch(() => null)
  const stage = (k: string) => stages?.find((s) => s.stage === k)?.count ?? null
  const { priced, hireable, pulled, checked, warranted, delivered, measuredAt } = supply
  return { registered: stage('registered_bsc'), answering: stage('reachable'), priced, hireable, pulled, checked, warranted, delivered, measuredAt }
}

export interface PassFail {
  pass: { agent: string; testId: string; fields: string[]; at: string; href: string } | null
  fail: { agent: string; testId: string; failedFields: number; thirdPartyRuns: number; thirdPartyPasses: number; at: string; href: string } | null
}

/** Dated examples; a failure must still be the latest observation for that agent/test. */
export async function passFail(): Promise<PassFail> {
  const [p, f, counts] = await Promise.all([
    db().execute(sql`
      select ${oneAgentIdSql(sql`cr.agent_id`)} as agent_id, cr.test_id, cr.diffs, cr.ran_at, a.name from conformance_result cr
      left join agent a on a.id = ${oneAgentIdSql(sql`cr.agent_id`)}
      where cr.pass = true and cr.agent_id in ${firstPartyIdListSql()} order by cr.ran_at desc limit 1`).then(rowsOf).catch(() => []),
    db().execute(sql`
      with latest as (
        select distinct on (agent_id, test_id) id from conformance_result
        order by agent_id, test_id, ran_at desc, id desc
      )
      select cr.agent_id, cr.test_id, cr.ran_at, a.name, jsonb_array_length(cr.failed_fields) as n
      from latest l join conformance_result cr on cr.id = l.id join agent a on a.id = cr.agent_id
      where cr.pass = false and cr.error is null and cr.agent_id not like 'stub:%'
        and cr.agent_id not in ${firstPartyIdListSql()} and jsonb_array_length(cr.failed_fields) > 0
        and exists (
          select 1 from jsonb_array_elements(cr.diffs) d
          where d->>'pass' = 'false' and coalesce(d->>'missing', 'false') <> 'true'
            and coalesce(d->>'actual', '') <> ''
            and d->>'actual' not like '(not %' and d->>'actual' not like '(no %'
        )
      order by cr.ran_at desc, cr.id desc limit 1`).then(rowsOf).catch(() => []),
    db().execute(sql`
      select count(*)::int as runs, count(*) filter (where pass)::int as passes from conformance_result
      where agent_id not like 'stub:%' and agent_id not in ${firstPartyIdListSql()}`).then(rowsOf).catch(() => []),
  ])
  const pr = p[0]
  const fr = f[0]
  const profile = (r: Record<string, unknown>) => {
    const agentId = String(r['agent_id'] ?? '')
    const reference = referenceAgent(agentId)
    if (reference) return `/agents/${reference.slug}`
    const id = agentId.match(/^(56|97):0x[0-9a-f]{40}:(\d+)$/i)
    return id ? `/agents/${id[1]}/${id[2]}` : `/standard/${String(r['test_id'])}`
  }
  const at = (r: Record<string, unknown>) => new Date(r['ran_at'] as string | Date).toISOString()
  const diffs = Array.isArray(pr?.['diffs']) ? (pr!['diffs'] as Array<Record<string, unknown>>) : []
  return {
    pass: pr ? { agent: String(pr['name'] ?? referenceAgent(String(pr['agent_id']))?.name ?? String(pr['agent_id']).replace('marque:', '')), testId: String(pr['test_id']), fields: diffs.slice(0, 5).map((d) => String(d['field'])), at: at(pr), href: profile(pr) } : null,
    fail: fr ? {
      agent: String(fr['name']), testId: String(fr['test_id']), failedFields: Number(fr['n']),
      at: at(fr), href: profile(fr),
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

export interface RecentHire {
  jobId: string
  /** The agent's canonical id, for its portrait. */
  agentId: string | null
  imageUrl: string | null
  agent: string
  category: string
  state: string
  fundedAt: string
  price: string | null
  team: boolean
  /** An outside payer that also owns or runs an agent listed on Marque (operators-here.ts). */
  alsoOperator: boolean
  steps: Array<{ label: string; tx: string | null; at: string | null }>
  deliveredSeconds: number | null
  stars: number | null
  /** The job's first chain event (JobCreated), and its settlement (JobCompleted) once the review window closed. */
  openedTx: string | null
  settledTx: string | null
}

/**
 * A short selection of real paid Marque jobs on BSC mainnet, from agents that deliver (3 Nov): delivered jobs only,
 * each delivered within 15 minutes of payment, by agents that delivered at least 9 in 10 of their paid jobs (two or more)
 * and are not pulled for safety; one job per agent, outside buyers first. A job still waiting for its agent is never
 * shown here. No raw buyer task is put on Home; the Job Room carries the full evidence.
 */
export async function recentHires(): Promise<RecentHire[]> {
  const operators = await operatorWalletsHere().catch(() => new Set<string>())
  const jobs = rowsOf(await db().execute(sql`
    select j.job_id, j.client, j.provider, j.funded_raw, j.token, j.state,
           i.category, i.agent_id, a.name, a.token_id, a.image_url,
           (a.raw_metadata #>> '{offchain_content,image}') as meta_image, funded.block_time as funded_at,
           (select json_object_agg(e.name, json_build_object('tx', e.tx_hash, 'at', e.block_time, 'block', e.block_number))
              from commerce_event e where e.chain_id = j.chain_id and e.job_id = j.job_id) as ev
    from commerce_job j
    join hire_intent i on i.id = j.intent_id
    left join agent a on a.id = i.agent_id
    join commerce_event funded on funded.chain_id = j.chain_id and funded.job_id = j.job_id and funded.name = 'JobFunded'
    where j.chain_id = 56 and j.state in ('SUBMITTED', 'COMPLETED', 'PAID')
    order by funded.block_time desc nulls last limit 120`).catch(() => []))
  // Each agent's record on Marque hires: paid jobs and how many it delivered.
  const records = new Map(rowsOf(await db().execute(sql`
    select i.agent_id, count(*) filter (where j.funded_raw is not null and j.funded_raw <> '0')::int as funded,
           count(*) filter (where j.state in ('SUBMITTED', 'DISPUTED', 'COMPLETED', 'PAID'))::int as delivered
    from commerce_job j join hire_intent i on i.id = j.intent_id and i.chain_id = j.chain_id and i.job_id = j.job_id
    where j.chain_id = 56 group by 1`).catch(() => [])).map((r) => [String(r['agent_id']), { funded: Number(r['funded']), delivered: Number(r['delivered']) }]))
  const standing = await standingEvidence().catch(() => ({} as Record<string, StandingEvidence>))
  const quick = (j: Record<string, unknown>) => {
    const ev = (j['ev'] ?? {}) as Record<string, { at: string | null }>
    const f = ev['JobFunded']?.at ? Date.parse(ev['JobFunded'].at) : NaN, d = ev['JobSubmitted']?.at ? Date.parse(ev['JobSubmitted'].at) : NaN
    return Number.isFinite(f) && Number.isFinite(d) && d - f >= 0 && d - f <= 15 * 60_000
  }
  const reliable = (j: Record<string, unknown>) => {
    const id = String(j['agent_id'] ?? '')
    const rec = records.get(id)
    const s = standing[id]
    return Boolean(rec && rec.delivered >= 2 && rec.funded > 0 && rec.delivered / rec.funded >= 0.9 && !s?.undelivered && !s?.wrong)
  }
  const team = new Set(teamWallets())
  const isTeam = (j: Record<string, unknown>) => team.has(String(j['client']))
  const done = (j: Record<string, unknown>) => j['state'] === 'COMPLETED' || j['state'] === 'PAID'
  // Outside buyers first, settled before in review, newest first; then one job per agent.
  const seen = new Set<string>()
  const selected = jobs.filter((j) => quick(j) && reliable(j))
    .sort((a, b) => Number(isTeam(a)) - Number(isTeam(b)) || Number(done(b)) - Number(done(a)) || Date.parse(String(b['funded_at'])) - Date.parse(String(a['funded_at'])))
    .filter((j) => { const id = String(j['agent_id']); if (seen.has(id)) return false; seen.add(id); return true })
    .slice(0, 5)
  return Promise.all(selected.map(async (j): Promise<RecentHire> => {
    const ev = (j['ev'] ?? {}) as Record<string, { tx: string; at: string | null; block?: number }>
    const [r] = rowsOf(await db().execute(sql`
      select r.value, r.value_decimals, r.tx_hash, r.block_time from rating_comment c
      join rating r on r.chain_id = c.chain_id and r.feedback_hash = c.feedback_hash
        and r.client = c.client and r.agent_token_id = c.agent_token_id
      where c.chain_id = 56 and c.job_id = ${String(j['job_id'])} and not r.revoked
      order by r.block_number desc limit 1`).catch(() => []))
    const tok = j['token'] ? assetAt(56 as ChainId, String(j['token'])) : null
    const funded = ev['JobFunded']?.at ? Date.parse(ev['JobFunded'].at) : null
    const submitted = ev['JobSubmitted']?.at ? Date.parse(ev['JobSubmitted'].at) : null
    const iso = (v: string | null | undefined) => (v ? new Date(v).toISOString() : null)
    return {
      jobId: String(j['job_id']),
      agentId: j['agent_id'] ? String(j['agent_id']) : null,
      imageUrl: registryImageUrl(j['image_url']) ?? registryImageUrl(j['meta_image']),
      agent: String(j['name'] ?? 'An agent'),
      category: CAT_LABEL[String(j['category'] ?? '')] ?? 'Agent',
      state: String(j['state']),
      fundedAt: iso(String(j['funded_at']))!,
      price: tok && j['funded_raw'] ? `${formatAmount(String(j['funded_raw']), tok.decimals)} ${tok.symbol}` : null,
      team: teamWallets().includes(String(j['client'])),
      alsoOperator: !teamWallets().includes(String(j['client'])) && operators.has(String(j['client']).toLowerCase()),
      steps: [
        { label: 'Quote evidence, with signature mode shown', tx: null, at: null },
        { label: 'Paid into escrow', tx: ev['JobFunded']?.tx ?? null, at: iso(ev['JobFunded']?.at) },
        { label: 'Delivered on chain', tx: ev['JobSubmitted']?.tx ?? null, at: iso(ev['JobSubmitted']?.at) },
        { label: r ? 'Rated by the buyer' : 'Rating open to the buyer', tx: r ? String(r['tx_hash']) : null, at: r ? iso(String(r['block_time'])) : null },
      ],
      deliveredSeconds: funded !== null && submitted !== null ? Math.max(0, Math.round((submitted - funded) / 1000)) : null,
      stars: r ? Math.round(Number(r['value']) / 10 ** Number(r['value_decimals'] ?? 0) / 20) : null,
      openedTx: ev['JobCreated']?.tx ?? null,
      settledTx: ev['JobCompleted']?.tx ?? null,
    }
  }))
}

/** Acted-on outcomes recorded from chain (the "Ranked by results" roadmap meter). A COUNT(*), never an estimate. */
export async function outcomeCount(): Promise<number> {
  const r = await db().execute(sql`select count(*)::int as n from outcome`)
  return Number(rowsOf(r)[0]?.['n'] ?? 0)
}
