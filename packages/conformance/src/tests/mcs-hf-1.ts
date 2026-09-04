import type { PublicClient } from 'viem'
import { venusReader, healthFactorOf, exactRepayToReachTargetHf } from '@marque/positions'
import { HF } from '../tolerances.js'
import {
  diffAbsolute, diffRelative, diffAssert, num, str,
  type FieldDiff, type TestCase,
} from '../types.js'

/**
 * MCS-HF-1 — Health Factor, Venus Core.
 *
 * The most brutal and most valuable test in the set, because the answer is a
 * single number read from a single Comptroller at a single block. An agent that
 * gets a user's liquidation price wrong is worse than no agent, so this is the
 * one place where publishing a failure does the most good.
 */

export interface HfPolicy {
  /** The health factor the agent must restore the account to. */
  targetHealthFactor: number
  statement: string
}

export interface HfGroundTruth {
  address: string
  healthFactor: number
  weightedCollateralUsd: number
  totalBorrowedUsd: number
  /** Repay in USD of debt that restores the target. */
  repayUsd: number
  targetHealthFactor: number
  markets: Array<{
    symbol: string
    underlyingSymbol: string
    collateralFactor: number
    priceUsd: number
    suppliedUsd: number
    borrowedUsd: number
    liquidationPriceUsd: number | null
  }>
  /** The largest collateral market, used for the liquidation-price check. */
  primaryCollateral: string | null
}

export async function hfGroundTruth(
  testCase: TestCase<HfPolicy>,
  opts: { client?: PublicClient } = {},
): Promise<HfGroundTruth> {
  const address = testCase.subject['address'] as `0x${string}`
  const read = await venusReader(address, {
    ...(opts.client ? { client: opts.client } : {}),
    blockNumber: testCase.blockNumber,
  })
  if (!read.ok) throw new Error(`MCS-HF-1 ground truth unavailable: ${read.error}`)
  const d = read.data
  if (d.healthFactor === null) {
    throw new Error(`MCS-HF-1: ${address} has no debt at block ${testCase.blockNumber}; not a valid case`)
  }

  const collateral = d.weightedCollateralUsd.value
  const borrowed = d.totalBorrowedUsd.value
  const target = testCase.policy.targetHealthFactor

  const withCollateral = d.markets
    .filter((m) => m.suppliedUsd > 0 && m.collateralFactor > 0)
    .sort((a, b) => b.suppliedUsd - a.suppliedUsd)

  return {
    address,
    healthFactor: d.healthFactor.value,
    weightedCollateralUsd: collateral,
    totalBorrowedUsd: borrowed,
    repayUsd: exactRepayToReachTargetHf(collateral, borrowed, target),
    targetHealthFactor: target,
    markets: d.markets.map((m) => ({
      symbol: m.symbol,
      underlyingSymbol: m.underlyingSymbol,
      collateralFactor: m.collateralFactor,
      priceUsd: m.priceUsd,
      suppliedUsd: m.suppliedUsd,
      borrowedUsd: m.borrowedUsd,
      liquidationPriceUsd: m.liquidationPriceUsd,
    })),
    primaryCollateral: withCollateral[0]?.underlyingSymbol ?? null,
  }
}

export function hfPrompt(testCase: TestCase<HfPolicy>, gt: HfGroundTruth): string {
  return [
    `You are given a Venus Core lending account on BNB Smart Chain (chain 56).`,
    ``,
    `Account: ${gt.address}`,
    `Block: ${testCase.blockNumber.toString()} — answer for this block only.`,
    ``,
    `POLICY YOU MUST FOLLOW: ${testCase.policy.statement}`,
    ``,
    `Return strict JSON with exactly these fields:`,
    `{`,
    `  "healthFactor": <number to 3 decimal places>,`,
    `  "primaryCollateralSymbol": <string, the underlying symbol of the largest collateral market>,`,
    `  "primaryCollateralFactor": <number 0..1, that market's collateral factor>,`,
    `  "primaryLiquidationPriceUsd": <number, price at which this account reaches HF 1.0>,`,
    `  "repayUsdToReachTarget": <number, USD of debt to repay to reach HF ${gt.targetHealthFactor}>`,
    `}`,
    ``,
    `No prose. JSON only.`,
  ].join('\n')
}

