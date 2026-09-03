import { describe, it, expect } from 'vitest'
import { exactRepayToReachTargetHf, healthFactorOf } from './venus.js'

/**
 * MCS-HF-1's tolerance is 0.005. The round trip below is held to 0.002, so the
 * engine that grades agents is four times tighter than the bar it enforces.
 */
const TOLERANCE = 0.002

describe('healthFactorOf', () => {
  it('is weighted collateral over borrows', () => {
    expect(healthFactorOf(1500, 1000)).toBeCloseTo(1.5, 9)
  })

  it('is null with no debt, rather than Infinity or a placeholder', () => {
    // Rendering "Infinity" or defaulting to 0 would both be fabricated metrics.
    expect(healthFactorOf(1500, 0)).toBeNull()
  })
})

describe('exactRepayToReachTargetHf', () => {
  it('round-trips: applying the repay lands within 0.002 of the target', () => {
    const cases: Array<[collateral: number, borrowed: number, target: number]> = [
      [1500, 1000, 2.0],
      [1500, 1000, 1.5],
      [10_000, 7_500, 2.5],
      [412.55, 380.12, 1.35],
      [1_000_000, 999_999, 3.0],
      [83.4, 21.9, 4.0],
    ]

    for (const [collateral, borrowed, target] of cases) {
      const repay = exactRepayToReachTargetHf(collateral, borrowed, target)
      const recomputed = healthFactorOf(collateral, borrowed - repay)
      expect(recomputed, `c=${collateral} b=${borrowed} t=${target}`).not.toBeNull()
      expect(Math.abs((recomputed as number) - target)).toBeLessThan(TOLERANCE)
    }
  })

  it('asks for nothing when the account already exceeds the target', () => {
    expect(exactRepayToReachTargetHf(3000, 1000, 2.0)).toBe(0)
    expect(exactRepayToReachTargetHf(2000, 1000, 2.0)).toBe(0)
  })

  it('never asks for more than the outstanding debt', () => {
    // Even a badly underwater account has a reachable target: repaying almost
    // all of the debt leaves a tiny remainder that the collateral covers.
    // c=10, b=1000, t=5 => repay 998, leaving debt 2 and HF exactly 5.
    const repay = exactRepayToReachTargetHf(10, 1000, 5.0)
    expect(repay).toBeLessThanOrEqual(1000)
    expect(repay).toBeCloseTo(998, 6)
    expect(healthFactorOf(10, 1000 - repay)).toBeCloseTo(5, 6)
  })

  it('clamps at the full debt when there is no collateral at all', () => {
    // The only case where the cap can bind. Repaying everything is correct;
    // the account simply has no health factor afterwards.
    expect(exactRepayToReachTargetHf(0, 1000, 2.0)).toBe(1000)
  })

  it('returns zero when there is no debt', () => {
    expect(exactRepayToReachTargetHf(1000, 0, 2.0)).toBe(0)
  })

  it('rejects a non-positive target instead of dividing by zero', () => {
    expect(() => exactRepayToReachTargetHf(1000, 500, 0)).toThrow(/positive/)
    expect(() => exactRepayToReachTargetHf(1000, 500, -1)).toThrow(/positive/)
  })

  it('is monotonic: a higher target needs a larger repayment', () => {
    const a = exactRepayToReachTargetHf(1500, 1000, 1.6)
    const b = exactRepayToReachTargetHf(1500, 1000, 2.0)
    const c = exactRepayToReachTargetHf(1500, 1000, 2.5)
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
  })

  it('recovers an at-risk account to the 2.5 floor AGENTS.md requires', () => {
    // Our own mainnet position must stay above HF 2.5. This is the number the
    // Keel reference agent will quote to get there.
    const collateral = 100
    const borrowed = 60 // HF 1.667
    expect(healthFactorOf(collateral, borrowed)).toBeCloseTo(1.667, 2)
    const repay = exactRepayToReachTargetHf(collateral, borrowed, 2.5)
    expect(healthFactorOf(collateral, borrowed - repay)).toBeCloseTo(2.5, 3)
  })
})
