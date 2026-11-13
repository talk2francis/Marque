import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  client: { getBlockNumber: vi.fn(), getLogs: vi.fn() }, publicClient: vi.fn(), venus: vi.fn(), pancake: vi.fn(),
  execute: vi.fn(), published: vi.fn(),
}))
vi.mock('@marque/chain', () => ({ publicClient: h.publicClient }))
vi.mock('@marque/positions', () => ({ venusReader: h.venus, pancakeV3Reader: h.pancake }))
vi.mock('@marque/db', () => ({
  db: () => ({ execute: h.execute }),
  cachedProjection: async (_key: string, build: () => Promise<unknown>) => {
    const value = await build(); h.published(value); return { value }
  },
}))
vi.mock('@marque/conformance', () => ({
  CASES: [{ testId: 'MCS-HF-1', subject: { address: '0x1111111111111111111111111111111111111111' } },
    { testId: 'MCS-REB-1', subject: { owner: '0x2222222222222222222222222222222222222222', tokenId: '101' } }],
  REB_FALLBACK_SUBJECTS: [102, 103, 104, 105].map(tokenId => ({ tokenId: String(tokenId), owner: '0x2222222222222222222222222222222222222222' })),
}))
import { liveExamples } from './live-examples'
let stop: AbortController
beforeEach(() => {
  vi.clearAllMocks(); stop = new AbortController()
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(stop.signal)
  h.publicClient.mockImplementation((signal: AbortSignal) => { expect(signal).toBe(stop.signal); return h.client })
  h.client.getBlockNumber.mockResolvedValue(100_000n)
  h.client.getLogs.mockResolvedValue(Array.from({ length: 60 }, (_, i) => ({ args: { borrower: `0x${String(i + 10).padStart(40, '0')}` } })))
  h.execute.mockResolvedValue([])
  h.venus.mockResolvedValue({ ok: true, blockNumber: 100_000n, data: { totalBorrowedUsd: { value: 2000 }, healthFactor: { value: 1.5 } } })
  h.pancake.mockImplementation(async (_owner: string, { tokenId }: { tokenId: bigint }) => ({ ok: true, blockNumber: 100_000n,
    data: { positions: [{ tokenId, liquidity: '42', token0: { symbol: 'A' }, token1: { symbol: 'B' }, inRange: { value: 1 } }] } }))
})
afterEach(() => vi.restoreAllMocks())

it('retains five real loan and position examples, order, block provenance and the original budget', async () => {
  const value = await liveExamples()
  expect(AbortSignal.timeout).toHaveBeenCalledWith(25_000)
  expect(value.loans).toHaveLength(5); expect(value.positions).toHaveLength(5)
  expect(value.loans[0]!.address).toBe('0x1111111111111111111111111111111111111111')
  expect(value.positions[0]!.tokenId).toBe('7367728')
  expect([...value.loans, ...value.positions].every(x => x.block === '100000')).toBe(true)
  expect(h.published).toHaveBeenCalledOnce()
})

it('aborts borrower discovery without starting another window or publishing an empty replacement', async () => {
  let started!: () => void
  const ready = new Promise<void>(resolve => { started = resolve })
  h.client.getLogs.mockImplementationOnce(() => new Promise((_resolve, reject) => {
    started(); stop.signal.addEventListener('abort', () => reject(stop.signal.reason), { once: true })
  }))
  const work = liveExamples(), rejected = expect(work).rejects.toThrow('Stop scan')
  await ready; stop.abort(Error('Stop scan')); await rejected
  expect(h.client.getLogs).toHaveBeenCalledOnce()
  expect(h.venus).not.toHaveBeenCalled(); expect(h.pancake).not.toHaveBeenCalled(); expect(h.published).not.toHaveBeenCalled()
})

it('rejects a cancelled scan after one valid loan without publishing a partial projection', async () => {
  h.venus.mockImplementationOnce(async () => { stop.abort(Error('Stop scan')); return { ok: true, blockNumber: 100_000n,
    data: { totalBorrowedUsd: { value: 2000 }, healthFactor: { value: 1.5 } } } })
  await expect(liveExamples()).rejects.toThrow('Stop scan')
  expect(h.venus).toHaveBeenCalledOnce(); expect(h.pancake).not.toHaveBeenCalled(); expect(h.published).not.toHaveBeenCalled()
})
