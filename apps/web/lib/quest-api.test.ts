import { afterEach, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ build: vi.fn() }))
vi.mock('@marque/commerce', () => ({ questFor: h.build }))
import { closeCache } from '@marque/db'
import { questProjection } from './quest-api'

afterEach(async () => { await closeCache(); vi.useRealTimers(); vi.unstubAllEnvs() })
it('returns the dated last-good wallet progress while its slow refresh is pending, then recovers', async () => {
  vi.stubEnv('REDIS_URL', '')
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-12T10:00:00Z'))
  const address = `0x${'1'.repeat(40)}`
  const old = { observedAt: new Date().toISOString() }
  let finish!: (value: { observedAt: string }) => void
  h.build.mockResolvedValueOnce(old).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const first = await questProjection(address)
  expect(first.stale).toBe(false)
  await vi.advanceTimersByTimeAsync(60_001)
  const read = questProjection(address)
  const raced = Promise.race([read, new Promise<null>(resolve => setTimeout(() => resolve(null), 1))])
  await vi.advanceTimersByTimeAsync(1)
  const stale = await raced
  expect(stale).not.toBeNull()
  expect(stale?.value).toEqual(old)
  expect(stale?.stale).toBe(true)
  expect(stale?.computedAt).toBe(first.computedAt)
  expect(stale?.ageMs).toBeGreaterThan(60_000)
  const fresh = { observedAt: new Date().toISOString() }
  finish(fresh)
  await vi.advanceTimersByTimeAsync(1)
  const recovered = await questProjection(address)
  expect(recovered.value).toEqual(fresh)
  expect(recovered.stale).toBe(false)
  expect(h.build).toHaveBeenCalledTimes(2)
})
