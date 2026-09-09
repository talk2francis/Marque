import { venusReader, exactRepayToReachTargetHf } from '@marque/positions'
import { publicClient } from '@marque/chain'
import { address, num } from './parse.js'
import { historicalContext, isRefusal } from './historical.js'
import { refuse, within, type Engine, type EngineAnswer, type EngineMeta } from './types.js'

/**
 * Keel — health factor.
 *
 * The narrowest of the five and the one where being wrong costs the most: a
 * liquidation price is a single number, and an agent that gets it wrong is
 * worse than no agent at all.
 *
 * It answers by reading the Venus Comptroller, never by reasoning about the
 * prompt. The repayment is closed-form, not a search: for a target H,
 *
 *     repay = (weightedCollateral / H) - borrowed        ... clamped at 0
 *
 * which is exact rather than iterative, and therefore reproducible by anyone
 * holding the same two chain reads.
 */

export const KEEL_META: EngineMeta = {
  id: 'keel',
  name: 'Keel',
  category: 'health_factor',
  testId: 'MCS-HF-1',
  description:
    'Reads a Venus Core position on BNB Smart Chain and reports the health factor to three decimals, the per-market collateral factor, the liquidation price, and the exact repayment that restores a requested health factor. Non-custodial: it computes, it never signs.',
  priceUsd: 0.05,
  skills: [
    {
      id: 'health-factor-read',
      name: 'Read a Venus health factor',
      description: 'Health factor to three decimals, collateral factor and liquidation price, read from the Comptroller at a given block.',
      tags: ['health factor', 'liquidation', 'venus', 'lending'],
    },
    {
      id: 'repay-to-target',
      name: 'Exact repayment to restore a target health factor',
      description: 'The closed-form USD repayment that moves the account to a requested health factor.',
      tags: ['health factor', 'repay', 'venus'],
    },
  ],
}

export const keelEngine: Engine = {
  meta: KEEL_META,
  async run(prompt, opts = {}): Promise<EngineAnswer> {
    const deadline = opts.deadlineMs ?? 6_000
    const subject = address(prompt)
    if (!subject) return refuse('no BNB Smart Chain address found in the task', 'a 0x address to read')

    const target = num(
      prompt,
      String.raw`restore it to\s+%N%`,
      String.raw`target(?:\s+health factor)?(?:\s+of)?\s+%N%`,
      String.raw`health factor(?:\s+of)?\s+%N%`,
    )
    if (target === null || target <= 1) {
      // Refusing beats guessing. An answer to the wrong question is worse than
      // no answer, because it looks like an answer.
      return refuse(
        'no target health factor found in the task',
        'state it explicitly, e.g. "restore it to 2.5"',
      )
    }

    try {
      const head = await within(publicClient().getBlockNumber(), 3_000, 'BNB Smart Chain')
      const ctx = historicalContext(prompt, head)
      if (isRefusal(ctx)) return ctx
      // Comptroller state, market state and the oracle price are all read at
      // this one block through this one client — never a historical balance
      // combined with a current collateral factor.
      const { client, readAt } = ctx
      const r = await within(
        venusReader(subject, { client, ...(readAt === undefined ? {} : { blockNumber: readAt }) }),
        deadline,
        'the Venus Comptroller',
      )
      if (!r.ok) return refuse(`could not read Venus state: ${r.error}`)

      const d = r.data
      if (d.healthFactor === null) {
        return {
          healthFactor: null,
          note: 'this account carries no debt, so it has no health factor',
          blockNumber: r.blockNumber.toString(),
        }
      }

      // The market that actually decides the liquidation price: the largest
      // supplied position that counts as collateral at all.
      const primary = [...d.markets]
        .filter((m) => m.suppliedUsd > 0 && m.collateralFactor > 0)
        .sort((a, b) => b.suppliedUsd - a.suppliedUsd)[0]

      return {
        healthFactor: Number(d.healthFactor.value.toFixed(3)),
        primaryCollateralSymbol: primary?.underlyingSymbol ?? null,
        primaryCollateralFactor: primary?.collateralFactor ?? null,
        primaryLiquidationPriceUsd: primary?.liquidationPriceUsd ?? null,
        repayUsdToReachTarget: exactRepayToReachTargetHf(
          d.weightedCollateralUsd.value, d.totalBorrowedUsd.value, target,
        ),
        targetHealthFactor: target,
        blockNumber: r.blockNumber.toString(),
        readAt: r.readAt,
        source: 'Venus Comptroller, read on-chain',
      }
    } catch (err) {
      return refuse(err instanceof Error ? err.message : String(err))
    }
  },
}
