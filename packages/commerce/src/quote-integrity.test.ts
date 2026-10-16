import { describe, expect, it } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { network } from './config'
import { negotiationHashOf } from './description'
import { verifySimpleQuote, verifyNegotiation, type Negotiation, type SimpleQuote } from './quote'

// Synthetic deterministic key only; never used for a network transaction.
const account = privateKeyToAccount(`0x${'1'.repeat(64)}`)
const other = privateKeyToAccount(`0x${'2'.repeat(64)}`)
const now = 1_790_000_000
const net = network(56)
const simple: SimpleQuote = { accepted: true, provider: account.address, price: '10', payment_token: net.assets[0]!.address, chain_id: 56, verifying_contract: net.commerce }
const ctx = { agentOwner: account.address, now }
async function signed(extra: Partial<Negotiation> = {}): Promise<Negotiation> {
  const n = { request: { task_description: 'task A' }, request_hash: `0x${'a'.repeat(64)}`, response: { accepted: true, terms: { price: '10', currency: net.assets[0]!.address }, negotiated_at: now, quote_expires_at: now + 300 }, response_hash: `0x${'b'.repeat(64)}`, negotiation_hash: `0x${'0'.repeat(64)}`, chain_id: 56, verifying_contract: net.commerce, ...extra } as Negotiation
  n.negotiation_hash = negotiationHashOf(n)
  n.provider_sig = await account.signMessage({ message: n.negotiation_hash })
  return n
}
describe('quote authority and expiry', () => {
  it.each([now - 1, now])('rejects explicit unsigned expiry %s instead of renewing it', expiry => {
    expect(verifySimpleQuote({ ...simple, quote_expires_at: expiry }, ctx)).toMatchObject({ ok: false, reason: 'expired' })
  })
  it('assigns a bounded local lifetime only when expiry is absent', () => {
    expect(verifySimpleQuote(simple, ctx)).toMatchObject({ ok: true, signed: false, expiresAt: now + 900 })
  })
  it('caps an unsigned far-future expiry and preserves a shorter one', () => {
    expect(verifySimpleQuote({ ...simple, quote_expires_at: now + 9000 }, ctx)).toMatchObject({ ok: true, expiresAt: now + 900 })
    expect(verifySimpleQuote({ ...simple, quote_expires_at: now + 10 }, ctx)).toMatchObject({ ok: true, expiresAt: now + 10 })
  })
  it.each([
    [{ chain_id: 1 }, 'chain_unsupported'],
    [{ payment_token: other.address }, 'currency_unsupported'],
    [{ provider: other.address }, 'provider_mismatch'],
    [{ verifying_contract: other.address }, 'wrong_contract'],
  ] as const)('preserves unsigned identity/network/asset/escrow checks %j', (change, reason) => {
    expect(verifySimpleQuote({ ...simple, ...change }, ctx)).toMatchObject({ ok: false, reason })
  })
  it('accepts a valid signed negotiation and rejects signer mismatch', async () => {
    const n = await signed()
    expect(await verifyNegotiation(n, ctx)).toMatchObject({ ok: true, signed: true, expiresAt: now + 300 })
    expect(await verifyNegotiation(n, { agentOwner: other.address, now })).toMatchObject({ ok: false, reason: 'provider_mismatch' })
  })
  it('rejects a conflicting top-level signed expiry', async () => {
    const n = await signed({ quote_expires_at: now - 1 })
    expect(await verifyNegotiation(n, ctx)).toMatchObject({ ok: false })
  })
  it('rejects signed replay after expiry and mutated signed terms', async () => {
    const n = await signed()
    expect(await verifyNegotiation(n, { ...ctx, now: now + 300 })).toMatchObject({ ok: false, reason: 'expired' })
    n.request.task_description = 'task B'
    expect(await verifyNegotiation(n, ctx)).toMatchObject({ ok: false, reason: 'bad_signature' })
  })
  it('rejects a signed response replayed for a different requested task', async () => {
    const n = await signed()
    expect(await verifyNegotiation(n, { ...ctx, expectedTask: 'task B' })).toMatchObject({ ok: false, reason: 'task_mismatch' })
  })
  it('preserves signed domain, chain and token enforcement', async () => {
    const n = await signed()
    expect(await verifyNegotiation({ ...n, chain_id: 1 }, ctx)).toMatchObject({ ok: false, reason: 'chain_unsupported' })
    expect(await verifyNegotiation({ ...n, verifying_contract: other.address }, ctx)).toMatchObject({ ok: false, reason: 'wrong_contract' })
    expect(await verifyNegotiation({ ...n, response: { ...n.response, terms: { ...n.response.terms, currency: other.address } } }, ctx)).toMatchObject({ ok: false, reason: 'currency_unsupported' })
  })
})
