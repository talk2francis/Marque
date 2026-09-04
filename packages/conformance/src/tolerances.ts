/**
 * MCS tolerances — the single source of truth.
 *
 * Every numeric threshold the harness enforces lives here, and the published
 * standard at `docs/standard/MCS-v1.0.md` is GENERATED from this file. That is
 * the whole point: a standard maintained by hand drifts from the code that
 * enforces it, and then the published document is a lie.
 *
 * AGENTS.md invariant 8 governs what may appear here at all:
 *
 *   MCS tests facts and compliance. The Ledger tests judgement.
 *
 * A tolerance may only bound something with exactly one right answer —
 * arithmetic, on-chain state, legality against a pool's own parameters, or
 * compliance with a policy the test case itself supplied. If a check cannot be
 * written as an assertion with a numeric tolerance, it is not a conformance
 * check and belongs in the Ledger (P8b).
 */

export const MCS_VERSION = '1.0.0'

/** Bumped whenever any tolerance changes. Stamped onto every result row. */
export const MCS_TOLERANCE_REVISION = 1

export interface Tolerance {
  /** Stable identifier, used as the diff field key and in the published spec. */
  readonly id: string
  /** One-line statement of what is being bounded. */
  readonly description: string
  /** The bound itself. `null` means the check is boolean, not numeric. */
  readonly value: number | null
  readonly unit: string
  /** Why this number and not another. Rendered into the standard. */
  readonly rationale: string
}

function tol<T extends Record<string, Tolerance>>(t: T): T {
  return t
}

// ---------------------------------------------------------------------------
// MCS-REB-1 — Rebalancing (PancakeSwap V3)
// ---------------------------------------------------------------------------

export const REB = tol({
  TICK_EXACT: {
    id: 'currentTick',
    description: 'Reported current tick must equal the pool tick at the pinned block, exactly.',
    value: 0,
    unit: 'ticks',
    rationale:
      'The tick is a single integer read from slot0 at a fixed block. There is no ambiguity and therefore no tolerance.',
  },
  TICK_SPACING_MULTIPLE: {
    id: 'proposedTickSpacing',
    description: 'Every proposed tick must be an exact multiple of the pool’s tickSpacing.',
    value: null,
    unit: 'boolean',
    rationale:
      'The pool contract reverts on a tick that is not a multiple of its spacing, so a plan that violates this is not merely suboptimal, it is unexecutable. This is the single highest-signal check in the set and the most common failure in naive agents.',
  },
  POLICY_RANGE_SPACINGS: {
    id: 'policyRange',
    description:
      'Proposed bounds must match the range implied by the policy SUPPLIED IN THE TEST CASE, within one tick spacing.',
    value: 1,
    unit: 'tick spacings',
    rationale:
      'There is no objectively correct V3 range in the abstract, so the case supplies the policy and we check compliance with it. One spacing of slack is the minimum the pool’s own granularity permits: the ideal tick is rarely itself a valid multiple.',
  },
  AMOUNTS_PCT: {
    id: 'amounts',
    description: 'Proposed token amounts must satisfy the V3 liquidity formula within this tolerance.',
    value: 0.5,
    unit: '%',
    rationale:
      'The formula is exact, but agents legitimately round for slippage and gas. 0.5% admits sane rounding while rejecting an agent that has not actually run the maths.',
  },
  IN_RANGE_EXACT: {
    id: 'inRange',
    description: 'The in-range boolean must match the chain.',
    value: null,
    unit: 'boolean',
    rationale: 'Derived from tickLower <= tick < tickUpper. One right answer.',
  },
  DISTANCE_PCT: {
    id: 'distanceToBound',
    description: 'Distance to the nearest bound, in price terms.',
    value: 0.5,
    unit: 'percentage points',
    rationale:
      'Derived arithmetic from the tick and the two bounds. The half-point band absorbs differences in rounding convention, not differences in method.',
  },
  SLIPPAGE_STATED: {
    id: 'slippageBound',
    description: 'A slippage bound must be stated, as a positive number.',
    value: null,
    unit: 'boolean',
    rationale:
      'An execution plan with no slippage bound is unsafe to sign regardless of how good its range is. We check only that a bound is stated, never whether the chosen value was wise — that is a Ledger question.',
  },
})

// ---------------------------------------------------------------------------
// MCS-GRID-1 — Grid Trading
// ---------------------------------------------------------------------------

export const GRID = tol({
  SPACING_PCT: {
    id: 'levelSpacing',
    description: 'Level spacing must match the declared spacing type (arithmetic or geometric).',
    value: 0.5,
    unit: '%',
    rationale:
      'The agent declares which type it used; we then verify the levels actually follow it. Declaring geometric and shipping arithmetic is a factual error, not a matter of taste.',
  },
  ALLOCATION_OVER_CAPITAL: {
    id: 'allocationSum',
    description: 'Summed level allocations must not exceed the stated capital.',
    value: 0.1,
    unit: '%',
    rationale:
      'Spending more than the capital supplied is unexecutable. The 0.1% band covers floating-point summation, nothing more.',
  },
  LEVELS_IN_BOUNDS: {
    id: 'levelsWithinBounds',
    description: 'Every level must lie inside the bounds supplied by the test case.',
    value: null,
    unit: 'boolean',
    rationale: 'Compliance with a constraint the case supplied. One right answer.',
  },
  NONE_BELOW_STOP: {
    id: 'levelsAboveStop',
    description: 'No level may sit below the stop supplied by the test case.',
    value: null,
    unit: 'boolean',
    rationale: 'A level below the stop would be filled and then immediately stopped out.',
  },
  FEE_DRAG_DISCLOSED: {
    id: 'feeDragDisclosed',
    description:
      'The plan must disclose fee drag: n levels implies n round-trips of fees, stated as a number.',
    value: null,
    unit: 'boolean',
    rationale:
      'A grid plan that omits fee drag overstates its own return, and the omission is invisible to the buyer. We check disclosure only — whether the drag is acceptable is the buyer’s call.',
  },
})

