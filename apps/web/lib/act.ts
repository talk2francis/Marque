import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { getAddress, type Address, type Hex, type PublicClient } from 'viem'
import { db } from '@marque/db'
import { archiveClient, publicClient } from '@marque/chain'
import { intentFromLens, measure, plan, type Plan } from '@marque/act'
import { questJob, type ChainId } from '@marque/commerce'
import { jobLens } from './lens'

/**
 * Act on the answer, server side (SPEC-ACT 3 and 4). The plan is built from the delivered answer's
 * decision fields and Marque's own reads; it is sealed with an HMAC so the outcome endpoint only ever
 * records against a plan this server made (and its `before` read). Actions are on BSC mainnet.
 */
const SECRET = process.env['MARQUE_CLAIM_SECRET'] ?? ''
const TTL_MS = 30 * 60_000
type Ok = Extract<Plan, { ok: true }>
export interface SealedPlan { plan: Ok; jobKey: string; agentKey: string; agentName: string; category: string; exp: number }

const mac = (body: string) => createHmac('sha256', SECRET).update(`act-plan-v1\n${body}`).digest('base64url')
const client = (): PublicClient => (archiveClient() ?? publicClient()) as PublicClient
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x))

export async function makePlan(chainId: ChainId, jobId: string, user: string, amount: number | null): Promise<{ plan: Plan; token: string | null; agentName: string | null }> {
  if (!SECRET) throw new Error('MARQUE_CLAIM_SECRET is not set')
  const [lensP, job] = await Promise.all([jobLens(chainId, jobId), questJob(chainId, jobId).catch(() => null)])
  const lens = lensP.value.lens
  const agentName = job?.agent?.name ?? null
  if (!lens) return { plan: { ok: false, code: 'not_actionable', reason: 'The delivered answer could not be read, so there is nothing to act on.' }, token: null, agentName }
  // The buyer's own words (the task in the signed description): the position's account and the asset asked about.
  const [hi] = (await db().execute(sql`select i.description from commerce_job j join hire_intent i on i.id = j.intent_id where j.chain_id = ${chainId} and j.job_id = ${jobId} limit 1`).catch(() => [])) as unknown as Array<{ description: string | null }>
  const desc = hi?.description ?? null
  const task = desc ? (() => { try { const j = JSON.parse(desc) as { task?: unknown }; return typeof j.task === 'string' ? j.task : null } catch { return desc } })() : null
  const intent = intentFromLens(lens as never, { taskAsset: task?.match(/\b(USDT|USDC|FDUSD)\b/i)?.[1] ?? null })
  if (!intent) return { plan: { ok: false, code: 'not_actionable', reason: lens.kind === 'grid' ? 'A grid is many orders over time: Marque shows the plan and builds nothing.' : lens.kind === 'rebalancing' ? 'Re-centring a PancakeSwap position is not offered yet.' : 'This answer carries no decision Marque can act on (a repay to a target, or a supply on Venus).' }, token: null, agentName }
  // Whose position the answer is about: the answer's own account field, else the address in the buyer's task.
  let account = intent.action === 'repay' ? intent.account : null
  // The description is the signed JSON (currency and provider addresses come first): only its task text is read.
  if (intent.action === 'repay' && !account) account = task?.match(/0x[0-9a-fA-F]{40}/)?.[0] ?? null
  if (intent.action === 'repay' && !account) return { plan: { ok: false, code: 'not_owner', reason: 'The answer does not say whose position it is about, so Marque cannot check that it is yours.' }, token: null, agentName }
  const p = await plan({ client: client(), user: getAddress(user) as Address, intent, amount, positionAccount: account })
  if (!p.ok) return { plan: p, token: null, agentName }
  const sealed: SealedPlan = { plan: p, jobKey: `${chainId}:${jobId}`, agentKey: job?.agent?.agentKey ?? 'unknown', agentName: agentName ?? 'the agent', category: lens.kind, exp: Date.now() + TTL_MS }
  const body = Buffer.from(json(sealed)).toString('base64url')
  return { plan: p, token: `${body}.${mac(body)}`, agentName }
}

export function openPlan(token: string): SealedPlan | null {
  const [body, sig] = token.split('.')
  if (!body || !sig || !SECRET) return null
  const want = Buffer.from(mac(body)), got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SealedPlan
  return s.exp > Date.now() ? s : null
}

