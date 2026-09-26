import { sql, eq, and, isNull, gte } from 'drizzle-orm'
import { createPublicClient, decodeEventLog, fallback, http, parseAbi, type Log, type Abi, type PublicClient } from 'viem'
import { bsc, bscTestnet } from 'viem/chains'
import { db, commerceEvent, commerceJob, chainCursor, hireIntent, rating } from '@marque/db'
import { agenticCommerceAbi, evaluatorRouterAbi, optimisticPolicyAbi } from './generated.js'
import { network, type ChainId } from './config.js'
import { chainClient } from './chain.js'
import { archiveClient } from '@marque/chain'
import { projectJob, type JobEvent, type JobEventName } from './state.js'
import { bindIntent } from './hire.js'

/**
 * The Quest Index (SPEC-TRACKING 3). Tails the four contracts that make up a hire on
 * each chain, stores every log as it came off the chain, and recomputes each touched
 * job from ALL of its stored events. Re-reading a range is harmless: events upsert on
 * (chain, tx, logIndex) and the job row is a pure function of its events, which is why
 * a reorg or a restart can never double-count.
 */

/** ERC-8004 ReputationRegistry, not in the SDK. Proxy addresses measured in PROTOCOL-FACTS. */
export const REPUTATION_REGISTRY: Record<ChainId, `0x${string}`> = {
  56: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  97: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
}

export const reputationAbi = parseAbi([
  'event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
  'event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)',
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
  'function getLastIndex(uint256 agentId, address clientAddress) view returns (uint64)',
])

const JOB_EVENTS = new Set<JobEventName>([
  'JobCreated', 'JobRegistered', 'BudgetSet', 'JobPaymentTokenBound', 'JobFunded', 'JobSubmitted',
  'Disputed', 'JobSettled', 'JobCompleted', 'PaymentReleased', 'JobRejected', 'JobExpired', 'Refunded',
])

export function contractsOf(chainId: ChainId): Array<{ key: string; address: `0x${string}`; abi: Abi }> {
  const n = network(chainId)
  return [
    { key: 'commerce', address: n.commerce, abi: agenticCommerceAbi as Abi },
    { key: 'router', address: n.router, abi: evaluatorRouterAbi as Abi },
    { key: 'policy', address: n.policy, abi: optimisticPolicyAbi as Abi },
    { key: 'reputation', address: REPUTATION_REGISTRY[chainId], abi: reputationAbi as Abi },
  ]
}

/**
 * Logs come from publicnode first: bnbchain dataseed refuses getLogs and blockrazor caps
 * ranges at 25 blocks (PF-6). INDEXER_RPC_<chainId> (comma list) overrides.
 */
const logClients = new Map<ChainId, PublicClient>()
export function logsClient(chainId: ChainId): PublicClient {
  let c = logClients.get(chainId)
  if (!c) {
    const env = process.env[`INDEXER_RPC_${chainId}`]
    const urls = env ? env.split(',').map((s) => s.trim()).filter(Boolean)
      : chainId === 56 ? ['https://bsc-rpc.publicnode.com', 'https://bsc.publicnode.com'] : ['https://bsc-testnet-rpc.publicnode.com', 'https://bsc-testnet.publicnode.com']
    c = createPublicClient({ chain: chainId === 56 ? bsc : bscTestnet, transport: fallback(urls.map((u) => http(u, { timeout: 20_000, retryCount: 2 }))) }) as PublicClient
    logClients.set(chainId, c)
  }
  return c
}

/**
 * How far back the public log RPC answers, measured 26 Sep 2026: mainnet publicnode
 * serves about 9,500 blocks (about 70 min) and refuses older ranges ("Archive requests
 * require a personal token"); testnet serves at least 20,000. P2-00 had measured about
 * 20,000 on mainnet, so this is kept conservative.
 */
export const LOG_WINDOW: Record<ChainId, bigint> = { 56: 8_500n, 97: 18_000n }
const ARCHIVE_STEP = 5n
const ARCHIVE_BLOCKS_PER_PASS = 1_000n

const CURSOR_KEY = 'quest'
export const CONFIRMATIONS = 3n
export const RESCAN = 50n
export const CHUNK = 2_000n

