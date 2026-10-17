import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ limit: vi.fn(), db: vi.fn(), groundTruth: vi.fn(), block: vi.fn() }))
vi.mock('@marque/db', async original => ({ ...await original<object>(), db: mocks.db }))
vi.mock('@marque/chain', () => ({ publicClient: () => ({ getBlockNumber: mocks.block }) }))
vi.mock('./tests/mcs-hf-1.js', async original => ({ ...await original<object>(), hfGroundTruth: mocks.groundTruth, hfPrompt: () => 'synthetic frozen prompt' }))
import { observeCase, runConformance } from './harness'
import { stableHash } from './hash'

const at = '2026-01-01T00:00:00.000Z'
const row = () => ({ id: 'synthetic-case', testId: 'MCS-HF-1', category: 'health_factor', chainId: 56, blockNumber: '100', subject: { address: '0x' + '1'.repeat(40) }, policy: { targetHealthFactor: 2 }, prompt: 'synthetic frozen prompt', groundTruth: {}, groundTruthHash: stableHash({}), capturedAt: new Date(at) })
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(at)); vi.clearAllMocks()
  const chain = { from: () => chain, where: () => chain, orderBy: () => chain, limit: mocks.limit }
  mocks.db.mockReturnValue({ select: () => chain })
  mocks.limit.mockResolvedValue([row()]); mocks.block.mockResolvedValue(100n); mocks.groundTruth.mockResolvedValue({})
})
afterEach(() => vi.useRealTimers())

describe('frozen MCS capture and request binding', () => {
  it('observes current input without database access or agent invocation', async () => {
    const observed = await observeCase({ id: 'read-only', testId: 'MCS-HF-1', subject: row().subject, policy: { targetHealthFactor: 2, statement: 'synthetic' } })
    expect(observed.testCase.blockNumber).toBe(100n)
    expect(mocks.groundTruth).toHaveBeenCalledTimes(1)
    expect(mocks.db).not.toHaveBeenCalled()
  })
  it('records the exact discovery surface and refuses stale input before asking', async () => {
    mocks.limit.mockResolvedValue([{ ...row(), capturedAt: new Date('2025-12-31T23:00:00Z') }])
    const ask = vi.fn()
    const out = await runConformance({ testId: 'MCS-HF-1', caseId: 'synthetic-case', persist: false, adapter: { agentId: '56:0x' + '1'.repeat(40) + ':1', name: 'synthetic', service: { kind: 'a2a', discoveryEndpoint: 'https://synthetic.invalid/card' }, ask } })
    expect(ask).not.toHaveBeenCalled()
    expect(out.error).toMatch(/^case_stale:/)
    expect(out.failedFields).toEqual([])
    expect(out.requestHash).toBe(stableHash(out.request))
    expect(out.request).toMatchObject({ evidence: { version: 1, caseHash: expect.stringMatching(/^0x[0-9a-f]{64}$/), service: { discoveryEndpoint: 'https://synthetic.invalid/card' }, invocation: null } })
  })
  it('rejects another category case before any task', async () => {
    const ask = vi.fn()
    await expect(runConformance({ testId: 'MCS-GRID-1', caseId: 'synthetic-case', persist: false, adapter: { agentId: 'synthetic', name: 'synthetic', ask } })).rejects.toThrow('belongs')
    expect(ask).not.toHaveBeenCalled()
  })
})
