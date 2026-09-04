import { z } from 'zod'

/**
 * Task schemas.
 *
 * A hire is always a typed task, never free text. Two reasons, and the second
 * is the one that matters:
 *
 *  1. A typed task can be validated before anything is signed.
 *  2. A typed task can be GRADED. The same structure the buyer approved is the
 *     structure MCS checks the answer against, so "what you agreed to" and
 *     "what we verified" are the same object rather than two descriptions of
 *     one intention.
 *
 * Free-text hiring makes both impossible, which is why every marketplace that
 * does it ends up arbitrating screenshots.
 */

export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 0x-prefixed address')

/** Fields every task carries, whatever its category. */
const baseTask = z.object({
  chainId: z.literal(56),
  /** Block the task refers to, so a quote cannot silently drift. */
  blockNumber: z.string().regex(/^\d+$/),
  /** Who the work is for. Never inferred from a connected wallet. */
  subject: addressSchema,
  /** The buyer's own upper bound on what this may cost, in USD. */
  maxSpendUsd: z.number().positive().max(10_000),
})

export const rebalanceTask = baseTask.extend({
  kind: z.literal('rebalance'),
  positionTokenId: z.string().regex(/^\d+$/),
  /**
   * The policy the agent must follow. Supplied by the buyer, exactly as MCS
   * cases supply theirs — there is no objectively correct range, so somebody
   * has to say what is wanted, and it must be the person whose money it is.
   */
  policy: z.object({
    rangePct: z.number().positive().max(100),
    feeTier: z.union([z.literal(100), z.literal(500), z.literal(2500), z.literal(10000)]),
    maxSlippageBps: z.number().int().positive().max(1000),
  }),
})

export const gridTask = baseTask.extend({
  kind: z.literal('grid'),
  pair: z.string().min(3),
  policy: z.object({
    lowerBound: z.number().positive(),
    upperBound: z.number().positive(),
    capitalUsd: z.number().positive(),
    levels: z.number().int().min(2).max(200),
    stopPrice: z.number().positive(),
    feeBps: z.number().int().min(0).max(1000),
  }).refine((p) => p.upperBound > p.lowerBound, { message: 'upperBound must exceed lowerBound' })
    .refine((p) => p.stopPrice < p.lowerBound, { message: 'stopPrice must sit below lowerBound' }),
})

export const yieldTask = baseTask.extend({
  kind: z.literal('yield'),
  policy: z.object({
    asset: z.string().min(2),
    sizeUsd: z.number().positive(),
    allowedProtocols: z.array(z.string()).min(1),
    minImprovementBps: z.number().int().min(0).max(10_000),
    leverageAllowed: z.boolean(),
    currentAprPct: z.number().min(0),
  }),
})

export const healthFactorTask = baseTask.extend({
  kind: z.literal('health_factor'),
  policy: z.object({
    targetHealthFactor: z.number().min(1.01).max(10),
  }),
})

export const structuredTask = z.discriminatedUnion('kind', [
  rebalanceTask, gridTask, yieldTask, healthFactorTask,
])

export type StructuredTask = z.infer<typeof structuredTask>
export type RebalanceTask = z.infer<typeof rebalanceTask>
export type GridTask = z.infer<typeof gridTask>
export type YieldTask = z.infer<typeof yieldTask>
export type HealthFactorTask = z.infer<typeof healthFactorTask>

/** The MCS test that grades a task of this kind. */
export const TASK_TEST: Record<StructuredTask['kind'], string> = {
  rebalance: 'MCS-REB-1',
  grid: 'MCS-GRID-1',
  yield: 'MCS-YIELD-1',
  health_factor: 'MCS-HF-1',
}

/**
 * The task, rendered as the question an agent is actually asked.
 *
 * Deliberately the same shape MCS uses, so an agent that can pass the published
 * test can answer a real hire with no additional integration. A marketplace
 * whose test and whose hire ask differently is testing the wrong thing.
 */
export function renderTaskPrompt(task: StructuredTask): string {
  const head = [
    `Chain: BNB Smart Chain (56). Block: ${task.blockNumber}.`,
    `Subject address: ${task.subject}`,
    '',
  ]

  switch (task.kind) {
    case 'rebalance':
      return [
        ...head,
        `Task: re-centre PancakeSwap V3 position ${task.positionTokenId}.`,
        `POLICY YOU MUST FOLLOW: symmetric ±${task.policy.rangePct}% around spot on the ${task.policy.feeTier} fee tier, with a slippage bound no wider than ${task.policy.maxSlippageBps} bps.`,
        '',
        'Return strict JSON: { "currentTick", "inRange", "pctToNearestBound", "proposedTickLower", "proposedTickUpper", "amount0", "amount1", "maxSlippageBps" }.',
        'Proposed ticks must be multiples of the pool tickSpacing. No prose.',
      ].join('\n')

    case 'grid':
      return [
        ...head,
        `Task: plan a grid for ${task.pair}.`,
        `POLICY YOU MUST FOLLOW: ${task.policy.levels} levels between ${task.policy.lowerBound} and ${task.policy.upperBound}, ${task.policy.capitalUsd} USD of capital, stop at ${task.policy.stopPrice}, ${task.policy.feeBps} bps per trade.`,
        '',
        'Return strict JSON: { "spacingType", "levels": [{ "price", "allocationUsd" }], "feeDragPct" }.',
        'Fee drag must be disclosed. No prose.',
      ].join('\n')

    case 'yield':
      return [
        ...head,
        `Task: find the best net-of-cost route for ${task.policy.sizeUsd} USD of ${task.policy.asset}.`,
        `POLICY YOU MUST FOLLOW: only ${task.policy.allowedProtocols.join(', ')}; only recommend a move beating the current ${task.policy.currentAprPct}% by at least ${task.policy.minImprovementBps} bps; leverage ${task.policy.leverageAllowed ? 'allowed' : 'NOT allowed'}.`,
        '',
        'Return strict JSON: { "recommend", "venue", "netAprPct", "aprSources": [{ "value", "source", "timestamp" }], "switchingCost": { "gasUsd", "swapUsd", "exitUsd" }, "usesLeverage" }.',
        'State recommend explicitly, true or false. No prose.',
      ].join('\n')

    case 'health_factor':
      return [
        ...head,
        `Task: report this account's Venus health factor and restore it to ${task.policy.targetHealthFactor}.`,
        '',
        'Return strict JSON: { "healthFactor", "primaryCollateralSymbol", "primaryCollateralFactor", "primaryLiquidationPriceUsd", "repayUsdToReachTarget" }.',
        'No prose.',
      ].join('\n')
  }
}
