import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const { agentForSheet, readContract, disputeWindowSeconds, execute } = vi.hoisted(() => ({
  agentForSheet: vi.fn(), readContract: vi.fn(), disputeWindowSeconds: vi.fn(), execute: vi.fn(),
}))
vi.mock('@marque/db', () => ({ db: () => ({ execute }) }))
vi.mock('@marque/commerce', () => ({
  agentForSheet, disputeWindowSeconds, freeTarget: vi.fn(),
  HireError: class HireError extends Error {}, isSupportedChain: (v: number) => v === 56 || v === 97,
  campaignChainId: () => 56, chainClient: () => ({ readContract }), network: () => ({ commerce: '0x1' }),
}))
import { GET } from './route'
const req = () => new NextRequest('https://candidate.invalid/api/v1/hire/agent?agentId=56:registry:1')
beforeEach(() => {
  vi.useFakeTimers()
  agentForSheet.mockReset().mockResolvedValue({ agentId: '56:registry:1', name: 'Selected seller', lastQuote: null })
  execute.mockReset().mockResolvedValue([])
  readContract.mockReset().mockImplementation(() => new Promise(() => {}))
  disputeWindowSeconds.mockReset().mockImplementation(() => new Promise(() => {}))
})
afterEach(() => { vi.useRealTimers() })
describe('read-only hire metadata failure recovery', () => {
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
