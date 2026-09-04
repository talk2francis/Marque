import type { PublicClient } from 'viem'
import {
  pancakeV3Reader, amountsForLiquidity, liquidityForAmounts,
  tickSpacingForFee, isValidTick, nearestUsableTick, priceToTick, toHuman,
} from '@marque/positions'
import { REB } from '../tolerances.js'
import {
  diffAbsolute, diffExact, diffRelative, diffAssert, num, bool,
  type FieldDiff, type TestCase,
} from '../types.js'

/**
 * MCS-REB-1 — Rebalancing, PancakeSwap V3.
 *
 * The policy is SUPPLIED BY THE CASE. There is no objectively correct V3 range
 * in the abstract, so the case says "re-centre symmetrically at ±6% around spot
 * on the 0.25% tier" and every check is arithmetic against that instruction.
 * Whether ±6% was wise is a Ledger question and is not graded here.
 */

export interface RebPolicy {
  /** Symmetric half-width around spot, as a percentage. */
  rangePct: number
  /** Fee tier the plan must target, in hundredths of a bip (2500 = 0.25%). */
  feeTier: number
  /** Human description, rendered into the prompt. */
  statement: string
}

export interface RebGroundTruth {
  tokenId: string
  pool: string
  fee: number
  tickSpacing: number
  tickCurrent: number
  tickLower: number
  tickUpper: number
  inRange: boolean
  priceCurrent: number
  pctToNearestBound: number
  /** The range the SUPPLIED POLICY implies, snapped to valid ticks. */
  policyTickLower: number
  policyTickUpper: number
  /** Amounts the policy range requires, from the V3 liquidity formula. */
  policyAmount0: number
  policyAmount1: number
  token0Symbol: string
  token1Symbol: string
  decimals0: number
  decimals1: number
  liquidity: string
  sqrtPriceX96: string
}

/**
 * Compute ground truth ourselves, from chain state at the pinned block.
 *
 * We never ask the agent for anything we have not already computed. That is
 * what makes the diff meaningful rather than a comparison of two opinions.
 */
export async function rebGroundTruth(
  testCase: TestCase<RebPolicy>,
  opts: { client?: PublicClient } = {},
): Promise<RebGroundTruth> {
  const owner = testCase.subject['owner'] as `0x${string}`
  const wantTokenId = testCase.subject['tokenId']

  const read = await pancakeV3Reader(owner, {
    ...(opts.client ? { client: opts.client } : {}),
    blockNumber: testCase.blockNumber,
  })
  if (!read.ok) throw new Error(`MCS-REB-1 ground truth unavailable: ${read.error}`)

  const position = read.data.positions.find((p) => p.tokenId === wantTokenId)
  if (!position) {
    throw new Error(`MCS-REB-1: position ${wantTokenId} not found for ${owner} at block ${testCase.blockNumber}`)
  }

  const spacing = tickSpacingForFee(position.fee)
  const { rangePct } = testCase.policy
  const spot = position.priceCurrent.value

  // The policy range, snapped to ticks the pool will actually accept.
  const lowerPrice = spot * (1 - rangePct / 100)
  const upperPrice = spot * (1 + rangePct / 100)
  const policyTickLower = nearestUsableTick(
    priceToTick(lowerPrice, position.token0.decimals, position.token1.decimals), spacing,
  )
  const policyTickUpper = nearestUsableTick(
    priceToTick(upperPrice, position.token0.decimals, position.token1.decimals), spacing,
  )

  // Amounts required to mint the policy range with the position's liquidity.
  const sqrt = BigInt(
    // Recover sqrtPriceX96 from the current tick, which the reader already used.
    Math.floor(Math.sqrt(1.0001 ** position.tickCurrent) * 2 ** 96),
  )
  const amounts = amountsForLiquidity(sqrt, policyTickLower, policyTickUpper, BigInt(position.liquidity))

  const pctToNearest = Math.min(
    Math.abs(position.pctToLower.value), Math.abs(position.pctToUpper.value),
  )

  return {
    tokenId: position.tokenId,
    pool: position.pool,
    fee: position.fee,
    tickSpacing: spacing,
    tickCurrent: position.tickCurrent,
    tickLower: position.tickLower,
    tickUpper: position.tickUpper,
    inRange: position.inRange.value === 1,
    priceCurrent: spot,
    pctToNearestBound: pctToNearest,
    policyTickLower,
    policyTickUpper,
    policyAmount0: toHuman(amounts.amount0, position.token0.decimals),
    policyAmount1: toHuman(amounts.amount1, position.token1.decimals),
    token0Symbol: position.token0.symbol,
    token1Symbol: position.token1.symbol,
    decimals0: position.token0.decimals,
    decimals1: position.token1.decimals,
    liquidity: position.liquidity,
    sqrtPriceX96: sqrt.toString(),
  }
}

