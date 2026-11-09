import { encodeAbiParameters, encodeFunctionData, erc20Abi, parseAbi, type AbiParameter, type Address, type Hex } from 'viem'
import {
  EXECUTORS, loanGuardFactoryV2Abi, yieldSweepFactoryAbi, gridBandFactoryAbi, rangeKeeperFactoryAbi,
  type CharterKind, type ReviewedPool,
} from '@marque/charters/client'

/**
 * Pure builder logic for the v2 kinds (11_EXPERIENCE). Prices, never ticks: every tick the contracts use is derived
 * here from a price the person chose, and every bound is the factory's own, so the instrument's limits are the
 * contract's limits. Nothing here reads the chain or invents a number.
 */

// ---------- prices and ticks ----------

const LN_1_0001 = Math.log(1.0001)
/** Quote per base at a base tick (higher base tick = higher base price). */
export const priceAt = (bt: number, baseDecimals = 18, quoteDecimals = 18): number => Math.pow(1.0001, bt) * Math.pow(10, baseDecimals - quoteDecimals)
/** The base tick for a price, rounded down. */
export const btFor = (price: number, baseDecimals = 18, quoteDecimals = 18): number => Math.floor(Math.log(price / Math.pow(10, baseDecimals - quoteDecimals)) / LN_1_0001)
/** Pool tick to base tick: the same when base is token0, negated when it is token1. */
export const toBt = (poolTick: number, baseIsToken0: boolean) => (baseIsToken0 ? poolTick : -poolTick)
export const baseIsToken0 = (p: Pick<ReviewedPool, 'base' | 'quote'>) => p.base.toLowerCase() < p.quote.toLowerCase()
/** Ticks for the pool fee exactly as GridBandFactory.minStep counts them: ceil(fee / 100) (fee 500 = 0.05% = 5). */
export const feeTicks = (fee: number) => Math.floor((fee + 99) / 100)
/** Percent change across n ticks. */
export const pctOfTicks = (n: number) => (Math.pow(1.0001, n) - 1) * 100

export function fmtPrice(p: number): string {
  if (!Number.isFinite(p)) return 'unavailable'
  if (p >= 1e9) return 'no upper limit'
  if (p > 0 && p < 1e-6) return 'near zero'
  if (p >= 1000) return `$${Math.round(p).toLocaleString('en-US')}`
  if (p >= 1) return `$${p.toFixed(2)}`
  return `$${p.toPrecision(3)}`
}

// ---------- amounts ----------

export function units(input: string, decimals: number): bigint | null {
  const t = input.trim().replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const [w, f = ''] = t.split('.')
  if (f.length > decimals) return null
  return BigInt(w!) * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0')
}
export function amount(v: bigint, decimals: number, max = 4): string {
  const neg = v < 0n
  const a = neg ? -v : v
  const whole = a / 10n ** BigInt(decimals)
  const frac = (a % 10n ** BigInt(decimals)).toString().padStart(decimals, '0').slice(0, max).replace(/0+$/, '')
  return `${neg ? '-' : ''}${whole.toLocaleString('en-US')}${frac ? `.${frac}` : ''}`
}
const one = (decimals: number) => 10n ** BigInt(decimals)
/** Amounts too large to read digit by digit (testnet markets report trillions) in words, never rounded down to look smaller. */
export function compact(v: bigint, decimals: number): string {
  const whole = v / 10n ** BigInt(decimals)
  if (whole >= 10n ** 12n) return 'over a trillion'
  if (whole >= 10n ** 9n) return `${(Number(whole / 10n ** 7n) / 100).toFixed(2)} billion`
  if (whole >= 10n ** 6n) return `${(Number(whole / 10n ** 4n) / 100).toFixed(2)} million`
  return amount(v, decimals, 2)
}

// ---------- shared ----------

