import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ data: new Map<string, { value: string | Buffer; until: number }>(), offline: false }))
vi.mock('ioredis', () => {
  const get = (key: string) => {
    if (h.offline) throw Error('Synthetic cache outage')
    const e = h.data.get(key)
    if (e && e.until <= Date.now()) { h.data.delete(key); return null }
    return e?.value ?? null
  }
  return { default: class {
    on() { return this }
    async getBuffer(key: string) { const b = get(key); return b === null ? null : Buffer.from(b) }
    async set(key: string, value: string | Buffer, _px: string, ttl: number, nx?: string) {
      if (h.offline) throw Error('Synthetic cache outage')
      if (nx && get(key) !== null) return null
      h.data.set(key, { value, until: Date.now() + ttl }); return 'OK'
    }
    async eval(_script: string, count: number, ...args: Array<string | number | Buffer>) {
      if (h.offline) throw Error('Synthetic cache outage')
      const key = String(args[0]), token = String(args[count])
      if (get(key) !== token) return 0
      if (count === 1) h.data.delete(key)
      else h.data.set(String(args[1]), { value: args[count + 1] as Buffer, until: Date.now() + Number(args[count + 2]) })
      return 1
    }
    async quit() { return 'OK' }
  } }
})
type Cache = typeof import('./cache')
const instances: Cache[] = []
const instance = async () => { vi.resetModules(); const c = await import('./cache'); instances.push(c); return c }
const pending = () => {
  let resolve!: (value: { value: string; blob: Buffer }) => void, reject!: (error: Error) => void
  const promise = new Promise<{ value: string; blob: Buffer }>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const opts = { coordinate: true, leaseMs: 90_000, keepMs: 86_400_000 }
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10_000); vi.stubEnv('REDIS_URL', 'redis://fixture.invalid'); h.data.clear(); h.offline = false })
afterEach(async () => { for (const c of instances.splice(0)) await c.closeCache(); vi.useRealTimers(); vi.unstubAllEnvs() })

it('lets only one process refresh a binary snapshot and preserves every byte', async () => {
  const a = await instance(), b = await instance(), work = pending(), duplicate = vi.fn()
  const owner = a.refreshBlob('catalogue', () => work.promise, opts); await flush()
  expect(await b.refreshBlob('catalogue', duplicate, opts)).toBeNull(); expect(duplicate).not.toHaveBeenCalled()
  expect(await b.loadBlob('catalogue')).toBeNull()
  const bytes = Buffer.from([0, 255, 128, 10, 34, 0])
  work.resolve({ value: 'complete', blob: bytes })
  expect(await owner).toBe('complete'); expect(await b.loadBlob('catalogue')).toEqual(bytes)
  expect(h.data.has('blob:refresh:catalogue')).toBe(false)
})
it('releases a failed query or encoder without replacing the last complete bytes', async () => {
  const a = await instance(), b = await instance()
  await a.storeBlob('catalogue', Buffer.from('old'), opts.keepMs)
  await expect(a.refreshBlob('catalogue', async () => { throw Error('encoder failed') }, opts)).rejects.toThrow('encoder failed')
  expect(await b.loadBlob('catalogue')).toEqual(Buffer.from('old'))
  expect(await b.refreshBlob('catalogue', async () => ({ value: 'new', blob: Buffer.from('new') }), opts)).toBe('new')
})
it('fences an expired owner from overwriting or unlocking its successor', async () => {
  const a = await instance(), b = await instance(), old = pending(), next = pending()
  await a.storeBlob('catalogue', Buffer.from('initial'), opts.keepMs)
  const first = a.refreshBlob('catalogue', () => old.promise, opts); await flush(); await vi.advanceTimersByTimeAsync(90_001)
  const second = b.refreshBlob('catalogue', () => next.promise, opts); await flush()
  const token = h.data.get('blob:refresh:catalogue')?.value
  old.resolve({ value: 'expired', blob: Buffer.from('expired') })
  expect(await first).toBeNull(); expect(h.data.get('blob:refresh:catalogue')?.value).toBe(token)
  expect(await a.loadBlob('catalogue')).toEqual(Buffer.from('initial'))
  next.resolve({ value: 'successor', blob: Buffer.from('successor') })
  expect(await second).toBe('successor'); expect(await a.loadBlob('catalogue')).toEqual(Buffer.from('successor'))
})
it('retains cold reads and local computation when Redis is unavailable', async () => {
  const a = await instance()
  expect(await a.refreshBlob('cold', async () => ({ value: 'cold', blob: Buffer.from('cold') }), { ...opts, coordinate: false })).toBe('cold')
  expect(h.data.has('blob:refresh:cold')).toBe(false)
  h.offline = true
  expect(await a.refreshBlob('cold', async () => ({ value: 'local', blob: Buffer.from('local') }), opts)).toBe('local')
})
