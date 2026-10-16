import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const { agentForSheet, readContract, disputeWindowSeconds, execute, freeTarget } = vi.hoisted(() => ({
  agentForSheet: vi.fn(), readContract: vi.fn(), disputeWindowSeconds: vi.fn(), execute: vi.fn(), freeTarget: vi.fn(),
}))
vi.mock('@marque/db', () => ({ db: () => ({ execute }) }))
vi.mock('@marque/commerce', () => ({
  agentForSheet, disputeWindowSeconds, freeTarget,
  HireError: class HireError extends Error { constructor(public code: string, message: string, public status = 400) { super(message) } }, isSupportedChain: (v: number) => v === 56 || v === 97,
  campaignChainId: () => 56, chainClient: () => ({ readContract }), network: () => ({ commerce: '0x1' }),
}))
import { GET } from './route'
import { HireError } from '@marque/commerce'
const req = () => new NextRequest('https://candidate.invalid/api/v1/hire/agent?agentId=56:registry:1')
beforeEach(() => {
  vi.useFakeTimers()
  agentForSheet.mockReset().mockResolvedValue({ agentId: '56:registry:1', name: 'Selected seller', lastQuote: null })
  execute.mockReset().mockResolvedValue([])
  freeTarget.mockReset()
  readContract.mockReset().mockImplementation(() => new Promise(() => {}))
  disputeWindowSeconds.mockReset().mockImplementation(() => new Promise(() => {}))
})
afterEach(() => { vi.useRealTimers() })
describe('read-only hire metadata failure recovery', () => {
  it('retains the exact selected service', async () => {
    const pending = GET(new NextRequest('https://candidate.invalid/api/v1/hire/agent?agentId=56:registry:1&serviceId=42'))
    await vi.advanceTimersByTimeAsync(2501)
    expect((await pending).status).toBe(200)
    expect(agentForSheet).toHaveBeenCalledWith('56:registry:1',42)
  })
  it('rejects invalid service selection before dependency reads', async () => {
    for (const serviceId of ['0','-1','1.5','9007199254740992']) expect((await GET(new NextRequest(`https://candidate.invalid/api/v1/hire/agent?agentId=56:registry:1&serviceId=${serviceId}`))).status).toBe(400)
    expect(agentForSheet).not.toHaveBeenCalled()
  })
  it('does not replace an explicitly selected service with a free endpoint', async () => {
    agentForSheet.mockRejectedValue(new HireError('not_a_seller', 'fixture mismatch', 404))
    const response = await GET(new NextRequest('https://candidate.invalid/api/v1/hire/agent?agentId=56:registry:1&serviceId=42&try=1'))
    expect(response.status).toBe(404)
    expect(freeTarget).not.toHaveBeenCalled()
  })
  it('returns the selected seller while optional policy reads time out as unknown', async () => {
    const pending = GET(req())
    await vi.advanceTimersByTimeAsync(2501)
    const response = await pending
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ name: 'Selected seller', reviewWindowSeconds: null, platformFeeBP: null })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
  it('bounds an unavailable metadata dependency and returns a plain retryable error', async () => {
    agentForSheet.mockImplementation(() => new Promise(() => {}))
    const pending = GET(req())
    await vi.advanceTimersByTimeAsync(10001)
    const response = await pending
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: 'hire_unavailable' })
    expect(readContract).not.toHaveBeenCalled()
  })
})
