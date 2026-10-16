import { describe, expect, it } from 'vitest'
import { expireMarketQuote, type MarketRow } from './marketplace'
const now = Date.now()
const fixture = { price: '0.01 U', priceProvenance: 'MEASURED', commerce: { state: 'hireable', priceRaw: '100', token: { symbol: 'U' }, quoteExpiresAt: new Date(now + 1000).toISOString() } } as unknown as MarketRow
describe('cached ready-to-hire expiry', () => {
  it('removes the ready state and measured price when a cached quote crosses its deadline', () => {
    expect(expireMarketQuote(fixture, now)).toBe(fixture)
    expect(expireMarketQuote(fixture, now + 1000)).toMatchObject({ price: null, priceProvenance: null, commerce: { state: 'quoteable', priceRaw: null, token: null, failure: 'expired' } })
    expect(fixture.commerce.state).toBe('hireable')
  })
})
