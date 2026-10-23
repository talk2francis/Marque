import { sql } from 'drizzle-orm'
import { keccak256, toHex, type PublicClient } from 'viem'
import { db, campaignJob } from '@marque/db'
import { agenticCommerceAbi } from './generated.js'
import { network, SUPPORTED_CHAINS, type ChainId } from './config.js'
import { chainClient } from './chain.js'

/**
 * Set and Earn, as the organizer runs it (SPEC-ADOPTION 2, FACTS 11, 16, 17).
 *
 * Every ERC-8183 job created in the window on chains 56 and 97 is read into `campaign_job`,
 * whichever marketplace made it, and credited to a marketplace only from what the job
 * record itself says (invariant 36). This is derived state: dropping the table and running
 * `indexCampaignJobs` again rebuilds it from chain.
 */
import { CAMPAIGN, campaignStartMs, attributeDescription, statusName, pgArray } from './campaign-rules.js'
export * from './campaign-rules.js'

interface ChainJob { id: bigint; client: string; provider: string; evaluator: string; description: string; budget: bigint; expiredAt: bigint; status: number; hook: string; submittedAt: bigint }

async function readJobs(client: PublicClient, chainId: ChainId, ids: bigint[]): Promise<Map<string, ChainJob>> {
  const address = network(chainId).commerce
  const out = new Map<string, ChainJob>()
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100)
    const res = await client.multicall({ contracts: batch.map((id) => ({ address, abi: agenticCommerceAbi, functionName: 'getJob' as const, args: [id] as const })), allowFailure: true })
    res.forEach((r, k) => { if (r.status === 'success') out.set(String(batch[k]), r.result as unknown as ChainJob) })
  }
  return out
}

/**
 * The first job id created in the window. Uses the indexed JobCreated block time when the
 * Quest Index has it; otherwise a binary search on `expiredAt`, which is never earlier than
 * creation, so the search can only start early (harmless: early jobs are filtered by time).
 */
async function firstWindowJob(client: PublicClient, chainId: ChainId, counter: bigint): Promise<bigint> {
  const r = await db().execute(sql`select min(job_id::numeric)::text as first from commerce_job where chain_id = ${chainId} and created_at >= ${CAMPAIGN.start}::timestamptz`)
  const indexed = (r as unknown as Array<{ first: string | null }>)[0]?.first
  const covered = await db().execute(sql`select min(job_id::numeric)::text as low from commerce_job where chain_id = ${chainId} and created_at < ${CAMPAIGN.start}::timestamptz`)
  if (indexed && (covered as unknown as Array<{ low: string | null }>)[0]?.low) return BigInt(indexed)
  const startSec = BigInt(Math.floor(campaignStartMs / 1000))
  let lo = 1n, hi = counter
  while (lo < hi) {
    const mid = (lo + hi) / 2n
    const job = (await readJobs(client, chainId, [mid])).get(String(mid))
    if (job && job.expiredAt >= startSec) hi = mid
    else lo = mid + 1n
  }
  return lo
}

interface EventTimes { createdAt: Date | null; fundedAt: Date | null; fundedTx: string | null; submittedAt: Date | null; completedAt: Date | null }

async function eventTimes(chainId: ChainId, ids: string[]): Promise<Map<string, EventTimes>> {
  const out = new Map<string, EventTimes>()
  if (!ids.length) return out
  const rows = await db().execute(sql`
    select job_id, name, min(block_time) as at, (array_agg(tx_hash order by block_number, log_index))[1] as tx
    from commerce_event
    where chain_id = ${chainId} and job_id = any(${pgArray(ids)}::text[]) and name in ('JobCreated','JobFunded','JobSubmitted','JobCompleted')
    group by job_id, name`) as unknown as Array<{ job_id: string; name: string; at: Date | string | null; tx: string }>
  for (const r of rows) {
    const t = out.get(r.job_id) ?? { createdAt: null, fundedAt: null, fundedTx: null, submittedAt: null, completedAt: null }
    const at = r.at ? new Date(r.at) : null
    if (r.name === 'JobCreated') t.createdAt = at
    if (r.name === 'JobFunded') { t.fundedAt = at; t.fundedTx = r.tx }
    if (r.name === 'JobSubmitted') t.submittedAt = at
    if (r.name === 'JobCompleted') t.completedAt = at
    out.set(r.job_id, t)
  }
  return out
}

