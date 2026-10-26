import 'server-only'
import { taskFromDescription } from './job-task'
import { agenticCommerceAbi, chainClient, isSupportedChain, network, type ChainId } from '@marque/commerce'

/**
 * The buyer's task as the escrow itself records it: the `description` of the ERC-8183 job, set once by createJob and
 * never changed. Marque's hire intent holds the same words for hires started on Marque; this is the public, permanent
 * source for every job, wherever it was started (V4.2 L0: job 57066 was started on the staging stack, so production
 * had no intent and its health factor check could not find the account). A Marque description is JSON with a `task`;
 * any other is plain text. Remembered per process: the value cannot change.
 */
const memo = new Map<string, { description: string; task: string } | null>()

export async function onchainJobTask(chainId: number, jobId: string): Promise<{ description: string; task: string } | null> {
  const key = `${chainId}:${jobId}`
  if (memo.has(key)) return memo.get(key) ?? null
  if (!isSupportedChain(chainId) || !/^\d{1,12}$/.test(jobId)) return null
  try {
    const job = await chainClient(chainId as ChainId).readContract({ address: network(chainId).commerce, abi: agenticCommerceAbi, functionName: 'getJob', args: [BigInt(jobId)] }) as { id: bigint; description: string }
    if (!job || job.id === 0n || !job.description) { memo.set(key, null); return null }
    const out = { description: job.description, task: taskFromDescription(job.description) }
    memo.set(key, out)
    return out
  } catch {
    return null
  }
}
