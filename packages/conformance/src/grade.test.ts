import { describe, it, expect } from 'vitest'
import { gradeReb, type RebGroundTruth } from './tests/mcs-reb-1.js'
import { gradeHf, type HfGroundTruth } from './tests/mcs-hf-1.js'
import { gradeGrid, type GridGroundTruth } from './tests/mcs-grid-1.js'
import { gradeYield, type YieldGroundTruth } from './tests/mcs-yield-1.js'
import { correctAnswer, wrongAnswer } from './stubs.js'
import { ALL_TOLERANCES, EXCLUDED_CHECKS } from './tolerances.js'

/**
 * Grading is pure: frozen ground truth in, field diffs out, no network.
 *
 * These tests exist because a harness that passes everything and a harness that
 * works look identical from the outside. Each test asserts BOTH that a correct
 * answer passes AND that a specific defect fails the specific field.
 */

const failed = (diffs: ReturnType<typeof gradeReb>): string[] =>
  diffs.filter((d) => !d.pass).map((d) => d.field)

// Mirrors the live BTCB/USDC case captured at block 119862131.
const REB_GT: RebGroundTruth = {
  tokenId: '7321916',
  pool: '0x0000000000000000000000000000000000000001',
  fee: 2500,
  tickSpacing: 50,
  tickCurrent: 113038,
  tickLower: 111850,
  tickUpper: 113100,
  inRange: true,
  priceCurrent: 81000,
  pctToNearestBound: 0.61448,
  policyTickLower: 112400,
  policyTickUpper: 113600,
  policyAmount0: 0.0220327309370712,
  policyAmount1: 2024.2503503385976,
  token0Symbol: 'BTCB',
  token1Symbol: 'USDC',
  decimals0: 18,
  decimals1: 18,
  liquidity: '226431702139314671186',
  sqrtPriceX96: String(BigInt(Math.floor(Math.sqrt(1.0001 ** 113038) * 2 ** 96))),
}

const HF_GT: HfGroundTruth = {
  address: '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf',
  // Internally consistent by construction: HF = C/B, and repay = B - C/target.
  // A fixture whose numbers do not satisfy its own arithmetic tests nothing.
  healthFactor: 1.181,
  weightedCollateralUsd: 8573.31,
  totalBorrowedUsd: 7259.37,
  repayUsd: 3830.046,
  targetHealthFactor: 2.5,
  primaryCollateral: 'BTCB',
  markets: [{
    symbol: 'vBTC', underlyingSymbol: 'BTCB', collateralFactor: 0.8,
    priceUsd: 81253.1, suppliedUsd: 4000, borrowedUsd: 0, liquidationPriceUsd: 68623.375973,
  }],
}

const GRID_GT: GridGroundTruth = {
  pair: 'BNB/USDT', lowerBound: 600, upperBound: 850, capitalUsd: 2000,
  levels: 12, stopPrice: 580, feeBps: 25, spotPriceUsd: 724, minFeeDragPct: 6,
}

const YIELD_GT: YieldGroundTruth = {
  asset: 'USDT', sizeUsd: 1000, currentAprPct: 0, minImprovementBps: 50,
  leverageAllowed: false,
  venues: [{ protocol: 'venus', symbol: 'USDT', grossAprPct: 3.051, netAprPct: 2.938461, gasCostUsd: 0.0214 }],
  bestNetAprPct: 2.938461, bestVenue: 'venus', nothingClearsThreshold: false,
}

describe('the standard itself', () => {
  it('states a bound and a rationale for every check', () => {
    for (const [testId, tolerances] of Object.entries(ALL_TOLERANCES)) {
      for (const t of Object.values(tolerances)) {
        expect(t.id, `${testId} check has no id`).toBeTruthy()
        expect(t.rationale.length, `${testId}.${t.id} has no rationale`).toBeGreaterThan(20)
        expect(t.description.length, `${testId}.${t.id} has no description`).toBeGreaterThan(10)
      }
    }
  })

  it('records why each excluded check was excluded', () => {
    expect(EXCLUDED_CHECKS.length).toBeGreaterThan(0)
    for (const e of EXCLUDED_CHECKS) expect(e.reason.length).toBeGreaterThan(30)
  })

  it('keeps "expected fills at stated volatility" out of MCS-GRID-1', () => {
    // Removed on review: a model output wearing the clothes of a fact. If it
    // ever reappears as a graded check, the standard stops being deterministic.
    const gridChecks = Object.values(ALL_TOLERANCES['MCS-GRID-1']).map((t) => t.id.toLowerCase())
    expect(gridChecks.some((c) => c.includes('fill'))).toBe(false)
    expect(EXCLUDED_CHECKS.some((e) => /fills/i.test(e.check))).toBe(true)
  })
})

