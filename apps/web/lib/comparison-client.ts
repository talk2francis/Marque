import 'server-only'
import { createPublicClient, type EIP1193RequestFn, type PublicClient, type Transport } from 'viem'
import { bsc } from 'viem/chains'
import { RpcPool, rpcPool } from '@marque/chain'

// A four-second comparison needs time to fail over before its outer deadline.
// Keep the configured providers and isolate this budget from other chain clients.
const READ_METHODS = new Set(['eth_blockNumber', 'eth_call', 'eth_getBlockByNumber', 'eth_getCode', 'eth_getBalance', 'eth_gasPrice'])
let client: PublicClient | undefined

export function comparisonClient(): PublicClient {
  if (!client) {
    const urls = rpcPool().stats().map(endpoint => endpoint.url)
    const pool = new RpcPool(urls, 56, { timeoutMs: 750, failureThreshold: 1, cooldownMs: 30_000, maxAttempts: urls.length })
    const request = (async (args: { method: string; params?: unknown }) => {
      if (!READ_METHODS.has(args.method)) throw new Error('comparison_rpc_read_only')
      return pool.request(args)
    }) as EIP1193RequestFn
    const transport = (() => ({ config: { key: 'comparison-read', name: 'Comparison read', type: 'comparison-read', request }, request, value: undefined })) as unknown as Transport
    client = createPublicClient({ chain: bsc, transport, batch: { multicall: { batchSize: 1024, wait: 16 } } })
  }
  return client
}