const plain = (v: unknown): unknown =>
  typeof v === 'bigint' ? v.toString()
    : Array.isArray(v) ? v.map(plain)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
        : typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v) ? v.toLowerCase() : v

export interface DecodedLog { chainId: ChainId; contract: string; name: string; jobId: string | null; args: Record<string, unknown>; txHash: string; logIndex: number; blockNumber: number }

export function decodeLog(chainId: ChainId, log: Log): DecodedLog | null {
  const c = contractsOf(chainId).find((x) => x.address.toLowerCase() === log.address.toLowerCase())
  if (!c || log.transactionHash === null || log.logIndex === null || log.blockNumber === null) return null
  try {
    const d = decodeEventLog({ abi: c.abi, data: log.data, topics: log.topics, strict: false }) as unknown as { eventName: string; args: Record<string, unknown> }
    const args = plain(d.args ?? {}) as Record<string, unknown>
    const jobId = args['jobId'] == null ? null : String(args['jobId'])
    return { chainId, contract: c.key, name: d.eventName, jobId, args, txHash: log.transactionHash.toLowerCase(), logIndex: log.logIndex, blockNumber: Number(log.blockNumber) }
  } catch {
    return null
  }
}

export async function cursorOf(chainId: ChainId): Promise<number | null> {
  const [r] = await db().select().from(chainCursor).where(and(eq(chainCursor.chainId, chainId), eq(chainCursor.contract, CURSOR_KEY))).limit(1)
  return r ? r.lastBlock : null
}

async function setCursor(chainId: ChainId, block: number): Promise<void> {
  await db().insert(chainCursor).values({ chainId, contract: CURSOR_KEY, lastBlock: block, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [chainCursor.chainId, chainCursor.contract], set: { lastBlock: block, updatedAt: new Date() } })
}

/**
 * Where to begin on a chain with no cursor: the block of the first Marque intent minus
 * 1,000 when it is inside what public RPCs serve, else near head (PF-6: public nodes keep
 * about 20,000 blocks of logs). An operator can pin it with INDEXER_START_<chainId>.
 */
export async function startBlock(chainId: ChainId, head: bigint): Promise<bigint> {
  const pinned = process.env[`INDEXER_START_${chainId}`]
  if (pinned) return BigInt(pinned)
  const floor = head - LOG_WINDOW[chainId] + 500n
  const [first] = await db().select({ tx: hireIntent.createTx }).from(hireIntent)
    .where(and(eq(hireIntent.chainId, chainId), sql`${hireIntent.createTx} is not null`)).orderBy(hireIntent.createdAt).limit(1)
  if (first?.tx) {
    const r = await chainClient(chainId).getTransactionReceipt({ hash: first.tx as `0x${string}` }).catch(() => null)
    if (r) { const b = r.blockNumber - 1_000n; return b > floor ? b : floor }
  }
  return floor
}

const blockTimes = new Map<string, Date>()
async function blockTime(chainId: ChainId, n: number): Promise<Date | null> {
  const k = `${chainId}:${n}`
  const hit = blockTimes.get(k)
  if (hit) return hit
  const b = await chainClient(chainId).getBlock({ blockNumber: BigInt(n) }).catch(() => null)
  if (!b) return null
  const d = new Date(Number(b.timestamp) * 1000)
  if (blockTimes.size > 5_000) blockTimes.clear()
  blockTimes.set(k, d)
  return d
}

