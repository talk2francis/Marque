import { sql, eq, and, desc } from 'drizzle-orm'
import { decodeEventLog, getAddress, isAddress, type Hex } from 'viem'
import { db, hireIntent, commerceQuote, notifyAttempt, firstPartyAgents, canonicalAgentId } from '@marque/db'
import { safeFetch } from '@marque/probe'
import { agenticCommerceAbi } from './generated.js'
import { network, isSupportedChain, formatAmount, type ChainId } from './config.js'
import { chainClient, disputeWindowSeconds, fromAny, receiptFromAny } from './chain.js'
import { buildJobDescription, buildPlainDescription, descriptionHash } from './description.js'
import { computeExpiredAt, createJobCall } from './calls.js'
import { requestQuote, type NegotiateTask, type QuoteResult, NegotiationSchema, SimpleQuoteSchema } from './quote.js'
import { sellerCandidates, recordQuote, type SellerCandidate } from './supply.js'

/**
 * The server half of the hire rail (SPEC-COMMERCE 7.1). Nothing here signs or holds
 * anything: it fetches the seller's quote, records the buyer's intent, verifies the
 * createJob receipt the buyer's own wallet produced, and tells the seller the job is
 * funded. Every buyer write happens in the browser (AGENTS invariant 22).
 */

export class HireError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message) }
}

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>

/** The exact seller service to hire. Never substitutes another agent (invariant 24). */
export async function sellerFor(agentId: string, serviceId?: number | null): Promise<SellerCandidate> {
  const list = (await sellerCandidates()).filter((c) => c.agentId === agentId && (serviceId == null || c.serviceId === serviceId))
  if (!list.length) throw new HireError('not_a_seller', 'This agent does not offer paid jobs through ERC-8183.', 404)
  return list[0]!
}

export interface PublicQuote {
  quoteId: number
  agentId: string
  serviceId: number
  agentName: string
  category: string | null
  chainId: ChainId
  provider: string
  price: string
  priceLabel: string
  token: { address: string; symbol: string; decimals: number; isDefault: boolean }
  signed: boolean
  expiresAt: number
  estimatedCompletionSeconds: number | null
  providerMatchesRegistry: true
}

/** Ask the exact service for a price on the buyer's task, verify it, store it. */
export async function quoteForBuyer(agentId: string, serviceId: number | null, task: NegotiateTask): Promise<PublicQuote> {
  const seller = await sellerFor(agentId, serviceId)
  const q: QuoteResult = await requestQuote(seller.endpoint, task, { agentWallet: seller.agentWallet, agentOwner: seller.owner, timeoutMs: 10_000 })
  // A plain quote does not echo the task, so the task we asked is kept with it for the job description.
  const quoteId = await recordQuote('user', seller, q, q.ok && !q.signed ? { _marque_task: task.task_description } : undefined)
  if (!q.ok) throw new HireError(`quote_${q.reason}`, quoteFailureSentence(q.reason), 422)
  return {
    quoteId, agentId, serviceId: seller.serviceId, agentName: seller.name, category: seller.category,
    chainId: q.chainId, provider: q.provider, price: q.price.toString(),
    priceLabel: `${formatAmount(q.price, q.token.decimals)} ${q.token.symbol}`,
    token: q.token, signed: q.signed, expiresAt: q.expiresAt, estimatedCompletionSeconds: q.estimatedCompletionSeconds,
    providerMatchesRegistry: true,
  }
}

export function quoteFailureSentence(reason: string): string {
  switch (reason) {
    case 'unreachable': case 'not_a2a': return 'The agent did not answer. Try again in a minute, or pick another agent.'
    case 'declined': return 'The agent declined this task. Try describing it differently.'
    case 'provider_mismatch': return 'The agent quoted with a wallet that is not its registered identity, so Marque will not send payment to it.'
    case 'expired': return 'The quote expired before it arrived. Ask again.'
    default: return 'The agent\'s quote did not pass Marque\'s checks, so it cannot be hired right now.'
  }
}

/** The category frozen into the intent: first-party config, else Marque's current label. Never from the request. */
async function categoryOf(agentId: string): Promise<string> {
  const fp = firstPartyAgents().find((a) => canonicalAgentId(a) === agentId)
  if (fp) return fp.category
  const r = rowsOf(await db().execute(sql`
    select category from agent_category where agent_id = ${agentId}
    order by (category <> 'unclassified') desc, confidence desc, assigned_at desc limit 1`))
  return r[0]?.['category'] ? String(r[0]['category']) : 'unclassified'
}

