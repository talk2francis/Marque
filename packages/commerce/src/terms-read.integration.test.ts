import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { network } from './config'
import { currentTermsMany } from './terms-read'
const url = process.env.MARQUE_INTEGRATION_DB
const enabled = Boolean(url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1)))
const prefix = BigInt(`0x${randomBytes(5).toString('hex')}`) + 970000000000n
const agent = (offset: number) => `56:${network(56).identityRegistry.toLowerCase()}:${prefix + BigInt(offset)}`
const service = 1500000000 + Number(prefix % 100000000n)
const provider = '0x' + '7'.repeat(40)
const now = Date.now(), time = (offset: number) => new Date(now + offset).toISOString()
async function quote(id: string, sid: number | null, price: string, options: { created?: number; expires?: number; ok?: boolean; chain?: number } = {}) {
  const rows = await db().execute(sql`insert into commerce_quote(source,agent_id,service_id,endpoint,ok,failure,chain_id,provider,price_raw,token,token_symbol,token_decimals,quote_expires_at,negotiation_hash,provider_sig,signed,created_at)
    values ('probe',${id},${sid},'https://fixture.invalid/card',${options.ok ?? true},${options.ok === false ? 'timeout' : null},${options.chain ?? 56},${provider},${price},${network(56).kernelToken},'U',18,${time(options.expires ?? 600000)}::timestamptz,${'0x'+'1'.repeat(64)},${'0x'+'2'.repeat(130)},true,${time(options.created ?? -10000)}::timestamptz) returning id`)
  return Number((rows as Array<{ id: number }>)[0]!.id)
}
describe.skipIf(!enabled)('current price selection in an isolated quote-history database', () => {
  beforeAll(() => { process.env.DATABASE_URL = url })
  afterAll(async () => { await closeDb() })
  it('keeps a newer failed service observation ahead of an older successful price', async () => {
    const id = agent(1)
    await quote(id, service + 1, '100', { created: -20000 })
    await quote(id, service + 1, '200', { created: -10000, ok: false })
    const value = (await currentTermsMany([id], now)).get(id)!
    expect(value.commerce?.failure).toBe('timeout')
    expect(value.commerce?.lastQuote?.priceRaw).toBe('100')
    expect(value.terms.state).not.toBe('fresh')
  })
  it('uses the higher row id for observations with identical timestamps', async () => {
    const id = agent(2)
    await quote(id, service + 2, '100')
    await quote(id, service + 2, '200')
    const value = (await currentTermsMany([id], now)).get(id)!
    expect(value.commerce?.priceRaw).toBe('200')
    expect(value.commerce?.lastQuote?.priceRaw).toBe('200')
    expect(value.terms.state).toBe('fresh')
  })
  it('keeps service-less successful history and excludes wrong-network and old quotes', async () => {
    const id = agent(3)
    await quote(id, null, '111', { created: -8*86400000 })
    await quote(id, null, '333', { created: -20000 })
    await quote(id, service + 3, '999', { created: -10000, chain: 97 })
    expect((await currentTermsMany([id], now)).get(id)?.commerce?.lastQuote).toMatchObject({ priceRaw: '333', chainId: 56 })
    const old = agent(4)
    await quote(old, service + 4, '444', { created: -8*86400000 })
    expect((await currentTermsMany([old], now)).get(old)).toMatchObject({ serviceId: null, commerce: null, terms: { state: 'none' } })
  })
  it('preserves global service selection even if retained observations lack a derived service row', async () => {
    const first = agent(5), second = agent(6)
    await quote(first, service + 5, '100', { created: -20000 })
    await quote(second, service + 5, '200', { created: -10000 })
    const result = await currentTermsMany([first, second], now)
    expect(result.get(first)?.serviceId).toBe(null)
    expect(result.get(second)?.serviceId).toBe(service + 5)
    expect(result.get(second)?.commerce?.priceRaw).toBe('200')
  })
  it('re-evaluates expiry for each caller and sees new observations after a completed read', async () => {
    const id = agent(7)
    await quote(id, service + 7, '100')
    const [fresh, dated] = await Promise.all([currentTermsMany([id], now), currentTermsMany([id], now + 700000)])
    expect(fresh.get(id)?.terms.state).toBe('fresh')
    expect(dated.get(id)?.terms.state).toBe('dated')
    await quote(id, service + 7, '200', { created: -5000 })
    expect((await currentTermsMany([id], now)).get(id)?.terms.priceRaw).toBe('200')
  })
  it('retains input deduplication, the 48-agent bound and honest unknown states', async () => {
    const ids = Array.from({ length: 49 }, (_, i) => agent(100 + i))
    const result = await currentTermsMany([ids[0]!, ...ids], now)
    expect(result.size).toBe(48)
    expect(result.has(ids[48]!)).toBe(false)
    expect([...result.values()].every(v => v.terms.state === 'none')).toBe(true)
  })
})