export function gradeHf(gt: HfGroundTruth, raw: unknown): FieldDiff[] {
  const r = (raw ?? {}) as Record<string, unknown>
  const diffs: FieldDiff[] = []

  diffs.push(diffAbsolute(
    HF.HEALTH_FACTOR.id, gt.healthFactor, num(r['healthFactor']),
    HF.HEALTH_FACTOR.value as number, 'HF', 'Health factor',
  ))

  // The collateral factor is where a wrong HF usually comes from, so it is
  // checked separately: it turns "your number is wrong" into "here is why".
  const claimedSymbol = str(r['primaryCollateralSymbol'])
  const market = gt.markets.find((m) => m.underlyingSymbol.toLowerCase() === (claimedSymbol ?? '').toLowerCase())
  const expectedMarket = gt.markets.find((m) => m.underlyingSymbol === gt.primaryCollateral)

  diffs.push(diffAssert(
    'primaryCollateralSymbol',
    claimedSymbol !== undefined && market !== undefined,
    gt.primaryCollateral ?? '(none)',
    claimedSymbol ?? '(not provided)',
    claimedSymbol === undefined
      ? 'No collateral market was named, so the collateral factor cannot be checked.'
      : `${claimedSymbol} is not a market this account has entered.`,
  ))

  const cfExpected = market?.collateralFactor ?? expectedMarket?.collateralFactor
  if (cfExpected !== undefined) {
    diffs.push(diffAbsolute(
      HF.COLLATERAL_FACTOR.id, cfExpected, num(r['primaryCollateralFactor']),
      HF.COLLATERAL_FACTOR.value as number, 'fraction', 'Collateral factor',
    ))
  }

  const liqExpected = market?.liquidationPriceUsd ?? expectedMarket?.liquidationPriceUsd
  if (liqExpected !== null && liqExpected !== undefined) {
    diffs.push(diffRelative(
      HF.LIQUIDATION_PRICE_PCT.id, liqExpected, num(r['primaryLiquidationPriceUsd']),
      HF.LIQUIDATION_PRICE_PCT.value as number, 'Liquidation price',
    ))
  }

  /**
   * The repay check APPLIES the agent's number rather than comparing it to
   * ours. An agent that reaches the target by a different but valid route
   * passes — we are testing the outcome, not the method.
   */
  const repay = num(r['repayUsdToReachTarget'])
  if (repay === undefined) {
    diffs.push({
      field: HF.REPAY_AMOUNT.id, pass: false,
      expected: `${gt.repayUsd.toFixed(2)} USD`, actual: '(not provided)',
      tolerance: `±${HF.REPAY_AMOUNT.value} HF after applying`, missing: true,
      detail: 'No repay amount was provided.',
    })
  } else {
    const resulting = healthFactorOf(gt.weightedCollateralUsd, gt.totalBorrowedUsd - repay)
    const reached = resulting ?? Number.POSITIVE_INFINITY
    const delta = Math.abs(reached - gt.targetHealthFactor)
    const pass = delta <= (HF.REPAY_AMOUNT.value as number)
    diffs.push({
      field: HF.REPAY_AMOUNT.id, pass,
      expected: `${gt.repayUsd.toFixed(2)} USD → HF ${gt.targetHealthFactor}`,
      actual: `${repay.toFixed(2)} USD → HF ${Number.isFinite(reached) ? reached.toFixed(4) : 'no debt left'}`,
      tolerance: `±${HF.REPAY_AMOUNT.value} HF after applying`,
      missing: false,
      detail: pass ? '' : `Repaying the stated ${repay.toFixed(2)} USD leaves the account at HF ${Number.isFinite(reached) ? reached.toFixed(4) : '∞'}, which is ${delta.toFixed(4)} away from the target of ${gt.targetHealthFactor}.`,
    })
  }

  return diffs
}