export interface IntentResponse {
  intentId: string
  chainId: ChainId
  agentName: string
  category: string
  provider: string
  price: string
  priceLabel: string
  token: PublicQuote['token']
  expiredAt: string
  refundAfter: string
  disputeWindowSeconds: number
  description: string
  descriptionHash: string
  contracts: { commerce: string; router: string; policy: string }
  /** The one call the wallet signs next: createJob (or createJobWithToken). */
  createJob: { to: string; functionName: string; args: string[] }
}

/** Record a buyer's intent for one stored quote (no signature needed; SPEC-TRACKING 5). */
export async function createIntent(input: { wallet: string; quoteId: number; clientIp?: string | null }): Promise<IntentResponse> {
  if (!isAddress(input.wallet)) throw new HireError('bad_wallet', 'That is not a wallet address.')
  const wallet = getAddress(input.wallet)
  const [q] = await db().select().from(commerceQuote).where(and(eq(commerceQuote.id, input.quoteId), eq(commerceQuote.source, 'user'), eq(commerceQuote.ok, true))).limit(1)
  if (!q) throw new HireError('no_quote', 'That quote does not exist or did not pass checks. Ask for a new quote.', 404)
  const now = Math.floor(Date.now() / 1000)
  if (!q.quoteExpiresAt || q.quoteExpiresAt.getTime() / 1000 <= now + 20) throw new HireError('quote_expired', 'The quote has expired. Ask for a new one.', 410)
  if (!isSupportedChain(q.chainId) || !q.provider || !q.priceRaw || !q.token || q.tokenDecimals === null || !q.tokenSymbol) {
    throw new HireError('bad_quote', 'That quote is incomplete. Ask for a new one.', 422)
  }
  const chainId = q.chainId as ChainId
  const net = network(chainId)
  const token = net.assets.find((a) => a.address.toLowerCase() === q.token!.toLowerCase())
  if (!token) throw new HireError('bad_token', 'The quoted token is not accepted by the escrow.', 422)
  const agent = rowsOf(await db().execute(sql`select name from agent where id = ${q.agentId}`))[0]
  const agentName = String(agent?.['name'] ?? 'this agent')
  const category = await categoryOf(q.agentId)
  const window = await disputeWindowSeconds(chainId)
  const expiredAt = computeExpiredAt(now, window, q.estimatedCompletionSeconds)

  const intentId = crypto.randomUUID()
  const raw = q.raw as Record<string, unknown>
  let description: string
  if (q.signed === false) {
    const simple = SimpleQuoteSchema.parse(raw)
    const task = String(raw['_marque_task'] ?? raw['service'] ?? '')
    description = buildPlainDescription(simple, task, intentId)
  } else {
    description = buildJobDescription(NegotiationSchema.parse(raw))
  }
  const hash = descriptionHash(description)
  const price = BigInt(q.priceRaw)
  const priceLabel = `${formatAmount(price, token.decimals)} ${token.symbol}`

  await db().insert(hireIntent).values({
    id: intentId, wallet: wallet.toLowerCase(), agentId: q.agentId, serviceId: q.serviceId, category, chainId,
    quoteId: q.id, provider: q.provider.toLowerCase(), token: token.address.toLowerCase(), priceRaw: q.priceRaw,
    description, descriptionHash: hash, expiredAt: Number(expiredAt), clientIp: input.clientIp ?? null,
  })

  const call = createJobCall({ chainId, provider: getAddress(q.provider), token, price, priceLabel, agentName, expiredAt, description })
  return {
    intentId, chainId, agentName, category, provider: getAddress(q.provider), price: q.priceRaw, priceLabel,
    token: { address: token.address, symbol: token.symbol, decimals: token.decimals, isDefault: token.isDefault },
    expiredAt: expiredAt.toString(), refundAfter: new Date(Number(expiredAt) * 1000).toISOString(),
    disputeWindowSeconds: window, description, descriptionHash: hash,
    contracts: { commerce: net.commerce, router: net.router, policy: net.policy },
    createJob: { to: call.to, functionName: call.functionName, args: call.args.map((a) => String(a)) },
  }
}

