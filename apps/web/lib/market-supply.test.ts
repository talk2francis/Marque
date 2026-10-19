import { describe, expect, it } from 'vitest'
import type { MarketRow } from './marketplace'
import { marketSupply } from './market-supply'

const now = 1_800_000_000_000
function row(id: number, category = 'yield', overrides: Partial<MarketRow> = {}): MarketRow {
  return {
    agentId: `synthetic:${id}`, tokenId: String(id), name: 'Synthetic fixture', category, isReference: false,
    identityCount: 1, owner: `owner:${id}`, ownerLabel: null, host: 'fixture.invalid',
    identity: { imageUrl: null, description: null, contractAddress: null, website: null, x402: false, registeredAt: null },
    liveness: 'live', latencyMs: null, interfaces: ['a2a'], protocols: [], price: null, priceProvenance: null,
    commerce: { state: 'hireable', serviceId: id, chainId: 56, provider: null, priceRaw: String(id),
      token: { address: '0x0000000000000000000000000000000000000001', symbol: 'U', decimals: 18 },
      signedQuote: false, quotedAt: new Date(now - 1_000).toISOString(), quoteExpiresAt: new Date(now + 60_000).toISOString(), deliveredJobs: 0, failure: null },
    warrant: { status: 'untested', testId: null, date: null, failedField: null }, qual: 'callable', previewable: false, hireBlockedReason: null,
    track: null as unknown as MarketRow['track'], ...overrides,
  }
}
describe('one complete marketplace supply snapshot', () => {
  it('counts the full set beyond the display page size', () => {
    const rows = Array.from({ length: 350 }, (_, i) => row(i + 1))
    expect(marketSupply(rows, now).find(c => c.category === 'yield')?.hireable).toBe(350)
    expect(rows).toHaveLength(350)
  })
  it('keeps all four categories explicit, including measured empty supply', () => {
    expect(marketSupply([row(1, 'grid')], now).map(c => [c.category, c.hireable])).toEqual([
      ['yield', 0], ['grid', 1], ['rebalancing', 0], ['health_factor', 0], ['security', 0],
    ])
  })
  it('does not count expired terms, unavailable supply or missing expiry', () => {
    const expired = row(2); expired.commerce.quoteExpiresAt = new Date(now).toISOString()
    const unavailable = row(3); unavailable.commerce.state = 'quoteable'
    const unknown = row(4); unknown.commerce.quoteExpiresAt = null
    expect(marketSupply([row(1), expired, unavailable, unknown], now)[0]?.hireable).toBe(1)
  })
  it('groups recorded owners without claiming separate people or funding', () => {
    const rows = [row(1, 'yield', { owner: 'OWNER', isReference: true }), row(2, 'yield', { owner: 'owner' }), row(3, 'yield', { owner: null }), row(4, 'yield', { owner: null })]
    expect(marketSupply(rows, now)[0]).toMatchObject({ hireable: 4, operators: 3, thirdPartyOperators: 3, firstParty: 1 })
  })
  it('compares atomic amounts only within the same chain, token and decimals', () => {
    const one = row(1), two = row(2)
    expect(marketSupply([two, one], now)[0]?.cheapest?.agentKey).toBe(one.agentId)
    for (const token of [{ ...two.commerce.token!, address: '0x0000000000000000000000000000000000000002' }, { ...two.commerce.token!, decimals: 6 }]) {
      expect(marketSupply([one, { ...two, commerce: { ...two.commerce, token } }], now)[0]?.cheapest).toBeNull()
    }
    expect(marketSupply([one, { ...two, commerce: { ...two.commerce, chainId: 97 } }], now)[0]?.cheapest).toBeNull()
  })
})
