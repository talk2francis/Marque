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
it('returns full listing counts rather than the one-row display page', async () => {
  const categories = [{ category: 'yield', hireable: 350 }, { category: 'grid', hireable: 2 }]
  mocks.market.mockResolvedValue({ rows: [{ agentId: 'synthetic' }], total: 355, supply: categories, generatedAt: '2026-01-01T00:00:00Z' })
  const response = await GET(new Request('https://fixture.invalid/api/v1/phase2/coverage?chainId=56'))
  expect(response.status).toBe(200)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  expect(await response.json()).toMatchObject({ chainId: 56, totalHireable: 355, categories, unclassifiedHireableCount: 3, countingUnit: 'deduplicated_marketplace_listing' })
  expect(mocks.market).toHaveBeenCalledWith({ tab: 'ready', lane: 'mainnet', limit: 1 })
})
it('reports both lanes side by side without summing them, mainnet repeated at top level for one release', async () => {
  mocks.market.mockImplementation(async (q: { lane: string }) => ({ rows: [], total: q.lane === 'mainnet' ? 22 : 12, supply: [], generatedAt: '2026-01-01T00:00:00Z' }))
  const body = await (await GET(new Request('https://fixture.invalid/api/v1/phase2/coverage'))).json()
  expect(body).toMatchObject({ chainId: 56, totalHireable: 22, mainnet: { chainId: 56, totalHireable: 22 }, practice: { chainId: 97, totalHireable: 12 } })
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