/**
 * Read new job ids and refresh every job that can still change. Terminal jobs (COMPLETED,
 * REJECTED, EXPIRED) are read once more only when `full` is set.
 */
export async function indexCampaignJobs(chainId: ChainId, opts: { full?: boolean; client?: PublicClient } = {}): Promise<{ read: number; first: string; counter: string }> {
  const client = opts.client ?? chainClient(chainId)
  const counter = await client.readContract({ address: network(chainId).commerce, abi: agenticCommerceAbi, functionName: 'jobCounter' }) as bigint
  const first = await firstWindowJob(client, chainId, counter)
  const known = await db().execute(sql`select job_id, status from campaign_job where chain_id = ${chainId}`) as unknown as Array<{ job_id: string; status: number }>
  const status = new Map(known.map((k) => [k.job_id, k.status]))
  const ids: bigint[] = []
  for (let id = first; id <= counter; id++) {
    const s = status.get(String(id))
    if (opts.full || s === undefined || s < 3) ids.push(id)
  }
  const jobs = await readJobs(client, chainId, ids)
  const times = await eventTimes(chainId, [...jobs.keys()])
  const intents = new Set((await db().execute(sql`select job_id from hire_intent where chain_id = ${chainId} and job_id = any(${pgArray([...jobs.keys()])}::text[])`) as unknown as Array<{ job_id: string }>).map((r) => r.job_id))
  let read = 0
  for (const [id, j] of jobs) {
    const t = times.get(id)
    // Before the window: the binary-search fallback can start early. Unknown creation time
    // (no indexed event) keeps the job; the hire still needs a funded time in the window.
    if (t?.createdAt && t.createdAt.getTime() < campaignStartMs) continue
    const a = attributeDescription(j.description, { marqueIntent: intents.has(id) })
    const row = {
      chainId, jobId: id, client: j.client.toLowerCase(), provider: j.provider.toLowerCase(),
      evaluator: j.evaluator.toLowerCase(), hook: j.hook.toLowerCase(), budgetRaw: j.budget.toString(),
      status: Number(j.status), statusName: statusName(Number(j.status)), expiredAt: Number(j.expiredAt),
      description: j.description.slice(0, 8192), descriptionHash: keccak256(toHex(j.description)),
      createdAt: t?.createdAt ?? null, fundedAt: t?.fundedAt ?? null, fundedTx: t?.fundedTx ?? null,
      submittedAt: t?.submittedAt ?? (j.submittedAt > 0n ? new Date(Number(j.submittedAt) * 1000) : null),
      completedAt: t?.completedAt ?? null,
      marketplace: a.marketplace, attribution: a.attribution, clientRef: a.clientRef, readAt: new Date(),
    }
    await db().insert(campaignJob).values(row).onConflictDoUpdate({ target: [campaignJob.chainId, campaignJob.jobId], set: { ...row } })
    read++
  }
  return { read, first: first.toString(), counter: counter.toString() }
}

export async function indexAllCampaignJobs(opts: { full?: boolean } = {}): Promise<Record<number, { read: number; first: string; counter: string } | { error: string }>> {
  const out: Record<number, { read: number; first: string; counter: string } | { error: string }> = {}
  for (const c of SUPPORTED_CHAINS) {
    try { out[c] = await indexCampaignJobs(c, opts) } catch (e) { out[c] = { error: e instanceof Error ? e.message.slice(0, 200) : String(e) } }
  }
  return out
}
