import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarketRow } from './marketplace'

/**
 * One count (2 Nov): the home hero, the coverage API, the funnel API and llms.txt read the same supply, so the same
 * agents can never be "30 hireable" on one surface and "15" on another. Each surface is run over the same fixed rows.
 */
const mocks = vi.hoisted(() => ({ cached: vi.fn(), funnel: vi.fn() }))
vi.mock('./market-cache', () => ({ marketplaceAgentsCached: mocks.cached }))
vi.mock('@marque/db', () => ({
  cachedProjection: async (_k: string, build: () => Promise<unknown>) => ({ value: await build(), stale: false, ageMs: 0, computedAt: 'now' }),
}))
vi.mock('@marque/registry', () => ({
  funnel: mocks.funnel,
  categoryFunnel: async () => [],
  failureHistogram: async () => [],
}))

const at = '2026-11-02T00:00:00.000Z'
let n = 0
function row(chain: 56 | 97, category: string | null, warrant: 'warranted' | 'failed' | 'untested', state = 'hireable', owner = `0x${String(++n).padStart(40, '0')}`): MarketRow {
  return {
    agentId: `${chain}:0x8004:${n}`, name: `Agent ${n}`, category, owner, isReference: false,
    warrant: { status: warrant, testId: null, date: null, failedField: null },
    commerce: { state, priceRaw: '10', token: { address: '0x1', symbol: 'U', decimals: 18 }, chainId: chain, quoteExpiresAt: '2999-01-01T00:00:00.000Z' },
  } as unknown as MarketRow
}
const mainnet = [
  row(56, 'yield', 'warranted'), row(56, 'yield', 'warranted', 'settleable'), row(56, 'yield', 'failed'),
  row(56, 'grid', 'warranted'), row(56, 'grid', 'untested'), row(56, 'rebalancing', 'failed'),
  row(56, 'health_factor', 'untested'), row(56, null, 'untested'),
  // Not priced now: never counted, whatever its test result.
  row(56, 'yield', 'warranted', 'quoteable'),
]
const testnet = [row(97, 'yield', 'untested'), row(97, 'grid', 'untested')]

beforeEach(() => {
  mocks.cached.mockReset().mockImplementation(async (q: { lane?: string }) => ({
    rows: q.lane === 'practice' ? testnet : mainnet, total: 0, generatedAt: at, quoteObservedAt: at, supply: [], facets: {}, failedGroup: [],
  }))
  mocks.funnel.mockReset().mockResolvedValue([{ stage: 'registered_bsc', count: 1000 }, { stage: 'reachable', count: 100 }])
})

describe('supplyNow: one count for every surface', () => {
  it('counts priced, passed, failed and not yet tested per network and category', async () => {
    const { supplyNow } = await import('./supply-truth')
    const m = await supplyNow(56)
    expect(m).toMatchObject({ chainId: 56, priced: 8, passed: 3, failed: 2, notYetTested: 3, measuredAt: at })
    expect(m.byCategory['yield']).toMatchObject({ priced: 3, passed: 2, failed: 1, notYetTested: 0, passedOperators: 2 })
    expect(m.byCategory['unclassified']).toMatchObject({ priced: 1, notYetTested: 1 })
    expect(m.priced).toBe(m.passed + m.failed + m.notYetTested)
    expect(await supplyNow(97)).toMatchObject({ priced: 2, passed: 0, notYetTested: 2 })
  })

  it('the coverage API, the funnel API, llms.txt and the home line agree', async () => {
    const { supplyNow } = await import('./supply-truth')
    const truth = await supplyNow(56)
    const coverage = await (await (await import('../app/api/v1/phase2/coverage/route')).GET(new Request('https://marque.trade/api/v1/phase2/coverage'))).json()
    expect(coverage.mainnet).toMatchObject({ totalHireable: truth.passed, passed: truth.passed, priced: truth.priced, failed: truth.failed, notYetTested: truth.notYetTested })
    expect(coverage.practice).toMatchObject({ totalHireable: 0, priced: 2 })
    expect(coverage.mainnet.categories.find((c: { category: string }) => c.category === 'yield')).toMatchObject({ hireable: 2, priced: 3 })

    const funnel = await (await (await import('../app/api/v1/funnel/route')).GET()).json()
    expect(funnel.stages.at(-1)).toMatchObject({ stage: 'hireable', count: truth.passed })
    expect(funnel.supply).toMatchObject({ passed: truth.passed, priced: truth.priced })

    const llms = await (await (await import('../app/llms.txt/route')).GET()).text()
    expect(llms).toContain(`BSC mainnet: ${truth.passed} hireable (passed), ${truth.priced} priced, ${truth.failed} failed, ${truth.notYetTested} not yet tested.`)

    const { funnelLine } = await import('./home-data')
    expect(await funnelLine(truth)).toMatchObject({ passed: truth.passed, priced: truth.priced, registered: 1000, answering: 100 })
  })
})