describe('MCS-REB-1', () => {
  it('passes a correct answer', () => {
    expect(failed(gradeReb(REB_GT, correctAnswer('MCS-REB-1', REB_GT)))).toEqual([])
  })

  it('fails an off-by-one tick and names proposedTickSpacing', () => {
    // The pool reverts on a tick that is not a multiple of its spacing, so this
    // is the difference between a plan and an unexecutable plan.
    const f = failed(gradeReb(REB_GT, wrongAnswer('MCS-REB-1', REB_GT)))
    expect(f).toContain('proposedTickSpacing')
  })

  it('fails a range that ignores the supplied policy', () => {
    const answer = {
      ...(correctAnswer('MCS-REB-1', REB_GT) as Record<string, unknown>),
      proposedTickLower: 100000, proposedTickUpper: 120000,
    }
    expect(failed(gradeReb(REB_GT, answer))).toContain('policyRange')
  })

  it('fails a missing slippage bound', () => {
    const answer = { ...(correctAnswer('MCS-REB-1', REB_GT) as Record<string, unknown>) }
    delete answer['maxSlippageBps']
    expect(failed(gradeReb(REB_GT, answer))).toContain('slippageBound')
  })

  it('fails an inverted range', () => {
    const answer = {
      ...(correctAnswer('MCS-REB-1', REB_GT) as Record<string, unknown>),
      proposedTickLower: 113600, proposedTickUpper: 112400,
    }
    expect(failed(gradeReb(REB_GT, answer))).toContain('tickOrdering')
  })

  it('fails an empty response rather than throwing', () => {
    const diffs = gradeReb(REB_GT, {})
    expect(diffs.length).toBeGreaterThan(0)
    expect(diffs.every((d) => !d.pass)).toBe(true)
  })
})

describe('MCS-HF-1', () => {
  it('passes a correct answer', () => {
    expect(failed(gradeHf(HF_GT, correctAnswer('MCS-HF-1', HF_GT)))).toEqual([])
  })

  it('fails a health factor off by 0.02', () => {
    const f = failed(gradeHf(HF_GT, wrongAnswer('MCS-HF-1', HF_GT)))
    expect(f).toContain('healthFactor')
  })

  it('accepts a health factor off by less than the tolerance', () => {
    const answer = { ...(correctAnswer('MCS-HF-1', HF_GT) as Record<string, unknown>), healthFactor: 1.184 }
    expect(failed(gradeHf(HF_GT, answer))).not.toContain('healthFactor')
  })

  it('grades the repay by APPLYING it, not by comparing to ours', () => {
    // An agent reaching the target by a different but valid route must pass.
    const answer = {
      ...(correctAnswer('MCS-HF-1', HF_GT) as Record<string, unknown>),
      repayUsdToReachTarget: HF_GT.repayUsd + 0.004,
    }
    expect(failed(gradeHf(HF_GT, answer))).not.toContain('repayToTarget')
  })

  it('fails a repay that does not restore the target', () => {
    const answer = {
      ...(correctAnswer('MCS-HF-1', HF_GT) as Record<string, unknown>),
      repayUsdToReachTarget: HF_GT.repayUsd * 0.5,
    }
    expect(failed(gradeHf(HF_GT, answer))).toContain('repayToTarget')
  })

  it('fails a wrong collateral factor, which is usually the cause of a wrong HF', () => {
    const answer = { ...(correctAnswer('MCS-HF-1', HF_GT) as Record<string, unknown>), primaryCollateralFactor: 0.75 }
    expect(failed(gradeHf(HF_GT, answer))).toContain('collateralFactor')
  })
})

