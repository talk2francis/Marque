import { createPublicClient, type Abi, type Address, type PublicClient } from 'viem'
import { bsc, bscTestnet } from 'viem/chains'
import { RpcPool } from './pool.js'

export const BSC_MAINNET_ID = 56
export const BSC_TESTNET_ID = 97

/**
 * Endpoints used when BSC_RPC_URLS is unset. All verified reachable from the
 * VPS on 3 Sep 2026. Kept at 4+ so the pool has somewhere to go under load.
 */
export const DEFAULT_BSC_RPCS = [
  'https://bsc-dataseed.bnbchain.org',
  'https://bsc-rpc.publicnode.com',
  'https://bsc-dataseed1.defibit.io',
  'https://bsc-dataseed1.ninicoin.io',
  'https://bsc-dataseed2.bnbchain.org',
  'https://bsc.drpc.org',
] as const

function urlsFromEnv(): string[] {
  const raw = process.env.BSC_RPC_URLS
  const urls = raw
    ? raw.split(',').map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_BSC_RPCS]
  if (urls.length < 3) {
    // Not fatal, but a single-provider pool will rate-limit during indexing.
    console.warn(`[chain] RPC pool has only ${urls.length} endpoint(s); 3+ recommended`)
  }
  return urls
}

let pool: RpcPool | undefined
let client: PublicClient | undefined

export function rpcPool(): RpcPool {
  if (!pool) pool = new RpcPool(urlsFromEnv(), BSC_MAINNET_ID)
  return pool
}

/** The shared BSC mainnet public client, backed by the failover pool. */
export function publicClient(): PublicClient {
  if (!client) {
    client = createPublicClient({
      chain: bsc,
      transport: rpcPool().transport(),
      batch: { multicall: { batchSize: 1024, wait: 16 } },
    })
  }
  return client
}

/** A throwaway client on an explicit endpoint list — used by tests and probes. */
export function clientFor(urls: readonly string[], chainId = BSC_MAINNET_ID): PublicClient {
  const p = new RpcPool(urls, chainId)
  return createPublicClient({
    chain: chainId === BSC_TESTNET_ID ? bscTestnet : bsc,
    transport: p.transport(),
    batch: { multicall: { batchSize: 1024, wait: 16 } },
  })
}

export async function getBlockNumber(): Promise<bigint> {
  return publicClient().getBlockNumber()
}

export interface ReadCall {
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
}

/**
 * Multicall that never throws for a single bad call: each result carries its own
 * status. Reading 300 agent-owned positions must not fail because one is stale.
 */
export async function multicallAllowFailure<T = unknown>(
  calls: readonly ReadCall[],
  blockNumber?: bigint,
): Promise<Array<{ status: 'success'; result: T } | { status: 'failure'; error: Error }>> {
  if (calls.length === 0) return []
  const res = await publicClient().multicall({
    contracts: calls as never,
    allowFailure: true,
    ...(blockNumber === undefined ? {} : { blockNumber }),
  })
  return res as Array<{ status: 'success'; result: T } | { status: 'failure'; error: Error }>
}

/** Typed single read. Throws on revert, which is what a caller wants here. */
export async function read<T = unknown>(call: ReadCall, blockNumber?: bigint): Promise<T> {
  const result = await publicClient().readContract({
    address: call.address,
    abi: call.abi,
    functionName: call.functionName,
    ...(call.args === undefined ? {} : { args: call.args }),
    ...(blockNumber === undefined ? {} : { blockNumber }),
  } as never)
  return result as T
}
