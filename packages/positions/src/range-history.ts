import type { Address, PublicClient } from 'viem'
import { createPublicClient, http } from 'viem'
import { bsc } from 'viem/chains'

/**
 * How long a V3 position has been out of range — measured, not estimated.
 *
 * This is the number that makes an LP feel the loss, so it is also the number
 * most worth getting wrong. Three sources were tried:
 *
 *   1. Pool state at past blocks. Impossible: BSC public nodes keep about 64
 *      blocks of state, so `slot0` cannot be read historically at all.
 *   2. The official PancakeSwap V3 BSC subgraph
 *      (thegraph.pancakeswap.com/exchange-v3-bsc). It answers, and it is
 *      roughly FOUR MONTHS behind head — see docs/FINDINGS.md F-02. Anything
 *      built on it reports range history from April.
 *   3. `Swap` event logs, which carry the resulting `tick` in the payload.
 *      Logs are not pruned, so this is the only honest source. It is what we
 *      use.
 *
 * The walk is bounded. When the budget runs out while the position is still
 * out of range, the answer is "at least N hours", flagged `capped`, and the
 * UI says so — an unbounded search that reported a precise number after
 * timing out would be worse than a bounded one that admits its floor.
 */

/** Only this provider allows a useful log span; the rest cap under 100 blocks. */
const LOG_RPC = 'https://bsc-rpc.publicnode.com'

/** Measured ceiling on `bsc-rpc.publicnode.com`. Larger requests are refused. */
export const MAX_LOG_SPAN = 5000n

/** BSC produces a block roughly every 0.45s — measured, and 6.7x faster than
 *  the 3s constant inherited from Ethereum-shaped code. */
export const BSC_BLOCK_SECONDS = 0.45

export const swapEvent = {
  type: 'event',
  name: 'Swap',
  inputs: [
    { indexed: true, name: 'sender', type: 'address' },
    { indexed: true, name: 'recipient', type: 'address' },
    { name: 'amount0', type: 'int256' },
    { name: 'amount1', type: 'int256' },
    { name: 'sqrtPriceX96', type: 'uint160' },
    { name: 'liquidity', type: 'uint128' },
    { name: 'tick', type: 'int24' },
    { name: 'protocolFeesToken0', type: 'uint128' },
    { name: 'protocolFeesToken1', type: 'uint128' },
  ],
} as const

export interface RangeHistory {
  /** True when the most recent swap put the tick inside the position range. */
  inRangeNow: boolean
  /** Hours since the tick was last inside the range. Null when in range. */
  hoursOutOfRange: number | null
  /** The block at which the tick was last seen inside the range, if found. */
  lastInRangeBlock: string | null
  /** True when the budget ran out first: the real figure is AT LEAST this. */
  capped: boolean
  /** How far back the walk actually looked, in blocks and in hours. */
  searchedBlocks: number
  searchedHours: number
  /** Swaps inspected. Zero means the pool did not trade in the window at all. */
  swapsSeen: number
  measuredAt: string
  headBlock: string
}

function logClient(): PublicClient {
  return createPublicClient({ chain: bsc, transport: http(LOG_RPC) }) as PublicClient
}

/**
 * Walk `Swap` logs backwards until the tick was last inside [lower, upper).
 *
 * `maxChunks` bounds the work: each chunk is 5,000 blocks, about 37 minutes of
 * chain time, so 40 chunks covers roughly a day.
 */
export async function rangeHistory(
  pool: Address,
  tickLower: number,
  tickUpper: number,
  opts: { maxChunks?: number; client?: PublicClient } = {},
): Promise<RangeHistory> {
  const client = opts.client ?? logClient()
  const maxChunks = opts.maxChunks ?? 40
  const head = await client.getBlockNumber()

  const inRange = (t: number): boolean => t >= tickLower && t < tickUpper

  let swapsSeen = 0
  let searched = 0n
  let newestSwapWasInRange: boolean | null = null

  for (let chunk = 0; chunk < maxChunks; chunk++) {
    const to = head - searched
    const from = to > MAX_LOG_SPAN ? to - MAX_LOG_SPAN : 0n
    // A single refused chunk is usually rate limiting, not a hard limit, so it
    // is retried with backoff. Giving up on the first refusal silently
    // shortened the window and reported a much smaller floor than the truth.
    let logs: Awaited<ReturnType<PublicClient['getLogs']>> | null = null
    for (let attempt = 0; attempt < 3 && logs === null; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 250 * attempt))
      try {
        logs = await client.getLogs({ address: pool, event: swapEvent, fromBlock: from, toBlock: to })
      } catch {
        logs = null
      }
    }
    if (logs === null) break
    swapsSeen += logs.length

    // Newest first within the chunk.
    for (let i = logs.length - 1; i >= 0; i--) {
      const tick = Number((logs[i] as unknown as { args: { tick: number | bigint } }).args.tick)
      if (newestSwapWasInRange === null) newestSwapWasInRange = inRange(tick)
      if (inRange(tick)) {
        const block = logs[i]!.blockNumber!
        const blocksSince = Number(head - block)
        return {
          inRangeNow: newestSwapWasInRange,
          hoursOutOfRange: newestSwapWasInRange ? null : (blocksSince * BSC_BLOCK_SECONDS) / 3600,
          lastInRangeBlock: block.toString(),
          capped: false,
          searchedBlocks: Number(head - from),
          searchedHours: (Number(head - from) * BSC_BLOCK_SECONDS) / 3600,
          swapsSeen,
          measuredAt: new Date().toISOString(),
          headBlock: head.toString(),
        }
      }
    }

    searched = head - from
    if (from === 0n) break
  }

  // The budget ran out with no in-range swap found. Everything we saw was out
  // of range, so the true duration is AT LEAST the window we covered.
  return {
    inRangeNow: newestSwapWasInRange ?? false,
    hoursOutOfRange: (Number(searched) * BSC_BLOCK_SECONDS) / 3600,
    lastInRangeBlock: null,
    capped: true,
    searchedBlocks: Number(searched),
    searchedHours: (Number(searched) * BSC_BLOCK_SECONDS) / 3600,
    swapsSeen,
    measuredAt: new Date().toISOString(),
    headBlock: head.toString(),
  }
}