/** Store decoded events, then recompute every job and rating they touch. */
export async function ingestEvents(events: DecodedLog[]): Promise<{ stored: number; jobs: number; ratings: number; bound: number }> {
  if (!events.length) return { stored: 0, jobs: 0, ratings: 0, bound: 0 }
  const times = new Map<number, Date | null>()
  for (const e of events) if (!times.has(e.blockNumber)) times.set(e.blockNumber, await blockTime(e.chainId, e.blockNumber))
  const rows = events.map((e) => ({
    chainId: e.chainId, txHash: e.txHash, logIndex: e.logIndex, blockNumber: e.blockNumber, blockTime: times.get(e.blockNumber) ?? null,
    contract: e.contract, name: e.name, jobId: e.jobId, args: e.args,
  }))
  for (let i = 0; i < rows.length; i += 500) await db().insert(commerceEvent).values(rows.slice(i, i + 500)).onConflictDoNothing()

  let bound = 0
  // Auto-bind (SPEC-TRACKING 5.3): a JobCreated whose client has an open intent for the
  // same provider on this chain. bindIntent re-checks client, provider, description hash
  // and the 30-minute window from the chain; a mismatch simply does not bind.
  for (const e of events.filter((x) => x.name === 'JobCreated')) {
    const client = String(e.args['client'] ?? '').toLowerCase()
    const provider = String(e.args['provider'] ?? '').toLowerCase()
    const open = await db().select({ id: hireIntent.id }).from(hireIntent).where(and(
      eq(hireIntent.chainId, e.chainId), eq(hireIntent.wallet, client), eq(hireIntent.provider, provider), isNull(hireIntent.jobId),
      gte(hireIntent.createdAt, new Date(Date.now() - 6 * 3600_000)),
    ))
    for (const intent of open) {
      const r = await bindIntent({ intentId: intent.id, txHash: e.txHash, source: 'indexer' }).catch(() => null)
      if (r && !r.alreadyBound) { bound++; break }
    }
  }

  const jobKeys = [...new Set(events.filter((e) => e.jobId && JOB_EVENTS.has(e.name as JobEventName)).map((e) => `${e.chainId}:${e.jobId}`))]
  for (const k of jobKeys) {
    const [c, j] = k.split(':') as [string, string]
    await recomputeJob(Number(c) as ChainId, j)
  }

  let ratings = 0
  for (const e of events.filter((x) => x.contract === 'reputation')) {
    if (e.name === 'NewFeedback') {
      const a = e.args
      await db().insert(rating).values({
        chainId: e.chainId, agentTokenId: String(a['agentId']), client: String(a['clientAddress']).toLowerCase(), feedbackIndex: String(a['feedbackIndex']),
        value: String(a['value']), valueDecimals: Number(a['valueDecimals'] ?? 0), tag1: (a['tag1'] as string) ?? null, tag2: (a['tag2'] as string) ?? null,
        endpoint: (a['endpoint'] as string) ?? null, feedbackUri: (a['feedbackURI'] as string) ?? null, feedbackHash: (a['feedbackHash'] as string) ?? null,
        txHash: e.txHash, blockNumber: e.blockNumber, blockTime: times.get(e.blockNumber) ?? null,
      }).onConflictDoNothing()
      ratings++
    } else if (e.name === 'FeedbackRevoked') {
      const a = e.args
      await db().update(rating).set({ revoked: true }).where(and(
        eq(rating.chainId, e.chainId), eq(rating.agentTokenId, String(a['agentId'])),
        eq(rating.client, String(a['clientAddress']).toLowerCase()), eq(rating.feedbackIndex, String(a['feedbackIndex'])),
      ))
      ratings++
    }
  }
  return { stored: rows.length, jobs: jobKeys.length, ratings, bound }
}

/** commerce_job for one job, as a pure function of every stored event for it. */
export async function recomputeJob(chainId: ChainId, jobId: string): Promise<void> {
  const evs = await db().select().from(commerceEvent).where(and(eq(commerceEvent.chainId, chainId), eq(commerceEvent.jobId, jobId)))
  const p = projectJob(evs.filter((e) => JOB_EVENTS.has(e.name as JobEventName)).map((e): JobEvent => ({
    name: e.name as JobEventName, blockNumber: e.blockNumber, logIndex: e.logIndex, txHash: e.txHash,
    blockTime: e.blockTime?.toISOString() ?? null, args: e.args,
  })))
  // A job whose JobCreated predates the index has no client or provider: its events are
  // kept, but there is no honest row to write for it.
  if (!p.client || !p.provider) return
  const [intent] = await db().select({ id: hireIntent.id }).from(hireIntent).where(and(eq(hireIntent.chainId, chainId), eq(hireIntent.jobId, jobId))).limit(1)
  const row = {
    chainId, jobId, client: p.client.toLowerCase(), provider: p.provider.toLowerCase(), evaluator: p.evaluator, hook: p.hook, token: p.token,
    budgetRaw: p.budgetRaw, fundedRaw: p.fundedRaw, expiredAt: p.expiredAt, deliverable: p.deliverable, state: p.state,
    intentId: intent?.id ?? null, createdBlock: p.createdBlock, updatedBlock: p.updatedBlock,
    createdAt: p.times.created ? new Date(p.times.created) : null, updatedAt: new Date(),
  }
  const { chainId: _c, jobId: _j, ...set } = row
  await db().insert(commerceJob).values(row).onConflictDoUpdate({ target: [commerceJob.chainId, commerceJob.jobId], set })
}

