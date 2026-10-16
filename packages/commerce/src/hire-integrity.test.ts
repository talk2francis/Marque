import { beforeEach, describe, expect, it, vi } from 'vitest'
import { network } from './config'
const { quote, insert, candidates } = vi.hoisted(() => ({ quote: { current: {} as Record<string, unknown> }, insert: vi.fn(), candidates: vi.fn() }))
vi.mock('@marque/db', async original => ({ ...await original<object>(), db: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => [quote.current] }) }) }), insert }) }))
vi.mock('./supply', async original => ({ ...await original<object>(), sellerCandidates: candidates }))
import { createIntent } from './hire'
const net = network(56)
const provider = '0x1111111111111111111111111111111111111111'
beforeEach(() => {
  insert.mockReset()
  const now = Date.now()
  quote.current = { id: 1, source: 'user', ok: true, signed: false, agentId: 'selected-agent', serviceId: 42, endpoint: 'https://example.org/a2a', chainId: 56, provider, priceRaw: '10', token: net.assets[0]!.address, tokenSymbol: net.assets[0]!.symbol, tokenDecimals: net.assets[0]!.decimals, quoteExpiresAt: new Date(now + 800_000), createdAt: new Date(now - 100_000), raw: { accepted: true, provider, price: '10', chain_id: 56, verifying_contract: net.commerce, payment_token: net.assets[0]!.address, quote_expires_at: Math.floor(now / 1000) - 1 } }
  candidates.mockResolvedValue([{ agentId: 'selected-agent', serviceId: 42, endpoint: 'https://example.org/a2a', owner: provider, agentWallet: provider }])
})
describe('purchasing persisted quotes', () => {
  it('rejects a stored explicitly expired quote even if old verification renewed the database expiry', async () => {
    await expect(createIntent({ wallet: provider, quoteId: 1 })).rejects.toMatchObject({ code: 'quote_expired' })
    expect(insert).not.toHaveBeenCalled()
  })
  it('rejects a stored price after its database acceptance expiry', async () => {
    quote.current.quoteExpiresAt = new Date(Date.now() - 1)
    await expect(createIntent({ wallet: provider, quoteId: 1 })).rejects.toMatchObject({ code: 'quote_expired' })
    expect(insert).not.toHaveBeenCalled()
  })
  it('refuses a changed exact service rather than buying from a replacement endpoint', async () => {
    candidates.mockResolvedValue([{ agentId: 'selected-agent', serviceId: 42, endpoint: 'https://different.example/a2a' }])
    await expect(createIntent({ wallet: provider, quoteId: 1 })).rejects.toMatchObject({ code: 'service_changed' })
    expect(insert).not.toHaveBeenCalled()
  })
})
