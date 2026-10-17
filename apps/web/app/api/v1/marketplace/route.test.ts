import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ marketplaceAgents: vi.fn(), checkWindow: vi.fn(), deadline: vi.fn() }))
vi.mock('../../../../lib/marketplace', () => ({ marketplaceAgents: mocks.marketplaceAgents }))
vi.mock('../../../../lib/limits', () => ({ checkWindow: mocks.checkWindow, clientKey: () => 'synthetic' }))
vi.mock('../../../../lib/deadline', () => ({ withDeadline: mocks.deadline }))
import { GET } from './route'

const invoke = (params = '') => GET(new NextRequest('https://candidate.invalid/api/v1/marketplace' + params))
const result = () => ({ rows: [], generatedAt: new Date().toISOString(), total: 0, offset: 0, hasMore: false })
beforeEach(() => { vi.clearAllMocks(); mocks.checkWindow.mockReturnValue({ ok: true }); mocks.marketplaceAgents.mockResolvedValue(result()); mocks.deadline.mockImplementation(x => x) })
describe('existing marketplace API compatibility and read boundary', () => {
  it('keeps the original successful JSON contract and has no writer', async () => {
    const r = result(); mocks.marketplaceAgents.mockResolvedValue(r)
    const response = await invoke()
    expect(await response.json()).toEqual({ chainId: 56, generatedAt: r.generatedAt, provenance: 'MEASURED', count: 0, total: 0, offset: 0, hasMore: false, agents: [] })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.deadline).toHaveBeenCalledWith(expect.any(Promise), 12000)
  })
  it('exposes opt-in version, UTC source time, bounds and supported query mapping', async () => {
    const response = await invoke('?format=machine&network=97&category=grid&offset=20&limit=3&thirdParty=true')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ schema: 'marque.catalog.v1', version: 1, provenance: 'MEASURED_PROJECTION' })
    expect(mocks.marketplaceAgents).toHaveBeenCalledWith(expect.objectContaining({ network: 97, category: 'grid', offset: 20, limit: 3, thirdPartyOnly: true }))
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Link')).toContain('openapi.json')
  })
  it.each(['network=1', 'limit=301', 'format=machine', 'iface=exec', 'unknown=x'])('rejects invalid or duplicate machine filter %s before reads', async q => {
    expect((await invoke('?format=machine&' + q)).status).toBe(400)
    expect(mocks.marketplaceAgents).not.toHaveBeenCalled()
  })
  it('returns 429 and Retry-After before querying', async () => {
    mocks.checkWindow.mockReturnValue({ ok: false, retryAfterSeconds: 12, detail: 'Synthetic rate test' })
    const response = await invoke('?format=machine')
    expect(response.status).toBe(429); expect(response.headers.get('Retry-After')).toBe('12')
    expect(mocks.marketplaceAgents).not.toHaveBeenCalled()
  })
  it('redacts SQL/transport failures and never caches them', async () => {
    mocks.marketplaceAgents.mockRejectedValue(new Error('PRIVATE_SQL_URL'))
    const response = await invoke('?format=machine')
    expect(response.status).toBe(503); expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.text()).not.toContain('PRIVATE_SQL_URL')
  })
})
