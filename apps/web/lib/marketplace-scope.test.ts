import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
const mocks = vi.hoisted(() => ({ states: vi.fn(), read: vi.fn() }))
vi.mock('@marque/commerce', async original => ({ ...await original<object>(), commercialStates: mocks.states }))
vi.mock('@marque/commerce/reads', () => ({ boundedCommerceRead: mocks.read }))
import { marketplaceAgents } from './marketplace'
describe('ready selection before the broad catalog read', () => {
  it('returns measured empty supply for no stored quotes without scanning the registry', async () => {
    mocks.read.mockClear(); mocks.states.mockResolvedValueOnce(new Map())
    expect(await marketplaceAgents({ tab: 'ready' })).toMatchObject({ rows: [], total: 0, offset: 0, hasMore: false })
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('does not revive expired or merely quoteable supply', async () => {
    mocks.read.mockClear(); mocks.states.mockResolvedValueOnce(new Map([[1, { agentId: 'synthetic', state: 'quoteable' }]]))
    expect((await marketplaceAgents({ hireableOnly: true })).total).toBe(0)
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('propagates a failed commerce read instead of returning a fabricated empty catalog', async () => {
    mocks.states.mockRejectedValueOnce(Error('database unavailable'))
    await expect(marketplaceAgents({ tab: 'ready' })).rejects.toThrow('database unavailable')
  })
  it('retains the full null-owner partition instead of narrowing unknown ownership', async () => {
    mocks.states.mockResolvedValue(new Map()); mocks.read.mockReset()
    mocks.read.mockResolvedValueOnce([{ id: 'synthetic-null', owner_address: null }]).mockRejectedValueOnce(Error('captured source query'))
    await expect(marketplaceAgents({ agentIds: ['synthetic-null'] })).rejects.toThrow('captured source query')
    const query = new PgDialect().sqlToQuery(mocks.read.mock.calls[1]![0])
    expect(query.sql).not.toContain('and a.owner_address in')
  })
  it('scopes complete owner groups rather than only selected identities', async () => {
    mocks.states.mockResolvedValue(new Map()); mocks.read.mockReset()
    mocks.read.mockResolvedValueOnce([{ id: 'synthetic-owned', owner_address: 'synthetic-owner' }]).mockRejectedValueOnce(Error('captured source query'))
    await expect(marketplaceAgents({ agentIds: ['synthetic-owned'] })).rejects.toThrow('captured source query')
    const query = new PgDialect().sqlToQuery(mocks.read.mock.calls[1]![0])
    expect(query.sql).toContain('and a.owner_address in')
    expect(query.params).toContain('synthetic-owner')
    expect(query.params).not.toContain('synthetic-owned')
  })

  it('resolves the requested category before reading unrelated catalog rows', async () => {
    mocks.states.mockResolvedValue(new Map()); mocks.read.mockReset()
    mocks.read.mockRejectedValueOnce(Error('category lookup unavailable'))
    await expect(marketplaceAgents({ category: 'health_factor', tab: 'all' })).rejects.toThrow('category lookup unavailable')
    const query = new PgDialect().sqlToQuery(mocks.read.mock.calls[0]![0])
    expect(query.params).toContain('health_factor')
    expect(mocks.read).toHaveBeenCalledTimes(1)
  })

  it('returns an empty missing category without reading the broad registry', async () => {
    mocks.states.mockResolvedValue(new Map()).mockClear(); mocks.read.mockReset()
    mocks.read.mockResolvedValueOnce([])
    expect(await marketplaceAgents({ category: 'missing-category', tab: 'all' })).toMatchObject({ rows: [], total: 0 })
    expect(mocks.read).toHaveBeenCalledTimes(1)
    expect(mocks.states).not.toHaveBeenCalled()
  })

})