describe('MCS-GRID-1', () => {
  it('passes a correct answer', () => {
    expect(failed(gradeGrid(GRID_GT, correctAnswer('MCS-GRID-1', GRID_GT)))).toEqual([])
  })

  it('fails undisclosed fee drag', () => {
    // n levels means n round-trips of fees. Omitting it overstates the return
    // in a way the buyer cannot see.
    const answer = { ...(correctAnswer('MCS-GRID-1', GRID_GT) as Record<string, unknown>) }
    delete answer['feeDragPct']
    expect(failed(gradeGrid(GRID_GT, answer))).toContain('feeDragDisclosed')
  })

  it('fails implausibly low fee drag', () => {
    const answer = { ...(correctAnswer('MCS-GRID-1', GRID_GT) as Record<string, unknown>), feeDragPct: 0.01 }
    expect(failed(gradeGrid(GRID_GT, answer))).toContain('feeDragDisclosed')
  })

  it('fails over-allocated capital', () => {
    expect(failed(gradeGrid(GRID_GT, wrongAnswer('MCS-GRID-1', GRID_GT)))).toContain('allocationSum')
  })

  it('fails a level at or below the stop', () => {
    expect(failed(gradeGrid(GRID_GT, wrongAnswer('MCS-GRID-1', GRID_GT)))).toContain('levelsAboveStop')
  })

  it('fails geometric spacing declared but arithmetic shipped', () => {
    const answer = {
      ...(correctAnswer('MCS-GRID-1', GRID_GT) as Record<string, unknown>),
      spacingType: 'geometric',
    }
    expect(failed(gradeGrid(GRID_GT, answer))).toContain('levelSpacing')
  })

  it('fails an undeclared spacing type', () => {
    const answer = { ...(correctAnswer('MCS-GRID-1', GRID_GT) as Record<string, unknown>) }
    delete answer['spacingType']
    expect(failed(gradeGrid(GRID_GT, answer))).toContain('levelSpacing')
  })
})

describe('MCS-YIELD-1', () => {
  it('passes a correct answer', () => {
    expect(failed(gradeYield(YIELD_GT, correctAnswer('MCS-YIELD-1', YIELD_GT)))).toEqual([])
  })

  it('fails an unsourced APR', () => {
    expect(failed(gradeYield(YIELD_GT, wrongAnswer('MCS-YIELD-1', YIELD_GT)))).toContain('aprProvenance')
  })

  it('fails a net APR outside 15bps', () => {
    const answer = { ...(correctAnswer('MCS-YIELD-1', YIELD_GT) as Record<string, unknown>), netAprPct: 3.5 }
    expect(failed(gradeYield(YIELD_GT, answer))).toContain('netApr')
  })

  it('accepts a net APR inside 15bps', () => {
    const answer = { ...(correctAnswer('MCS-YIELD-1', YIELD_GT) as Record<string, unknown>), netAprPct: 2.94 }
    expect(failed(gradeYield(YIELD_GT, answer))).not.toContain('netApr')
  })

  it('fails an un-itemized switching cost', () => {
    expect(failed(gradeYield(YIELD_GT, wrongAnswer('MCS-YIELD-1', YIELD_GT)))).toContain('switchingCost')
  })

  it('treats a correct decline as a PASS', () => {
    // An agent that says "nothing beats your current position by enough" is
    // behaving exactly as the policy asked. A standard that punished this would
    // teach agents to always recommend something.
    const gt: YieldGroundTruth = { ...YIELD_GT, nothingClearsThreshold: true }
    expect(failed(gradeYield(gt, { recommend: false }))).toEqual([])
  })

  it('fails a recommendation that ignores the supplied threshold', () => {
    const gt: YieldGroundTruth = { ...YIELD_GT, nothingClearsThreshold: true }
    const f = failed(gradeYield(gt, correctAnswer('MCS-YIELD-1', YIELD_GT)))
    expect(f).toContain('improvementThreshold')
  })
})

describe('vacuous passes', () => {
  it('does not let an empty response pass MCS-YIELD-1 as a decline', () => {
    // Regression: a live third-party agent returned no recognisable fields and
    // scored PASS, because an absent `recommend` was read as "declined" and
    // every later check returned early. Silence is not a decision.
    const diffs = gradeYield(YIELD_GT, {})
    expect(diffs.length).toBeGreaterThan(0)
    expect(diffs.every((d) => d.pass)).toBe(false)
  })

  it('does not let an empty response pass any test', () => {
    for (const [label, diffs] of [
      ['REB', gradeReb(REB_GT, {})],
      ['HF', gradeHf(HF_GT, {})],
      ['GRID', gradeGrid(GRID_GT, {})],
      ['YIELD', gradeYield(YIELD_GT, {})],
    ] as const) {
      expect(diffs.length, `${label} produced no diffs at all`).toBeGreaterThan(0)
      expect(diffs.some((d) => !d.pass), `${label} passed an empty response`).toBe(true)
    }
  })

  it('still accepts an EXPLICIT decline when nothing clears the threshold', () => {
    const gt: YieldGroundTruth = { ...YIELD_GT, nothingClearsThreshold: true }
    expect(failed(gradeYield(gt, { recommend: false }))).toEqual([])
  })
})
