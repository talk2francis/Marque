import { describe, it, expect } from 'vitest'
import { netAprAtSize, aprFromRatePerBlock, type YieldVenue } from './yield.js'
import { onchain, measured } from './provenance.js'

/** A venue shaped like the live Venus USDT market read on 4 Sep 2026. */
function venue(over: { grossApr?: number; gasUsd?: number; swapBps?: number } = {}): YieldVenue {
  return {
    protocol: 'venus',
    market: '0xfD5840Cd36d94D7229439859C0112a4185BC0255',
    symbol: 'vUSDT',
    underlying: '0x55d398326f99059fF775485246999027B3197955',
    underlyingSymbol: 'USDT',
    underlyingDecimals: 18,
    grossApr: onchain(over.grossApr ?? 3.051, '%'),
    incentiveApr: onchain(0, '%'),
    gasCostUsd: measured(over.gasUsd ?? 0.0214, 'USD', 'test fixture', new Date().toISOString()),
    swapCostBps: onchain(over.swapBps ?? 0, 'bps'),
    cashUsd: onchain(52_960_000, 'USD'),
    priceUsd: 1,
  }
}

describe('aprFromRatePerBlock', () => {
  it('compounds a per-block rate without overflowing at BSC block counts', () => {
    // BSC runs 0.45s blocks — 70,080,000 a year. Naive (1+r)^n overflows;
    // computing in log space does not.
    const apr = aprFromRatePerBlock(428_000_000n, 70_080_000)
    expect(Number.isFinite(apr)).toBe(true)
    expect(apr).toBeGreaterThan(0)
  })

  it('is zero for a market paying nothing', () => {
    expect(aprFromRatePerBlock(0n, 70_080_000)).toBe(0)
  })
})

describe('netAprAtSize', () => {
  it('is a function of size, not a constant', () => {
    const v = venue()
    const small = netAprAtSize(v, 1).netAprPct
    const large = netAprAtSize(v, 10_000).netAprPct
    expect(small).not.toBeCloseTo(large, 3)
    expect(large).toBeGreaterThan(small)
  })

  it('goes NEGATIVE for a small enough size', () => {
    // The acceptance criterion for this reader. If this ever passes trivially
    // or cannot be made to fail, the gas model has stopped working.
    const v = venue()
    expect(netAprAtSize(v, 0.1).netAprPct).toBeLessThan(0)
    expect(netAprAtSize(v, 0.5).netAprPct).toBeLessThan(0)
    expect(netAprAtSize(v, 100).netAprPct).toBeGreaterThan(0)
  })

  it('goes negative at a realistic size over a short holding period', () => {
    // BSC gas is cheap enough that size alone rarely turns a supply negative.
    // Holding period is the dimension that actually bites, so it is modelled.
    const v = venue()
    expect(netAprAtSize(v, 200, 1 / 365).netAprPct).toBeLessThan(0)
    expect(netAprAtSize(v, 200, 1).netAprPct).toBeGreaterThan(0)
  })

  it('goes negative when the route needs a swap', () => {
    const v = venue({ swapBps: 30 })
    expect(netAprAtSize(v, 10_000, 7 / 365).netAprPct).toBeLessThan(0)
  })

  it('reports a break-even size that matches where net APR crosses zero', () => {
    const v = venue()
    const { breakEvenUsd } = netAprAtSize(v, 1000)
    expect(breakEvenUsd).toBeGreaterThan(0)
    expect(netAprAtSize(v, breakEvenUsd).netAprPct).toBeCloseTo(0, 6)
    expect(netAprAtSize(v, breakEvenUsd * 0.5).netAprPct).toBeLessThan(0)
    expect(netAprAtSize(v, breakEvenUsd * 2).netAprPct).toBeGreaterThan(0)
  })

  it('reports break-even as unreachable when swap cost exceeds the yield', () => {
    // 3% a year cannot pay for a 30bps swap inside a single day.
    const v = venue({ swapBps: 30 })
    expect(netAprAtSize(v, 1000, 1 / 365).breakEvenUsd).toBe(Number.POSITIVE_INFINITY)
  })

  it('rejects a non-positive size rather than dividing by zero', () => {
    expect(() => netAprAtSize(venue(), 0)).toThrow(/positive/)
    expect(() => netAprAtSize(venue(), -100)).toThrow(/positive/)
  })

  it('never lets net exceed gross', () => {
    const v = venue()
    for (const size of [1, 10, 1000, 1e9]) {
      const q = netAprAtSize(v, size)
      expect(q.netAprPct).toBeLessThanOrEqual(q.grossAprPct + 1e-9)
    }
  })
})
