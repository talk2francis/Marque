import { encodeFunctionData, erc20Abi, type Address, type Hex } from 'viem'
import {
  BOUNDS, CHARTER_CHAINS, charterFactoryAbi, parseDecimal, type CharterChainId, type FramingInput,
} from '@marque/charters/client'

/**
 * The builder's arithmetic and the grant's calls, kept out of the components so each rule is tested once
 * (03_EXPERIENCE sections 3, 4 and 9). Health values in the builder are whole hundredths (130 = 1.30), which is
 * the precision the handles move in and the precision the paper shows.
 */

/** /api/v1/guards/quote, as the browser receives it (amounts are decimal strings of chain integers). */
export interface Quote {
  chainId: CharterChainId
  account: Address
  blockNumber: string
  readAt: string
  health: string | null
  collateralUsd: string
  debtUsd: string
  markets: Array<{ vToken: Address; symbol: string; decimals: number; price: string; borrowed: string; supplied: string; repayable: boolean; unsupportedReason: string | null; borrowedUsd: string }>
  mainCollateral: { vToken: Address; symbol: string; decimals: number; price: string; priceUsd: number; supplied: string; liquidationThreshold: string } | null
  market: { vToken: Address; token: Address; symbol: string; decimals: number; price: string; borrowed: string } | null
  noLoan: boolean
  unsupportedOnly: boolean
  defaults: { trigger: string; target: string; warn: boolean } | null
  wallet: { balance: string; symbol: string; decimals: number } | null
}

export const H = 10n ** 16n // one hundredth of health, in the guard's 1e18 scale
export const toWad = (hundredths: number): bigint => BigInt(hundredths) * H
export const toHundredths = (wad: bigint): number => Number(wad / H)
export const fmtHealth = (hundredths: number): string => (hundredths / 100).toFixed(2)

export const TRIGGER_MIN = Number(BOUNDS.minTrigger / H)
export const TRIGGER_MAX = Number(BOUNDS.maxTrigger / H)
export const GAP_MIN = Number(BOUNDS.minGap / H)
export const TARGET_MAX = Number(BOUNDS.maxTarget / H)

/** Keep a trigger and target inside the factory's bounds, moving the target up when the trigger pushes it. */
export function clampRule(trigger: number, target: number): { trigger: number; target: number } {
  const t = Math.min(TRIGGER_MAX, Math.max(TRIGGER_MIN, Math.round(trigger)))
  const g = Math.min(TARGET_MAX, Math.max(t + GAP_MIN, Math.round(target)))
  return { trigger: t, target: g }
}

export type PresetId = 'steady' | 'cautious' | 'light' | 'test'
export const PRESETS: Array<{ id: PresetId; label: string }> = [
  { id: 'steady', label: 'Steady' },
  { id: 'cautious', label: 'Cautious' },
  { id: 'light', label: 'Light touch' },
  { id: 'test', label: 'Test it now' },
]

/** A preset's trigger and target. Test it now sits 0.05 above today's health, the target 0.10 above that. */
export function presetRule(id: PresetId, healthNow: number | null): { trigger: number; target: number } {
  if (id === 'steady') return clampRule(130, 180)
  if (id === 'cautious') return clampRule(150, 200)
  if (id === 'light') return clampRule(115, 145)
  const now = healthNow === null ? 150 : Math.ceil(healthNow * 100)
  return clampRule(now + 5, now + 15)
}

/** Round a token amount up to two significant whole tokens (4,432.79 to 4,500; 38.1 to 39; 0.4 to 1). */
export function roundUpBudget(units: bigint, decimals: number): bigint {
  const one = 10n ** BigInt(decimals)
  let whole = (units + one - 1n) / one
  if (whole <= 0n) return 0n
  const digits = whole.toString().length
  if (digits > 2) {
    const step = 10n ** BigInt(digits - 2)
    whole = ((whole + step - 1n) / step) * step
  }
  return whole * one
}

/** Budget suggestion: enough for one action at the trigger price, rounded up, never above what the wallet holds. */
export function suggestBudget(repayAtTrigger: bigint, decimals: number, walletBalance: bigint | null): bigint {
  const rounded = roundUpBudget(repayAtTrigger, decimals)
  if (walletBalance !== null && walletBalance > 0n && rounded > walletBalance) return walletBalance
  return rounded
}

export type TipChoice = 'none' | 'small' | 'larger'
/** A thank-you per action, from the budget: small is 1% of it, larger 5%; the factory allows at most 10%. */
export function tipFor(choice: TipChoice, budget: bigint): bigint {
  if (choice === 'small') return budget / 100n
  if (choice === 'larger') return budget / 20n
  return 0n
}

export const DURATIONS = [7, 30, 90] as const
/**
 * Expiry for a duration chosen now, from this device's clock. The factory checks it against the block that creates
 * the guard: the 1-day minimum tightens as a create lands later (review I-7), which the shortest choice, 7 days,
 * never approaches; the 90-day maximum loosens. The hour kept under 90 days covers a device clock running ahead of
 * the chain.
 */
export function expiryFor(days: number, nowSec: number): bigint {
  const max = nowSec + BOUNDS.maxDays * 86_400 - 3600
  return BigInt(Math.min(nowSec + days * 86_400, max))
}

/** Can a create with this expiry still land? (A retry hours later might not.) */
export function expiryStillValid(expiresAt: bigint, nowSec: number): boolean {
  return expiresAt >= BigInt(nowSec + BOUNDS.minDays * 86_400 + 300) && expiresAt <= BigInt(nowSec + BOUNDS.maxDays * 86_400 - 60)
}

