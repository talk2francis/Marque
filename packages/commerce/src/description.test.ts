import { describe, it, expect } from 'vitest'
import { buildJobDescription as sdkBuild, buildDescriptionContent as sdkContent } from '@bnbagent/sdk/erc8183'
import { buildJobDescription, buildDescriptionContent, canonicalJson, sanitizeForClaim, negotiationHashOf, buildPlainDescription, descriptionHash } from './description.js'
import type { Negotiation } from './quote.js'

const base = {
  request: { task_description: 'Rebalance my BNB/USDT position [range ±6%]\u0007 now', terms: { deliverables: 'plan', quality_standards: 'x' } },
  request_hash: '0x' + 'a'.repeat(64),
  response: {
    accepted: true,
    terms: { deliverables: 'A plan — with "quotes" and [brackets]', quality_standards: 'tick multiples ✓', price: '150000000000000000', currency: '0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565', success_criteria: ['a [b]', 'ü'] },
    estimated_completion_seconds: 600,
    quote_expires_at: 1790402016,
    negotiated_at: 1790401116,
  },
  response_hash: '0x' + 'b'.repeat(64),
  negotiation_hash: '0x' + 'c'.repeat(64),
  provider_sig: '0x' + 'd'.repeat(130),
  chain_id: 97,
  verifying_contract: '0xa206c0517b6371c6638cd9e4a42cc9f02a33b0de',
} as unknown as Negotiation

describe('job description matches @bnbagent/sdk 0.6.0 byte for byte', () => {
  it('builds the same description as the SDK', () => {
    expect(buildJobDescription(base)).toBe(sdkBuild(base as never))
  })
  it('builds the same signed content as the SDK', () => {
    expect(canonicalJson(buildDescriptionContent(base, 97, base.verifying_contract!))).toBe(canonicalJson(sdkContent(base as never, 97, base.verifying_contract!)))
  })
  it('matches without optional fields', () => {
    const lean = { ...base, response: { accepted: true, terms: { price: '1', currency: base.response.terms!.currency } }, chain_id: undefined, verifying_contract: undefined } as unknown as Negotiation
    expect(buildJobDescription(lean)).toBe(sdkBuild(lean as never))
  })
  it('escapes non-ASCII like the SDK', () => {
    expect(canonicalJson({ b: 'é', a: [1, { d: '—', c: null }] })).toBe('{"a":[1,{"c":null,"d":"\\u2014"}],"b":"\\u00e9"}')
  })
  it('sanitizes claims', () => {
    expect(sanitizeForClaim('a[b]\u0001\tc\n')).toBe('a(b)\tc\n')
    expect(sanitizeForClaim(5)).toBe('5')
  })
  it('refuses rejected or unpriced negotiations', () => {
    expect(() => buildJobDescription({ ...base, response: { ...base.response, accepted: false } } as Negotiation)).toThrow()
    expect(() => buildJobDescription({ ...base, response: { accepted: true, terms: { currency: '0x' + '1'.repeat(40) } } } as unknown as Negotiation)).toThrow(/price/)
  })
  it('refuses a description over 4096 bytes instead of truncating', () => {
    const long = { ...base, request: { task_description: 'x'.repeat(5000) } } as unknown as Negotiation
    expect(() => buildJobDescription(long)).toThrow(/exceeds/)
  })
  it('recomputes negotiation_hash over the signed content', () => {
    expect(negotiationHashOf(base)).toMatch(/^0x[0-9a-f]{64}$/)
  })
})

describe('plain quote description', () => {
  it('names the task, price, token, provider, chain, contract and Marque intent, canonically', () => {
    const d = buildPlainDescription({ accepted: true, provider: '0x73809f69916fcf7ddc5bb1315fbdf96a569a5963', price: '100', payment_token: '0xce24439f2d9c6a2289f741120fe202248b666666', chain_id: 56, verifying_contract: '0xea4daa3100a767e86fded867729ae7446476eba6', service: 'yield_plan' }, 'Rank [Venus]', 'intent-1')
    const j = JSON.parse(d)
    expect(j).toMatchObject({ version: 1, task: 'Rank (Venus)', price: '100', chain_id: 56, marque_intent: 'intent-1', client_ref: 'marque.trade', provider: '0x73809F69916FcF7Ddc5BB1315fBdf96A569a5963' })
    expect(Object.keys(j)).toEqual([...Object.keys(j)].sort())
    expect(descriptionHash(d)).toMatch(/^0x[0-9a-f]{64}$/)
  })
})
