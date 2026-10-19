import { expect, it, vi } from 'vitest'
import { readinessGuard } from './seller-readiness.js'

it('never treats unknown state as ready and coalesces simultaneous checks', async () => {
  let release!: () => void
  const read = vi.fn(() => new Promise<void>(resolve => { release = resolve }))
  const guard = readinessGuard(read)
  expect(guard.status()).toBe('unknown')
  const a = guard(), b = guard()
  expect(read).toHaveBeenCalledTimes(1)
  release(); await Promise.all([a, b])
  expect(guard.status()).toBe('ready')
})
it('bounds a healthy observation and rechecks after its actual cache interval', async () => {
  let now = 1_000
  const read = vi.fn(async () => {})
  const guard = readinessGuard(read, { now: () => now, successMs: 100 })
  await guard(); now += 99; await guard()
  expect(read).toHaveBeenCalledTimes(1)
  now++; expect(guard.status()).toBe('unknown'); await guard()
  expect(read).toHaveBeenCalledTimes(2)
})
it('declines new terms on dependency failure without leaking its endpoint', async () => {
  const guard = readinessGuard(async () => { throw Error('https://archive.invalid/private-token') })
  await expect(guard()).rejects.toThrow('No new quote can be issued')
  expect(guard.status()).toBe('unavailable')
  await expect(guard()).rejects.not.toThrow('private-token')
})
it('retains a short failure backoff and recovers only after a successful real recheck', async () => {
  let now = 1_000
  const read = vi.fn().mockRejectedValueOnce(Error('unavailable')).mockResolvedValueOnce(undefined)
  const guard = readinessGuard(read, { now: () => now, failureMs: 100 })
  await expect(guard()).rejects.toThrow(); now += 99
  await expect(guard()).rejects.toThrow(); expect(read).toHaveBeenCalledTimes(1)
  now++; expect(guard.status()).toBe('unknown'); await guard()
  expect(guard.status()).toBe('ready'); expect(read).toHaveBeenCalledTimes(2)
})
