import 'server-only'
import { loadBlob, storeBlob } from '@marque/db'
import { taskFromDescription } from './job-task'
import { agenticCommerceAbi, fromAny, isSupportedChain, network, type ChainId } from '@marque/commerce'

/**
 * The buyer's task as the escrow itself records it: the `description` of the ERC-8183 job, set once by createJob and
 * never changed. Marque's hire intent holds the same words for hires started on Marque; this is the public, permanent
 * source for every job, wherever it was started (V4.2 L0: job 57066 was started on the staging stack, so production
 * had no intent and its health factor check could not find the account). A Marque description is JSON with a `task`;
 * any other is plain text. Remembered per process: the value cannot change.
 */
type Task = { description: string; task: string }
const memo = new Map<string, Task>()
const misses = new Map<string, number>()
const pending = new Map<string, Promise<Task | null>>()
const MAX_TASKS = 2000

export async function onchainJobTask(chainId: number, jobId: string): Promise<{ description: string; task: string } | null> {
  const key = `${chainId}:${jobId}`
  if (!isSupportedChain(chainId) || !/^\d{1,20}$/.test(jobId)) return null
  if (memo.has(key)) return memo.get(key) ?? null
  const missedAt = misses.get(key)
  if (missedAt !== undefined && Date.now() >= missedAt && Date.now() - missedAt < 15_000) return null
  const existing = pending.get(key)
  if (existing) return existing
  const run = readTask(chainId, jobId, key)
  pending.set(key, run)
  try { return await run } finally { if (pending.get(key) === run) pending.delete(key) }
}

async function readTask(chainId: ChainId, jobId: string, key: string): Promise<Task | null> {
  let empty = false
  try {
    // The escrow's description is immutable. Share successful, identity-bound
    // reads across web workers and releases; missing jobs and failures never enter
    // this cache. The page's changing state and signing checks still read freshly.
    const escrow = network(chainId).commerce.toLowerCase()
    const cacheKey = `job-description:v1:${chainId}:${escrow}:${jobId}`
    try {
      const bytes = await loadBlob(cacheKey)
      if (bytes && bytes.length <= 512 * 1024) {
        const stored = JSON.parse(bytes.toString('utf8')) as { chainId?: unknown; escrow?: unknown; jobId?: unknown; description?: unknown }
        if (stored.chainId === chainId && stored.escrow === escrow && stored.jobId === jobId && typeof stored.description === 'string' && stored.description.length) {
          const out = { description: stored.description, task: taskFromDescription(stored.description) }
          memo.set(key, out)
          while (memo.size > MAX_TASKS) memo.delete(memo.keys().next().value!)
          return out
        }
      }
    } catch { /* cache failure or invalid bytes: retain the validated RPC path */ }
    const job = await fromAny(chainId, async client => {
      const value = await client.readContract({ address: network(chainId).commerce, abi: agenticCommerceAbi, functionName: 'getJob', args: [BigInt(jobId)] }) as { id: bigint; description: string }
      if (!value || value.id === 0n || !value.description) empty = true
      return value
    }, value => value?.id === BigInt(jobId) && Boolean(value.description), 150)
    const out = { description: job.description, task: taskFromDescription(job.description) }
    const bytes = Buffer.from(JSON.stringify({ chainId, escrow, jobId, description: out.description }))
    if (bytes.length <= 512 * 1024) void storeBlob(cacheKey, bytes, 7 * 24 * 3600_000).catch(() => undefined)
    memo.set(key, out)
    misses.delete(key)
    while (memo.size > MAX_TASKS) memo.delete(memo.keys().next().value!)
    return out
  } catch {
    if (empty) {
      misses.set(key, Date.now())
      while (misses.size > MAX_TASKS) misses.delete(misses.keys().next().value!)
    }
    return null
  }
}