/** Bind a createJob transaction to its intent, only if the chain says it matches (SPEC-TRACKING 5.2). */
export async function bindIntent(input: { intentId: string; txHash: string; source?: 'browser' | 'indexer' }): Promise<{ jobId: string; chainId: number; alreadyBound: boolean }> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.txHash)) throw new HireError('bad_tx', 'That is not a transaction hash.')
  const [intent] = await db().select().from(hireIntent).where(eq(hireIntent.id, input.intentId)).limit(1)
  if (!intent) throw new HireError('no_intent', 'That hire was not started on Marque.', 404)
  if (intent.jobId) return { jobId: intent.jobId, chainId: intent.chainId, alreadyBound: true }
  const chainId = intent.chainId as ChainId
  const receipt = await receiptFromAny(chainId, input.txHash as Hex, 45_000)
  if (!receipt) throw new HireError('tx_pending', 'The transaction is not confirmed yet. Marque will pick it up automatically.', 409)
  if (receipt.status !== 'success') throw new HireError('tx_failed', 'That transaction failed on chain, so no job was opened.', 422)
  const commerce = network(chainId).commerce.toLowerCase()
  let jobId: bigint | null = null
  let client_: string | null = null
  let provider: string | null = null
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== commerce) continue
    try {
      const d = decodeEventLog({ abi: agenticCommerceAbi, data: log.data, topics: log.topics })
      if (d.eventName === 'JobCreated') {
        const a = d.args as { jobId: bigint; client: string; provider: string }
        jobId = a.jobId; client_ = a.client; provider = a.provider
      }
    } catch { /* another event */ }
  }
  if (jobId === null) throw new HireError('no_job', 'That transaction did not open an escrow job.', 422)
  if (client_!.toLowerCase() !== intent.wallet) throw new HireError('wrong_client', 'The job was opened by a different wallet than this hire.', 422)
  if (provider!.toLowerCase() !== intent.provider) throw new HireError('wrong_provider', 'The job names a different agent than the one quoted.', 422)
  const job = await fromAny(chainId, (c) => c.readContract({ address: network(chainId).commerce, abi: agenticCommerceAbi, functionName: 'getJob', args: [jobId!] }) as Promise<{ description: string }>, (j) => Boolean(j?.description))
  if (descriptionHash(job.description) !== intent.descriptionHash) throw new HireError('wrong_description', 'The job terms on chain differ from the quote.', 422)
  const block = await fromAny(chainId, (c) => c.getBlock({ blockNumber: receipt.blockNumber }))
  if (Number(block.timestamp) * 1000 - intent.createdAt.getTime() > 30 * 60_000) throw new HireError('too_late', 'The job was opened more than 30 minutes after the quote.', 422)
  await db().update(hireIntent).set({ jobId: jobId.toString(), createTx: input.txHash, state: 'bound', bindSource: input.source ?? 'browser', boundAt: new Date() })
    .where(and(eq(hireIntent.id, intent.id), sql`${hireIntent.jobId} is null`))
  return { jobId: jobId.toString(), chainId, alreadyBound: false }
}

/**
 * Tell the seller its job is funded (A2A notify_funded). Idempotent: a job with a
 * successful notify is not notified again. Retries 3 times with backoff. The seller
 * re-verifies the funded job on chain before working, so this can never cause work
 * that was not paid for.
 */
export async function notifySeller(chainId: number, jobId: string, opts: { params?: Record<string, unknown>; force?: boolean } = {}): Promise<{ accepted: boolean; status: string | null; attempts: number }> {
  if (!isSupportedChain(chainId)) throw new HireError('bad_chain', 'Unsupported network.')
  const [intent] = await db().select().from(hireIntent).where(and(eq(hireIntent.chainId, chainId), eq(hireIntent.jobId, jobId))).limit(1)
  if (!intent) throw new HireError('not_marque', 'That job was not started on Marque.', 404)
  const done = await db().select().from(notifyAttempt).where(and(eq(notifyAttempt.chainId, chainId), eq(notifyAttempt.jobId, jobId), eq(notifyAttempt.ok, true))).orderBy(desc(notifyAttempt.createdAt)).limit(1)
  if (done[0] && !opts.force) return { accepted: true, status: done[0].status, attempts: 0 }
  const job = await chainClient(chainId as ChainId).readContract({ address: network(chainId).commerce, abi: agenticCommerceAbi, functionName: 'getJob', args: [BigInt(jobId)] }) as { status: number }
  if (job.status < 1) throw new HireError('not_funded', 'The job is not paid yet, so the agent has not been asked to start.', 409)
  const [q] = await db().select().from(commerceQuote).where(eq(commerceQuote.id, intent.quoteId)).limit(1)
  if (!q) throw new HireError('no_quote', 'The quote for this job is missing.', 500)
  const prior = await db().select({ n: sql<number>`count(*)::int` }).from(notifyAttempt).where(and(eq(notifyAttempt.chainId, chainId), eq(notifyAttempt.jobId, jobId)))
  let attempt = prior[0]?.n ?? 0
  const body = (id: string) => JSON.stringify({
    jsonrpc: '2.0', id, method: 'message/send',
    params: { message: { kind: 'message', role: 'user', messageId: id, parts: [{ kind: 'data', data: { skill: 'notify_funded', job_id: Number(jobId), ...(opts.params ?? {}) } }] } },
  })
  for (let i = 0; i < 3; i++) {
    attempt++
    const started = Date.now()
    const res = await safeFetch(q.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body(`marque-notify-${jobId}-${attempt}`), timeoutMs: 15_000, maxBytes: 64 * 1024 })
    let status: string | null = null
    let ok = false
    if (res.ok && res.status < 400) {
      const m = res.body.match(/"status"\s*:\s*"(accepted|rejected)"/)
      status = m?.[1] ?? (/"accepted"\s*:\s*true/.test(res.body) ? 'accepted' : null)
      ok = status === 'accepted' || /job_id|jobId/.test(res.body)
    }
    await db().insert(notifyAttempt).values({
      chainId, jobId, intentId: intent.id, endpoint: q.endpoint, attempt, ok, status,
      detail: res.ok ? res.body.slice(0, 500) : `${res.failure}: ${res.detail}`.slice(0, 500), latencyMs: Date.now() - started,
    })
    if (ok) {
      await db().update(hireIntent).set({ state: 'notified' }).where(eq(hireIntent.id, intent.id))
      return { accepted: true, status, attempts: i + 1 }
    }
    if (status === 'rejected') return { accepted: false, status, attempts: i + 1 }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i))
  }
  return { accepted: false, status: null, attempts: 3 }
}

