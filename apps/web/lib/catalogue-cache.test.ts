import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { catalogueCache, type CatalogueSnapshot } from './catalogue-cache'

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
const pending = <T>() => {
  let resolve!: (value: T) => void, reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10_000) })
afterEach(() => { vi.useRealTimers() })

it('starts from a stale complete snapshot immediately and adopts the other worker refresh', async () => {
  const old = { at: 1, rows: Array.from({ length: 513 }, (_, id) => ({ id })) }
  let shared = old, leased = false
  const work = pending<CatalogueSnapshot<{ id: number }>>()
  const compute = vi.fn(() => work.promise)
  const refresh = vi.fn(async (coordinate: boolean) => {
    expect(coordinate).toBe(true)
    if (leased) return null
    leased = true
    try { shared = await compute(); return shared } finally { leased = false }
  })
  const load = vi.fn(async () => shared)
  const workers = Array.from({ length: 4 }, () => catalogueCache({ load, freshMs: 5_000 }))
  expect(await Promise.all(workers.map(w => w.read(refresh)))).toEqual([old, old, old, old])
  await flush(); expect(compute).toHaveBeenCalledTimes(1)
  expect(refresh.mock.calls.every(args => args[0] !== false)).toBe(true)
  const next = { at: Date.now(), rows: [...old.rows, { id: 513 }] }
  work.resolve(next); await flush()
  await vi.advanceTimersByTimeAsync(1_001)
  // The owner's real observation date is retained when the other workers adopt it.
  await Promise.all(workers.slice(1).map(w => w.read(refresh))); await flush()
  expect(workers.slice(1).map(w => w.peek())).toEqual([shared, shared, shared])
  expect(compute).toHaveBeenCalledTimes(1)
  expect(shared.rows).toHaveLength(514)
})

it('keeps fresh reads in memory with their original date and no extra shared read', async () => {
  const entry = { at: Date.now(), rows: [0, 1, 2] }, load = vi.fn(async () => entry), refresh = vi.fn()
  const cache = catalogueCache({ load, freshMs: 1_000 })
  expect(await cache.read(refresh)).toEqual(entry)
  await vi.advanceTimersByTimeAsync(999)
  expect(await cache.read(refresh)).toEqual(entry)
  expect(load).toHaveBeenCalledTimes(1); expect(refresh).not.toHaveBeenCalled()
})

it('shares cold computation, never exposes an empty population and propagates cold failure', async () => {
  const load = vi.fn(async () => null), cache = catalogueCache<number>({ load, freshMs: 1_000 })
  const work = pending<CatalogueSnapshot<number>>(), refresh = vi.fn(() => work.promise)
  const a = cache.read(refresh), b = cache.read(refresh)
  await flush(); expect(load).toHaveBeenCalledTimes(1); expect(refresh).toHaveBeenCalledOnce(); expect(refresh).toHaveBeenCalledWith(false)
  work.reject(Error('query failed'))
  await expect(a).rejects.toThrow('query failed'); await expect(b).rejects.toThrow('query failed')
  expect(cache.peek()).toBeNull()
  const complete = { at: Date.now(), rows: [1, 2, 3] }
  expect(await cache.read(async () => complete)).toEqual(complete)
})

it('retains last good rows after a failed refresh and bounds polling while another worker owns it', async () => {
  const entry = { at: 1, rows: [1, 2, 3] }, load = vi.fn(async () => entry)
  const cache = catalogueCache({ load, freshMs: 1_000 }), refresh = vi.fn(async () => { throw Error('query failed') })
  expect(await cache.read(refresh)).toEqual(entry); await flush()
  const reads = load.mock.calls.length
  for (let i = 0; i < 20; i++) expect(await cache.read(refresh)).toEqual(entry)
  expect(load).toHaveBeenCalledTimes(reads); expect(refresh).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(1_001)
  expect(await cache.read(async () => null)).toEqual(entry); await flush()
  expect(cache.peek()).toEqual(entry)
})

it('uses the local complete result during a shared-cache outage', async () => {
  const cache = catalogueCache<number>({ load: async () => { throw Error('Redis unavailable') }, freshMs: 1_000 })
  const entry = { at: Date.now(), rows: [4, 5] }
  expect(await cache.read(async () => entry)).toEqual(entry)
  expect(cache.peek()).toEqual(entry)
})
