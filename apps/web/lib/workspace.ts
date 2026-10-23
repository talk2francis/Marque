import 'server-only'
import { sql } from 'drizzle-orm'
import { erc20Abi, formatUnits } from 'viem'
import { db } from '@marque/db'
import { chainClient, disputeWindowSeconds, network, NETWORKS, questFor, teamWallets, type ChainId } from '@marque/commerce'

/**
 * My Marque, Lane A (SPEC-WORKSPACE 1.2 and 1.3): the Logbook and the Needs-you list for any
 * address, from indexed chain events (both networks, never summed) plus live allowance reads.
 * Read-only: every action these items offer is signed by the user's own wallet in the browser.
 */

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>
const s = (v: unknown) => (v == null ? null : String(v))
const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString())
const pgArray = (list: ReadonlyArray<string | number>) => `{${list.map((v) => String(v).replace(/[^0-9a-zA-Zx]/g, '')).join(',')}}`

export type LogKind = 'payment' | 'delivery' | 'rating' | 'job' | 'settlement'
export interface LogEntry {
  at: string | null; chainId: number; kind: LogKind; title: string
  jobId: string | null; agent: string | null; amount: string | null; tx: string; key: string
}

const EVENT: Record<string, { kind: LogKind; title: (who: string) => string; amount?: boolean }> = {
  JobCreated: { kind: 'job', title: (a) => `Opened a job with ${a}` },
  JobRegistered: { kind: 'job', title: () => 'Turned on buyer protection' },
  BudgetSet: { kind: 'job', title: () => 'Locked the price' },
  JobFunded: { kind: 'payment', title: () => 'Paid into escrow', amount: true },
  JobSubmitted: { kind: 'delivery', title: (a) => `${a} delivered` },
  Disputed: { kind: 'job', title: () => 'Reported a problem' },
  JobCompleted: { kind: 'settlement', title: () => 'Settled' },
  PaymentReleased: { kind: 'payment', title: (a) => `Released to ${a}`, amount: true },
  Refunded: { kind: 'payment', title: () => 'Refunded to you', amount: true },
  JobRejected: { kind: 'job', title: () => 'Job cancelled' },
  JobExpired: { kind: 'job', title: () => 'Deadline passed' },
}

function tokenLabel(chainId: number, token: string | null, raw: unknown): string | null {
  if (raw == null || !token) return null
  const asset = NETWORKS[chainId as ChainId]?.assets.find((a) => a.address.toLowerCase() === token.toLowerCase())
  if (!asset) return null
  const v = Number(formatUnits(BigInt(String(raw)), asset.decimals))
  return `${v.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${chainId === 97 ? 'test ' : ''}${asset.symbol}`
}

