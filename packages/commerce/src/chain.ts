import { createPublicClient, http, fallback, type PublicClient } from 'viem'
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
