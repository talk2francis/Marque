import { describe, expect, it } from 'vitest'
import { effectiveCategory, qualityVerdict, type QualityFacts } from './quality.js'

const W = '0x4e9C0f537cCcA8Db4BDD16FBA9Ff306F86a82505'
const NOW = Date.parse('2026-09-27T01:00:00Z')
const base: QualityFacts = {
  chainId: 97, tokenId: '2501', wallet: W, owner: W.toLowerCase(),
  proof: { owner: W, at: '2026-09-27T00:40:00Z' },
  callable: { at: '2026-09-27T00:45:00Z', endpoint: 'https://example.org/a2a', via: 'builder' },
  classified: { category: 'health_factor', confidence: 0.9, rationale: 'health factor' },
  declared: null,
  test: { at: '2026-09-27T00:50:00Z', testId: 'MCS-HF-1', wellFormed: true, pass: false, error: null },
  now: NOW,
}

describe('qualityVerdict', () => {
  it('passes all five, and a failed-but-well-formed test still counts', () => {
    const v = qualityVerdict(base)
    expect(v.qualityListing).toBe(true)
    expect(v.passed).toBe(5)
  })
  it('fails identity for another owner and leaves the proof pending', () => {
    const v = qualityVerdict({ ...base, owner: '0x0000000000000000000000000000000000000001' })
    expect(v.qualityListing).toBe(false)
    expect(v.checks[0]!.state).toBe('fail')
    expect(v.checks[0]!.fix).toMatch(/wallet that owns/)
    expect(v.checks[1]!.state).toBe('pending')
  })
  it('does not accept a proof signed by a previous owner', () => {
    const v = qualityVerdict({ ...base, proof: { owner: '0x00000000000000000000000000000000000000ff', at: '2026-09-01T00:00:00Z' } })
    expect(v.checks[1]!.state).toBe('fail')
    expect(v.checks[1]!.reason).toMatch(/previous owner/)
  })
  it('needs a callable answer inside 24 hours', () => {
    const v = qualityVerdict({ ...base, callable: { ...base.callable!, at: '2026-09-25T00:00:00Z' } })
    expect(v.checks[2]!.state).toBe('fail')
    expect(v.checks[2]!.fix).toMatch(/Probe now/)
  })
  it('flags a declared category the classifier disagrees with', () => {
    const v = qualityVerdict({ ...base, declared: 'grid' })
    expect(v.checks[3]!.state).toBe('fail')
    expect(v.checks[3]!.reason).toMatch(/reads as Health factor/)
  })
  it('accepts a declared category when the classifier has no signal, with a note', () => {
    const e = effectiveCategory({ classified: { category: 'unclassified', confidence: null, rationale: null }, declared: 'yield' })
    expect(e.category).toBe('yield')
    expect(e.flag).toMatch(/Declared by the owner/)
  })
  it('does not count a test without a gradable answer', () => {
    const v = qualityVerdict({ ...base, test: { ...base.test!, wellFormed: false, error: 'timeout' } })
    expect(v.checks[4]!.state).toBe('fail')
    expect(v.qualityListing).toBe(false)
  })
  it('reports a missing token as not existing', () => {
    const v = qualityVerdict({ ...base, owner: null })
    expect(v.checks[0]!.reason).toMatch(/No identity #2501 exists on BSC testnet/)
  })
})
