/* eslint-disable @typescript-eslint/no-explicit-any -- recorded JSON fixtures are walked by shape in these tests */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import fixtures from './__fixtures__/quotes-v4.json'

/** Every adapter, six ways (SPEC-SUPPLY 3 rule 6), against responses recorded from real agents. */
let reply: { ok: true; status: number; body: string } | { ok: false; failure: string; detail: string } = { ok: true, status: 200, body: '{}' }
vi.mock('@marque/probe', () => ({
  safeFetch: vi.fn(async () => (reply.ok ? { ok: true, status: reply.status, headers: {}, body: reply.body, bytes: reply.body.length, latencyMs: 5, finalUrl: 'https://agent.example/a2a', redirects: 0 } : { ok: false, failure: reply.failure, detail: reply.detail, latencyMs: 10_000 })),
}))
const { requestQuote, plainDeclineOf } = await import('./quote.js')

const task = fixtures.task as { task_description: string; terms: { deliverables: string; quality_standards: string } }
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const respond = (body: unknown) => { reply = { ok: true, status: 200, body: JSON.stringify(body) } }
const OTHER = '0x1111111111111111111111111111111111111111'

describe('adapter bnb-sdk-negotiate (signed NegotiationResult)', () => {
  const base = fixtures.sdkNegotiate
  const task = (fixtures.sdkNegotiate as any).task as typeof fixtures.task
  const neg = () => (base.response as any).result.parts[0].data
  const now = () => (neg().negotiated_at ?? neg().response.negotiated_at) + 5
  beforeEach(() => respond(base.response))
  it('recorded real response: verified, signed by the registered wallet, task bound', async () => {
    const q = await requestQuote('https://agent.example/a2a', task, { agentWallet: base.agentWallet, now: now() })
    expect(q).toMatchObject({ ok: true, signed: true, protocol: 'bnb-sdk-negotiate', chainId: 56, signatureEvidence: 'provider_signed' })
    expect(q.ok && q.provider.toLowerCase()).toBe(base.agentWallet)
  })
  it('forged terms: a changed price no longer matches the signed hash', async () => {
    const r = clone(base.response) as any; r.result.parts[0].data.response.terms.price = '1'
    respond(r)
    expect(await requestQuote('https://agent.example/a2a', task, { agentWallet: base.agentWallet, now: now() })).toMatchObject({ ok: false, reason: 'bad_signature' })
  })
  it('forged signature: the same hash signed by another key', async () => {
    const r = clone(base.response) as any
    r.result.parts[0].data.provider_sig = await privateKeyToAccount(generatePrivateKey()).signMessage({ message: r.result.parts[0].data.negotiation_hash })
    respond(r)
    expect(await requestQuote('https://agent.example/a2a', task, { agentWallet: base.agentWallet, now: now() })).toMatchObject({ ok: false, reason: 'provider_mismatch' })
  })
  it('wrong provider: the registered wallet is someone else', async () => {
    expect(await requestQuote('https://agent.example/a2a', task, { agentWallet: OTHER, agentOwner: OTHER, now: now() })).toMatchObject({ ok: false, reason: 'provider_mismatch' })
  })
  it('wrong provider, recorded: an envelope without request/response hashes, signed by a key that is neither the registered wallet nor the owner', async () => {
    const w = fixtures.sdkWrongSigner as any
    respond(w.response)
    const n = w.response.result.parts[0].data
    const q = await requestQuote('https://agent.example/a2a', fixtures.task, { agentWallet: w.agentWallet, agentOwner: w.agentWallet, now: n.negotiated_at + 5 })
    expect(q).toMatchObject({ ok: false, reason: 'provider_mismatch', protocol: 'bnb-sdk-negotiate' })
  })
  it('wrong token: a currency outside the catalog', async () => {
    const r = clone(base.response) as any; r.result.parts[0].data.response.terms.currency = OTHER
    respond(r)
    expect(await requestQuote('https://agent.example/a2a', task, { agentWallet: base.agentWallet, now: now() })).toMatchObject({ ok: false, reason: 'currency_unsupported' })
  })
  it('expired quote', async () => {
    expect(await requestQuote('https://agent.example/a2a', task, { agentWallet: base.agentWallet, now: (neg().quote_expires_at ?? neg().response.quote_expires_at) + 1 })).toMatchObject({ ok: false, reason: 'expired' })
  })
  it('a quote for a different task is refused', async () => {
    expect(await requestQuote('https://agent.example/a2a', { ...task, task_description: 'something else' }, { agentWallet: base.agentWallet, now: now() })).toMatchObject({ ok: false, reason: 'task_mismatch' })
  })
  it('timeout', async () => {
    reply = { ok: false, failure: 'timeout', detail: 'no answer in 8000 ms' }
    expect(await requestQuote('https://agent.example/a2a', task, { agentWallet: base.agentWallet })).toMatchObject({ ok: false, reason: 'unreachable' })
  })
})

describe('adapter simple-quote (identity-checked plain quote)', () => {
  const base = fixtures.simpleQuote
  beforeEach(() => respond(base.response))
  it('recorded real response: verified as identity checked, never shown as signed', async () => {
    const q = await requestQuote('https://agent.example/a2a', task, { agentWallet: base.agentWallet })
    expect(q).toMatchObject({ ok: true, signed: false, protocol: 'simple-quote', signatureEvidence: 'identity_matched_unsigned', chainId: 56 })
  })
  it('forged signature: a provider_sig field does not upgrade a plain quote to signed', async () => {
    const r = clone(base.response) as any; r.result.provider_sig = '0x' + 'ab'.repeat(65)
    respond(r)
    expect(await requestQuote('https://agent.example/a2a', task, { agentWallet: base.agentWallet })).toMatchObject({ ok: true, signed: false })
  })
  it('wrong provider: the price pays a different wallet than the one registered', async () => {
    expect(await requestQuote('https://agent.example/a2a', task, { agentWallet: OTHER })).toMatchObject({ ok: false, reason: 'provider_mismatch' })
  })
  it('wrong token', async () => {
    const r = clone(base.response) as any; r.result.payment_token = OTHER; for (const p of r.result.parts ?? []) if (p.data) p.data.payment_token = OTHER
    respond(r)
    expect(await requestQuote('https://agent.example/a2a', task, { agentWallet: base.agentWallet })).toMatchObject({ ok: false, reason: 'currency_unsupported' })
  })
  it('expired quote', async () => {
    const r = clone(base.response) as any; r.result.quote_expires_at = 1_000_000; for (const p of r.result.parts ?? []) if (p.data) p.data.quote_expires_at = 1_000_000
    respond(r)
    expect(await requestQuote('https://agent.example/a2a', task, { agentWallet: base.agentWallet })).toMatchObject({ ok: false, reason: 'expired' })
  })
  it('timeout', async () => {
    reply = { ok: false, failure: 'timeout', detail: 'no answer' }
    expect(await requestQuote('https://agent.example/a2a', task, { agentWallet: base.agentWallet })).toMatchObject({ ok: false, reason: 'unreachable' })
  })
})

describe('plain refusals are declines with the agent’s own words', () => {
  it('recorded {accepted:false, reason, need}', async () => {
    respond(fixtures.plainDecline.response)
    const q = await requestQuote('https://agent.example/a2a', task, {})
    expect(q).toMatchObject({ ok: false, reason: 'declined' })
    expect(!q.ok && q.detail).toMatch(/names no amount and stablecoin\. Say how much/)
    expect(plainDeclineOf({ a: { accepted: true } })).toBeNull()
  })
})
