import { describe, expect, it, vi, afterEach } from 'vitest'
import { safeFetch } from '@marque/probe'
import { X402Executor } from './x402'
import type { StructuredTask } from '../tasks'
vi.mock('@marque/probe', async original => ({ ...await original<typeof import('@marque/probe')>(), safeFetch: vi.fn() }))
const task: StructuredTask = { kind: 'yield', chainId: 56, blockNumber: '123', subject: '0x0000000000000000000000000000000000000001', maxSpendUsd: 1, policy: { asset: 'USDT', sizeUsd: 100, allowedProtocols: ['Venus'], minImprovementBps: 10, leverageAllowed: false, currentAprPct: 2 } }
afterEach(() => vi.resetAllMocks())
const response = (status: number, body = '{}') => ({ ok: true as const, status, body, headers: {}, bytes: body.length, latencyMs: 1, finalUrl: 'https://provider.invalid', redirects: 0 })
describe('x402 observation cannot silently invoke work', () => {
  it.each([200, 404, 503])('does not classify HTTP %s as a free compatible service', async status => {
    vi.mocked(safeFetch).mockResolvedValue(response(status))
    const result = await new X402Executor('exact-id', 'https://provider.invalid').quote(task)
    expect(result).toMatchObject({ ok: false, feeUsd: null, declaredPrice: null })
    expect(result.status).not.toBe('free')
    expect(safeFetch).toHaveBeenCalledTimes(1)
    expect(vi.mocked(safeFetch).mock.calls[0]?.[1]).not.toHaveProperty('body')
  })
  it('preflight and execution are blocked before any provider request', async () => {
    const x = new X402Executor('exact-id', 'https://provider.invalid')
    expect(await x.preflight(task)).toMatchObject({ ok: false, reason: 'blocked', nothingSubmitted: true })
    expect(await x.execute(task, { buyer: task.subject, maxSpendUsd: 1 })).toMatchObject({ ok: false, reason: 'blocked', txHashes: [] })
    expect(safeFetch).not.toHaveBeenCalled()
  })
  it('keeps reachability separate from free-task and price support', async () => {
    vi.mocked(safeFetch).mockResolvedValue(response(200, '{"name":"Discovery only"}'))
    expect(await new X402Executor('exact-id', 'https://provider.invalid').inspect()).toMatchObject({ supportsFreePreflight: false, declaredPrice: null })
    vi.mocked(safeFetch).mockResolvedValue(response(503))
    expect(await new X402Executor('exact-id', 'https://provider.invalid').inspect()).toMatchObject({ ok: false, reason: 'unreachable' })
  })
  it('keeps 402 as payment required without selecting an option', async () => {
    vi.mocked(safeFetch).mockResolvedValue(response(402, '{"x402Version":2}'))
    expect(await new X402Executor('exact-id', 'https://provider.invalid').quote(task)).toMatchObject({ ok: false, reason: 'payment_required', feeUsd: null, settlementAsset: null })
  })
})