/** The exact question put to the agent. Contains the policy, in words. */
export function rebPrompt(testCase: TestCase<RebPolicy>, gt: RebGroundTruth): string {
  return [
    `You are given a PancakeSwap V3 position on BNB Smart Chain (chain 56).`,
    ``,
    `Position NFT id: ${gt.tokenId}`,
    `Pool: ${gt.pool}  (${gt.token0Symbol}/${gt.token1Symbol}, fee tier ${gt.fee})`,
    `Block: ${testCase.blockNumber.toString()}  — answer for this block only.`,
    ``,
    `POLICY YOU MUST FOLLOW: ${testCase.policy.statement}`,
    ``,
    `Return strict JSON with exactly these fields:`,
    `{`,
    `  "currentTick": <integer, the pool's tick at this block>,`,
    `  "inRange": <boolean>,`,
    `  "pctToNearestBound": <number, percent in price terms to the nearer bound>,`,
    `  "proposedTickLower": <integer, must be a multiple of the pool's tickSpacing>,`,
    `  "proposedTickUpper": <integer, must be a multiple of the pool's tickSpacing>,`,
    `  "amount0": <number, ${gt.token0Symbol} required to mint the proposed range>,`,
    `  "amount1": <number, ${gt.token1Symbol} required to mint the proposed range>,`,
    `  "maxSlippageBps": <number, your stated slippage bound in basis points>`,
    `}`,
    ``,
    `No prose. JSON only.`,
  ].join('\n')
}

