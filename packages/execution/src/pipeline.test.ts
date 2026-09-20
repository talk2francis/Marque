import { describe, expect, it, vi } from 'vitest'
import { checkCharterBinding, runHire } from './pipeline'
import type { AgentExecutor } from './types'
import type { StructuredTask } from './tasks'

vi.mock('@marque/conformance', () => ({
  loadCase: vi.fn(), grade: vi.fn(),
}))

const task: StructuredTask = {
  kind: 'health_factor', chainId: 56, blockNumber: '100',
  subject: '0x0000000000000000000000000000000000000001', maxSpendUsd: 1,
  policy: { targetHealthFactor: 2 },
}

function executor(overrides: Partial<AgentExecutor> = {}): AgentExecutor {
  return {
    kind: 'a2a', agentId: '56:registry:1',
    inspect: vi.fn(),
    quote: vi.fn(async () => ({
      ok: true, status: 'price_unknown', provenance: 'none', agentId: '56:registry:1', kind: 'a2a', feeUsd: null,
      declaredPrice: null, settlementAsset: null, latencyMs: 1,
    })),
    execute: vi.fn(async () => ({
      ok: true, agentId: '56:registry:1', kind: 'a2a', result: { healthFactor: 2 },
      txHashes: [], feeUsd: null, latencyMs: 1,
      startedAt: '2026-09-21T00:00:00Z', finishedAt: '2026-09-21T00:00:01Z',
    })),
    ...overrides,
  }
}

describe('terminal evidence', () => {
  it('issues a failure receipt when quote discovery fails', async () => {
    const out = await runHire({
      runId: 'quote-failure', task,
      executor: executor({ quote: vi.fn(async () => ({
        ok: false, status: 'failed', provenance: 'none', agentId: '56:registry:1', kind: 'a2a', feeUsd: null,
        declaredPrice: null, settlementAsset: null, latencyMs: 2,
        reason: 'unreachable', detail: 'agent card returned http 502',
      })) }),
      ctx: { buyer: task.subject, maxSpendUsd: 1, charterId: 'charter:1', allowlist: [] },
    })
    expect(out.ok).toBe(false)
    expect(out.stage).toBe('quote')
    expect(out.receipt).toMatchObject({
      version: '2', artifactType: 'failure', runId: 'quote-failure',
      failure: { stage: 'quote', class: 'unreachable' },
      execution: { ok: false, txHashes: [] },
      commercial: { settled: false },
    })
    expect(out.receiptHash).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('issues a failure receipt when authority rejects the task', async () => {
    const out = await runHire({
      runId: 'authority-failure', task, executor: executor(),
      ctx: { buyer: task.subject, maxSpendUsd: 1, charterId: 'charter:1', allowlist: [] },
    })
    expect(out.stage).toBe('authority')
    expect(out.receipt?.failure).toMatchObject({ stage: 'authority', class: 'AUTHORIZATION_FAILED' })
    expect(out.receipt?.authority.withinAuthority).toBe(false)
  })
})

describe('Charter binding', () => {
  const valid = {
    selectedAgentId: '56:registry:1', charterAgentId: '56:registry:1',
    requestedCategory: 'yield', charterCategory: 'yield', charterStatus: 'active',
    expiresAt: '2026-09-21T01:00:00Z', now: new Date('2026-09-21T00:00:00Z'),
  }
  it('accepts only the exact active, unexpired agent/category binding', () => {
    expect(checkCharterBinding(valid)).toEqual({ ok: true })
  })
  it.each([
    [{ ...valid, charterAgentId: 'marque:sluicegate' }, 'IDENTITY_MISMATCH'],
    [{ ...valid, charterCategory: 'grid' }, 'CATEGORY_MISMATCH'],
    [{ ...valid, charterStatus: 'revoked' }, 'REVOKED'],
    [{ ...valid, expiresAt: '2026-09-20T23:00:00Z' }, 'EXPIRED'],
  ] as const)('rejects invalid binding %#', (input, reason) => {
    expect(checkCharterBinding(input)).toMatchObject({ ok: false, reason })
  })
})
