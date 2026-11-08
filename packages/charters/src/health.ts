/**
 * The guard's arithmetic, mirrored in bigint for projections (the storm test, the night replay, price framing).
 * It reproduces HealthMath.sol and LoanGuard.act() exactly, including truncation, and is checked against vectors
 * exported from the Solidity tests. It never decides an action: the chain does (AGENTS.md, C1).
 *
 * Units, as Venus uses them: USD values carry 18 decimals; a token price is scaled to 1e(36 - token decimals), so
 * price * amount / 1e18 is USD with 18 decimals; health carries 18 decimals (1e18 is 1.00).
 */
export const WAD = 10n ** 18n
/** What HealthMath returns as the health of an account with no debt. */
export const NO_DEBT = (1n << 256n) - 1n

export interface Health {
  collateralUsd: bigint
  debtUsd: bigint
}

export const minBig = (...xs: bigint[]): bigint => xs.reduce((a, b) => (b < a ? b : a))

export function healthOf(h: Health): bigint {
  return h.debtUsd === 0n ? NO_DEBT : (h.collateralUsd * WAD) / h.debtUsd
}

/** HealthMath.repayToTarget: debt-token units to reach `target`, rounded up by one unit. */
export function repayToTarget(h: Health, target: bigint, debtPrice: bigint): bigint {
  if (h.debtUsd === 0n) return 0n
  const keep = (h.collateralUsd * WAD) / target
  if (keep >= h.debtUsd) return 0n
  return ((h.debtUsd - keep) * WAD) / debtPrice + 1n
}

/** USD value of `units` of a token at a Venus price, truncated as Venus truncates. */
export const usdOf = (price: bigint, units: bigint): bigint => (price * units) / WAD

export type GuardState = 'watching' | 'would_act' | 'ended' | 'expired' | 'no_debt' | 'no_funds'
export const STATE_CODES: Record<number, GuardState> = { 0: 'watching', 1: 'would_act', 2: 'ended', 3: 'expired', 4: 'no_debt', 5: 'no_funds' }

export interface ActInput {
  /** Venus's weighted collateral and total debt for the owner, after interest accrual on the debt market. */
  health: Health
  /** The owner's debt in the guard's market, in token units. */
  debtInMarket: bigint
  /** Venus's price for the guard's market. */
  price: bigint
  trigger: bigint
  target: bigint
  budget: bigint
  spent: bigint
  allowance: bigint
  balance: bigint
  tip: bigint
  callerIsOwner: boolean
  ended?: boolean
  expired?: boolean
}

export interface ActResult {
  state: GuardState
  repaid: bigint
  tipPaid: bigint
  healthBefore: bigint
  healthAfter: bigint
  debtInMarketAfter: bigint
}

/** What act() would do, step for step. A state other than would_act means act() would revert. */
export function simulateAct(x: ActInput): ActResult {
  const healthBefore = healthOf(x.health)
  const none = (state: GuardState): ActResult => ({ state, repaid: 0n, tipPaid: 0n, healthBefore, healthAfter: healthBefore, debtInMarketAfter: x.debtInMarket })
  if (x.ended) return none('ended')
  if (x.expired) return none('expired')
  if (healthBefore >= x.trigger) return none('watching')
  if (x.debtInMarket === 0n) return none('no_debt')
  const left = x.budget - x.spent
  const avail = minBig(x.allowance, x.balance)
  const repaid = minBig(repayToTarget(x.health, x.target, x.price), x.debtInMarket, left, avail)
  if (repaid === 0n) return none('no_funds')
  const tipPaid = x.callerIsOwner ? 0n : minBig(x.tip, repaid, left - repaid, avail - repaid)
  const debtInMarketAfter = x.debtInMarket - repaid
  const debtUsdAfter = x.health.debtUsd - usdOf(x.price, x.debtInMarket) + usdOf(x.price, debtInMarketAfter)
  const healthAfter = healthOf({ collateralUsd: x.health.collateralUsd, debtUsd: debtUsdAfter })
  return { state: 'would_act', repaid, tipPaid, healthBefore, healthAfter, debtInMarketAfter }
}

/** Health as a plain number for display, to 4 decimals; null when there is no debt. */
export function healthToNumber(h: bigint): number | null {
  if (h === NO_DEBT) return null
  return Number((h * 10_000n) / WAD) / 10_000
}

/**
 * A decimal string ("1.30", "500", "0.000001") to integer units with `decimals` places. Rejects exponents,
 * signs, spaces, more places than the token has, and anything that is not a plain decimal. Returns null for any
 * invalid input, so a form can say what is wrong instead of guessing.
 */
export function parseDecimal(input: string, decimals: number): bigint | null {
  const s = input.trim()
  if (!/^\d{1,30}(\.\d*)?$|^\.\d+$/.test(s)) return null
  const [whole = '', frac = ''] = s.split('.')
  if (frac.length > decimals) return null
  const value = BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt((frac || '').padEnd(decimals, '0') || '0')
  return value
}

/** Integer units to a decimal string, trimmed of trailing zeros, at most `places` decimals (rounded down). */
export function formatUnitsTrim(value: bigint, decimals: number, places = 2): string {
  const neg = value < 0n
  const v = neg ? -value : value
  const base = 10n ** BigInt(decimals)
  const whole = v / base
  const frac = (v % base).toString().padStart(decimals, '0').slice(0, Math.max(0, places)).replace(/0+$/, '')
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${neg ? '-' : ''}${w}${frac ? `.${frac}` : ''}`
}
