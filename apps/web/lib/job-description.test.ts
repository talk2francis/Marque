import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ read: vi.fn(), pooled: vi.fn() }))
vi.mock('@marque/commerce', () => ({
  agenticCommerceAbi: [],
  isSupportedChain: (chain: number) => chain === 56 || chain === 97,
  network: () => ({ commerce: '0x0000000000000000000000000000000000000001' }),
  fromAny: mocks.pooled,
}))
import { onchainJobTask } from './job-description'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-12T00:00:00Z'))
  mocks.read.mockReset()
  mocks.pooled.mockReset().mockImplementation(async (_chain, read, valid) => {
    const value = await read({ readContract: mocks.read })
    if (!valid(value)) throw new Error('Synthetic node has not observed this job')
    return value
  })
})
afterEach(() => vi.useRealTimers())

it('coalesces concurrent reads and retains a confirmed immutable description', async () => {
  let resolve!: (job: { id: bigint; description: string }) => void
  mocks.read.mockReturnValue(new Promise(done => { resolve = done }))
  const first = onchainJobTask(56, '700001'), second = onchainJobTask(56, '700001')
  expect(mocks.pooled).toHaveBeenCalledTimes(1)
  resolve({ id: 700001n, description: '{"task":"The original task"}' })
  expect(await first).toEqual({ description: '{"task":"The original task"}', task: 'The original task' })
  expect(await second).toEqual(await first)
  expect(await onchainJobTask(56, '700001')).toEqual(await first)
  expect(mocks.pooled).toHaveBeenCalledTimes(1)
})
it('does not permanently hide a job first read before its creation', async () => {
  mocks.read.mockResolvedValueOnce({ id: 0n, description: '' }).mockResolvedValueOnce({ id: 700002n, description: 'New job' })
  expect(await onchainJobTask(56, '700002')).toBeNull()
  expect(await onchainJobTask(56, '700002')).toBeNull()
  expect(mocks.read).toHaveBeenCalledTimes(1)
  vi.setSystemTime(new Date('2026-11-12T00:00:16Z'))
  expect(await onchainJobTask(56, '700002')).toMatchObject({ task: 'New job' })
})
it('never caches transport failures or a response for a different job', async () => {
  mocks.read.mockRejectedValueOnce(new Error('Synthetic node unavailable'))
    .mockResolvedValueOnce({ id: 17n, description: 'Wrong job' })
    .mockResolvedValueOnce({ id: 700003n, description: 'Correct job' })
  expect(await onchainJobTask(56, '700003')).toBeNull()
  expect(await onchainJobTask(56, '700003')).toBeNull()
  expect(await onchainJobTask(56, '700003')).toMatchObject({ task: 'Correct job' })
})
it('keeps chain identities separate and accepts the job page\'s full numeric identifier range', async () => {
  mocks.read.mockResolvedValueOnce({ id: 700004n, description: 'Mainnet task' })
    .mockResolvedValueOnce({ id: 700004n, description: 'Practice task' })
    .mockResolvedValueOnce({ id: 12345678901234567890n, description: 'Large job identifier' })
  expect((await onchainJobTask(56, '700004'))?.task).toBe('Mainnet task')
  expect((await onchainJobTask(97, '700004'))?.task).toBe('Practice task')
  expect((await onchainJobTask(56, '12345678901234567890'))?.task).toBe('Large job identifier')
  for (const [chain, id] of [[1, '700004'], [56, '-1'], [56, '1x'], [56, '1'.repeat(21)]] as const) expect(await onchainJobTask(chain, id)).toBeNull()
  expect(mocks.read).toHaveBeenCalledTimes(3)
})
