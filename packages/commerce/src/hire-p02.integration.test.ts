import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db, closeDb, commerceQuote } from '@marque/db'
import { network } from './config'
const state = vi.hoisted(() => ({ seller: {} as Record<string, unknown>, owner: '0x1111111111111111111111111111111111111111', unavailable: false }))
vi.mock('./supply', async original => ({ ...await original<object>(), sellerCandidates: async () => [state.seller] }))
vi.mock('./chain', async original => ({ ...await original<object>(), sellerIdentity: async () => { if (state.unavailable) throw Error('offline'); return { agentOwner: state.owner, agentWallet: null, blockNumber: '123' } }, disputeWindowSeconds: async () => 900 }))
import { createIntent, agentForSheet, sellerFor } from './hire'
const url = process.env['MARQUE_INTEGRATION_DB']
const enabled = !!url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1))
const buyer = '0x2222222222222222222222222222222222222222'
const provider = '0x1111111111111111111111111111111111111111'
const net = network(56)
const token = 'ab'.repeat(32)
let serial = Date.now()
const rows = (r: unknown) => r as Array<Record<string, unknown>>
describe.skipIf(!enabled)('P02 intent boundary, synthetic actors and real fixture PostgreSQL', () => {
  beforeAll(() => { process.env['DATABASE_URL'] = url })
  afterAll(async () => { await closeDb() })
  beforeEach(() => { state.owner = provider; state.unavailable = false })
  async function fixture(access = true) {
    const tokenId = String(++serial), agentId = `56:${net.identityRegistry.toLowerCase()}:${tokenId}`
    state.seller = { agentId, serviceId: 42, chainId: 56, tokenId, endpoint: 'https://example.org/a2a', owner: provider, agentWallet: provider, name: 'synthetic outside seller', category: 'yield', firstParty: null }
    await db().execute(sql`insert into agent(id,chain_id,contract_address,token_id,name) values (${agentId},56,${net.identityRegistry},${tokenId},'synthetic outside seller')`)
    const expires = Math.floor(Date.now() / 1000) + 600
    const [quote] = await db().insert(commerceQuote).values({ source: 'user', agentId, serviceId: 42, endpoint: String(state.seller.endpoint), ok: true, signed: false, chainId: 56, provider, priceRaw: '10', token: net.assets[0]!.address, tokenSymbol: net.assets[0]!.symbol, tokenDecimals: net.assets[0]!.decimals, quoteExpiresAt: new Date(expires * 1000), raw: { accepted: true, provider, price: '10', chain_id: 56, verifying_contract: net.commerce, payment_token: net.assets[0]!.address, quote_expires_at: expires, _marque_task: 'synthetic task only', ...(access ? { _marque_access: { version: 2, tokenHash: createHash('sha256').update(token).digest('hex') } } : {}) } }).returning()
    return { wallet: buyer, quoteId: quote!.id, quoteAccessToken: token }
  }
  it('serializes concurrent retries into one durable intent and byte-identical create call', async () => {
    const f = await fixture()
    const answers = await Promise.all([createIntent(f), createIntent(f), createIntent(f)])
    expect(answers[1]).toEqual(answers[0]); expect(answers[2]).toEqual(answers[0])
    expect(rows(await db().execute(sql`select id from hire_intent where quote_id=${f.quoteId}`))).toHaveLength(1)
    expect(answers[0]!.createJob.args[0]!.toLowerCase()).toBe(provider)
  })
  it('blocks missing or incorrect access capability before exposing task or writing an intent', async () => {
    const f = await fixture()
    for (const quoteAccessToken of [undefined, 'ff'.repeat(32)]) await expect(createIntent({ ...f, quoteAccessToken })).rejects.toMatchObject({ code: 'quote_access', status: 403 })
    expect(rows(await db().execute(sql`select id from hire_intent where quote_id=${f.quoteId}`))).toHaveLength(0)
  })
  it('retains the legacy contract for unversioned quotes', async () => { const f = await fixture(false); expect((await createIntent({ wallet: f.wallet, quoteId: f.quoteId })).intentId).toBeTruthy() })
  it('rejects indexed owner evidence after a real-time owner transfer', async () => {
    const f = await fixture(); state.owner = buyer
    await expect(createIntent(f)).rejects.toMatchObject({ code: 'quote_provider_mismatch' })
    expect(rows(await db().execute(sql`select id from hire_intent where quote_id=${f.quoteId}`))).toHaveLength(0)
  })
  it('fails closed on unavailable chain identity without an indexed fallback', async () => {
    const f = await fixture(); state.unavailable = true
    await expect(createIntent(f)).rejects.toMatchObject({ code: 'identity_unavailable', status: 503 })
  })
  it('never substitutes another service, including the metadata path', async () => {
    const f = await fixture()
    await expect(sellerFor(String(state.seller.agentId), 43)).rejects.toMatchObject({ code: 'not_a_seller' })
    await expect(agentForSheet(String(state.seller.agentId), 43)).rejects.toMatchObject({ code: 'not_a_seller' })
    state.seller.endpoint = 'https://different.example/a2a'
    await expect(createIntent(f)).rejects.toMatchObject({ code: 'service_changed' })
  })
  it('refuses another create call for a bound intent', async () => {
    const f = await fixture(); const intent = await createIntent(f)
    await db().execute(sql`update hire_intent set job_id=${String(++serial)}, state='bound' where id=${intent.intentId}`)
    await expect(createIntent(f)).rejects.toMatchObject({ code: 'intent_already_bound', status: 409 })
  })
  it('does not revive a stored expired quote on retry', async () => {
    const f = await fixture(); await createIntent(f)
    await db().execute(sql`update commerce_quote set quote_expires_at=now()-interval '1 second' where id=${f.quoteId}`)
    await expect(createIntent(f)).rejects.toMatchObject({ code: 'quote_expired' })
    expect(rows(await db().execute(sql`select id from hire_intent where quote_id=${f.quoteId}`))).toHaveLength(1)
  })
})
