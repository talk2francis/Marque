import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { db, firstPartyAgents } from '@marque/db'
import { NETWORKS, campaignChainId, assetAt, SUPPORTED_CHAINS, type ChainId } from './config.js'
import { REPUTATION_REGISTRY, LOG_WINDOW, cursorOf, logsClient } from './indexer.js'
import { DELIVERED, type JobState } from './state.js'
import { QUEST_CATEGORIES, type QuestCategory } from './supply.js'

/**
 * The Set and Earn projection (SPEC-TRACKING 6 and 9). Everything here is read from
 * indexed chain events plus Marque's own intent records. Ineligible activity is returned
 * with `eligible: false` and reasons, never hidden.
 */


/** topic0 per event, from the SDK ABIs and ERC-8004 (verified by scripts/verify-topics.mts). */
export const QUEST_TOPICS = {
  hire: { name: 'JobCreated', topic0: '0xb0f0239bfdd96453e24733e18bfc24b70d8fadf123dd977473518dd577ee79b9' },
  priceLocked: { name: 'BudgetSet', topic0: '0x869e2577b006bf47ee981cf6fec2e25583548081c14b98deab587f77b5068038' },
  deposit: { name: 'JobFunded', topic0: '0xbdb056de345bfeadca7c9fd7df6430bdb83c677c8eefbb601dff56f34d3dac52' },
  delivered: { name: 'JobSubmitted', topic0: '0x80c17db79857f338a6a6df68a6883ecc0ce78e2202fe61ed979733573f40538e' },
  settled: { name: 'JobCompleted', topic0: '0x0fd54bd364fa9e67f17b091aefe930932c09fe7651cf5ad02c71a418f3341444' },
  paid: { name: 'PaymentReleased', topic0: '0x21d71db5be59bb9fa133895586b7404307dd33fb93b16db09dc6f1d9d7d231b0' },
  rating: { name: 'NewFeedback', topic0: '0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc' },
} as const

/** A repo file, found by walking up from MARQUE_ROOT or the working directory. */
function repoFile(rel: string): string | null {
  for (const start of [process.env.MARQUE_ROOT, process.cwd()].filter((x): x is string => Boolean(x))) {
    let dir = path.resolve(start)
    for (let i = 0; i < 10; i++) {
      const p = path.join(dir, rel)
      if (existsSync(p)) return p
      const up = path.dirname(dir)
      if (up === dir) break
      dir = up
    }
  }
  return null
}

/** The last scripts/verify-topics.mts result, if it has been run. */
export function verifiedTopics(): Record<string, { topic0: string; verified: boolean; chainId?: number; tx?: string | null }> | null {
  const p = repoFile('docs/phase2/evidence/verify-topics.json')
  if (!p) return null
  try { return (JSON.parse(readFileSync(p, 'utf8')) as { events: Record<string, { topic0: string; verified: boolean }> }).events } catch { return null }
}

let teamCache: { at: number; list: string[] } | null = null
/** config/team-wallets.json, lowercased. Reloaded every minute so an edit needs no restart. */
export function teamWallets(): string[] {
  if (teamCache && Date.now() - teamCache.at < 60_000) return teamCache.list
  const p = repoFile('config/team-wallets.json')
  const list = p ? (JSON.parse(readFileSync(p, 'utf8')) as { wallets: Array<{ address: string }> }).wallets.map((w) => w.address.toLowerCase()) : []
  teamCache = { at: Date.now(), list }
  return list
}

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>
const s = (v: unknown): string | null => (v == null ? null : String(v))
const iso = (v: unknown): string | null => (v == null ? null : new Date(v as string).toISOString())

export interface QuestHire {
  jobKey: string
  chainId: number
  jobId: string
  agent: { agentKey: string | null; agentId: string | null; name: string | null; owner: string | null; provider: string; category: string | null; firstParty: boolean }
  amount: string | null
  token: { address: string | null; symbol: string | null; decimals: number | null }
  state: JobState
  marque: boolean
  intentId: string | null
  tx: Record<string, string | null>
  timestamps: Record<string, string | null>
  rating: { value: number; stars: number; tx: string; revoked: boolean } | null
  eligible: boolean
  reasons: string[]
}