// ---------------------------------------------------------------------------
// MCS-YIELD-1 — Yield Optimisation
// ---------------------------------------------------------------------------

export const YIELD = tol({
  APR_SOURCED: {
    id: 'aprProvenance',
    description: 'Every quoted APR must carry a source and a timestamp.',
    value: null,
    unit: 'boolean',
    rationale:
      'An APR with no source and no timestamp cannot be checked by anyone, including the buyer. This is the yield-category equivalent of a provenance chip.',
  },
  NET_APR_BPS: {
    id: 'netApr',
    description: 'Net APR at the stated size must reproduce ours within this tolerance.',
    value: 15,
    unit: 'basis points',
    rationale:
      'Both sides compute from the same on-chain rates at the same block, so the only legitimate divergence is gas and compounding convention. 15bps is generous for that and far tighter than the differences between real venues.',
  },
  SWITCHING_COST_ITEMIZED: {
    id: 'switchingCost',
    description: 'The switching cost must be itemized, not given as a single opaque number.',
    value: null,
    unit: 'boolean',
    rationale:
      'Gas, swap and exit costs behave differently with size. A lump sum hides which one dominates at the buyer’s size.',
  },
  THRESHOLD_RESPECTED: {
    id: 'improvementThreshold',
    description:
      'A recommendation must clear the minimum-improvement threshold supplied by the test case, or the agent must decline to recommend.',
    value: null,
    unit: 'boolean',
    rationale:
      'Compliance with a supplied constraint. Declining is a pass: an agent that correctly says "nothing beats your current position by enough" is behaving well.',
  },
  LEVERAGE_FLAGGED: {
    id: 'leverageFlagged',
    description: 'If the case excludes leverage, any leveraged strategy must be flagged as such.',
    value: null,
    unit: 'boolean',
    rationale:
      'Presenting a looped position as a plain deposit misstates the risk the buyer is taking.',
  },
})

// ---------------------------------------------------------------------------
// MCS-HF-1 — Health Factor
// ---------------------------------------------------------------------------

export const HF = tol({
  HEALTH_FACTOR: {
    id: 'healthFactor',
    description: 'Reported health factor must match ours to three decimal places.',
    value: 0.005,
    unit: 'HF',
    rationale:
      'Both sides read the same Comptroller state at the same block, so this is pure arithmetic. 0.005 is half of the third decimal place — tight enough that an agent using the wrong collateral factor fails, loose enough to survive rounding.',
  },
  COLLATERAL_FACTOR: {
    id: 'collateralFactor',
    description: 'Per-market collateral factor must match the Comptroller.',
    value: 0.001,
    unit: 'fraction',
    rationale: 'Read directly from markets(vToken). Getting this wrong is what makes an HF wrong.',
  },
  REPAY_AMOUNT: {
    id: 'repayToTarget',
    description:
      'The repay amount must, when applied, restore the target health factor within this tolerance.',
    value: 0.005,
    unit: 'HF',
    rationale:
      'Checked by APPLYING the agent’s number to the snapshot and recomputing, not by comparing to ours. An agent that reaches the target by a different but valid route passes.',
  },
  LIQUIDATION_PRICE_PCT: {
    id: 'liquidationPrice',
    description: 'Per-asset liquidation price must match ours within this tolerance.',
    value: 1,
    unit: '%',
    rationale:
      'A closed-form function of collateral, debt and collateral factors. One percent admits oracle rounding, not method error.',
  },
})

/** Every tolerance, grouped by test, for the standard generator. */
export const ALL_TOLERANCES = {
  'MCS-REB-1': REB,
  'MCS-GRID-1': GRID,
  'MCS-YIELD-1': YIELD,
  'MCS-HF-1': HF,
} as const

export type TestId = keyof typeof ALL_TOLERANCES

/**
 * Checks deliberately EXCLUDED from MCS, and why.
 *
 * Published alongside the standard. A standard is defined as much by what it
 * refuses to grade as by what it grades, and stating the exclusions is what
 * makes it survive an interrogation by a judge or a sponsor.
 */
export const EXCLUDED_CHECKS: ReadonlyArray<{ check: string; test: TestId; reason: string }> = [
  {
    check: 'Expected number of fills at a stated volatility',
    test: 'MCS-GRID-1',
    reason:
      'A model output wearing the clothes of a fact. Two honest agents can differ and both be right, so grading it would make the standard quietly non-deterministic. Moved to the Ledger.',
  },
  {
    check: 'Whether the chosen range is the wisest available',
    test: 'MCS-REB-1',
    reason:
      'There is no objectively correct V3 range in the abstract. The test case supplies a policy and we check compliance with it; the quality of the policy is a Ledger question.',
  },
  {
    check: 'Whether the recommended venue is the best one',
    test: 'MCS-YIELD-1',
    reason:
      'Judgement. We check that the arithmetic is right, the sources are cited and the supplied threshold is respected — not that the choice was optimal.',
  },
  {
    check: 'Speed, price and helpfulness of the response',
    test: 'MCS-HF-1',
    reason:
      'Measured and published, but in the Ledger against a pre-registered rubric, never as a pass/fail certificate.',
  },
]
