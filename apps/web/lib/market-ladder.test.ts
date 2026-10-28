import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ agents: vi.fn(), funnel: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('./marketplace', () => ({ marketplaceAgents: mocks.agents }))
vi.mock('@marque/registry', () => ({ funnel: mocks.funnel }))
vi.mock('@marque/commerce', () => ({ chainOf: (l: string) => (l === 'practice' ? 97 : 56) }))

const ladder = { listed: 10, answering: 5, priced: 3, passed: 2, delivered: 1 }
beforeEach(() => {
  vi.useRealTimers()
  mocks.agents.mockReset().mockResolvedValue({ ladder, generatedAt: '2026-10-28T10:00:00.000Z' })
  mocks.funnel.mockReset().mockResolvedValue([{ stage: 'registered_bsc', count: 100 }])
})

describe('marketLadder', () => {
  it('counts over the whole listed set and adds the registered count of every network in view', async () => {
    const { marketLadder } = await import('./market-ladder')
    const v = await marketLadder({ lane: 'all', category: 'yield-a' })
    expect(mocks.agents).toHaveBeenCalledWith(expect.objectContaining({ tab: null, limit: 1, lane: 'all', category: 'yield-a' }))
    expect(v).toMatchObject({ ...ladder, registered: 200 })
  })
  it('computes once for concurrent reads of one view and reuses a fresh value', async () => {
    const { marketLadder } = await import('./market-ladder')
    const q = { lane: 'mainnet' as const, category: 'grid-b' }
    await Promise.all([marketLadder(q), marketLadder(q), marketLadder(q)])
    await marketLadder(q)
    expect(mocks.agents).toHaveBeenCalledTimes(1)
  })
  it('answers with the recent value at once while one refresh runs', async () => {
    const { marketLadder } = await import('./market-ladder')
    vi.useFakeTimers({ toFake: ['Date'] })
    const q = { lane: 'mainnet' as const, category: 'hf-c' }
    await marketLadder(q)
    vi.setSystemTime(Date.now() + 120_000)
    let release!: () => void
    mocks.agents.mockReturnValueOnce(new Promise((r) => { release = () => r({ ladder: { ...ladder, listed: 11 }, generatedAt: 'x' }) }))
    expect((await marketLadder(q)).listed).toBe(10)
    release(); await new Promise((r) => setTimeout(r, 0))
    expect(mocks.agents).toHaveBeenCalledTimes(2)
  })
})
