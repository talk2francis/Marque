import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
const mocks = vi.hoisted(() => ({ states: vi.fn(), read: vi.fn(), capabilities: vi.fn(), tracks: vi.fn().mockResolvedValue(null) }))
vi.mock('@marque/commerce', async original => ({ ...await original<object>(), commercialStates: mocks.states }))
vi.mock('@marque/commerce/reads', () => ({ boundedCommerceRead: mocks.read, coalescedCatalogRead: mocks.read }))
vi.mock('./agent-state', async original => ({ ...await original<object>(), agentStates: mocks.capabilities }))
vi.mock('./agent-track', async original => ({ ...await original<object>(), agentTracks: mocks.tracks }))
import { marketplaceAgents, marketPageAgentStates } from './marketplace'
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
  it('filters an expired memoized quote at wall-clock time rather than its array index', async () => {
    const id = '56:synthetic-expired-boundary'
    mocks.states.mockReset().mockResolvedValue(new Map([[987, {
      agentId: id, serviceId: 987, state: 'hireable', priceRaw: '1',
      token: { address: '0x0000000000000000000000000000000000000001', symbol: 'U', decimals: 18 },
      chainId: 56, quoteExpiresAt: '2000-01-01T00:00:00Z',
    }]]))
    mocks.read.mockReset().mockResolvedValueOnce([{ id, owner_address: id }])
      .mockResolvedValueOnce([{ agent_id: id, owner_address: id, category: 'yield', name: 'Synthetic expired fixture' }])
    mocks.tracks.mockResolvedValue(null)
    const result = await marketplaceAgents({ tab: 'ready' })
    expect(result.total).toBe(0)
    expect(result.rows).toEqual([])
    expect(result.supply.every(category => category.hireable === 0)).toBe(true)
  })

  it('uses renewed exact-agent terms even when the listing metadata is memoized', async () => {
    const id = '56:synthetic-renewal-boundary', expires = new Date(Date.now() + 600_000).toISOString()
    const first = { agentId: id, serviceId: 988, state: 'hireable', priceRaw: '1',
      token: { address: '0x0000000000000000000000000000000000000001', symbol: 'U', decimals: 18 },
      chainId: 56, quoteExpiresAt: expires }
    mocks.states.mockReset().mockResolvedValueOnce(new Map([[988, first]]))
      .mockResolvedValueOnce(new Map([[988, { ...first, priceRaw: '2' }]]))
    mocks.read.mockReset().mockResolvedValueOnce([{ id, owner_address: id }])
      .mockResolvedValueOnce([{ agent_id: id, owner_address: id, category: 'yield', name: 'Synthetic renewal fixture' }])
    mocks.tracks.mockResolvedValue(null); mocks.capabilities.mockResolvedValue(new Map())
    expect((await marketplaceAgents({ tab: 'ready' })).rows[0]?.commerce.priceRaw).toBe('1')
    expect((await marketplaceAgents({ tab: 'ready' })).rows[0]?.commerce.priceRaw).toBe('2')
    expect(mocks.read).toHaveBeenCalledTimes(2) // metadata is still reused; no new catalog scan
  })

  it('retains the full null-owner partition instead of narrowing unknown ownership', async () => {
    mocks.states.mockResolvedValue(new Map()); mocks.read.mockReset()
    mocks.read.mockResolvedValueOnce([{ id: '56:synthetic-null', owner_address: null }]).mockRejectedValueOnce(Error('captured source query'))
    await expect(marketplaceAgents({ agentIds: ['56:synthetic-null'] })).rejects.toThrow('captured source query')
    const query = new PgDialect().sqlToQuery(mocks.read.mock.calls[1]![0])
    expect(query.sql).not.toContain('and a.owner_address in')
  })
  it('scopes complete owner groups rather than only selected identities', async () => {
    mocks.states.mockResolvedValue(new Map()); mocks.read.mockReset()
    mocks.read.mockResolvedValueOnce([{ id: '56:synthetic-owned', owner_address: 'synthetic-owner' }]).mockRejectedValueOnce(Error('captured source query'))
    await expect(marketplaceAgents({ agentIds: ['56:synthetic-owned'] })).rejects.toThrow('captured source query')
    const query = new PgDialect().sqlToQuery(mocks.read.mock.calls[1]![0])
    expect(query.sql).toContain('and a.owner_address in')
    expect(query.params).toContain('synthetic-owner')
    expect(query.params).not.toContain('56:synthetic-owned')
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

  it('starts independent catalog observations without waiting for a slow quote or track read', async () => {
    let quotesDone!: (value: Map<never, never>) => void
    let rowsDone!: (value: []) => void
    let tracksDone!: (value: null) => void
    const quotes = new Promise<Map<never, never>>(resolve => { quotesDone = resolve })
    const source = new Promise<[]>(resolve => { rowsDone = resolve })
    const tracks = new Promise<null>(resolve => { tracksDone = resolve })
    mocks.states.mockReset().mockReturnValueOnce(quotes)
    mocks.tracks.mockClear().mockReturnValueOnce(tracks)
    mocks.read.mockReset().mockResolvedValueOnce([{ id: '56:concurrent-observations', owner_address: 'concurrent-owner' }])
      .mockReturnValueOnce(source)
    const pending = marketplaceAgents({ agentIds: ['56:concurrent-observations'] })
    try {
      await vi.waitFor(() => {
        expect(mocks.states).toHaveBeenCalledTimes(1)
        expect(mocks.read).toHaveBeenCalledTimes(2)
        expect(mocks.tracks).toHaveBeenCalledTimes(1)
      })
    } finally {
      quotesDone(new Map<never, never>()); rowsDone([]); tracksDone(null)
      await pending
    }
    expect(await pending).toMatchObject({ rows: [], total: 0 })
  })

})

describe('paged capability evaluation', () => {
  it('batches exact identities by their own task and excludes reference agents', async () => {
    mocks.capabilities.mockReset().mockImplementation(async (ids: string[]) => new Map(ids.map(id => [id, { agentId: id }])))
    const result = await marketPageAgentStates([
      { agentId: 'A', category: 'yield', isReference: false },
      { agentId: 'B', category: 'grid', isReference: false },
      { agentId: 'C', category: 'yield', isReference: false },
      { agentId: 'reference', category: 'grid', isReference: true },
    ])
    expect(mocks.capabilities.mock.calls).toEqual([[['A', 'C'], 'yield'], [['B'], 'grid']])
    expect([...result.keys()].sort()).toEqual(['A', 'B', 'C'])
  })
  it('performs no capability read for an empty or reference-only page', async () => {
    mocks.capabilities.mockReset()
    expect((await marketPageAgentStates([])).size).toBe(0)
    expect((await marketPageAgentStates([{ agentId: 'reference', category: 'yield', isReference: true }])).size).toBe(0)
    expect(mocks.capabilities).not.toHaveBeenCalled()
  })
  it('keeps a failed task group unavailable without substituting another identity', async () => {
    mocks.capabilities.mockReset().mockImplementation(async (ids: string[], task: string) => {
      if (task === 'grid') throw Error('read unavailable')
      return new Map(ids.map(id => [id, { agentId: id }]))
    })
    const result = await marketPageAgentStates([
      { agentId: 'A', category: 'yield', isReference: false },
      { agentId: 'B', category: 'grid', isReference: false },
    ])
    expect([...result.keys()]).toEqual(['A'])
  })
})
