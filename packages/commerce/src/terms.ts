import { formatAmount } from './words.js'

/**
 * Current terms: the one answer to "what does this agent charge right now?" (AGENTS
 * invariant 41). Every surface that shows a price under a hire heading (home card,
 * marketplace row, profile rail, compare, hire sheet) reads it through `termsOf`, so two
 * places can never disagree about the same observation at the same moment.
 *
 *   fresh  a quote inside its acceptance window: show the price as current.
 *   dated  the newest successful quote has lapsed: show the price with its age and a
 *          refresh action, never as current.
 *   none   no usable price: show the reason in plain words.
 *
 * Pure and browser-safe. The server reader lives in `terms-read.ts`.
 */

export type TermsState = 'fresh' | 'dated' | 'none'

/** The commerce facts a surface already holds (a MarketRow's `commerce`, a storefront's, an API row). */
export interface CommerceFacts {
  state: string
  chainId: number | null
  priceRaw: string | null
  token: { address: string; symbol: string; decimals: number } | null
  signedQuote?: boolean | null
  signed?: boolean | null
  quotedAt: string | null
  quoteExpiresAt?: string | null
  failure: string | null
  /** The newest successful quote, kept after it lapses so it can be shown dated. */
  lastQuote?: LastQuote | null
}

export interface LastQuote {
  priceRaw: string
  token: { address: string; symbol: string; decimals: number }
  chainId: number | null
  quotedAt: string
  signed: boolean | null
}

export interface Terms {
  state: TermsState
  /** "0.10 U"; for testnet "0.10 test U". Null when state is none. */
  priceLabel: string | null
  priceRaw: string | null
  token: { address: string; symbol: string; decimals: number } | null
  chainId: number | null
  signed: boolean | null
  observedAt: string | null
  expiresAt: string | null
  /** Plain words for a none state, or why a dated price is not current. */
  reason: string | null
}

const HIREABLE = new Set(['hireable', 'settleable'])

export function priceLabel(priceRaw: string, token: { symbol: string; decimals: number }, chainId: number | null): string {
  return `${formatAmount(priceRaw, token.decimals)} ${chainId === 97 ? 'test ' : ''}${token.symbol}`
}

/** Reasons a price is missing, in the words a buyer reads. Never raw library text. */
export function reasonWords(failure: string | null): string {
  switch (failure) {
    case null: case undefined: return 'It has not quoted a price through BNB Chain escrow yet.'
    case 'expired': case 'expired_or_unproven': return 'Its last quote has lapsed.'
    case 'unreachable': case 'timeout': return 'It did not answer the last price check.'
    case 'declined': return 'It declined the last price check, usually because the task needs more detail.'
    case 'provider_mismatch': return 'Its price pays a different wallet than the one it registered.'
    case 'wrong_lane': return 'Its price is for a different network than the one it is registered on.'
    case 'currency_unsupported': return 'It quotes in a token BNB Chain escrow does not take.'
    case 'chain_unsupported': case 'wrong_contract': return 'Its quote is not for BNB Chain escrow.'
    case 'bad_signature': case 'unsigned': case 'malformed': return 'Its quote could not be verified.'
    case 'no_quote': case 'not_a2a': return 'It does not answer price requests yet.'
    default: return 'Its last price check did not pass.'
  }
}

/** The single terms function. `now` is injectable for tests and for client clocks. */
export function termsOf(c: CommerceFacts | null | undefined, now = Date.now()): Terms {
  if (!c) return { state: 'none', priceLabel: null, priceRaw: null, token: null, chainId: null, signed: null, observedAt: null, expiresAt: null, reason: reasonWords(null) }
  const signed = c.signedQuote ?? c.signed ?? null
  const exp = c.quoteExpiresAt ? Date.parse(c.quoteExpiresAt) : NaN
  if (HIREABLE.has(c.state) && c.priceRaw && c.token && Number.isFinite(exp) && exp > now) {
    return { state: 'fresh', priceLabel: priceLabel(c.priceRaw, c.token, c.chainId), priceRaw: c.priceRaw, token: c.token, chainId: c.chainId,
      signed, observedAt: c.quotedAt, expiresAt: c.quoteExpiresAt ?? null, reason: null }
  }
  const last = c.lastQuote ?? (c.priceRaw && c.token && c.quotedAt ? { priceRaw: c.priceRaw, token: c.token, chainId: c.chainId, quotedAt: c.quotedAt, signed } : null)
  if (last) {
    return { state: 'dated', priceLabel: priceLabel(last.priceRaw, last.token, last.chainId), priceRaw: last.priceRaw, token: last.token, chainId: last.chainId,
      signed: last.signed, observedAt: last.quotedAt, expiresAt: c.quoteExpiresAt ?? null, reason: reasonWords('expired') }
  }
  return { state: 'none', priceLabel: null, priceRaw: null, token: null, chainId: c.chainId, signed: null, observedAt: c.quotedAt, expiresAt: null,
    reason: reasonWords(c.failure) }
}

export { ageWords } from './words.js'

/** "valid 12 min" for a fresh quote. */
export function validForWords(expiresAt: string | null, now = Date.now()): string | null {
  if (!expiresAt) return null
  const s = Math.round((Date.parse(expiresAt) - now) / 1000)
  if (!Number.isFinite(s) || s <= 0) return null
  return s < 90 ? `valid ${s} s` : `valid ${Math.round(s / 60)} min`
}

/** Milliseconds until a fresh price lapses (for a client timer), or null. */
export function msUntilLapse(t: Terms, now = Date.now()): number | null {
  if (t.state !== 'fresh' || !t.expiresAt) return null
  return Math.max(0, Date.parse(t.expiresAt) - now)
}