/**
 * Record an outcome: every transaction must be confirmed, sent by the planned user, and match a planned
 * call byte for byte (target and calldata). `after` is read at the confirmed block plus 2.
 */
export async function recordOutcome(token: string, txHashes: string[]): Promise<{ ok: true; id: number; after: unknown; before: unknown; confirmedBlock: string } | { ok: false; reason: string }> {
  const s = openPlan(token)
  if (!s) return { ok: false, reason: 'The plan expired or was not made here. Make a new plan; nothing is recorded.' }
  const c = client()
  const receipts = []
  for (const h of txHashes) {
    const [tx, r] = await Promise.all([c.getTransaction({ hash: h as Hex }), c.waitForTransactionReceipt({ hash: h as Hex, timeout: 90_000 })])
    if (r.status !== 'success') return { ok: false, reason: `Transaction ${h.slice(0, 10)}… did not succeed.` }
    if (tx.from.toLowerCase() !== s.plan.user.toLowerCase()) return { ok: false, reason: 'A transaction was not sent by the planned wallet.' }
    // Byte for byte: a changed amount makes a new sealed plan, so every call must be exactly one planned.
    if (!s.plan.calls.some((p) => p.to.toLowerCase() === (tx.to ?? '').toLowerCase() && p.data.toLowerCase() === tx.input.toLowerCase())) return { ok: false, reason: 'A transaction does not match the planned call exactly.' }
    receipts.push(r)
  }
  const confirmed = receipts.reduce((m, r) => (r.blockNumber > m ? r.blockNumber : m), 0n)
  const at = confirmed + 2n
  for (let i = 0; i < 30 && (await c.getBlockNumber()) < at; i++) await new Promise((res) => setTimeout(res, 1000))
  const after = await measure(c, s.plan.user, s.plan.market.vToken, s.plan.market.decimals, at)
  if (!after) return { ok: false, reason: 'Venus could not be read after the transaction; try recording again in a minute.' }
  const [row] = (await db().execute(sql`
    insert into outcome (chain_id, job_key, agent_key, user_address, category, action, plan_json, simulated_after_json, tx_hashes, confirmed_block, before_json, after_json)
    values (56, ${s.jobKey}, ${s.agentKey}, ${s.plan.user.toLowerCase()}, ${s.category}, ${s.plan.action}, ${json(s.plan)}::jsonb, ${json(s.plan.predicted)}::jsonb,
      ${json(txHashes)}::jsonb, ${confirmed.toString()}, ${json(s.plan.before)}::jsonb, ${json(after)}::jsonb)
    on conflict (chain_id, confirmed_block, user_address, action) do update set after_json = outcome.after_json
    returning id`)) as unknown as Array<{ id: number }>
  return { ok: true, id: Number(row!.id), after, before: s.plan.before, confirmedBlock: confirmed.toString() }
}

export interface OutcomeView { id: number; jobKey: string; agentKey: string; user: string; action: string; category: string; txHashes: string[]; confirmedBlock: string; before: { healthFactor: number | null; market: { borrowed: number; supplied: number } }; after: { healthFactor: number | null; market: { borrowed: number; supplied: number }; block: string }; amount: number; symbol: string; target: number | null; createdAt: string }

function view(r: Record<string, unknown>): OutcomeView {
  const plan = r['plan_json'] as Ok
  return {
    id: Number(r['id']), jobKey: String(r['job_key']), agentKey: String(r['agent_key']), user: String(r['user_address']), action: String(r['action']), category: String(r['category']),
    txHashes: r['tx_hashes'] as string[], confirmedBlock: String(r['confirmed_block']), before: r['before_json'] as OutcomeView['before'], after: r['after_json'] as OutcomeView['after'],
    amount: plan.amount, symbol: plan.market.symbol, target: plan.agent.target, createdAt: new Date(String(r['created_at'])).toISOString(),
  }
}

export async function outcomesForJob(jobKey: string): Promise<OutcomeView[]> {
  const rows = (await db().execute(sql`select * from outcome where job_key = ${jobKey} order by created_at`).catch(() => [])) as unknown as Array<Record<string, unknown>>
  return rows.map(view)
}
export async function outcomesForAgent(agentKey: string): Promise<OutcomeView[]> {
  const rows = (await db().execute(sql`select * from outcome where agent_key = ${agentKey} order by created_at desc limit 50`).catch(() => [])) as unknown as Array<Record<string, unknown>>
  return rows.map(view)
}
