import { minBig, repayToTarget, simulateAct, usdOf, WAD, type Health } from './health.js'

/**
 * Health values in plain prices ("acts if BNB falls to about $478"). Framing speaks about the main collateral,
 * holding every other market where it is, using Venus's liquidation thresholds. It is a translation for people,
 * always "about": the guard itself reads Venus at the moment it acts.
 */
export interface FramingInput {
  /** Venus's weighted collateral and total debt now. */
  collateralUsd: bigint
  debtUsd: bigint
  /** The main collateral: supplied underlying units, liquidation threshold and Venus price (1e(36 - decimals)). */
  main: { supplied: bigint; liquidationThreshold: bigint; price: bigint; decimals: number }
}

/** The main collateral's Venus price at which health would be `h` (1e18 scale), or null when no price can. */
export function priceAtHealth(x: FramingInput, h: bigint): bigint | null {
  const { supplied, liquidationThreshold, price } = x.main
  if (supplied === 0n || liquidationThreshold === 0n || x.debtUsd === 0n) return null
  const mainNow = (((supplied * price) / WAD) * liquidationThreshold) / WAD
  const others = x.collateralUsd > mainNow ? x.collateralUsd - mainNow : 0n
  const needed = (h * x.debtUsd) / WAD
  if (needed <= others) return null // other collateral alone keeps health at or above h
  return ((needed - others) * WAD * WAD) / (supplied * liquidationThreshold)
}

/** A Venus price as dollars per whole token. */
export function priceToUsd(price: bigint, decimals: number): number {
  // price is 1e(36 - decimals) per unit; per whole token that is price * 10^decimals / 1e36.
  return Number((price * 10n ** BigInt(decimals) * 10_000n) / 10n ** 36n) / 10_000
}

/** Percent the main collateral would fall from now to reach `h`; negative when health is already below it. */
export function dropToHealth(x: FramingInput, h: bigint): number | null {
  const p = priceAtHealth(x, h)
  if (p === null) return null
  return Number(((x.main.price - p) * 100_000n) / x.main.price) / 1000
}

/** What the guard would repay at the moment health reaches `trigger`, in debt-token units at the given price. */
export function repayAtTrigger(x: FramingInput, trigger: bigint, target: bigint, debtPrice: bigint): bigint {
  const collateralAtTrigger = (trigger * x.debtUsd) / WAD
  // Health just under the trigger: the guard acts the moment it crosses, so price at exactly the trigger.
  return repayToTarget({ collateralUsd: collateralAtTrigger, debtUsd: x.debtUsd }, target, debtPrice)
}

/**
 * Starting points from the owner's own loan, never advice (03_EXPERIENCE 3.6): the trigger is the health at which
 * the main collateral would have fallen 20%, clamped to [1.15, 1.60]; if health is already below that, health now
 * minus 0.10 (at least 1.10) with a warning. The target is the trigger plus 0.50.
 */
export function smartDefaults(x: FramingInput, healthNow: bigint): { trigger: bigint; target: bigint; warn: boolean } {
  const c = (n: number) => BigInt(Math.round(n * 100)) * 10n ** 16n
  const fallen = { ...x, collateralUsd: x.collateralUsd - (((((x.main.supplied * x.main.price) / WAD) * x.main.liquidationThreshold) / WAD) * 20n) / 100n }
  let trigger = x.debtUsd === 0n ? c(1.3) : (fallen.collateralUsd * WAD) / x.debtUsd
  trigger = (trigger / 10n ** 16n) * 10n ** 16n // two decimals
  let warn = false
  if (trigger < c(1.15)) trigger = c(1.15)
  if (trigger > c(1.6)) trigger = c(1.6)
  if (healthNow < trigger) {
    warn = true
    trigger = healthNow - c(0.1)
    trigger = (trigger / 10n ** 16n) * 10n ** 16n
    if (trigger < c(1.1)) trigger = c(1.1)
  }
  return { trigger, target: trigger + c(0.5), warn }
}

export interface StormGuard {
  trigger: bigint
  target: bigint
  /** Budget left, allowance and wallet balance, in debt-token units. */
  budgetLeft: bigint
  allowance: bigint
  balance: bigint
  debtInMarket: bigint
  debtPrice: bigint
}

export interface StormOutcome {
  /** Health at the final price; null when no debt is left. */
  health: bigint | null
  /** Health went under 1.00 somewhere on the way down: Venus could liquidate. */
  liquidated: boolean
}

export interface StormResult {
  without: StormOutcome
  with: StormOutcome
  actions: number
  /** Debt-token units the guard would use. */
  used: bigint
  /** Budget, allowance or balance ran out on the way down. */
  ranOut: boolean
}

/**
 * "What if the collateral falls by `dropPct`%": walk the main collateral's price down in 0.5% steps. Without a
 * guard, health just falls. With one, each step that crosses the trigger runs the guard's own act() arithmetic.
 * A projection, labelled as one; it assumes every other price holds and that a watcher acts at each step.
 */
export function storm(x: FramingInput, g: StormGuard, dropPct: number): StormResult {
  const steps = Math.max(0, Math.round(dropPct * 2))
  const mainNow = (((x.main.supplied * x.main.price) / WAD) * x.main.liquidationThreshold) / WAD
  const others = x.collateralUsd > mainNow ? x.collateralUsd - mainNow : 0n
  let debtUsd = x.debtUsd, debtInMarket = g.debtInMarket, left = minBig(g.budgetLeft, g.allowance, g.balance), used = 0n, actions = 0
  let withLiquidated = false
  let collateralUsd = x.collateralUsd
  for (let s = 0; s <= steps; s++) {
    collateralUsd = others + (mainNow * BigInt(2000 - Math.min(2000, s * 10))) / 2000n
    const h: Health = { collateralUsd, debtUsd }
    const r = simulateAct({ health: h, debtInMarket, price: g.debtPrice, trigger: g.trigger, target: g.target, budget: left, spent: 0n, allowance: left, balance: left, tip: 0n, callerIsOwner: true })
    if (r.state === 'would_act') {
      actions += 1
      used += r.repaid
      left -= r.repaid
      debtUsd = debtUsd - usdOf(g.debtPrice, debtInMarket) + usdOf(g.debtPrice, r.debtInMarketAfter)
      debtInMarket = r.debtInMarketAfter
    }
    if (debtUsd > 0n && (collateralUsd * WAD) / debtUsd < WAD) withLiquidated = true
  }
  const finalCollateral = collateralUsd
  const withoutHealth = x.debtUsd === 0n ? null : (finalCollateral * WAD) / x.debtUsd
  return {
    without: { health: withoutHealth, liquidated: withoutHealth !== null && withoutHealth < WAD },
    with: { health: debtUsd === 0n ? null : (finalCollateral * WAD) / debtUsd, liquidated: withLiquidated },
    actions,
    used,
    ranOut: left === 0n,
  }
}