/** One page of the Logbook, newest first. `cursor` is the `key` of the last entry already shown. */
export async function logbook(address: string, opts: { chains?: ChainId[]; cursor?: string | null; limit?: number; agentWallets?: string[] } = {}) {
  const wallet = address.toLowerCase()
  const chains = opts.chains ?? [56, 97]
  const limit = Math.min(opts.limit ?? 50, 200)
  const [cAt] = (opts.cursor ?? '').split('|')
  const before = cAt && !Number.isNaN(Date.parse(cAt)) ? new Date(cAt).toISOString() : null
  const agents = (opts.agentWallets ?? []).map((w) => w.toLowerCase())
  const who = agents.length ? sql`j.provider = any(${pgArray(agents)}::text[])` : sql`j.client = ${wallet}`
  const events = rowsOf(await db().execute(sql`
    select e.chain_id, e.job_id, e.name, e.tx_hash, e.log_index, e.block_time, e.args, j.token, j.provider,
           coalesce(a.name, ap.name) as agent_name
    from commerce_event e
    join commerce_job j on j.chain_id = e.chain_id and j.job_id = e.job_id
    left join hire_intent i on i.id = j.intent_id
    left join agent a on a.id = i.agent_id
    left join lateral (select name from agent x where x.chain_id = j.chain_id and x.agent_wallet = j.provider limit 1) ap on a.id is null
    where ${who} and e.chain_id = any(${pgArray(chains)}::int[]) and e.name = any(${pgArray(Object.keys(EVENT))}::text[])
      ${before ? sql`and e.block_time <= ${before}::timestamptz` : sql``}
    order by e.block_time desc nulls last, e.block_number desc, e.log_index desc limit ${limit + 60}`))
  const ratings = agents.length ? [] : rowsOf(await db().execute(sql`
    select r.chain_id, r.agent_token_id, r.value, r.value_decimals, r.tx_hash, r.feedback_index, r.block_time, a.name as agent_name
    from rating r left join agent a on a.chain_id = r.chain_id and a.token_id = r.agent_token_id
    where r.client = ${wallet} and r.chain_id = any(${pgArray(chains)}::int[]) and not r.revoked
      ${before ? sql`and r.block_time <= ${before}::timestamptz` : sql``}
    order by r.block_time desc nulls last limit ${limit}`))
  const out: LogEntry[] = []
  for (const r of events) {
    const def = EVENT[String(r['name'])]!
    const name = s(r['agent_name']) ?? `${String(r['provider']).slice(0, 6)}…${String(r['provider']).slice(-4)}`
    const args = (r['args'] ?? {}) as Record<string, unknown>
    out.push({
      at: iso(r['block_time']), chainId: Number(r['chain_id']), kind: def.kind, title: def.title(name),
      jobId: s(r['job_id']), agent: name, amount: def.amount ? tokenLabel(Number(r['chain_id']), s(r['token']), args['amount']) : null,
      tx: String(r['tx_hash']), key: `${iso(r['block_time']) ?? ''}|${r['chain_id']}|${r['tx_hash']}|${r['log_index']}`,
    })
  }
  for (const r of ratings) {
    const stars = Number(r['value']) / 10 ** Number(r['value_decimals'] ?? 0) / 20
    out.push({
      at: iso(r['block_time']), chainId: Number(r['chain_id']), kind: 'rating', title: `You rated ${s(r['agent_name']) ?? `agent #${r['agent_token_id']}`} ${Number.isInteger(stars) ? stars : stars.toFixed(1)} of 5`,
      jobId: null, agent: s(r['agent_name']), amount: null, tx: String(r['tx_hash']), key: `${iso(r['block_time']) ?? ''}|${r['chain_id']}|${r['tx_hash']}|r${r['feedback_index']}`,
    })
  }
  out.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '') || b.key.localeCompare(a.key))
  // Drop everything up to and including the cursor entry (same-second entries are ordered by key).
  let list = out
  if (opts.cursor) { const i = out.findIndex((e) => e.key === opts.cursor); list = i >= 0 ? out.slice(i + 1) : out.filter((e) => (e.at ?? '') < (before ?? '')) }
  const page = list.slice(0, limit)
  return { address: wallet, entries: page, next: page.length === limit ? page[page.length - 1]!.key : null }
}

export type NeedKind = 'rate' | 'review' | 'reclaim' | 'unfinished' | 'approval' | 'deliver' | 'criterion'
export interface NeedItem {
  kind: NeedKind; title: string; sentence: string; deadline: string | null; chainId: number | null; jobId: string | null
  action: { label: string; href?: string; do?: 'revoke' | 'reclaim' | 'rate'; token?: string }
  side: 'hiring' | 'building'
}

const ALLOWANCE_TOKENS: Record<ChainId, string[]> = { 56: [], 97: [] }
for (const c of [56, 97] as const) ALLOWANCE_TOKENS[c] = NETWORKS[c].assets.map((a) => a.address)

