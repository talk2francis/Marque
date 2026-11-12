import { afterEach, expect, it, vi } from 'vitest'
vi.mock('viem', async original => ({ ...await original<object>(), createPublicClient: vi.fn(() => ({})) }))
import { fromAny } from './chain'

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
it('avoids redundant RPC calls after a fast valid answer, but starts a hedge when the first node fails', async () => {
  vi.stubEnv('BSC_RPC_URLS', 'https://one.fixture.invalid,https://two.fixture.invalid,https://three.fixture.invalid')
  vi.useFakeTimers()
  const fast = vi.fn(async () => 7)
  expect(await fromAny(56, fast, value => value > 0, 150)).toBe(7)
  await vi.advanceTimersByTimeAsync(1000)
  expect(fast).toHaveBeenCalledTimes(1)

  const fallback = vi.fn().mockRejectedValueOnce(new Error('Synthetic unavailable node')).mockResolvedValue(9)
  const result = fromAny(56, fallback, value => value === 9, 150)
  await vi.advanceTimersByTimeAsync(150)
  expect(await result).toBe(9)
  await vi.advanceTimersByTimeAsync(1000)
  expect(fallback).toHaveBeenCalledTimes(2)
})
