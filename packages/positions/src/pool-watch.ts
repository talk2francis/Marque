import type { Address } from 'viem'
import { publicClient } from '@marque/chain'
import { pancakeV3PoolAbi } from './abis.js'

/**
 * Watching pool ticks, because nobody else will tell us.
 *
 * `docs/FINDINGS.md` F-06: on BSC there is no public source for a pool's tick
 * at a past moment. State prunes at ~64 blocks, the official subgraph is about
 * four months behind, and log queries reach back ~37 minutes. So the only way
 * to know how long a position has been out of range is to have been watching.
 *
 * These are first-party observations (invariant 12): never deleted, never
 * rebuilt from chain, because they cannot be.
 */

export interface TickReading {
  pool: Address
  tick: number
  blockNumber: string
  observedAt: Date
}

/** Read the current tick for a set of pools, in one multicall where possible. */
export async function readTicks(pools: Address[]): Promise<TickReading[]> {
  if (pools.length === 0) return []
  const client = publicClient()
  const blockNumber = await client.getBlockNumber()
  const observedAt = new Date()

  const results = await Promise.all(
    pools.map(async (pool) => {
      try {
        const slot0 = await client.readContract({
          address: pool, abi: pancakeV3PoolAbi, functionName: 'slot0',
        }) as readonly [bigint, number, number, number, number, number, boolean]
        return { pool, tick: Number(slot0[1]), blockNumber: blockNumber.toString(), observedAt }
      } catch {
        // A pool we cannot read produces NO observation. Recording a gap as a
        // reading would put a fabricated tick into a series whose entire value
        // is that every point in it was actually seen.
        return null
      }
    }),
  )
  return results.filter((r): r is TickReading => r !== null)
}

export interface OutOfRangeMeasure {
  /** Null when we have never observed this pool. Never guessed. */
  hoursOutOfRange: number | null
  inRangeNow: boolean | null
  /** The oldest observation we hold. Nothing before this is knowable. */
  watchingSince: string | null
  /** True when every observation we hold was out of range: it is AT LEAST this. */
  atLeast: boolean
  observations: number
  lastObservedAt: string | null
}

/**
 * How long a position has been out of range, from our own observation series.
 *
 * `observations` must be ordered newest first and contain only this pool.
 * When every point we hold is out of range the honest answer is a floor, not
 * a figure — `atLeast` says which it is, and the UI renders the difference.
 */
export function measureOutOfRange(
  observations: Array<{ tick: number; observedAt: Date }>,
  tickLower: number,
  tickUpper: number,
  now: Date = new Date(),
): OutOfRangeMeasure {
  if (observations.length === 0) {
    return {
      hoursOutOfRange: null, inRangeNow: null, watchingSince: null,
      atLeast: false, observations: 0, lastObservedAt: null,
    }
  }
  const inRange = (t: number): boolean => t >= tickLower && t < tickUpper
  const newest = observations[0]!
  const oldest = observations[observations.length - 1]!

  if (inRange(newest.tick)) {
    return {
      hoursOutOfRange: 0, inRangeNow: true,
      watchingSince: oldest.observedAt.toISOString(),
      atLeast: false, observations: observations.length,
      lastObservedAt: newest.observedAt.toISOString(),
    }
  }

  const lastInRange = observations.find((o) => inRange(o.tick))
  const since = lastInRange?.observedAt ?? oldest.observedAt
  return {
    hoursOutOfRange: (now.getTime() - since.getTime()) / 3_600_000,
    inRangeNow: false,
    watchingSince: oldest.observedAt.toISOString(),
    // No in-range point in the whole series: the position may have been out
    // of range long before we started, and we cannot know that.
    atLeast: lastInRange === undefined,
    observations: observations.length,
    lastObservedAt: newest.observedAt.toISOString(),
  }
}
