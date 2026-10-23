import { describe, expect, it } from 'vitest'
import { ageWords, priceLabel, termsOf, validForWords, type CommerceFacts } from './terms.js'

const U = { address: '0xcE24439F2D9C6a2289F741120FE202248B666666', symbol: 'U', decimals: 18 }
const now = Date.parse('2026-10-23T12:00:00Z')
const base = (over: Partial<CommerceFacts> = {}): CommerceFacts => ({
  state: 'hireable', chainId: 56, priceRaw: '100000000000000000', token: U, signedQuote: true,
  quotedAt: '2026-10-23T11:55:00Z', quoteExpiresAt: '2026-10-23T12:07:00Z', failure: null, ...over,
})

describe('termsOf (invariant 41)', () => {
  it('a quote inside its window is fresh, with its price', () => {
    const t = termsOf(base(), now)
    expect(t).toMatchObject({ state: 'fresh', priceLabel: '0.10 U', signed: true, reason: null })
  })
  it('a lapsed quote is dated, never current, and keeps its price and age', () => {
    const t = termsOf(base({ quoteExpiresAt: '2026-10-23T11:59:59Z' }), now)
    expect(t.state).toBe('dated')
    expect(t.priceLabel).toBe('0.10 U')
    expect(t.observedAt).toBe('2026-10-23T11:55:00Z')
    expect(t.reason).toMatch(/lapsed/)
  })
  it('a catalog row whose price was cleared still shows dated from its last quote', () => {
    const t = termsOf(base({ state: 'quoteable', priceRaw: null, token: null, failure: 'expired', lastQuote: { priceRaw: '50000000000000000', token: U, chainId: 56, quotedAt: '2026-10-23T11:30:00Z', signed: true } }), now)
    expect(t).toMatchObject({ state: 'dated', priceLabel: '0.05 U', observedAt: '2026-10-23T11:30:00Z' })
  })
  it('an agent that never priced reads none, with plain words', () => {
    const t = termsOf(base({ state: 'unavailable', priceRaw: null, token: null, quotedAt: null, failure: 'no_quote' }), now)
    expect(t.state).toBe('none')
    expect(t.priceLabel).toBeNull()
    expect(t.reason).toBe('It does not answer price requests yet.')
  })
  it('a wrong-wallet quote is none and says why, even with a stored price', () => {
    const t = termsOf(base({ state: 'quoteable', token: null, failure: 'provider_mismatch' }), now)
    expect(t.state).toBe('none')
    expect(t.reason).toMatch(/different wallet/)
  })
  it('a missing expiry is never fresh', () => {
    expect(termsOf(base({ quoteExpiresAt: null }), now).state).toBe('dated')
  })
  it('testnet prices say test', () => {
    expect(priceLabel('100000000000000000', U, 97)).toBe('0.10 test U')
    expect(termsOf(base({ chainId: 97 }), now).priceLabel).toBe('0.10 test U')
  })
  it('null facts read none', () => {
    expect(termsOf(null, now).state).toBe('none')
  })
})

describe('words', () => {
  it('ages and validity read plainly', () => {
    expect(ageWords('2026-10-23T11:59:30Z', now)).toBe('just now')
    expect(ageWords('2026-10-23T11:42:00Z', now)).toBe('18 min ago')
    expect(validForWords('2026-10-23T12:12:00Z', now)).toBe('valid 12 min')
    expect(validForWords('2026-10-23T11:00:00Z', now)).toBeNull()
  })
})
