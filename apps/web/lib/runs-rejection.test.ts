import { beforeEach, describe, expect, it, vi } from 'vitest'
const { insert, values, runHire, readCharter, verifyCharterCapability, executor, tables } = vi.hoisted(() => ({
  insert: vi.fn(), values: vi.fn(), runHire: vi.fn(), readCharter: vi.fn(), verifyCharterCapability: vi.fn(),
  executor: { quote: vi.fn(), execute: vi.fn() },
  tables: { run: { name: 'run' }, runEvent: { name: 'run_event' }, runRejection: { name: 'run_rejection' }, receipt: { name: 'receipt' } },
}))
vi.mock('@marque/db', () => ({ db: () => ({ insert }), ...tables }))
vi.mock('@marque/chain', () => ({ publicClient: () => ({ getBlockNumber: async () => 100n }) }))
vi.mock('@marque/execution', async (original) => ({
  ...await original<typeof import('@marque/execution')>(),
  executorFor: () => executor, runHire,
}))
vi.mock('./charters', () => ({ readCharter }))
vi.mock('./charter-capability', () => ({ verifyCharterCapability }))
vi.mock('./anchor', () => ({ anchorReceipt: vi.fn() }))
vi.mock('./reference-agents', () => ({ referenceAgent: () => null, displayName: () => null }))
vi.mock('./agent-state', () => ({ agentState: async () => ({
  agentId: '56:synthetic:1', name: 'Synthetic rejection fixture', hireable: true,
  selectedService: { serviceId: 42, protocol: 'a2a', discoveryEndpoint: 'https://synthetic.invalid/card', executableEndpoint: 'https://synthetic.invalid/a2a', probeId: 9 },
}) }))
import { startRun } from './runs'

const input = { agentId: '56:synthetic:1', subject: '0x0000000000000000000000000000000000000001', kind: 'health_factor' as const, policy: { targetHealthFactor: 2 }, maxSpendUsd: 1, charterId: 'synthetic-charter', charterToken: 'synthetic-token' }
beforeEach(() => {
  vi.clearAllMocks()
  insert.mockReturnValue({ values })
  values.mockResolvedValue(undefined)
  verifyCharterCapability.mockReturnValue(true)
  readCharter.mockResolvedValue({ id: input.charterId, agentId: input.agentId, category: 'health_factor', status: 'active', expiresAt: '2099-01-01T00:00:00Z' })
})

describe('pre-acceptance rejection remains separate from execution receipts', () => {
  it.each(['missing', 'unauthorized', 'identity_mismatch', 'revoked', 'expired'] as const)('records only rejection evidence for %s', async (failure) => {
    if (failure === 'missing') readCharter.mockResolvedValue(null)
    if (failure === 'unauthorized') verifyCharterCapability.mockReturnValue(false)
    if (failure === 'identity_mismatch') readCharter.mockResolvedValue({ id: input.charterId, agentId: '56:synthetic:2', category: 'health_factor', status: 'active', expiresAt: '2099-01-01T00:00:00Z' })
    if (failure === 'revoked') readCharter.mockResolvedValue({ id: input.charterId, agentId: input.agentId, category: 'health_factor', status: 'revoked', expiresAt: '2099-01-01T00:00:00Z' })
    if (failure === 'expired') readCharter.mockResolvedValue({ id: input.charterId, agentId: input.agentId, category: 'health_factor', status: 'active', expiresAt: '2000-01-01T00:00:00Z' })
    const result = await startRun(input)
    expect(result.ok).toBe(false)
    expect(result.rejectionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.runId).toBeUndefined()
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith(tables.runRejection)
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ id: result.rejectionId, agentId: input.agentId, serviceId: 42, charterId: input.charterId }))
    expect(runHire).not.toHaveBeenCalled()
    expect(executor.quote).not.toHaveBeenCalled()
    expect(executor.execute).not.toHaveBeenCalled()
  })
})
