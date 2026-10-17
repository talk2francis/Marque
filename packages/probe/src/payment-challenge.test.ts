import { describe, expect, it, vi } from 'vitest'
import { inspectPaymentChallenge, type ExpectedPaymentTerms } from './payment-challenge'
const asset = '0x1111111111111111111111111111111111111111', payTo = '0x2222222222222222222222222222222222222222'
const offer = () => ({ scheme: 'exact', network: 'eip155:56', amount: '900719925474099312345', asset, payTo, maxTimeoutSeconds: 60 })
const challenge = () => ({ x402Version: 2, resource: { url: 'https://provider.invalid/exact-service' }, accepts: [offer()] })
const capture = (c: unknown = challenge()) => ({ status: 402, headers: { 'PAYMENT-REQUIRED': btoa(JSON.stringify(c)) }, body: '' })
const expected: ExpectedPaymentTerms = { chainId: 56, asset, payTo, maxAmountRaw: offer().amount }
describe('captured payment inspection never signs or buys', () => {
  it('preserves atomic precision, all offers and unknown authentication', () => {
    const c = challenge(); c.accepts.push({ ...offer(), network: 'eip155:97', amount: '5' })
    const r = inspectPaymentChallenge(capture(c), expected)
    expect(r).toMatchObject({ schema: 'marque.payment-challenge-inspection.v1', state: 'OBSERVED', executionAllowed: false, provenance: 'CLAIMED', tokenDecimals: null, payerAuthentication: 'NOT_CHECKED', payeeAuthentication: 'NOT_CHECKED', replayProtection: 'NOT_CHECKED', idempotency: 'NOT_CHECKED', escrow: 'NOT_IMPLIED' })
    expect(r.offers).toHaveLength(2)
    expect(r.offers[0]).toMatchObject({ amountRaw: offer().amount, comparison: { state: 'MATCHED_DECLARED_TERMS_ONLY' } })
    expect(r.offers[1]).toMatchObject({ index: 1, comparison: { mismatches: ['wrong_chain'] } })
  })
  it.each(['chainId', 'asset', 'payTo', 'maxAmountRaw'] as const)('detects wrong %s against caller-reviewed terms', field => {
    const e = { ...expected, [field]: field === 'chainId' ? 97 : field === 'maxAmountRaw' ? '1' : '0x3333333333333333333333333333333333333333' }
    const r = inspectPaymentChallenge(capture(), e as ExpectedPaymentTerms)
    expect(r.offers[0]?.comparison.state).toBe('MISMATCH_OR_UNSUPPORTED')
    expect(r.executionAllowed).toBe(false)
  })
  it('accepts numeric v1 only in body and never invents a legacy network mapping', () => {
    const { amount, ...rest } = offer()
    const c = { x402Version: 1, accepts: [{ ...rest, network: 'bsc-mainnet', maxAmountRequired: amount }] }
    expect(inspectPaymentChallenge({ status: 402, headers: {}, body: JSON.stringify(c) }).offers[0]).toMatchObject({ amountRaw: amount, chainId: null, issues: ['unsupported_or_unverified_network'] })
    expect(inspectPaymentChallenge(capture(c))).toMatchObject({ state: 'UNSUPPORTED', reason: 'version_transport_mismatch' })
    expect(inspectPaymentChallenge({ status: 402, headers: {}, body: JSON.stringify(challenge()) })).toMatchObject({ state: 'UNSUPPORTED' })
  })
  it.each([null, [], { x402Version: 2 }, { ...challenge(), x402Version: '2' }, { ...challenge(), accepts: [null] }, { ...challenge(), accepts: Array.from({ length: 17 }, offer) }, { ...challenge(), resource: { url: 'file:///etc/passwd' } }])('fails closed on malformed captured shape', value => {
    expect(inspectPaymentChallenge(capture(value)).state).not.toBe('OBSERVED')
  })
  it.each(['-1', '0.1', '1e3', '001', '10 USDT', (2n ** 256n).toString()])('rejects noncanonical/unbounded atomic amount %s', amount => {
    const c = challenge(); c.accepts[0]!.amount = amount
    expect(inspectPaymentChallenge(capture(c)).state).toBe('INVALID')
  })
  it('rejects missing or contradictory amount fields', () => {
    const { amount: _amount, ...o } = offer()
    expect(inspectPaymentChallenge(capture({ ...challenge(), accepts: [o] })).reason).toBe('missing_or_conflicting_atomic_amount')
    expect(inspectPaymentChallenge(capture({ ...challenge(), accepts: [{ ...offer(), maxAmountRequired: '1' }] })).reason).toBe('missing_or_conflicting_atomic_amount')
  })
  it('does not promote unknown chain, scheme, token ticker or recipient to supported payment', () => {
    const c = challenge(); c.accepts[0] = { ...offer(), scheme: 'period', network: 'eip155:8453', asset: 'USDC', payTo: 'merchant' }
    expect(inspectPaymentChallenge(capture(c)).offers[0]?.issues).toEqual(['unsupported_or_unverified_network', 'unsupported_scheme', 'unsupported_asset_shape', 'unsupported_payee_shape'])
  })
  it('does not mistake relative payment timeout for absolute expiry or verified token metadata', () => {
    const c = { ...challenge(), accepts: [{ ...offer(), extra: { decimals: 6, name: 'USDT', assetTransferMethod: 'permit2' } }] }
    expect(inspectPaymentChallenge(capture(c))).toMatchObject({ absoluteExpiry: 'UNAVAILABLE', tokenDecimals: null, tokenSupport: 'NOT_CHECKED', offers: [{ extensionsNeedReview: true }] })
  })
  it.each([200, 404, 503])('does not turn HTTP %s into a free task or a payment challenge', status => {
    expect(inspectPaymentChallenge({ ...capture(), status })).toMatchObject({ state: 'NOT_PAYMENT_REQUIRED', offers: [], executionAllowed: false })
  })
  it('rejects ambiguous headers, conflicting body, invalid base64/UTF8 and oversized captures', () => {
    expect(inspectPaymentChallenge({ ...capture(), headers: { ...capture().headers, 'payment-required': 'other' } }).reason).toBe('duplicate_header')
    const c = challenge(); c.accepts[0]!.payTo = asset
    expect(inspectPaymentChallenge({ ...capture(), body: JSON.stringify(c) }).reason).toBe('conflicting_body_challenge')
    for (const header of ['!', '/w==', 'x'.repeat(90_001)]) expect(inspectPaymentChallenge({ status: 402, headers: { 'payment-required': header }, body: '' }).state).toBe('INVALID')
    expect(inspectPaymentChallenge({ ...capture(), body: 'x'.repeat(65_537) }).state).toBe('INVALID')
  })
  it('keeps MPP and mixed offers unsupported without selecting or replaying', () => {
    expect(inspectPaymentChallenge({ ...capture(), headers: { ...capture().headers, 'WWW-Authenticate': 'Payment intent="charge"' } }).state).toBe('UNSUPPORTED')
  })
  it('is offline and rejects invalid caller expectations', () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not fetch'))
    try {
      expect(inspectPaymentChallenge(capture(), { ...expected, maxAmountRaw: '-1' }).state).toBe('INVALID')
      const saved = capture()
      expect(inspectPaymentChallenge(saved, expected)).toEqual(inspectPaymentChallenge(saved, expected))
      expect(spy).not.toHaveBeenCalled()
    } finally { spy.mockRestore() }
  })
})
