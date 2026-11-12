import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  data: new Map<string, { value: string; until: number }>(),
  acquisitions: [] as Array<{ key: string; token: string }>,
  offline: false,
}))
vi.mock('ioredis', () => {
  const read = (key: string) => {
    const entry = h.data.get(key)
    if (entry && entry.until <= Date.now()) { h.data.delete(key); return null }
    return entry?.value ?? null
  }
  return { default: class {
    on() { return this }
    async get(key: string) { if (h.offline) throw Error('Synthetic cache outage'); return read(key) }
    async set(key: string, value: string, _px: string, ttl: number, nx?: string) {
      if (h.offline) throw Error('Synthetic cache outage')
      if (nx && read(key) !== null) return null
      if (nx) h.acquisitions.push({ key, token: value })
      h.data.set(key, { value, until: Date.now() + ttl }); return 'OK'
    }
    async eval(_script: string, count: number, ...args: Array<string | number>) {
      if (h.offline) throw Error('Synthetic cache outage')
      const keys = args.slice(0, count).map(String), values = args.slice(count).map(String)
      if (read(keys[0]!) !== values[0]) return 0
      if (count === 1) h.data.delete(keys[0]!)
      else h.data.set(keys[1]!, { value: values[1]!, until: Date.now() + Number(values[2]) })
      return 1
    }
    async quit() { return 'OK' }
  } }
})

type Cache = typeof import('./cache')
const instances: Cache[] = []
const options = { freshMs: 1_000, timeoutMs: 5_000, staleWhileRevalidate: true, staleRefreshLeaseMs: 45_000 }
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
const instance = async () => { vi.resetModules(); const c = await import('./cache'); instances.push(c); return c }
const pending = () => {
  let resolve!: (value: string) => void, reject!: (error: Error) => void
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-12T10:00:00Z'))
  vi.stubEnv('REDIS_URL', 'redis://fixture.invalid'); h.data.clear(); h.acquisitions.length = 0; h.offline = false
})
afterEach(async () => { for (const c of instances.splice(0)) await c.closeCache(); vi.useRealTimers(); vi.unstubAllEnvs() })

it('shares a stale refresh between separate process caches and preserves the observation date', async () => {
  const a = await instance(), b = await instance(), job = pending()
  const first = await a.cachedProjection('funnel', async () => 'old', options)
  expect(h.acquisitions).toHaveLength(0) // Cold reads retain the ordinary path.
  await vi.advanceTimersByTimeAsync(1_001)
  const owner = vi.fn(() => job.promise), duplicate = vi.fn(async () => 'duplicate')
  const [left, right] = await Promise.all([a.cachedProjection('funnel', owner, options), b.cachedProjection('funnel', duplicate, options)])
  await flush()
  expect(owner).toHaveBeenCalledTimes(1); expect(duplicate).not.toHaveBeenCalled()
  expect(left).toMatchObject({ value: 'old', computedAt: first.computedAt, stale: true })
  expect(right).toEqual(left)
  job.resolve('new'); await flush()
  expect(await b.cachedProjection('funnel', duplicate, options)).toMatchObject({ value: 'new', stale: false })
  expect(duplicate).not.toHaveBeenCalled()
})

it('releases a failed refresh so another process can recover immediately', async () => {
  const a = await instance(), b = await instance(), job = pending()
  await a.cachedProjection('funnel', async () => 'old', options); await vi.advanceTimersByTimeAsync(1_001)
  await a.cachedProjection('funnel', () => job.promise, options); await flush()
  job.reject(Error('Synthetic query failure')); await flush()
  const recover = vi.fn(async () => 'recovered')
  expect(await b.cachedProjection('funnel', recover, options)).toMatchObject({ value: 'old', stale: true })
  await flush(); expect(recover).toHaveBeenCalledTimes(1)
  expect(await a.cachedProjection('funnel', recover, options)).toMatchObject({ value: 'recovered', stale: false })
})

it('keeps memory fallback available while Redis is unreachable', async () => {
  const a = await instance()
  await a.cachedProjection('funnel', async () => 'old', options); await vi.advanceTimersByTimeAsync(1_001); h.offline = true
  const refresh = vi.fn(async () => 'local')
  expect(await a.cachedProjection('funnel', refresh, options)).toMatchObject({ value: 'old', stale: true })
  await flush(); expect(refresh).toHaveBeenCalledTimes(1)
  expect(await a.cachedProjection('funnel', refresh, options)).toMatchObject({ value: 'local', stale: false })
})

it('lets an expired lease recover without the previous owner overwriting or unlocking its successor', async () => {
  const a = await instance(), b = await instance(), old = pending(), next = pending()
  await a.cachedProjection('funnel', async () => 'initial', options); await vi.advanceTimersByTimeAsync(1_001)
  await a.cachedProjection('funnel', () => old.promise, options); await flush()
  await vi.advanceTimersByTimeAsync(45_001)
  await b.cachedProjection('funnel', () => next.promise, options); await flush()
  const successor = h.data.get('proj:refresh:funnel')?.value
  expect(successor).toBeTruthy()
  old.resolve('late old value'); await flush()
  expect(h.data.get('proj:refresh:funnel')?.value).toBe(successor)
  expect(JSON.parse(h.data.get('proj:funnel')!.value).value).toBe('initial')
  next.resolve('successor value'); await flush()
  expect(await a.cachedProjection('funnel', async () => 'wrong', options)).toMatchObject({ value: 'successor value', stale: false })
})