export const MIN_DAYS = 1
export const MAX_DAYS = 180
export const KIND_DURATIONS: Record<CharterKind, readonly number[]> = { loan: [7, 30, 90], yield: [30, 90, 180], grid: [7, 30, 90], range: [30, 90, 180] }
/** The factories accept 1 to 180 days; an hour of margin at each end covers a device clock ahead of the chain. */
export function expiryFor(days: number, nowSec: number): bigint {
  const d = Math.min(MAX_DAYS, Math.max(MIN_DAYS, days))
  const sec = d * 86_400 + (d === MIN_DAYS ? 3_600 : d === MAX_DAYS ? -3_600 : 0)
  return BigInt(nowSec + sec)
}
export function newSalt(): Hex {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return `0x${[...b].map((x) => x.toString(16).padStart(2, '0')).join('')}` as Hex
}
export const approveCall = (token: Address, spender: Address, value: bigint) => ({ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, value] }) })

// ---------- Loan Guard v2 ----------

export interface LoanV2Params { vDebt: Address; trigger: bigint; target: bigint; budget: bigint; minRepay: bigint }
/** Smallest repayment it will make: max(1 token, 2% of the budget), never above a quarter of it (factory bound). */
export function minRepayFor(budget: bigint, decimals: number): bigint {
  const q = budget / 4n
  const m = budget / 50n > one(decimals) ? budget / 50n : one(decimals)
  return m > q ? (q > 0n ? q : 1n) : m
}
export function loanCalls(factory: Address, token: Address, predicted: Address, p: LoanV2Params, expiresAt: bigint, tipPerAction: bigint, tipBudget: bigint, salt: Hex) {
  return [
    approveCall(token, predicted, p.budget + tipBudget),
    { to: factory, data: encodeFunctionData({ abi: loanGuardFactoryV2Abi, functionName: 'create', args: [{ p, expiresAt, tipPerAction, tipBudget }, salt] }) },
  ]
}

// ---------- Yield Sweep ----------

export interface YieldParams { vToken: Address; floor: bigint; ceiling: bigint; minAction: bigint; supplyCap: bigint; minHealthAfter: bigint }
/** Starting point from the wallet balance (06_YIELD_SWEEP, Parameters). */
export function yieldDefaults(balance: bigint, decimals: number): Pick<YieldParams, 'floor' | 'ceiling' | 'minAction' | 'supplyCap'> {
  const floor = balance / 5n > 0n ? balance / 5n : 10n * one(decimals)
  const minAction = floor / 20n > 10n * one(decimals) ? floor / 20n : 10n * one(decimals)
  let ceiling = floor + floor / 2n
  if (ceiling < floor + 2n * minAction) ceiling = floor + 2n * minAction
  const excess = balance > ceiling ? balance - (floor + ceiling) / 2n : 0n
  const supplyCap = excess * 3n > minAction * 10n ? roundUp(excess * 3n, decimals) : minAction * 10n
  return { floor, ceiling, minAction, supplyCap }
}
function roundUp(v: bigint, decimals: number): bigint {
  const step = 10n * one(decimals)
  return ((v + step - 1n) / step) * step
}
export type YieldProblem = 'band' | 'cap' | 'tip' | 'health' | null
export function yieldProblem(p: YieldParams, tipPerAction: bigint): YieldProblem {
  if (p.minAction === 0n || p.ceiling < p.floor + 2n * p.minAction) return 'band'
  if (p.supplyCap < p.minAction) return 'cap'
  if (tipPerAction >= p.minAction) return 'tip'
  if (p.minHealthAfter !== 0n && p.minHealthAfter < 11n * 10n ** 17n) return 'health'
  return null
}
/** What the sweep would do now for a wallet balance: supply down to mid, withdraw up to mid, or nothing. */
export function yieldNow(balance: bigint, p: Pick<YieldParams, 'floor' | 'ceiling'>): { action: 'supply' | 'withdraw' | 'none'; amount: bigint; after: bigint } {
  const mid = (p.floor + p.ceiling) / 2n
  if (balance > p.ceiling) return { action: 'supply', amount: balance - mid, after: mid }
  if (balance < p.floor) return { action: 'withdraw', amount: mid - balance, after: mid }
  return { action: 'none', amount: 0n, after: balance }
}
export function yieldCalls(factory: Address, underlying: Address, vToken: Address, predicted: Address, vAllowance: bigint, p: YieldParams, expiresAt: bigint, tipPerAction: bigint, tipBudget: bigint, salt: Hex) {
  return [
    approveCall(underlying, predicted, p.supplyCap + tipBudget),
    approveCall(vToken, predicted, vAllowance),
    { to: factory, data: encodeFunctionData({ abi: yieldSweepFactoryAbi, functionName: 'create', args: [{ p, expiresAt, tipPerAction, tipBudget }, salt] }) },
  ]
}

