import { describe, it, expect } from 'vitest'
import {
  TICK_SPACING, tickSpacingForFee, isValidTick, nearestUsableTick,
  tickToRawPrice, rawPriceToTick, tickToPrice, priceToTick, sqrtPriceX96ToPrice,
  tickToSqrtPriceX96, amountsForLiquidity, liquidityForAmounts,
  rangePosition, distanceToBounds, inRange, toHuman,
} from './v3-math.js'

describe('tick spacing (AGENTS.md gotcha 12)', () => {
  it('knows every PancakeSwap V3 fee tier', () => {
    expect(TICK_SPACING).toEqual({ 100: 1, 500: 10, 2500: 50, 10000: 200 })
  })

  it('throws on an unknown fee tier rather than guessing', () => {
    expect(() => tickSpacingForFee(3000)).toThrow(/unknown/)
  })

  it('matches real mainnet positions read on 4 Sep 2026', () => {
    // Live positions from the NonfungiblePositionManager. Every boundary a
    // real pool accepted must validate, or our rebalancing test is wrong.
    const live: Array<[fee: number, lower: number, upper: number]> = [
      [10000, -60200, -59200],
      [500, -2000, -1000],
      [2500, 111850, 113100],
      [2500, -191100, -191050],
      [100, 1000, 2000],
      [10000, 19600, 24800],
      [2500, 21300, 23650],
    ]
    for (const [fee, lower, upper] of live) {
      const spacing = tickSpacingForFee(fee)
      expect(isValidTick(lower, spacing), `lower ${lower} @ fee ${fee}`).toBe(true)
      expect(isValidTick(upper, spacing), `upper ${upper} @ fee ${fee}`).toBe(true)
    }
  })

  it('rejects a tick that is not a multiple of its spacing', () => {
    // The single highest-signal conformance check: this is what most naive
    // agents get wrong, and the pool reverts on it.
    expect(isValidTick(111851, 50)).toBe(false)
    expect(isValidTick(111850, 50)).toBe(true)
  })

  it('rounds to the nearest usable tick', () => {
    expect(nearestUsableTick(111873, 50)).toBe(111850)
    expect(nearestUsableTick(111876, 50)).toBe(111900)
    expect(nearestUsableTick(-191074, 50)).toBe(-191050)
  })

  it('keeps a rounded tick inside the representable range', () => {
    expect(nearestUsableTick(887272, 200)).toBeLessThanOrEqual(887272)
    expect(nearestUsableTick(-887272, 200)).toBeGreaterThanOrEqual(-887272)
  })
})

describe('tick and price conversion', () => {
  it('round-trips tick to raw price and back', () => {
    for (const tick of [-191100, -60200, 0, 21300, 113100]) {
      expect(rawPriceToTick(tickToRawPrice(tick))).toBeCloseTo(tick, 0)
    }
  })

  it('applies token decimals in the right direction', () => {
    // A pool of an 18-decimal token against a 6-decimal token: ignoring the
    // adjustment is the classic bug that renders 0.0000000004 instead of 2.41.
    const tick = 0
    expect(tickToPrice(tick, 18, 18)).toBeCloseTo(1, 9)
    expect(tickToPrice(tick, 18, 6)).toBeCloseTo(1e12, 0)
    expect(tickToPrice(tick, 6, 18)).toBeCloseTo(1e-12, 18)
  })

  it('round-trips price to tick with decimals', () => {
    const tick = priceToTick(2.41, 18, 18)
    expect(tickToPrice(tick, 18, 18)).toBeCloseTo(2.41, 2)
  })

  it('agrees between the sqrtPriceX96 and tick paths', () => {
    // slot0 gives sqrtPriceX96; positions give ticks. If these two disagree
    // the whole in-range display is untrustworthy.
    for (const tick of [-60200, 0, 21934, 113047]) {
      const viaSqrt = sqrtPriceX96ToPrice(tickToSqrtPriceX96(tick), 18, 18)
      const viaTick = tickToPrice(tick, 18, 18)
      expect(viaSqrt / viaTick).toBeCloseTo(1, 3)
    }
  })
})