/**
 * Durable notify (P2-02 item 6): any Marque-bound job that is funded on chain but whose
 * seller was never successfully told gets notified from the worker, so closing the tab or
 * a web restart after payment can never strand a job. Bounded to the last 3 days.
 */
export async function retryPendingNotifies(limit = 20): Promise<{ checked: number; notified: number }> {
  const rows = rowsOf(await db().execute(sql`
    select h.chain_id, h.job_id from hire_intent h
    where h.job_id is not null and h.state = 'bound' and h.bound_at > now() - interval '3 days'
      and not exists (select 1 from notify_attempt n where n.chain_id = h.chain_id and n.job_id = h.job_id and n.ok)
      and (select count(*) from notify_attempt n where n.chain_id = h.chain_id and n.job_id = h.job_id) < 12
    order by h.bound_at asc limit ${limit}`))
  let notified = 0
  for (const r of rows) {
    try {
      const out = await notifySeller(Number(r['chain_id']), String(r['job_id']))
      if (out.accepted) notified++
    } catch (err) {
      if (err instanceof HireError && err.code === 'not_funded') continue
    }
  }
  // Accepted is not delivered (28 Sep, job 56839: the seller accepted the notify, then
  // could not read the brand-new block and dropped it). A job still FUNDED with no new
  // notify for 4 min is told again; the seller re-verifies on chain, so this is safe.
  const stuck = rowsOf(await db().execute(sql`
    select j.chain_id, j.job_id from commerce_job j
    join hire_intent h on h.id = j.intent_id
    where j.state = 'FUNDED' and j.updated_at > now() - interval '2 days'
      and (select max(n.created_at) from notify_attempt n where n.chain_id = j.chain_id and n.job_id = j.job_id) < now() - interval '4 minutes'
      and (select count(*) from notify_attempt n where n.chain_id = j.chain_id and n.job_id = j.job_id) < 12
    order by j.updated_at asc limit ${limit}`))
  for (const r of stuck) {
    try {
      const out = await notifySeller(Number(r['chain_id']), String(r['job_id']), { force: true })
      if (out.accepted) notified++
    } catch (err) {
      if (err instanceof HireError && err.code === 'not_funded') continue
    }
  }
  return { checked: rows.length + stuck.length, notified }
}

export interface SheetAgent {
  agentId: string
  tokenId: string
  registryChainId: number
  name: string
  category: string | null
  owner: string | null
  firstParty: boolean
  state: string
  lastQuote: { chainId: number | null; priceLabel: string | null; signed: boolean | null; quotedAt: string | null } | null
  /** The seller's own example task when it works from a JSON object (see SellerCandidate). */
  taskExample: string | null
}

/** What the hire sheet shows before the buyer asks for a price. */
export async function agentForSheet(agentId: string): Promise<SheetAgent> {
  const seller = await sellerFor(agentId)
  const { commercialStates } = await import('./supply.js')
  const s = (await commercialStates()).get(seller.serviceId)
  return {
    agentId: seller.agentId, tokenId: seller.tokenId, registryChainId: seller.chainId, name: seller.name,
    category: seller.category, owner: seller.owner, firstParty: seller.firstParty !== null, state: s?.state ?? 'unavailable',
    taskExample: seller.taskExample,
    lastQuote: s ? {
      chainId: s.chainId,
      priceLabel: s.priceRaw && s.token ? `${formatAmount(BigInt(s.priceRaw), s.token.decimals)} ${s.token.symbol}` : null,
      signed: s.signed, quotedAt: s.quotedAt,
    } : null,
  }
}
