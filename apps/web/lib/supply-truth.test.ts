import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarketRow } from './marketplace'
import type { Standing } from './standing'

/**
 * One count (V4.4, 2 Nov): the home hero, the coverage API, the funnel API and llms.txt read the same supply, so the same
 * agents can never be "30 hireable" on one surface and "15" on another. Each surface is run over the same fixed rows.
 * Hireable is priced and not pulled; the test result is a badge (warranted), never the gate.
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
const PULLED: Standing['pulled'] = { reason: 'undelivered', text: 'Its latest paid job was refunded without a delivery', at, ref: '56/1' }
function row(chain: 56 | 97, category: string | null, standing: Partial<Standing>, state = 'hireable', delivered = 0, owner = `0x${String(++n).padStart(40, '0')}`): MarketRow {
  return {
    agentId: `${chain}:0x8004:${n}`, name: `Agent ${n}`, category, owner, isReference: false,
    warrant: { status: 'untested', testId: null, date: null, failedField: null },
    standing: { pulled: null, checked: null, warranted: null, ...standing },
    track: { jobs: { delivered } },
    commerce: { state, priceRaw: '10', token: { address: '0x1', symbol: 'U', decimals: 18 }, chainId: chain, quoteExpiresAt: '2999-01-01T00:00:00.000Z' },
  } as unknown as MarketRow
}
const W = { warranted: { at, testId: 'MCS-YIELD-1', onMainnet: false } }
const C = { checked: { at, via: 'job' as const, ref: '56/2', onMainnet: false } }
const mainnet = [
  row(56, 'yield', { ...W, ...C }, 'hireable', 3), row(56, 'yield', W, 'settleable'), row(56, 'yield', { pulled: PULLED }),
  row(56, 'grid', C), row(56, 'grid', {}, 'hireable', 1), row(56, 'rebalancing', {}),
  row(56, 'health_factor', {}), row(56, null, {}),
  // Not priced now: never counted, whatever its standing.
  row(56, 'yield', W, 'quoteable'),
]
const testnet = [row(97, 'yield', { checked: { at, via: 'job', ref: '56/2', onMainnet: true } }), row(97, 'grid', {})]

beforeEach(() => {
  mocks.cached.mockReset().mockImplementation(async (q: { lane?: string }) => ({
    rows: q.lane === 'practice' ? testnet : mainnet, total: 0, generatedAt: at, quoteObservedAt: at, supply: [], facets: {}, failedGroup: [],
  }))
  mocks.funnel.mockReset().mockResolvedValue([{ stage: 'registered_bsc', count: 1000 }, { stage: 'reachable', count: 100 }, { stage: 'callable', count: 50 }, { stage: 'qualified', count: 7 }])
})

describe('supplyNow: one count for every surface', () => {
  it('counts priced, hireable, pulled, checked and warranted per network and category', async () => {
    const { supplyNow } = await import('./supply-truth')
    const m = await supplyNow(56)
    expect(m).toMatchObject({ chainId: 56, priced: 8, hireable: 7, pulled: 1, checked: 2, warranted: 2, delivered: 2, measuredAt: at })
    expect(m.byCategory['yield']).toMatchObject({ priced: 3, hireable: 2, pulled: 1, checked: 1, warranted: 2, operators: 2 })
    expect(m.byCategory['unclassified']).toMatchObject({ priced: 1, hireable: 1 })
    expect(m.priced).toBe(m.hireable + m.pulled)
    expect(await supplyNow(97)).toMatchObject({ priced: 2, hireable: 2, checked: 1, warranted: 0 })
  })

  it('the coverage API, the funnel API, llms.txt and the home line agree', async () => {
    const { supplyNow } = await import('./supply-truth')
    const truth = await supplyNow(56)
    const coverage = await (await (await import('../app/api/v1/phase2/coverage/route')).GET(new Request('https://marque.trade/api/v1/phase2/coverage'))).json()
    expect(coverage.mainnet).toMatchObject({ totalHireable: truth.hireable, hireable: truth.hireable, priced: truth.priced, pulled: truth.pulled, checked: truth.checked, warranted: truth.warranted })
    expect(coverage.practice).toMatchObject({ totalHireable: 2, hireable: 2, priced: 2 })
    expect(coverage.mainnet.categories.find((c: { category: string }) => c.category === 'yield')).toMatchObject({ hireable: 2, priced: 3, checked: 1, warranted: 2 })

    const funnel = await (await (await import('../app/api/v1/funnel/route')).GET()).json()
    expect(funnel.stages.map((s: { stage: string }) => s.stage)).toEqual(['registered_bsc', 'reachable', 'callable', 'priced', 'hireable', 'checked', 'warranted'])
    expect(funnel.stages.at(-3)).toMatchObject({ stage: 'hireable', count: truth.hireable })
    expect(funnel.supply).toMatchObject({ hireable: truth.hireable, priced: truth.priced, checked: truth.checked, warranted: truth.warranted })
    expect(funnel.deliveredPaidWork).toMatchObject({ agents: truth.delivered })

    const llms = await (await (await import('../app/llms.txt/route')).GET()).text()
    expect(llms).toContain(`BSC mainnet: ${truth.hireable} hireable, ${truth.checked} checked against the chain, ${truth.warranted} warranted, ${truth.pulled} pulled.`)

    const { funnelLine } = await import('./home-data')
    expect(await funnelLine(truth)).toMatchObject({ hireable: truth.hireable, checked: truth.checked, warranted: truth.warranted, registered: 1000, answering: 100 })
  })
})
