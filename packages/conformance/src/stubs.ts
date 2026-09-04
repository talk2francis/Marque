import { nearestUsableTick } from '@marque/positions'
import type { ConformanceAdapter, TestCase } from './types.js'
import type { RebGroundTruth } from './tests/mcs-reb-1.js'
import type { HfGroundTruth } from './tests/mcs-hf-1.js'
import type { GridGroundTruth } from './tests/mcs-grid-1.js'
import type { YieldGroundTruth } from './tests/mcs-yield-1.js'
import { loadCase, type GroundTruth } from './harness.js'

/**
 * Reference stubs.
 *
 * These are NOT agents and are never listed in the marketplace. They exist so
 * the harness itself can be tested: a correct stub must pass every check, and a
 * deliberately wrong one must fail the exact field that is wrong. Without both,
 * a harness that passes everything and a harness that works look identical.
 *
 * The correct stub answers from the same ground truth the harness grades
 * against, which is the point: it isolates the grading logic from the question
 * of whether any real agent is any good.
 */

/** Build the correct answer for a case, from its frozen ground truth. */
export function correctAnswer(testId: string, gt: GroundTruth): unknown {
  switch (testId) {
    case 'MCS-REB-1': {
      const g = gt as RebGroundTruth
      return {
        currentTick: g.tickCurrent,
        inRange: g.inRange,
        pctToNearestBound: g.pctToNearestBound,
        proposedTickLower: g.policyTickLower,
        proposedTickUpper: g.policyTickUpper,
        amount0: g.policyAmount0,
        amount1: g.policyAmount1,
        maxSlippageBps: 40,
      }
    }
    case 'MCS-HF-1': {
      const g = gt as HfGroundTruth
      const primary = g.markets.find((m) => m.underlyingSymbol === g.primaryCollateral)
      return {
        healthFactor: Number(g.healthFactor.toFixed(3)),
        primaryCollateralSymbol: g.primaryCollateral,
        primaryCollateralFactor: primary?.collateralFactor,
        primaryLiquidationPriceUsd: primary?.liquidationPriceUsd,
        repayUsdToReachTarget: g.repayUsd,
      }
    }
    case 'MCS-GRID-1': {
      const g = gt as GridGroundTruth
      // Arithmetic spacing across the supplied bounds, capital split evenly,
      // no level at or below the stop, fee drag stated honestly.
      const lo = Math.max(g.lowerBound, g.stopPrice * 1.001)
      const step = (g.upperBound - lo) / (g.levels - 1)
      const alloc = g.capitalUsd / g.levels
      return {
        spacingType: 'arithmetic',
        levels: Array.from({ length: g.levels }, (_, i) => ({
          price: lo + step * i,
          allocationUsd: alloc,
        })),
        feeDragPct: g.minFeeDragPct,
      }
    }
    case 'MCS-YIELD-1': {
      const g = gt as YieldGroundTruth
      if (g.nothingClearsThreshold || g.bestNetAprPct === null) {
        return { recommend: false, venue: null }
      }
      const best = g.venues[0]
      return {
        recommend: true,
        venue: g.bestVenue,
        netAprPct: g.bestNetAprPct,
        aprSources: [{
          value: best?.grossAprPct ?? 0,
          source: 'Venus Comptroller supplyRatePerBlock, read on-chain',
          timestamp: new Date().toISOString(),
        }],
        switchingCost: { gasUsd: best?.gasCostUsd ?? 0, swapUsd: 0, exitUsd: 0 },
        usesLeverage: false,
      }
    }
    default:
      return {}
  }
}

/** An answer with exactly one deliberate defect per test. */
export function wrongAnswer(testId: string, gt: GroundTruth): unknown {
  const correct = correctAnswer(testId, gt) as Record<string, unknown>
  switch (testId) {
    case 'MCS-REB-1': {
      const g = gt as RebGroundTruth
      // Off-by-one tick spacing: the classic failure the pool reverts on.
      return {
        ...correct,
        proposedTickLower: g.policyTickLower + 1,
        proposedTickUpper: g.policyTickUpper + 1,
        maxSlippageBps: undefined,
      }
    }
    case 'MCS-HF-1': {
      const g = gt as HfGroundTruth
      // HF off by 0.02, four times the 0.005 tolerance.
      return {
        ...correct,
        healthFactor: Number((g.healthFactor + 0.02).toFixed(3)),
        repayUsdToReachTarget: g.repayUsd * 0.5,
      }
    }
    case 'MCS-GRID-1': {
      const g = gt as GridGroundTruth
      const step = (g.upperBound - g.lowerBound) / (g.levels - 1)
      return {
        spacingType: 'arithmetic',
        // Over-allocates capital AND places a level below the stop.
        levels: Array.from({ length: g.levels }, (_, i) => ({
          price: g.stopPrice * 0.9 + step * i,
          allocationUsd: (g.capitalUsd / g.levels) * 1.5,
        })),
        // Fee drag omitted entirely.
      }
    }
    case 'MCS-YIELD-1': {
      return {
        ...correct,
        recommend: true,
        netAprPct: ((correct['netAprPct'] as number) ?? 0) + 5,
        aprSources: [{ value: 6.8 }], // no source, no timestamp
        switchingCost: { gasUsd: 1 }, // not itemized
        usesLeverage: undefined,
      }
    }
    default:
      return {}
  }
}

function makeStub(agentId: string, name: string, answer: (testId: string, gt: GroundTruth) => unknown): ConformanceAdapter {
  return {
    agentId,
    name,
    async ask(testCase: TestCase) {
      const started = Date.now()
      const loaded = await loadCase(testCase.testId)
      if (!loaded) return { response: null, latencyMs: 0, error: 'case not found' }
      return {
        response: answer(testCase.testId, loaded.groundTruth),
        latencyMs: Date.now() - started,
        costUsd: 0,
      }
    },
  }
}

/** Answers every test correctly. Proves the harness can pass. */
export const CORRECT_STUB: ConformanceAdapter = makeStub(
  'stub:correct', 'Reference implementation (correct)', correctAnswer,
)

/** Answers every test with one specific defect. Proves the harness can fail. */
export const WRONG_STUB: ConformanceAdapter = makeStub(
  'stub:wrong', 'Reference implementation (deliberately wrong)', wrongAnswer,
)

/** A stub that never answers, to prove unreachability is recorded as a failure. */
export const SILENT_STUB: ConformanceAdapter = {
  agentId: 'stub:silent',
  name: 'Reference implementation (unreachable)',
  async ask() {
    return { response: null, latencyMs: 8_000, error: 'timeout: agent did not respond' }
  },
}

export { nearestUsableTick }
