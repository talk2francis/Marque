import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ read: vi.fn(), pooled: vi.fn(), load: vi.fn(), store: vi.fn(), cache: new Map<string, Buffer>() }))
vi.mock('@marque/db', () => ({ loadBlob: mocks.load, storeBlob: mocks.store }))
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
  mocks.cache.clear()
  mocks.load.mockReset().mockImplementation(async key => mocks.cache.get(key) ?? null)
  mocks.store.mockReset().mockImplementation(async (key, value) => { mocks.cache.set(key, value); return true })
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
  await Promise.resolve()
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

it('shares only a confirmed immutable description with another worker', async () => {
  mocks.read.mockResolvedValue({ id: 700005n, description: '{"task":"Byte-exact shared task"}' })
  const first = await onchainJobTask(56, '700005')
  expect(mocks.store).toHaveBeenCalledTimes(1)
  vi.resetModules()
  const secondWorker = await import('./job-description')
  expect(await secondWorker.onchainJobTask(56, '700005')).toEqual(first)
  expect(mocks.pooled).toHaveBeenCalledTimes(1)
})

it.each(['wrong chain', 'wrong job', 'wrong escrow', 'empty description', 'malformed bytes'])('ignores %s in the shared description cache', async fault => {
  vi.resetModules()
  const worker = await import('./job-description')
  const entry = { chainId: 56, escrow: '0x0000000000000000000000000000000000000001', jobId: '700006', description: 'Cached task' }
  if (fault === 'wrong chain') entry.chainId = 97
  if (fault === 'wrong job') entry.jobId = '17'
  if (fault === 'wrong escrow') entry.escrow = '0x0000000000000000000000000000000000000002'
  if (fault === 'empty description') entry.description = ''
  mocks.load.mockResolvedValue(Buffer.from(fault === 'malformed bytes' ? '{' : JSON.stringify(entry)))
  mocks.read.mockResolvedValue({ id: 700006n, description: 'Confirmed task' })
  expect(await worker.onchainJobTask(56, '700006')).toMatchObject({ task: 'Confirmed task' })
  expect(mocks.pooled).toHaveBeenCalledTimes(1)
})

it('retains successful chain reads when the shared cache is unavailable and never stores a missing job', async () => {
  vi.resetModules()
  const worker = await import('./job-description')
  mocks.load.mockRejectedValue(new Error('Synthetic cache outage'))
  mocks.store.mockRejectedValue(new Error('Synthetic cache outage'))
  mocks.read.mockResolvedValueOnce({ id: 0n, description: '' }).mockResolvedValueOnce({ id: 700008n, description: 'Chain task' })
  expect(await worker.onchainJobTask(56, '700007')).toBeNull()
  expect(mocks.store).not.toHaveBeenCalled()
  expect(await worker.onchainJobTask(56, '700008')).toMatchObject({ task: 'Chain task' })
})