/** Re-attach intents bound by the browser after their job row was written. */
export async function relinkIntents(): Promise<number> {
  const r = await db().execute(sql`
    update commerce_job j set intent_id = i.id
    from hire_intent i
    where i.chain_id = j.chain_id and i.job_id = j.job_id and j.intent_id is distinct from i.id`)
  return Number((r as { rowCount?: number }).rowCount ?? 0)
}

/** One pass on one chain: from the cursor (minus the rescan) to head minus confirmations. */
export async function indexChain(chainId: ChainId, opts: { maxChunks?: number } = {}): Promise<{ chainId: ChainId; from: number; to: number; head: number; stored: number; jobs: number; ratings: number; bound: number }> {
  const client = logsClient(chainId)
  const head = await client.getBlockNumber()
  const safe = head - CONFIRMATIONS
  const cursor = await cursorOf(chainId)
  let from = cursor === null ? await startBlock(chainId, head) : BigInt(cursor) - RESCAN
  if (from < 0n) from = 0n
  const addresses = contractsOf(chainId).map((c) => c.address)
  const total = { stored: 0, jobs: 0, ratings: 0, bound: 0 }
  const start = from
  let chunks = 0
  // Behind the public window (an outage longer than about an hour on mainnet): catch up
  // through the archive node in 5-block ranges (its getLogs cap), a bounded slice per pass.
  // Without an archive endpoint the skipped range is recorded as a gap, never hidden.
  const windowFloor = head - LOG_WINDOW[chainId]
  if (from < windowFloor) {
    const archive = chainId === 56 ? archiveClient() : null
    if (archive) {
      const until = from + ARCHIVE_BLOCKS_PER_PASS - 1n < windowFloor ? from + ARCHIVE_BLOCKS_PER_PASS - 1n : windowFloor
      const ranges: Array<[bigint, bigint]> = []
      for (let b = from; b <= until; b += ARCHIVE_STEP) ranges.push([b, b + ARCHIVE_STEP - 1n > until ? until : b + ARCHIVE_STEP - 1n])
      for (let i = 0; i < ranges.length; i += 10) {
        const batch = await Promise.all(ranges.slice(i, i + 10).map(([f, t]) => archive.getLogs({ address: addresses, fromBlock: f, toBlock: t })))
        const decoded = batch.flat().map((l) => decodeLog(chainId, l as Log)).filter((x): x is DecodedLog => x !== null)
        const r = await ingestEvents(decoded)
        total.stored += r.stored; total.jobs += r.jobs; total.ratings += r.ratings; total.bound += r.bound
      }
      await setCursor(chainId, Number(until))
      return { chainId, from: Number(start), to: Number(until), head: Number(head), ...total }
    }
    await db().insert(chainCursor).values({ chainId, contract: `gap:${from}-${windowFloor - 1n}`, lastBlock: Number(windowFloor - 1n), updatedAt: new Date() }).onConflictDoNothing()
    from = windowFloor
  }
  while (from <= safe && chunks < (opts.maxChunks ?? 20)) {
    const to = from + CHUNK - 1n > safe ? safe : from + CHUNK - 1n
    const logs = await client.getLogs({ address: addresses, fromBlock: from, toBlock: to })
    const decoded = logs.map((l) => decodeLog(chainId, l as Log)).filter((x): x is DecodedLog => x !== null)
    const r = await ingestEvents(decoded)
    total.stored += r.stored; total.jobs += r.jobs; total.ratings += r.ratings; total.bound += r.bound
    await setCursor(chainId, Number(to))
    from = to + 1n
    chunks++
  }
  return { chainId, from: Number(start), to: Number(from - 1n), head: Number(head), ...total }
}