/** The budget field: a plain decimal at the token's precision, above zero. */
export function readBudget(input: string, decimals: number): { value: bigint } | { error: string } {
  if (!input.trim()) return { error: 'Set the most it can ever use.' }
  const v = parseDecimal(input, decimals)
  if (v === null) return { error: `Use a plain number with at most ${decimals} decimals.` }
  if (v === 0n) return { error: 'The budget must be above zero.' }
  return { value: v }
}

export interface GrantParams { vDebt: Address; trigger: bigint; target: bigint; budget: bigint; tip: bigint; expiresAt: bigint }

/** A fresh 32-byte salt, so the guard's address is new and can be approved before it exists. */
export function newSalt(): Hex {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return `0x${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}` as Hex
}

/** The grant, in order: an exact allowance to the predicted guard address, then the create. */
export function grantCalls(chainId: CharterChainId, token: Address, predicted: Address, p: GrantParams, salt: Hex) {
  const factory = CHARTER_CHAINS[chainId].factory
  if (!factory) throw new Error('No Loan Guard factory on this network yet.')
  return [
    { kind: 'approve' as const, to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [predicted, p.budget] }) },
    { kind: 'create' as const, to: factory, data: encodeFunctionData({ abi: charterFactoryAbi, functionName: 'create', args: [p, salt] }) },
  ]
}

/** The quote's numbers as the framing math takes them, or null when the loan has no collateral to frame in. */
export function framingOf(q: Quote): FramingInput | null {
  const m = q.mainCollateral
  if (!m || q.noLoan) return null
  return {
    collateralUsd: BigInt(q.collateralUsd), debtUsd: BigInt(q.debtUsd),
    main: { supplied: BigInt(m.supplied), liquidationThreshold: BigInt(m.liquidationThreshold), price: BigInt(m.price), decimals: m.decimals },
  }
}

/** Dollars, "about", to the precision a person reads a price at. */
export function usd(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return 'n/a'
  const dp = n >= 1000 ? 0 : n >= 1 ? 2 : 4
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
}

/** Token amounts for people: grouped, at most two decimals (or more for dust), never in exponent form. */
export function tokens(units: bigint, decimals: number): string {
  const neg = units < 0n
  const v = neg ? -units : units
  const one = 10n ** BigInt(decimals)
  const whole = v / one
  const frac = v % one
  let dp = 2
  if (whole === 0n && frac > 0n) {
    const s = frac.toString().padStart(decimals, '0')
    dp = Math.min(decimals, s.search(/[1-9]/) + 2)
  }
  const fracStr = decimals === 0 ? '' : frac.toString().padStart(decimals, '0').slice(0, dp).replace(/0+$/, '')
  return `${neg ? '-' : ''}${whole.toLocaleString('en-US')}${fracStr ? `.${fracStr}` : ''}`
}

export const dateOf = (sec: bigint | number): string =>
  new Date(Number(sec) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/**
 * A grant that was approved but not created survives a reload, so the owner can finish it at the same address or
 * clear the allowance. Kept per chain and owner, in this browser only.
 */
export interface PendingGrant { chainId: CharterChainId; owner: Address; token: Address; symbol: string; decimals: number; predicted: Address; salt: Hex; params: { [K in keyof GrantParams]: string } & { vDebt: Address }; at: number }
const pendingKey = (chainId: number, owner: string) => `mq_charter_pending:${chainId}:${owner.toLowerCase()}`
export function savePending(p: PendingGrant): void {
  try { localStorage.setItem(pendingKey(p.chainId, p.owner), JSON.stringify(p)) } catch { /* storage off: the retry still works in this tab */ }
}
export function loadPending(chainId: number, owner: string): PendingGrant | null {
  try {
    const raw = localStorage.getItem(pendingKey(chainId, owner))
    return raw ? (JSON.parse(raw) as PendingGrant) : null
  } catch { return null }
}
export function clearPending(chainId: number, owner: string): void {
  try { localStorage.removeItem(pendingKey(chainId, owner)) } catch { /* nothing to clear */ }
}
export const paramsOf = (p: PendingGrant['params']): GrantParams => ({
  vDebt: p.vDebt, trigger: BigInt(p.trigger), target: BigInt(p.target), budget: BigInt(p.budget), tip: BigInt(p.tip), expiresAt: BigInt(p.expiresAt),
})

/**
 * Is this wallet error "the wallet cannot batch" (fall back to one prompt per step), as opposed to a refusal or a
 * failure that must stop the grant? A rejection is never a reason to try another way.
 */
export function cannotBatch(e: unknown): boolean {
  const err = e as { code?: number; cause?: { code?: number }; name?: string; message?: string; shortMessage?: string; details?: string }
  const codes = [err?.code, err?.cause?.code]
  if (codes.includes(4001)) return false
  if (codes.some((c) => c === 4200 || c === -32601 || c === -32004 || c === 5700 || c === 5710)) return true
  const text = `${err?.name ?? ''} ${err?.shortMessage ?? ''} ${err?.details ?? ''} ${err?.message ?? ''}`
  if (/user (rejected|denied)|rejected the request|cancel/i.test(text)) return false
  return /wallet_sendCalls|method not (found|supported)|not (supported|implemented)|unsupported|does not support|UnsupportedProviderMethod/i.test(text)
}

/** The sentence a person could read aloud. */
export function sentence(r: { trigger: number; target: number; budget: string; symbol: string; until: string }): string {
  return `If my loan health falls below ${fmtHealth(r.trigger)}, repay my ${r.symbol} loan back to ${fmtHealth(r.target)}, using up to ${r.budget} ${r.symbol} from my wallet, until ${r.until}.`
}