export async function needsYou(address: string): Promise<{ address: string; items: NeedItem[]; team: boolean; observedAt: string }> {
  const wallet = address.toLowerCase()
  const now = Date.now()
  const items: NeedItem[] = []
  const jobs = rowsOf(await db().execute(sql`
    select j.chain_id, j.job_id, j.state, j.expired_at, j.provider, coalesce(a.name, ap.name) as agent_name, coalesce(a.token_id, ap.token_id) as token_id,
           (select min(block_time) from commerce_event e where e.chain_id = j.chain_id and e.job_id = j.job_id and e.name = 'JobSubmitted') as submitted_at,
           exists (select 1 from rating r where r.client = j.client and r.chain_id = j.chain_id and r.agent_token_id = coalesce(a.token_id, ap.token_id) and not r.revoked) as rated
    from commerce_job j
    left join hire_intent i on i.id = j.intent_id left join agent a on a.id = i.agent_id
    left join lateral (select name, token_id from agent x where x.chain_id = j.chain_id and x.agent_wallet = j.provider limit 1) ap on a.id is null
    where j.client = ${wallet} order by j.updated_at desc limit 200`))
  const windows: Record<number, number | null> = {}
  for (const c of [56, 97] as const) windows[c] = await disputeWindowSeconds(c).catch(() => null)
  const openJobs = new Set<number>()
  for (const j of jobs) {
    const chainId = Number(j['chain_id']), jobId = String(j['job_id']), state = String(j['state'])
    const agent = s(j['agent_name']) ?? 'the agent'
    const href = `/jobs/${chainId}/${jobId}`
    const expires = j['expired_at'] ? Number(j['expired_at']) * 1000 : null
    const submitted = j['submitted_at'] ? Date.parse(String(j['submitted_at'])) : null
    if (state === 'OPEN') { openJobs.add(chainId); items.push({ kind: 'unfinished', title: `Finish or cancel the hire of ${agent}`, sentence: 'The job is open but not paid. Pay it, or cancel it so nothing is left waiting.', deadline: expires ? new Date(expires).toISOString() : null, chainId, jobId, action: { label: 'Open the job', href }, side: 'hiring' }); continue }
    if (state === 'FUNDED' && expires !== null && !submitted) {
      items.push(expires <= now
        ? { kind: 'reclaim', title: `Reclaim your payment for job ${jobId}`, sentence: `${agent} did not deliver before the deadline. The full amount comes back to the wallet that paid.`, deadline: null, chainId, jobId, action: { label: 'Reclaim', href }, side: 'hiring' }
        : { kind: 'reclaim', title: `Job ${jobId} is waiting on ${agent}`, sentence: 'Paid and not delivered yet. If it never delivers, you can reclaim the payment from the deadline.', deadline: new Date(expires).toISOString(), chainId, jobId, action: { label: 'Open the job', href }, side: 'hiring' })
    }
    if (['SUBMITTED', 'COMPLETED', 'PAID'].includes(state) && !j['rated']) items.push({ kind: 'rate', title: `Rate ${agent}`, sentence: `Job ${jobId} was delivered. Your rating goes on its public record from your wallet.`, deadline: null, chainId, jobId, action: { label: 'Rate', href: `${href}#rate` }, side: 'hiring' })
    const w = windows[chainId]
    if (state === 'SUBMITTED' && submitted && w) {
      const ends = submitted + w * 1000
      if (ends > now) items.push({ kind: 'review', title: `Review window open for job ${jobId}`, sentence: `${agent} delivered. Report a problem before the window closes if the answer is wrong.`, deadline: new Date(ends).toISOString(), chainId, jobId, action: { label: 'Open the job', href }, side: 'hiring' })
    }
  }
  // Leftover approvals: an allowance to BNB Chain's escrow with no open job that needs it.
  for (const c of [56, 97] as const) {
    if (openJobs.has(c)) continue
    const commerce = network(c).commerce
    const reads = await chainClient(c).multicall({ contracts: ALLOWANCE_TOKENS[c].map((t) => ({ address: t as `0x${string}`, abi: erc20Abi, functionName: 'allowance' as const, args: [wallet as `0x${string}`, commerce] as const })), allowFailure: true }).catch(() => [])
    reads.forEach((r, i) => {
      if (r.status !== 'success' || !r.result || (r.result as bigint) === 0n) return
      const token = ALLOWANCE_TOKENS[c][i]!
      items.push({ kind: 'approval', title: `${tokenLabel(c, token, r.result) ?? 'An allowance'} still approved`, sentence: `Left from a hire on ${c === 56 ? 'mainnet' : 'testnet'}. Nothing needs it now; revoking sets it to zero.`, deadline: null, chainId: c, jobId: null, action: { label: 'Revoke', do: 'revoke', token }, side: 'hiring' })
    })
  }
  // Building: funded jobs waiting on this wallet's agents, and the next Set and Earn criterion.
  const owned = rowsOf(await db().execute(sql`select chain_id, token_id, name, coalesce(agent_wallet, owner_address) as wallet from agent where owner_address = ${wallet} limit 20`))
  if (owned.length) {
    const wallets = [...new Set(owned.map((o) => String(o['wallet'])))]
    const toDeliver = rowsOf(await db().execute(sql`select chain_id, job_id, expired_at from commerce_job where provider = any(${pgArray(wallets)}::text[]) and state = 'FUNDED' order by updated_at desc limit 20`))
    for (const j of toDeliver) items.push({ kind: 'deliver', title: `Your agent has job ${j['job_id']} to deliver`, sentence: 'A buyer paid into escrow. Your agent normally delivers on its own; check it answered.', deadline: j['expired_at'] ? new Date(Number(j['expired_at']) * 1000).toISOString() : null, chainId: Number(j['chain_id']), jobId: String(j['job_id']), action: { label: 'Open the job', href: `/jobs/${j['chain_id']}/${j['job_id']}` }, side: 'building' })
    const q = await questFor(wallet).catch(() => null)
    const best = q?.build.agents[0]
    if (best) {
      const first = Object.entries(best.checks).find(([, c]) => c.state === 'not_yet' && c.next)
      if (first) items.push({ kind: 'criterion', title: `${best.name ?? `#${best.tokenId}`}: ${first[1].next!.label}`, sentence: first[1].reason, deadline: '2026-11-05T12:00:00.000Z', chainId: best.chainId, jobId: null, action: { label: first[1].next!.label, href: first[1].next!.href }, side: 'building' })
    }
  }
  items.sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))
  return { address: wallet, items, team: teamWallets().includes(wallet), observedAt: new Date(now).toISOString() }
}
