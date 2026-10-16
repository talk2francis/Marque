import { describe, expect, it } from 'vitest'
import vectors from './receipt-vectors.fixture.json'
import { canonicalise, receiptHash, sealedCallHash, type Receipt } from './receipt'
import { RECEIPT_DIGEST_CONTRACT, verifyReceiptIntegrity } from './receipt-integrity'

const receipt = () => structuredClone(vectors[1]!.receipt) as Receipt
const digest = (body: unknown) => receiptHash(body as Receipt)

describe('historical receipt digest contract (synthetic vectors)', () => {
  it.each(vectors)('replays frozen version $receipt.version bytes and SHA-256', (vector) => {
    const body = vector.receipt as Receipt
    expect(canonicalise(body)).toBe(vector.canonical)
    expect(receiptHash(body)).toBe(vector.hash)
    expect(verifyReceiptIntegrity(JSON.parse(JSON.stringify(body)), vector.hash)).toEqual({ status: 'MATCH', computedHash: vector.hash })
  })
  it('declares the existing non-JCS algorithm without adding a new prefix', () => {
    expect(RECEIPT_DIGEST_CONTRACT).toMatchObject({ algorithm: 'SHA-256', canonicalization: 'marque-sorted-json-v1', domainPrefix: '', unicodeNormalization: 'none' })
  })
  it('preserves nested object ordering independence and array order sensitivity', () => {
    const body = receipt()
    const reordered = JSON.parse(JSON.stringify(body), (_key, value: unknown) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) return Object.fromEntries(Object.entries(value).reverse())
      return value
    })
    expect(digest(reordered)).toBe(digest(body))
    ;(reordered.agentResponse.values as number[]).reverse()
    expect(verifyReceiptIntegrity(reordered, digest(body)).status).toBe('MISMATCH')
  })
  it('detects one-byte mutations and covers unknown optional fields', () => {
    const body = receipt()
    const hash = digest(body)
    body.runId += '!'
    expect(verifyReceiptIntegrity(body, hash).status).toBe('MISMATCH')
    const extended = { ...receipt(), extra: { rawAmount: '9007199254740993123456789' } }
    expect(verifyReceiptIntegrity(extended, digest(extended)).status).toBe('MATCH')
    extended.extra.rawAmount = '9007199254740993123456788'
    expect(verifyReceiptIntegrity(extended, digest(receipt())).status).toBe('MISMATCH')
  })
  it('does not normalize Unicode or lose raw decimal strings', () => {
    const body = receipt()
    body.agentResponse = { text: 'é', amountRaw: '9007199254740993123456789' }
    const bytes = canonicalise(body)
    expect(bytes).toContain('9007199254740993123456789')
    expect(bytes).toContain('é')
    const hash = digest(body)
    body.agentResponse = { text: 'e\u0301', amountRaw: '9007199254740993123456789' }
    expect(digest(body)).not.toBe(hash)
  })
  it('freezes JavaScript integer-key ordering, negative zero and JSON escaping', () => {
    const body = receipt()
    body.agentResponse = { '10': '<>&\n', '2': -0 }
    expect(canonicalise(body)).toContain('"agentResponse":{"2":0,"10":"<>&\\n"}')
    expect(verifyReceiptIntegrity(body, digest(body)).status).toBe('MATCH')
  })
  it('keeps __proto__ as content without mutating prototypes', () => {
    const body = receipt()
    body.agentResponse = JSON.parse('{"__proto__":{"polluted":true},"safe":1}')
    expect(canonicalise(body)).toContain('"__proto__":{"polluted":true}')
    expect(verifyReceiptIntegrity(body, digest(body)).status).toBe('MATCH')
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
  })
  it('freezes sealed-call SHA-256 separately from a receipt', () => {
    expect(sealedCallHash({ recommendation: { b: 2, a: 1 }, blockNumber: '100', agentId: 'synthetic:1', timestamp: '2026-01-01T00:00:00.000Z' }))
      .toBe('0xcf60e2e365baf793caea1df5e9e7a0735661c28df9cf61055542d241013fc9d9')
  })
})

describe('offline verification fails safely', () => {
  it.each(['0', '3', 1, null])('refuses unsupported version %s', (version) => {
    expect(verifyReceiptIntegrity({ ...receipt(), version }, '0x' + '0'.repeat(64)).status).toBe('UNSUPPORTED_VERSION')
  })
  it.each([null, [], {}, { ...receipt(), version: undefined }, { version: '2' }, { ...receipt(), execution: null }])('rejects malformed shape %#', (body) => {
    expect(verifyReceiptIntegrity(body, '0x' + '0'.repeat(64)).status).not.toBe('MATCH')
  })
  it.each(['sha256:x', '0x1', null, 3])('rejects malformed digest %s', (hash) => {
    expect(verifyReceiptIntegrity(receipt(), hash)).toEqual({ status: 'INVALID_HASH', computedHash: null })
  })
  it('rejects lossy and executable values rather than invoking or coercing them', () => {
    for (const value of [1n, NaN, Infinity, undefined, new Date(), { toJSON() { throw Error('must not call') } }, Object.defineProperty({}, 'x', { enumerable: true, get() { throw Error('must not call') } })]) {
      expect(verifyReceiptIntegrity({ ...receipt(), agentResponse: value }, '0x' + '0'.repeat(64)).status).toBe('INVALID_RECEIPT')
    }
    const cyclic: Record<string, unknown> = {}; cyclic['self'] = cyclic
    expect(verifyReceiptIntegrity({ ...receipt(), agentResponse: cyclic }, '0x' + '0'.repeat(64)).status).toBe('INVALID_RECEIPT')
  })
  it('bounds recursion, nodes and serialized bytes', () => {
    let deep: unknown = null
    for (let i = 0; i < 66; i++) deep = { nested: deep }
    expect(verifyReceiptIntegrity({ ...receipt(), agentResponse: deep }, '0x' + '0'.repeat(64)).status).toBe('INVALID_RECEIPT')
    expect(verifyReceiptIntegrity({ ...receipt(), agentResponse: Array(100_001).fill(0) }, '0x' + '0'.repeat(64)).status).toBe('INVALID_RECEIPT')
    expect(verifyReceiptIntegrity({ ...receipt(), agentResponse: 'x'.repeat(2 * 1024 * 1024) }, '0x' + '0'.repeat(64)).status).toBe('LIMIT_EXCEEDED')
  })
  it('rejects aggregate string/key bytes before repeated strings can expand during serialization', () => {
    const large = 'x'.repeat(1024 * 1024)
    expect(verifyReceiptIntegrity({ ...receipt(), agentResponse: [large, large, large] }, '0x' + '0'.repeat(64))).toEqual({ status: 'LIMIT_EXCEEDED', computedHash: null })
    expect(verifyReceiptIntegrity({ ...receipt(), agentResponse: { [large]: large } }, '0x' + '0'.repeat(64)).status).toBe('LIMIT_EXCEEDED')
  })
})
