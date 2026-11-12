import 'server-only'
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
    const job = await fromAny(chainId, async client => {
      const value = await client.readContract({ address: network(chainId).commerce, abi: agenticCommerceAbi, functionName: 'getJob', args: [BigInt(jobId)] }) as { id: bigint; description: string }
      if (!value || value.id === 0n || !value.description) empty = true
      return value
    }, value => value?.id === BigInt(jobId) && Boolean(value.description), 150)
    const out = { description: job.description, task: taskFromDescription(job.description) }
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
