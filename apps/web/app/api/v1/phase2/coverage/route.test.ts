import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ market: vi.fn(), projection: vi.fn() }))
vi.mock('../../../../../lib/marketplace', () => ({ marketplaceAgents: mocks.market }))
vi.mock('@marque/db', () => ({ cachedProjection: mocks.projection }))
import { GET } from './route'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.projection.mockImplementation(async (_key: string, build: () => Promise<unknown>) => ({
    value: await build(), ageMs: 0, computedAt: '2026-01-01T00:00:00Z', stale: false,
  }))
})
// A priced agent in the Ready view, with its standing (V4.4): pulled, checked, warranted.
type St = 'warranted' | 'checked' | 'pulled' | 'none'
const row = (n: number, category: string | null, st: St, owner = `0x${String(n).padStart(40, '0')}`) => ({
  agentId: `56:0x8004:${n}`, category, owner, isReference: false, warrant: { status: 'untested' },
  standing: {
    pulled: st === 'pulled' ? { reason: 'undelivered', text: 'Its latest paid job was refunded without a delivery', at: '2026-01-01T00:00:00Z', ref: '56/1' } : null,
    checked: st === 'checked' ? { at: '2026-01-01T00:00:00Z', via: 'job', ref: '56/2', onMainnet: false } : null,
    warranted: st === 'warranted' ? { at: '2026-01-01T00:00:00Z', testId: 'MCS-YIELD-1', onMainnet: false } : null,
  },
  commerce: { state: 'hireable', priceRaw: '10', token: { address: '0x1', symbol: 'U', decimals: 18 }, chainId: 56, quoteExpiresAt: '2999-01-01T00:00:00Z' },
})
it('counts hireable as priced and not pulled, over the full Ready listing, with checked, warranted and pulled beside it', async () => {
  const rows = [row(1, 'yield', 'warranted'), row(2, 'yield', 'checked'), row(3, 'yield', 'pulled'), row(4, 'grid', 'none'), row(5, null, 'warranted')]
  mocks.market.mockResolvedValue({ rows, total: rows.length, supply: [], generatedAt: '2026-01-01T00:00:00Z' })
  const response = await GET(new Request('https://fixture.invalid/api/v1/phase2/coverage?chainId=56'))
  expect(response.status).toBe(200)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  const body = await response.json()
  expect(body).toMatchObject({ chainId: 56, totalHireable: 4, hireable: 4, priced: 5, pulled: 1, checked: 1, warranted: 2, unclassifiedHireableCount: 1, countingUnit: 'deduplicated_marketplace_listing' })
  expect(body.categories.find((c: { category: string }) => c.category === 'yield')).toMatchObject({ hireable: 2, priced: 3, operators: 2, checked: 1, warranted: 1 })
  expect(body.categories.find((c: { category: string }) => c.category === 'grid')).toMatchObject({ hireable: 1, priced: 1 })
  expect(mocks.market).toHaveBeenCalledWith({ tab: 'ready', lane: 'mainnet', limit: 300 })
})
it('reports both lanes side by side without summing them, mainnet repeated at top level for one release', async () => {
  mocks.market.mockImplementation(async (q: { lane: string }) => ({ rows: q.lane === 'mainnet' ? [row(1, 'yield', 'none'), row(2, 'grid', 'warranted')] : [row(3, 'yield', 'checked')], total: 0, supply: [], generatedAt: '2026-01-01T00:00:00Z' }))
  const body = await (await GET(new Request('https://fixture.invalid/api/v1/phase2/coverage'))).json()
  expect(body).toMatchObject({ chainId: 56, totalHireable: 2, mainnet: { chainId: 56, totalHireable: 2 }, practice: { chainId: 97, totalHireable: 1 } })
  expect(body.deprecation).toMatch(/one release/)
})
it('rejects unsupported chains without reading marketplace state', async () => {
  expect((await GET(new Request('https://fixture.invalid/api/v1/phase2/coverage?chainId=1'))).status).toBe(400)
  expect(mocks.market).not.toHaveBeenCalled()
})
it('reports unavailable observations instead of fabricated zero supply or private errors', async () => {
  mocks.market.mockRejectedValue(Error('private provider credential'))
  const response = await GET(new Request('https://fixture.invalid/api/v1/phase2/coverage?chainId=97'))
  expect(response.status).toBe(503)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  const body = await response.text()
  expect(body).not.toContain('private provider credential')
  expect(body).not.toContain('totalHireable')
})
