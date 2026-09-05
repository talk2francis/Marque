/**
 * The guardrails PancakeSwap's own guide prescribes for V3 trading agents.
 *
 * Read from the live guide at build time:
 *   https://docs.pancakeswap.finance/trading-tools/building-trading-agents-on-pancakeswap-v3
 *
 * These are stated in the UI, not only enforced in code, because a guardrail a
 * user cannot see is a guardrail they cannot check. Each entry records whether
 * PancakeSwap prescribes it or we added it — attributing our own choices to
 * their guide would misrepresent the source in a submission they will judge.
 */

export interface Guardrail {
  name: string
  /** The concrete setting, in the form the code actually uses. */
  value: string
  why: string
  source: 'PancakeSwap guide' | 'Marque'
}

export const GUARDRAILS: Guardrail[] = [
  {
    name: 'Slippage bound, never zero',
    value: 'amountOutMinimum / amount*Min derived from an explicit tolerance · default 0.50% (Percent(50, 10_000))',
    why: 'The guide requires minimums derived from a stated tolerance and never left at 0. A zero minimum is an instruction to accept any price, which is what a sandwich needs.',
    source: 'PancakeSwap guide',
  },
  {
    name: 'Deadline of five minutes or less',
    value: 'deadline = now + 5 × 60 seconds',
    why: 'The guide’s recommended default. A transaction that can sit in the mempool indefinitely will eventually execute at a price nobody agreed to.',
    source: 'PancakeSwap guide',
  },
  {
    name: 'Approvals scoped to the exact amount',
    value: 'Permit2, approved for the amount being spent — never an infinite allowance',
    why: 'The guide is explicit: allowance scoped to the amount, not infinite. An infinite approval outlives the transaction that needed it.',
    source: 'PancakeSwap guide',
  },
  {
    name: 'Atomic multicall',
    value: 'Multicall.encodeMulticall([...]) — decreaseLiquidity, collect and burn in one transaction',
    why: 'The guide calls this a safety property rather than a gas saving: a rebalance that removes liquidity and then collects must never half-execute.',
    source: 'PancakeSwap guide',
  },
  {
    name: 'State re-read between transactions',
    value: 'waitForTransactionReceipt, then re-read slot0, liquidity and tickCurrent before minting',
    why: 'The guide: do not reuse pre-removal numbers. Removal and mint are separate transactions, so the pool can move between them.',
    source: 'PancakeSwap guide',
  },
  {
    name: 'Ticks snapped to the fee tier’s spacing',
    value: 'nearestUsableTick(tick, spacing) · 0.01%→1, 0.05%→10, 0.25%→50, 1.00%→200',
    why: 'A tick that is not a multiple of the pool’s spacing reverts. It is also the single most common agent failure we have measured, and MCS-REB-1 checks it.',
    source: 'PancakeSwap guide',
  },
  {
    name: 'Per-run cap on value moved',
    value: 'Enforced by the charter: a spend cap, an expiry, and an explicit contract allowlist',
    why: 'The guide asks for a per-run cap. Ours is the charter itself, so the cap is on chain and revocable rather than a constant inside the agent.',
    source: 'PancakeSwap guide',
  },
  {
    name: 'Pool price sanity-checked before acting',
    value: 'Pool price compared against an independent reference; the run is skipped if they diverge',
    why: 'The guide’s defence against acting on a manipulated pool. A price that only one source believes is not a price.',
    source: 'PancakeSwap guide',
  },
  {
    name: 'Raw units for all contract maths',
    value: 'No display-scaled values; ERC-8056 UI multipliers are ignored in arithmetic',
    why: 'The guide warns that some BSC tokens carry on-chain UI multipliers. Doing maths in display units silently scales every amount.',
    source: 'PancakeSwap guide',
  },
  {
    name: 'Token safelist',
    value: 'Charter allowlist limits which contracts may be touched at all',
    why: 'The guide prescribes NO safelist and offers no honeypot filtering — we checked. This one is ours, and it is enforced by the charter’s contract allowlist rather than by a curated token list we would have to maintain and could get wrong.',
    source: 'Marque',
  },
]
