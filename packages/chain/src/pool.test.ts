import { describe, it, expect } from 'vitest'
import { erc20Abi, type Address } from 'viem'
import { RpcPool } from './pool.js'
import { clientFor, DEFAULT_BSC_RPCS } from './client.js'

/** A host that does not resolve. Every request to it must fail at DNS. */
const DEAD_RPC = 'https://this-endpoint-does-not-exist.marque.invalid'

// Well-known BSC mainnet tokens, used only as read targets.
const TOKENS: Address[] = [
  '0x55d398326f99059fF775485246999027B3197955', // USDT
  '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC
  '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', // CAKE
  '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
  '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', // BTCB
]

describe('RpcPool', () => {
  it('completes a 50-read multicall with one endpoint forced to fail', async () => {
    // Dead endpoint first in rotation, so the very first request hits it.
    const client = clientFor([DEAD_RPC, ...DEFAULT_BSC_RPCS.slice(0, 3)])

    const contracts = Array.from({ length: 50 }, (_, i) => ({
      address: TOKENS[i % TOKENS.length]!,
      abi: erc20Abi,
      functionName: i % 2 === 0 ? ('decimals' as const) : ('symbol' as const),
    }))

    const results = await client.multicall({ contracts, allowFailure: true })

    expect(results).toHaveLength(50)
    const failures = results.filter((r) => r.status !== 'success')
    expect(failures).toHaveLength(0)

    // Spot-check a real value rather than only the status, so a silently empty
    // multicall cannot pass this test.
    const usdtDecimals = results[0]
    expect(usdtDecimals.status).toBe('success')
    expect(usdtDecimals.result).toBe(18)
  }, 60_000)

  it('benches a failing endpoint and keeps serving from the rest', async () => {
    const pool = new RpcPool([DEAD_RPC, ...DEFAULT_BSC_RPCS.slice(0, 2)], 56, {
      failureThreshold: 1,
      cooldownMs: 60_000,
    })

    const blocks: bigint[] = []
    for (let i = 0; i < 6; i++) {
      const hex = (await pool.request({ method: 'eth_blockNumber' })) as `0x${string}`
      blocks.push(BigInt(hex))
    }

    expect(blocks).toHaveLength(6)
    for (const b of blocks) expect(b).toBeGreaterThan(0n)

    const dead = pool.stats().find((s) => s.url === DEAD_RPC)
    expect(dead?.healthy).toBe(false)
    expect(dead?.totalOk).toBe(0)

    // The pool must not have retried the dead endpoint on every single call.
    expect(dead?.totalFailed).toBeLessThanOrEqual(2)

    const live = pool.stats().filter((s) => s.url !== DEAD_RPC)
    expect(live.reduce((n, s) => n + s.totalOk, 0)).toBe(6)
  }, 60_000)

  it('does not retry a revert across endpoints', async () => {
    const pool = new RpcPool([...DEFAULT_BSC_RPCS.slice(0, 3)], 56)
    await expect(
      pool.request({
        method: 'eth_call',
        params: [{ to: '0x55d398326f99059fF775485246999027B3197955', data: '0xdeadbeef' }, 'latest'],
      } as never),
    ).rejects.toThrow()
    // A malformed call must not have been counted against every endpoint.
    const totalFailed = pool.stats().reduce((n, s) => n + s.totalFailed, 0)
    expect(totalFailed).toBeLessThanOrEqual(1)
  }, 30_000)
})