describe('amountsForLiquidity', () => {
  const L = 10n ** 18n

  it('is entirely token0 below the range', () => {
    const sqrt = tickToSqrtPriceX96(-1000)
    const { amount0, amount1 } = amountsForLiquidity(sqrt, 0, 1000, L)
    expect(amount1).toBe(0n)
    expect(amount0).toBeGreaterThan(0n)
  })

  it('is entirely token1 above the range', () => {
    const sqrt = tickToSqrtPriceX96(2000)
    const { amount0, amount1 } = amountsForLiquidity(sqrt, 0, 1000, L)
    expect(amount0).toBe(0n)
    expect(amount1).toBeGreaterThan(0n)
  })

  it('holds both tokens inside the range', () => {
    const sqrt = tickToSqrtPriceX96(500)
    const { amount0, amount1 } = amountsForLiquidity(sqrt, 0, 1000, L)
    expect(amount0).toBeGreaterThan(0n)
    expect(amount1).toBeGreaterThan(0n)
  })

  it('returns nothing for a zero-liquidity position', () => {
    expect(amountsForLiquidity(tickToSqrtPriceX96(500), 0, 1000, 0n)).toEqual({ amount0: 0n, amount1: 0n })
  })

  it('rejects an inverted range instead of returning nonsense', () => {
    expect(() => amountsForLiquidity(tickToSqrtPriceX96(0), 1000, 0, L)).toThrow(/tickLower/)
  })

  it('round-trips through liquidityForAmounts within 0.5%', () => {
    // MCS-REB-1 asserts an agent's proposed amounts satisfy the V3 liquidity
    // formula within 0.5%. Our own implementation must clear that bar first.
    const sqrt = tickToSqrtPriceX96(500)
    const { amount0, amount1 } = amountsForLiquidity(sqrt, 0, 1000, L)
    const recovered = liquidityForAmounts(sqrt, 0, 1000, amount0, amount1)
    const drift = Math.abs(Number(recovered - L) / Number(L))
    expect(drift).toBeLessThan(0.005)
  })
})

describe('range geometry', () => {
  it('reports where the price sits inside the range', () => {
    expect(rangePosition(0, 0, 1000)).toBeCloseTo(0, 6)
    expect(rangePosition(500, 0, 1000)).toBeCloseTo(0.5, 6)
    expect(rangePosition(1000, 0, 1000)).toBeCloseTo(1, 6)
  })

  it('treats the upper bound as out of range, matching the pool', () => {
    // A position earns while tick < tickUpper; at the boundary it has stopped.
    expect(inRange(999, 0, 1000)).toBe(true)
    expect(inRange(1000, 0, 1000)).toBe(false)
    expect(inRange(-1, 0, 1000)).toBe(false)
  })

  it('measures distance to each bound as a signed percentage', () => {
    const { pctToLower, pctToUpper } = distanceToBounds(100, 90, 120)
    expect(pctToLower).toBeCloseTo(-10, 6)
    expect(pctToUpper).toBeCloseTo(20, 6)
  })

  it('reproduces the live BTCB/USDC position read at block 119814464', () => {
    // tokenId 7321916, fee 2500, ticks [111850, 113100], current 113047.
    // Read from mainnet on 4 Sep 2026; it sat 0.53% from its upper bound.
    const spacing = tickSpacingForFee(2500)
    expect(isValidTick(111850, spacing) && isValidTick(113100, spacing)).toBe(true)
    expect(inRange(113047, 111850, 113100)).toBe(true)
    expect(rangePosition(113047, 111850, 113100)).toBeCloseTo(0.958, 2)

    const lower = tickToPrice(111850, 18, 18)
    const upper = tickToPrice(113100, 18, 18)
    const current = tickToPrice(113047, 18, 18)
    const { pctToUpper } = distanceToBounds(current, lower, upper)
    expect(pctToUpper).toBeGreaterThan(0)
    expect(pctToUpper).toBeLessThan(1)
    // A believable BTC price is the check that decimals were applied at all.
    expect(current).toBeGreaterThan(10_000)
    expect(current).toBeLessThan(1_000_000)
  })
})

describe('toHuman', () => {
  it('scales base units by decimals', () => {
    expect(toHuman(10n ** 18n, 18)).toBe(1)
    expect(toHuman(1_500_000n, 6)).toBe(1.5)
  })
})
