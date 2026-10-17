import { describe, expect, it } from 'vitest'
import { network } from '@marque/commerce'
import { machineCatalog } from './machine-catalog'
import type { MarketRow } from './marketplace'

// Only fields read by this pure projection; deliberately synthetic, never served.
const now = Date.parse('2026-10-17T00:00:00Z')
function fixture() {
  const asset = network(56).assets[0]!
  return { agentId: `56:${network(56).identityRegistry}:123`, name: 'Synthetic projection test', category: 'grid', isReference: false, identityCount: 2, owner: '0x1111111111111111111111111111111111111111', interfaces: ['a2a'], protocols: ['x402'], liveness: 'alive', latencyMs: 100, warrant: { status: 'warranted', testId: 'MCS-GRID-1', date: new Date(now - 1000).toISOString() }, commerce: { state: 'hireable', serviceId: 42, chainId: 56, provider: '0x1111111111111111111111111111111111111111', priceRaw: '100', token: asset, signedQuote: false, sourceClaimVersion: 1, signatureEvidence: 'identity_matched_unsigned', quotedAt: new Date(now).toISOString(), quoteExpiresAt: new Date(now + 10_000).toISOString(), failure: null } } as MarketRow
}
const project = (row = fixture(), generatedAt = new Date(now).toISOString()) => machineCatalog({ rows: [row], generatedAt, total: 2, offset: 0, hasMore: true }, 1, now)
describe('machine projection preserves observation limits', () => {
  it('retains exact identity/service, pagination and independent unknowns', () => {
    const r = project()
    expect(r.page).toMatchObject({ count: 1, total: 2, nextOffset: 1, population: 'FILTERED_DEDUPLICATED_MARKETPLACE_ENTRIES' })
    expect(r.agents[0]).toMatchObject({ identity: { chainId: 56, tokenId: '123', registrationIsQualityProof: false }, selectedService: { serviceId: 42, exactTaskSupport: 'UNKNOWN_REQUEST_EXACT_TASK_QUOTE' }, ownership: { humanAndFundingIndependence: 'UNKNOWN' }, conformance: { state: 'IDENTITY_TEST_PASSED', exactServiceBinding: 'UNKNOWN', paymentProof: 'NOT_IMPLIED' }, payableRails: { x402: { discovered: true, buyerSupport: 'UNSUPPORTED' } } })
    expect(r.agents[0]!.price).toMatchObject({ state: 'CURRENT', amountRaw: '100', quoteMode: 'identity_matched_unsigned' })
    expect(r.cacheMaxAgeSeconds).toBe(10)
  })
  it.each(['expired', 'noExpiry', 'longExpiry', 'badAsset', 'badDecimals', 'futureObservation'])('does not promote %s price', kind => {
    const row = fixture()
    if (kind === 'expired') row.commerce.quoteExpiresAt = new Date(now - 1).toISOString()
    if (kind === 'noExpiry') row.commerce.quoteExpiresAt = null
    if (kind === 'longExpiry') row.commerce.quoteExpiresAt = new Date(now + 901_000).toISOString()
    if (kind === 'badAsset') row.commerce.token = { ...row.commerce.token!, address: row.owner! }
    if (kind === 'badDecimals') row.commerce.token = { ...row.commerce.token!, decimals: 2 }
    if (kind === 'futureObservation') row.commerce.quotedAt = new Date(now + 31_000).toISOString()
    const r = project(row).agents[0]!
    expect(r.price.state).not.toBe('CURRENT'); expect(r.price.amountRaw).toBeNull(); expect(r.price.token).toBeNull()
    expect(r.payableRails.erc8183.state).toBe('UNAVAILABLE')
  })
  it('separates identity chain from commerce chain', () => {
    const row = fixture(); row.commerce.chainId = 97; row.commerce.token = network(97).assets[0]!
    expect(project(row).agents[0]).toMatchObject({ identity: { chainId: 56 }, selectedService: { chainId: 97 }, price: { chainId: 97 } })
  })
  it('never exports arbitrary failure text, and does not infer signed mode', () => {
    const row = fixture(); row.commerce.failure = 'PRIVATE_URL https://secret.invalid'; row.commerce.signedQuote = true
    const r = project(row).agents[0]!
    expect(r.payableRails.erc8183.failure).toBeNull(); expect(r.price.quoteMode).toBe('unknown')
    expect(JSON.stringify(r)).not.toContain('secret.invalid')
  })
  it.each(['unknown', 'old', 'future'])('disables caching for %s projection time', kind => {
    const date = kind === 'unknown' ? 'unknown' : new Date(now + (kind === 'old' ? -180_001 : 1000)).toISOString()
    expect(project(fixture(), date)).toMatchObject({ stale: true, cacheMaxAgeSeconds: 0 })
  })
})