// ---------- Grid Band ----------

export const GRID_SLIP = 30
export const GRID_DEVIATION = 20
export const GRID_WINDOW = 300
export const GRID_MIN_FILL = 5_000
export const GRID_MAX_SLOTS = 40
/** The factory's own floor on level spacing: a round trip at both worst prices, fees included, never loses. */
export const minStepFor = (fee: number, slip = GRID_SLIP) => 2 * (slip + feeTicks(fee)) + 2

export interface GridPlan { lowerBt: number; stepTicks: number; slots: number; levels: number[]; prices: number[]; stepPct: number; worstRoundTripPct: number; clamped: boolean }
/**
 * Levels between two prices: the step is the band split into `slots`, never below the safe minimum. When the band is
 * too narrow for that many levels, the count stops at what fits and `clamped` is true ("Closer levels could lose money").
 */
export function planGrid(lowPrice: number, highPrice: number, slots: number, minStep: number, dec = { base: 18, quote: 18 }): GridPlan | null {
  if (!(lowPrice > 0) || !(highPrice > lowPrice) || slots < 1) return null
  const lo = btFor(lowPrice, dec.base, dec.quote)
  const hi = btFor(highPrice, dec.base, dec.quote)
  let n = Math.min(slots, GRID_MAX_SLOTS)
  let step = Math.floor((hi - lo) / n)
  let clamped = false
  if (step < minStep) { n = Math.max(1, Math.floor((hi - lo) / minStep)); step = Math.max(minStep, Math.floor((hi - lo) / n)); clamped = true }
  const levels = Array.from({ length: n + 1 }, (_, k) => lo + k * step)
  return { lowerBt: lo, stepTicks: step, slots: n, levels, prices: levels.map((t) => priceAt(t, dec.base, dec.quote)), stepPct: pctOfTicks(step), worstRoundTripPct: pctOfTicks(step - minStep + 2), clamped }
}
/** Slots whose buy level is above the average price start holding base (two-sided); this mirrors fullFromNow. */
export function fullFromFor(plan: GridPlan, twapBt: number): number {
  for (let s = 0; s < plan.slots; s++) if (plan.levels[s]! > twapBt) return s
  return plan.slots
}
export interface GridParams {
  pool: Address; base: Address; lowerBt: number; stepTicks: number; slots: number; orderQuote: bigint; baseOrder: bigint
  buyCap: bigint; sellCap: bigint; twapWindow: number; maxDeviation: number; slipTicks: number; minFillBps: number
}
export function gridCalls(factory: Address, pool: ReviewedPool, predicted: Address, p: GridParams, expiresAt: bigint, executors: Address[], fullFrom: number, salt: Hex) {
  return [
    approveCall(pool.quote, predicted, p.buyCap),
    approveCall(pool.base, predicted, p.sellCap),
    { to: factory, data: encodeFunctionData({ abi: gridBandFactoryAbi, functionName: 'create', args: [{ p, expiresAt, tipToken: pool.quote, tipPerAction: 0n, tipBudget: 0n, executors, fullFrom }, salt] }) },
  ]
}
export const defaultExecutors = (kind: 'grid' | 'range', backup: boolean): Address[] => [kind === 'grid' ? EXECUTORS.lattice : EXECUTORS.bound, ...(backup ? [EXECUTORS.backup] : [])]

// ---------- Range Keeper ----------