/** Every job one address opened as client, projected, with the anti-wash reasons. */
async function hiresFor(where: ReturnType<typeof sql>): Promise<QuestHire[]> {
  const rows = rowsOf(await db().execute(sql`
    select j.*, i.id as i_id, i.agent_id as i_agent, i.category as i_category,
           a.id as a_id, a.token_id as a_token, a.name as a_name, a.owner_address as a_owner,
           (select json_object_agg(e.name, json_build_object('tx', e.tx_hash, 'at', e.block_time))
              from commerce_event e where e.chain_id = j.chain_id and e.job_id = j.job_id) as ev
    from commerce_job j
    left join hire_intent i on i.id = j.intent_id
    left join lateral (
      select * from agent a
      where (i.agent_id is not null and a.id = i.agent_id)
         or (i.agent_id is null and a.agent_wallet = j.provider and a.chain_id = 56)
      order by (a.id = i.agent_id) desc nulls last limit 1
    ) a on true
    where ${where}
    order by j.created_block nulls last, j.job_id`))
  const team = new Set(teamWallets())
  const fp = firstPartyAgents()
  const out: QuestHire[] = []
  for (const r of rows) {
    const chainId = Number(r['chain_id'])
    const ev = (r['ev'] ?? {}) as Record<string, { tx: string; at: string | null }>
    const tok = s(r['token'])
    const asset = tok ? assetAt(chainId, tok) : null
    const tokenId = s(r['a_token'])
    const first = tokenId ? fp.find((f) => String(f.tokenId) === tokenId) ?? null : null
    const category = s(r['i_category']) ?? first?.category ?? null
    const client = String(r['client'])
    const provider = String(r['provider'])
    const owner = s(r['a_owner'])?.toLowerCase() ?? null
    const state = String(r['state']) as JobState
    const reasons: string[] = []
    if (team.has(client)) reasons.push('team_wallet')
    if (client === provider || (owner && client === owner)) reasons.push('self_hire')
    if (!r['funded_raw'] || String(r['funded_raw']) === '0') reasons.push('zero_deposit')
    if (!r['intent_id']) reasons.push('not_marque')
    if (!DELIVERED.has(state) && ['REFUNDED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(state)) reasons.push('not_delivered')
    out.push({
      jobKey: `${chainId}:${r['job_id']}`, chainId, jobId: String(r['job_id']),
      agent: { agentKey: s(r['a_id']), agentId: tokenId, name: s(r['a_name']), owner, provider, category, firstParty: first !== null },
      amount: s(r['funded_raw']) ?? s(r['budget_raw']),
      token: { address: tok, symbol: asset?.symbol ?? null, decimals: asset?.decimals ?? null },
      state, marque: Boolean(r['intent_id']), intentId: s(r['intent_id']),
      tx: {
        created: ev['JobCreated']?.tx ?? null, registered: ev['JobRegistered']?.tx ?? null, budgetSet: ev['BudgetSet']?.tx ?? null,
        funded: ev['JobFunded']?.tx ?? null, submitted: ev['JobSubmitted']?.tx ?? null, completed: ev['JobCompleted']?.tx ?? null,
        paymentReleased: ev['PaymentReleased']?.tx ?? null, rejected: ev['JobRejected']?.tx ?? null, refunded: ev['Refunded']?.tx ?? null,
        rating: null,
      },
      timestamps: {
        created: iso(ev['JobCreated']?.at), funded: iso(ev['JobFunded']?.at), submitted: iso(ev['JobSubmitted']?.at), completed: iso(ev['JobCompleted']?.at),
      },
      rating: null, eligible: reasons.length === 0, reasons,
    })
  }
  return out
}

/** The ERC-8004 token id an agent has on a given chain's registry (first-party agents carry both). */
function tokenOnChain(h: QuestHire): string | null {
  if (h.chainId === 56) return h.agent.agentId
  const first = firstPartyAgents().find((f) => String(f.tokenId) === h.agent.agentId)
  return first?.testnet?.chainId === h.chainId ? String(first.testnet.tokenId) : null
}

async function attachRatings(wallet: string, hires: QuestHire[]): Promise<void> {
  if (!hires.length) return
  const rows = rowsOf(await db().execute(sql`
    select chain_id, agent_token_id, value, value_decimals, tx_hash, block_number, revoked from rating
    where client = ${wallet} order by block_number`))
  for (const h of hires) {
    const tid = tokenOnChain(h)
    if (!tid) continue
    const submittedBlock = h.tx.submitted ? await submittedAt(h.chainId, h.jobId) : null
    const r = rows.find((x) => Number(x['chain_id']) === h.chainId && String(x['agent_token_id']) === tid)
    if (!r) continue
    const value = Number(r['value']) / 10 ** Number(r['value_decimals'] ?? 0)
    h.rating = { value, stars: Math.round(value / 20), tx: String(r['tx_hash']), revoked: Boolean(r['revoked']) }
    h.tx.rating = String(r['tx_hash'])
    if (submittedBlock === null || Number(r['block_number']) < submittedBlock) h.reasons.push('rating_unbound')
  }
}

async function submittedAt(chainId: number, jobId: string): Promise<number | null> {
  const [r] = rowsOf(await db().execute(sql`select block_number from commerce_event where chain_id = ${chainId} and job_id = ${jobId} and name = 'JobSubmitted' limit 1`))
  return r ? Number(r['block_number']) : null
}

export function isAddress(a: string): boolean { return /^0x[0-9a-fA-F]{40}$/.test(a) }

/** GET /api/v1/phase2/wallet/:address */
export async function walletQuest(address: string, chainId: ChainId = campaignChainId()) {
  const wallet = address.toLowerCase()
  const hires = await hiresFor(sql`j.client = ${wallet} and j.chain_id = ${chainId}`)
  await attachRatings(wallet, hires)
  // One counted hire per category: the first funded, Marque-bound one. Later ones are shown
  // with duplicate_category. Team and self flags do not move which job is "the" one.
  const categories = Object.fromEntries(QUEST_CATEGORIES.map((c) => [c, { done: false, delivered: false, jobKey: null as string | null }])) as Record<QuestCategory, { done: boolean; delivered: boolean; jobKey: string | null }>
  for (const h of hires) {
    const c = h.agent.category as QuestCategory | null
    if (!c || !(QUEST_CATEGORIES as readonly string[]).includes(c) || !h.marque || !h.tx.funded || h.reasons.includes('zero_deposit')) continue
    if (categories[c].jobKey) { h.reasons.push('duplicate_category'); h.eligible = false; continue }
    categories[c] = { done: true, delivered: DELIVERED.has(h.state), jobKey: h.jobKey }
  }
  for (const h of hires) h.eligible = h.reasons.length === 0
  const counted = hires.filter((h) => Object.values(categories).some((c) => c.jobKey === h.jobKey))
  const ratedAll = QUEST_CATEGORIES.every((c) => {
    const h = counted.find((x) => x.jobKey === categories[c].jobKey)
    return Boolean(h?.rating && !h.rating.revoked && !h.reasons.includes('rating_unbound'))
  })
  const walletReasons: string[] = []
  if (teamWallets().includes(wallet)) walletReasons.push('team_wallet')
  const own = await ownerAgents(wallet)
  const listed = own.find((a) => a.listedOnMarque) ?? null
  const cursor = await cursorOf(chainId)
  return {
    wallet, chainId, asOfBlock: { [chainId]: cursor },
    quest: {
      categories, ratedAll,
      ownAgentListed: { done: listed !== null, agentKey: listed?.agentKey ?? null },
      eligible: walletReasons.length === 0, reasons: walletReasons,
    },
    hires,
    totals: {
      hires: hires.length, deposits: hires.filter((h) => h.tx.funded).length, delivered: hires.filter((h) => DELIVERED.has(h.state)).length,
      settled: hires.filter((h) => h.tx.completed).length, ratings: hires.filter((h) => h.rating).length,
    },
  }
}

/** GET /api/v1/phase2/job/:chainId/:jobId */
export async function questJob(chainId: ChainId, jobId: string) {
  const [h] = await hiresFor(sql`j.chain_id = ${chainId} and j.job_id = ${jobId}`)
  const events = rowsOf(await db().execute(sql`
    select name, contract, tx_hash, log_index, block_number, block_time, args from commerce_event
    where chain_id = ${chainId} and job_id = ${jobId} order by block_number, log_index`))
  if (!h && !events.length) return null
  if (h) await attachRatings((await clientOf(chainId, jobId)) ?? '', [h])
  const [j] = rowsOf(await db().execute(sql`select * from commerce_job where chain_id = ${chainId} and job_id = ${jobId}`))
  const [intent] = h?.intentId ? rowsOf(await db().execute(sql`select id, wallet, agent_id, category, quote_id, description_hash, created_at, bound_at, bind_source from hire_intent where id = ${h.intentId}`)) : []
  const slug = h?.agent.agentId ? firstPartyAgents().find((f) => String(f.tokenId) === h.agent.agentId)?.slug : undefined
  return {
    chainId, jobId, state: h?.state ?? null, client: s(j?.['client']), provider: s(j?.['provider']), evaluator: s(j?.['evaluator']),
    agent: h?.agent ?? null, amount: h?.amount ?? null, token: h?.token ?? null,
    deliverable: { hash: s(j?.['deliverable']), url: slug ? `https://marque.trade/agents/${slug}/erc8183/job/${jobId}/response` : null },
    expiresAt: j?.['expired_at'] ? new Date(Number(j['expired_at']) * 1000).toISOString() : null,
    intent: intent ?? null, rating: h?.rating ?? null, tx: h?.tx ?? null, eligible: h?.eligible ?? false, reasons: h?.reasons ?? ['unknown_job'],
    events: events.map((e) => ({ name: e['name'], contract: e['contract'], tx: e['tx_hash'], logIndex: e['log_index'], block: Number(e['block_number']), at: iso(e['block_time']), args: e['args'] })),
  }
}

async function clientOf(chainId: number, jobId: string): Promise<string | null> {
  const [r] = rowsOf(await db().execute(sql`select client from commerce_job where chain_id = ${chainId} and job_id = ${jobId}`))
  return r ? String(r['client']) : null
}

/** GET /api/v1/phase2/owner/:address (SPEC-TRACKING 6.3, quality checks per section 10). */
export async function ownerAgents(address: string) {
  const owner = address.toLowerCase()
  const rows = rowsOf(await db().execute(sql`
    select a.id, a.chain_id, a.token_id, a.name, a.agent_wallet,
      (select category from agent_category c where c.agent_id = a.id order by (category <> 'unclassified') desc, confidence desc, assigned_at desc limit 1) as category,
      (select json_build_object('status', b.status, 'verifiedAt', b.verified_at, 'publishedAt', b.published_at) from builder_listing b
         where b.agent_id = a.id and b.withdrawn_at is null order by b.id desc limit 1) as listing,
      (select json_build_object('liveness', p.liveness, 'at', p.checked_at) from probe p join agent_service sv on sv.id = p.service_id
         where sv.agent_id = a.id order by p.checked_at desc limit 1) as probe,
      (select count(*) from commerce_job j where j.provider = a.agent_wallet) as jobs,
      (select count(*) from commerce_job j where j.provider = a.agent_wallet and j.funded_raw is not null) as paid
    from agent a where a.owner_address = ${owner} order by a.token_id::numeric desc nulls last limit 200`))
  return rows.map((r) => {
    const listing = r['listing'] as { status: string; verifiedAt: string | null; publishedAt: string | null } | null
    const probe = r['probe'] as { liveness: string; at: string } | null
    const category = s(r['category'])
    const fresh = probe ? Date.now() - new Date(probe.at).getTime() < 24 * 3600_000 : false
    const checks = [
      { id: 'identity', pass: true, fix: null },
      { id: 'owner_verified', pass: Boolean(listing?.verifiedAt), fix: 'Prove ownership at https://marque.trade/builders/claim' },
      { id: 'callable_24h', pass: fresh && probe?.liveness === 'live', fix: 'A declared service must answer a live call within 24 h' },
      { id: 'classified', pass: Boolean(category && category !== 'unclassified'), fix: 'Describe the agent so it classifies into a Set and Earn category' },
      { id: 'test_call', pass: listing?.status === 'published', fix: 'Pass the live test call at https://marque.trade/builders' },
    ]
    return {
      agentKey: String(r['id']), chainId: Number(r['chain_id']), agentId: String(r['token_id']), name: s(r['name']), category,
      listedOnMarque: listing?.status === 'published', listing, liveness: probe?.liveness ?? null, lastProbe: probe?.at ?? null,
      quality: { listing: checks.every((c) => c.pass), checks },
      jobsReceived: Number(r['jobs']), jobsPaid: Number(r['paid']),
    }
  })
}

/** GET /api/v1/phase2/stats: eligible activity only, since launch, on the campaign network. */
export async function questStats(chainId: ChainId = campaignChainId()) {
  const clients = rowsOf(await db().execute(sql`select distinct client from commerce_job where chain_id = ${chainId} and intent_id is not null`)).map((r) => String(r['client']))
  const per = await Promise.all(clients.map((c) => walletQuest(c, chainId)))
  const eligible = per.filter((w) => w.quest.eligible)
  const counted = eligible.flatMap((w) => w.hires.filter((h) => h.eligible))
  const hiresPerCategory = Object.fromEntries(QUEST_CATEGORIES.map((c) => [c, counted.filter((h) => h.agent.category === c).length]))
  const [listed] = rowsOf(await db().execute(sql`select count(*) as n from builder_listing where status = 'published' and withdrawn_at is null`))
  return {
    chainId, walletsWithHire: eligible.filter((w) => w.hires.some((h) => h.eligible)).length,
    hiresPerCategory, deposits: counted.filter((h) => h.tx.funded).length, delivered: counted.filter((h) => DELIVERED.has(h.state)).length,
    settled: counted.filter((h) => h.tx.completed).length, ratings: counted.filter((h) => h.rating && !h.reasons.includes('rating_unbound')).length,
    agentsListed: Number(listed?.['n'] ?? 0),
    excluded: { wallets: per.length - eligible.length, hires: per.flatMap((w) => w.hires).length - counted.length },
  }
}

/** Indexer position per chain, for /config and /status. */
export async function indexerStatus() {
  return Promise.all(SUPPORTED_CHAINS.map(async (chainId) => {
    const cursor = await cursorOf(chainId)
    const head = await logsClient(chainId).getBlockNumber().then(Number).catch(() => null)
    return { chainId, cursorBlock: cursor, headBlock: head, lagBlocks: cursor !== null && head !== null ? head - cursor : null, logWindowBlocks: Number(LOG_WINDOW[chainId]) }
  }))
}

/** GET /api/v1/phase2/config */
export async function questConfig() {
  const verified = verifiedTopics()
  const campaign = campaignChainId()
  return {
    product: 'Marque', url: 'https://marque.trade', campaignNetwork: campaign,
    networks: SUPPORTED_CHAINS.map((chainId) => {
      const n = NETWORKS[chainId]
      return {
        chainId, name: n.name, identityRegistry: n.identityRegistry, reputationRegistry: REPUTATION_REGISTRY[chainId],
        agenticCommerce: n.commerce, evaluatorRouter: n.router, optimisticPolicy: n.policy,
        paymentTokens: n.assets.map((a) => ({ symbol: a.symbol, address: a.address, decimals: a.decimals, default: a.isDefault })),
      }
    }),
    events: Object.fromEntries(Object.entries(QUEST_TOPICS).map(([k, v]) => [k, { ...v, verifiedOnChain: verified?.[v.name] ?? null }])),
    questRules: {
      hire: 'A Marque-bound JobCreated whose agent is in the category, followed by JobFunded with amount > 0',
      deposit: 'That JobFunded', completion: 'JobSubmitted for that job (JobCompleted reported alongside as settlement)',
      rating: 'NewFeedback from the job client for that agent after JobSubmitted', oneHirePerCategory: true,
      antiWash: ['team_wallet', 'self_hire', 'zero_deposit', 'not_marque', 'not_delivered', 'rating_unbound', 'duplicate_category'],
    },
    teamWallets: teamWallets(),
    indexer: await indexerStatus(),
  }
}
