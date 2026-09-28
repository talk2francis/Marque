import { createPublicClient, http, fallback, type Hex, type PublicClient, type TransactionReceipt } from 'viem'
import { bsc, bscTestnet } from 'viem/chains'
import { network, type ChainId } from './config.js'
import { optimisticPolicyAbi } from './generated.js'

/**
 * Server-side chain reads for the hire rail. RPCs come from env (BSC_RPC_URLS,
 * BSC_TESTNET_RPC). Providers measured as unusable are skipped (PROTOCOL-FACTS PF-6).
 */
const SKIP = [/1rpc\.io/]
const clients = new Map<ChainId, PublicClient>()

export function rpcUrls(chainId: ChainId): string[] {
  const raw = chainId === 56 ? process.env.BSC_RPC_URLS : process.env.BSC_TESTNET_RPC
  const list = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean).filter((u) => !SKIP.some((r) => r.test(u)))
  return list.length ? list : [chainId === 56 ? 'https://bsc-dataseed.bnbchain.org' : 'https://bsc-testnet-rpc.publicnode.com']
}

export function chainClient(chainId: ChainId): PublicClient {
  let c = clients.get(chainId)
  if (!c) {
    c = createPublicClient({
      chain: chainId === 56 ? bsc : bscTestnet,
      batch: { multicall: true },
      transport: fallback(rpcUrls(chainId).map((u) => http(u, { timeout: 12_000, retryCount: 1 }))),
    }) as PublicClient
    clients.set(chainId, c)
  }
  return c
}

const single = new Map<string, PublicClient>()

/**
 * A receipt from whichever RPC in the pool has it first (28 Sep, P2-12). A fallback
 * transport only moves on when a node errors; a node a few blocks behind answers "no
 * receipt" instead, so waiting on it held a just-mined createJob for the whole timeout
 * and the hire sheet stopped with the job open. Every node is asked at once, every
 * 1.5 s, and the first real receipt wins. The canonical dataseed is always in the set.
 */
export function poolClients(chainId: ChainId): PublicClient[] {
  const urls = [...new Set([...rpcUrls(chainId), chainId === 56 ? 'https://bsc-dataseed.bnbchain.org' : 'https://bsc-testnet-rpc.publicnode.com'])]
  return urls.map((u) => {
    let c = single.get(u)
    if (!c) { c = createPublicClient({ chain: chainId === 56 ? bsc : bscTestnet, transport: http(u, { timeout: 8_000, retryCount: 0 }) }) as PublicClient; single.set(u, c) }
    return c
  })
}

/** The first answer from any node in the pool that passes `valid` (a node behind head fails it). */
export async function fromAny<T>(chainId: ChainId, read: (c: PublicClient) => Promise<T>, valid: (v: T) => boolean = () => true): Promise<T> {
  return Promise.any(poolClients(chainId).map(async (c) => {
    const v = await read(c)
    if (!valid(v)) throw new Error('not yet on this node')
    return v
  }))
}

export async function receiptFromAny(chainId: ChainId, hash: Hex, timeoutMs = 45_000): Promise<TransactionReceipt | null> {
  const pool = poolClients(chainId)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const got = await Promise.any(pool.map(async (c) => {
      const r = await c.getTransactionReceipt({ hash })
      if (!r) throw new Error('none')
      return r
    })).catch(() => null)
    if (got) return got
    await new Promise((r) => setTimeout(r, 1500))
  }
  return null
}

const windowCache = new Map<ChainId, { at: number; seconds: number }>()

/** OptimisticPolicy.disputeWindow(), measured live and cached for an hour. */
export async function disputeWindowSeconds(chainId: ChainId): Promise<number> {
  const hit = windowCache.get(chainId)
  if (hit && Date.now() - hit.at < 3600_000) return hit.seconds
  const v = await chainClient(chainId).readContract({ address: network(chainId).policy, abi: optimisticPolicyAbi, functionName: 'disputeWindow' }) as bigint
  const seconds = Number(v)
  windowCache.set(chainId, { at: Date.now(), seconds })
  return seconds
}
