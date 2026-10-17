import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ select: vi.fn(), limit: vi.fn() }))
vi.mock('@marque/db', async original => ({ ...await original<object>(), db: () => ({ transaction: async (run: (tx: object) => unknown) => run({ select: mocks.select, execute: async () => [] }) }) }))
import { GET } from './route'

const invoke = (id = '1') => GET(new Request('https://candidate.invalid/api/v1/conformance/' + id), { params: Promise.resolve({ id }) })
beforeEach(() => {
  vi.clearAllMocks()
  const chain = { from: () => chain, where: () => chain, limit: mocks.limit }
  mocks.select.mockReturnValue(chain)
  mocks.limit.mockResolvedValue([{ id: 1, agentId: 'synthetic', testId: 'MCS-HF-1', testVersion: '1.0.0', toleranceRevision: 1, caseId: 'synthetic', chainId: 56, blockNumber: '100', pass: true, request: { prompt: 'PRIVATE_TASK_SENTINEL', endpoint: 'https://private.invalid/secret' }, requestHash: '0x' + '0'.repeat(64), responseHash: '0x' + '1'.repeat(64), ranAt: new Date('2026-01-01T00:00:00Z') }])
})
describe('public conformance commitments', () => {
  it('preserves unknown binding and never discloses raw task or endpoint content', async () => {
    for (let i = 0; i < 2; i++) {
      const response = await invoke(); expect(response.status).toBe(200)
      const text = await response.text(); const body = JSON.parse(text)
      expect(body).toMatchObject({ version: 1, recordedPass: true, replay: 'NOT_PERFORMED', bundle: null, commitments: { serviceKey: null }, independence: 'UNKNOWN' })
      expect(text).not.toContain('PRIVATE_TASK_SENTINEL'); expect(text).not.toContain('private.invalid')
      expect(response.headers.get('Cache-Control')).toBe('no-store')
    }
    expect(mocks.select).toHaveBeenCalledTimes(2)
  })
  it('rejects invalid IDs before database access', async () => {
    for (const id of ['0', '-1', '1.5', '2147483648', 'abc']) expect((await invoke(id)).status).toBe(400)
    expect(mocks.select).not.toHaveBeenCalled()
  })
  it('distinguishes missing records and unavailable reads', async () => {
    mocks.limit.mockResolvedValue([]); expect((await invoke()).status).toBe(404)
    mocks.limit.mockRejectedValue(new Error('PRIVATE_CONNECTION_STRING')); const response = await invoke()
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('PRIVATE_CONNECTION_STRING')
  })
})
