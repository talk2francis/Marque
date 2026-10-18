import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
const { execute, transaction } = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn() }))
vi.mock('@marque/db', async original => ({ ...await original<object>(), db: () => ({ execute, transaction }) }))
import { coverage } from './supply'
import { network } from './config'
const dialect = new PgDialect()
beforeEach(() => {
  execute.mockReset()
  transaction.mockReset().mockImplementation(async fn => fn({ execute }))
})
async function priceScope(offers: Array<{ chain: 56 | 97; token: string; decimals: number; price: string; symbol?: string }>) {
  const candidates = offers.map((o, i) => ({ service_id: 900001 + i, agent_id: `${o.chain}:${network(o.chain).identityRegistry.toLowerCase()}:${990001+i}`, chain_id: o.chain, token_id: String(990001+i), name: 'Synthetic price-scope fixture', category: 'yield', endpoint: 'https://fixture.invalid/a2a', advertises: true }))
  const quotes = offers.map((o, i) => ({ service_id: 900001+i, agent_id: candidates[i]!.agent_id, chain_id: o.chain, token: o.token, token_decimals: o.decimals, token_symbol: o.symbol ?? 'U', price_raw: o.price, provider: '0x1111111111111111111111111111111111111111', created_at: new Date(), quote_expires_at: new Date(Date.now()+120000), ok: true, signed: false }))
  execute.mockImplementation(async q => {
    const text = dialect.sqlToQuery(q).sql
    if (text.includes('with lp as')) return candidates
    if (text.includes('from commerce_quote')) return quotes
    return []
  })
  return (await coverage()).categories.find(c => c.category === 'yield')!
}
const token = network(56).assets[0]!.address
const offer = { chain: 56 as const, token, decimals: 18, price: '10000000000000000' }
describe('coverage minimum price uses comparable atomic units', () => {
  it('does not compare unlike asset addresses even when symbols and decimals match', async () => {
    const scope = await priceScope([offer, { ...offer, token: network(56).assets[1]!.address, price: '1' }])
    expect(scope.hireable).toBe(2)
    expect(scope.cheapest).toBeNull()
  })
  it('does not compare the same token symbol across chains', async () => {
    const scope = await priceScope([offer, { ...offer, chain: 97, token: network(97).assets[0]!.address, price: '1' }])
    expect(scope.hireable).toBe(2)
    expect(scope.cheapest).toBeNull()
  })
  it('does not compare inconsistent decimal metadata', async () => {
    expect((await priceScope([offer, { ...offer, decimals: 6, price: '1' }])).cheapest).toBeNull()
  })
  it('selects the smaller exact raw amount within one chain, asset and decimal scope', async () => {
    const huge = 2n ** 200n
    const scope = await priceScope([{ ...offer, price: (huge+1n).toString(), token: token.toUpperCase().replace('0X','0x') }, { ...offer, price: huge.toString() }])
    expect(scope.cheapest).toMatchObject({ priceRaw: huge.toString(), chainId: 56, decimals: 18 })
  })
  it('preserves the known-empty state without inventing a price', async () => {
    expect(await priceScope([])).toMatchObject({ hireable: 0, cheapest: null })
  })
})