/** Grade a response. Every check is arithmetic or compliance with the policy. */
export function gradeReb(gt: RebGroundTruth, raw: unknown): FieldDiff[] {
  const r = (raw ?? {}) as Record<string, unknown>
  const diffs: FieldDiff[] = []

  diffs.push(diffExact(REB.TICK_EXACT.id, gt.tickCurrent, num(r['currentTick']), 'Current tick'))
  diffs.push(diffExact(REB.IN_RANGE_EXACT.id, gt.inRange, bool(r['inRange']), 'In-range'))
  diffs.push(diffAbsolute(
    REB.DISTANCE_PCT.id, gt.pctToNearestBound, num(r['pctToNearestBound']),
    REB.DISTANCE_PCT.value as number, 'percentage points', 'Distance to nearest bound',
  ))

  const lower = num(r['proposedTickLower'])
  const upper = num(r['proposedTickUpper'])

  // The highest-signal check in the set: a tick that is not a multiple of the
  // pool's spacing makes the whole plan unexecutable, not merely suboptimal.
  if (lower === undefined || upper === undefined) {
    diffs.push({
      field: REB.TICK_SPACING_MULTIPLE.id, pass: false,
      expected: `multiples of ${gt.tickSpacing}`, actual: '(not provided)',
      tolerance: 'must hold', missing: true,
      detail: 'The response did not include both proposed ticks.',
    })
  } else {
    const lowerOk = isValidTick(lower, gt.tickSpacing)
    const upperOk = isValidTick(upper, gt.tickSpacing)
    const offenders: string[] = []
    if (!lowerOk) offenders.push(`lower ${lower} (remainder ${lower % gt.tickSpacing})`)
    if (!upperOk) offenders.push(`upper ${upper} (remainder ${upper % gt.tickSpacing})`)
    diffs.push(diffAssert(
      REB.TICK_SPACING_MULTIPLE.id, lowerOk && upperOk,
      `both ticks multiples of tickSpacing ${gt.tickSpacing}`,
      `lower ${lower}, upper ${upper}`,
      `Proposed ${offenders.join(' and ')} — the pool reverts on ticks that are not multiples of its spacing (${gt.tickSpacing}), so this plan cannot execute.`,
    ))

    // Ordering is a separate, equally fatal error.
    diffs.push(diffAssert(
      'tickOrdering', lower < upper,
      'proposedTickLower < proposedTickUpper', `lower ${lower}, upper ${upper}`,
      'The proposed lower tick is not below the proposed upper tick.',
    ))

    // Compliance with the SUPPLIED policy, within one spacing.
    const slack = (REB.POLICY_RANGE_SPACINGS.value as number) * gt.tickSpacing
    const lowerOff = Math.abs(lower - gt.policyTickLower)
    const upperOff = Math.abs(upper - gt.policyTickUpper)
    const withinPolicy = lowerOff <= slack && upperOff <= slack
    diffs.push(diffAssert(
      REB.POLICY_RANGE_SPACINGS.id, withinPolicy,
      `[${gt.policyTickLower}, ${gt.policyTickUpper}] ±${slack} ticks`,
      `[${lower}, ${upper}]`,
      `The proposed range does not match the supplied policy: lower is ${lowerOff} ticks out and upper is ${upperOff} ticks out, against a tolerance of ${slack} ticks (one spacing).`,
    ))
  }

  // Amounts must satisfy the V3 liquidity formula for the range THEY proposed,
  // not for ours — otherwise a correct plan with a different range fails here
  // for the wrong reason.
  const a0 = num(r['amount0'])
  const a1 = num(r['amount1'])
  if (lower !== undefined && upper !== undefined && lower < upper && a0 !== undefined && a1 !== undefined) {
    const sqrt = BigInt(gt.sqrtPriceX96)
    const raw0 = BigInt(Math.floor(a0 * 10 ** gt.decimals0))
    const raw1 = BigInt(Math.floor(a1 * 10 ** gt.decimals1))
    const impliedL = liquidityForAmounts(sqrt, lower, upper, raw0, raw1)
    const expected = amountsForLiquidity(sqrt, lower, upper, impliedL)
    const exp0 = toHuman(expected.amount0, gt.decimals0)
    const exp1 = toHuman(expected.amount1, gt.decimals1)
    // Compare the pair's ratio to the formula: the absolute size is the
    // agent's choice, the ratio is not.
    const worst = Math.max(
      exp0 === 0 ? 0 : Math.abs((a0 - exp0) / exp0) * 100,
      exp1 === 0 ? 0 : Math.abs((a1 - exp1) / exp1) * 100,
    )
    diffs.push(diffAssert(
      REB.AMOUNTS_PCT.id, worst <= (REB.AMOUNTS_PCT.value as number),
      `amounts consistent with the V3 liquidity formula within ${REB.AMOUNTS_PCT.value}%`,
      `${a0} ${gt.token0Symbol} / ${a1} ${gt.token1Symbol}`,
      `Proposed amounts deviate from the V3 liquidity formula for the proposed range by ${worst.toFixed(3)}%, above the ${REB.AMOUNTS_PCT.value}% tolerance.`,
    ))
  } else {
    diffs.push(diffRelative(REB.AMOUNTS_PCT.id, gt.policyAmount0, a0, REB.AMOUNTS_PCT.value as number, 'amount0'))
  }

  const slippage = num(r['maxSlippageBps'])
  diffs.push(diffAssert(
    REB.SLIPPAGE_STATED.id,
    slippage !== undefined && slippage > 0 && slippage < 10_000,
    'a stated slippage bound, 0 < bps < 10000',
    slippage === undefined ? '(not provided)' : String(slippage),
    'No usable slippage bound was stated. An execution plan without one is unsafe to sign regardless of the range it proposes.',
  ))

  return diffs
}