export interface RangeParams {
  pool: Address; mode: number; feesToOwner: boolean; twapWindow: number; maxDeviation: number; slipTicks: number; bufferTicks: number
  maxLossBps: number; maxLeftoverBps: number; minInterval: number; maxRebalances: number
}
export const RANGE_DEFAULTS = { twapWindow: 600, maxDeviation: 20, slipTicks: 50, maxLossBps: 50, maxLeftoverBps: 500 } as const
/**
 * Width a keeper needs to rebalance at all: the mint happens at spot, up to maxDeviation from the average the split
 * was computed at, and on a narrow range that offset alone leaves more than the leftover limit (found on testnet,
 * 9 Nov: 400 ticks with 20 of deviation refused with TooMuchLeftOver). Review L-01 asked for at least 4 x slip.
 */
export const minRangeWidth = (p: Pick<RangeParams, 'slipTicks' | 'maxDeviation'>) => Math.max(4 * p.slipTicks, 25 * p.maxDeviation)
/** A position this wide is always in range (full range is 1,774,540 ticks): there is nothing to keep. */
export const isFullRange = (lower: number, upper: number) => upper - lower >= 400_000
/** Same width, centred on the average tick, aligned to the pool's spacing (mirrors RangeKeeper.centeredRange). */
export function centeredRange(twapTick: number, width: number, spacing: number): { lower: number; upper: number } {
  const c = twapTick - Math.trunc(width / 2) // Solidity int division truncates toward zero
  let q = Math.trunc(c / spacing)
  if (c < 0 && c % spacing !== 0) q -= 1
  const lower = q * spacing
  return { lower, upper: lower + width }
}
const createTupleOf = (): AbiParameter => {
  const ev = (rangeKeeperFactoryAbi as readonly { type: string; name?: string; inputs?: readonly AbiParameter[] }[]).find((x) => x.type === 'event' && x.name === 'Created')!
  return ev.inputs!.find((i) => i.name === 'params')!
}
/** The one grant call for a Range Keeper: the position NFT to the factory, with the charter's terms as data. */
export function rangeGrantCall(npm: Address, owner: Address, factory: Address, tokenId: bigint, c: {
  p: RangeParams; expiresAt: bigint; tipToken: Address; tipPerAction: bigint; tipBudget: bigint; executors: Address[]; userSalt: Hex
}) {
  const data = encodeAbiParameters([createTupleOf()], [c])
  return { to: npm, data: encodeFunctionData({ abi: parseAbi(['function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)']), functionName: 'safeTransferFrom', args: [owner, factory, tokenId, data] }) }
}

// ---------- sentences (the charter reads aloud) ----------

export const dateWords = (sec: bigint) => new Date(Number(sec) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export function yieldSentence(x: { floor: string; ceiling: string; cap: string; symbol: string; until: string }): string {
  return `Keep between ${x.floor} and ${x.ceiling} ${x.symbol} in my wallet. Put the rest in Venus in my name, bring it back when I run low, supplying at most ${x.cap} ${x.symbol} over the charter's life, until ${x.until}.`
}
export function gridSentence(x: { low: string; high: string; pair: string; order: string; quote: string; levels: number; base: string; buyCap: string; sellCap: string; until: string }): string {
  return `Between ${x.low} and ${x.high} on ${x.pair}, buy ${x.order} ${x.quote} of ${x.base} at each of ${x.levels} levels as the price falls and sell each one a level higher, using at most ${x.buyCap} ${x.quote} and ${x.sellCap} ${x.base} in total, until ${x.until}.`
}
export function rangeSentence(x: { pair: string; low: string; high: string; minutes: number; moves: number; hours: number; lossPct: string; until: string; exit: boolean }): string {
  if (x.exit) return `When ${x.pair} has been outside my ${x.low} to ${x.high} range for ${x.minutes} minutes, close the position and send everything back to my wallet, until ${x.until}.`
  return `When ${x.pair} has been outside my ${x.low} to ${x.high} range for ${x.minutes} minutes, move the range back around the price, same width. At most ${x.moves} moves, at most one every ${x.hours} ${x.hours === 1 ? 'hour' : 'hours'}, each losing at most ${x.lossPct}% at the average price, until ${x.until}.`
}
