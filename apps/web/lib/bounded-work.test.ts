import { afterEach, describe, expect, it, vi } from 'vitest'
import { boundedWork } from './bounded-work'

afterEach(() => vi.useRealTimers())
describe('bounded read queue', () => {
  it('keeps the active limit and starts queued work in arrival order', async () => {
    const run = boundedWork(2, 8, 2500), order: number[] = []
    let release!: () => void
    const wait = new Promise<void>(resolve => { release = resolve })
    let active = 0, peak = 0
    const jobs = [0, 1, 2, 3].map(n => run(async () => { order.push(n); active++; peak = Math.max(peak, active); await wait; active--; return n }))
    expect(order).toEqual([0, 1])
    release()
    expect(await Promise.all(jobs)).toEqual([0, 1, 2, 3])
    expect(order).toEqual([0, 1, 2, 3]); expect(peak).toBe(2)
  })
  it('never starts expired work, refuses an overfull queue and releases failed tasks', async () => {
    vi.useFakeTimers()
    const run = boundedWork(1, 1, 20)
    let release!: () => void
    const first = run(() => new Promise<void>(resolve => { release = resolve }))
    const expiredWork = vi.fn(async () => 1)
    const second = run(expiredWork)
    const rejected = expect(second).rejects.toThrow('wait_expired')
    await expect(run(async () => 3)).rejects.toThrow('busy')
    await vi.advanceTimersByTimeAsync(21); await rejected
    release(); await first
    expect(expiredWork).not.toHaveBeenCalled()
    await expect(run(async () => { throw Error('read failed') })).rejects.toThrow('read failed')
    await expect(run(async () => 4)).resolves.toBe(4)
  })
})
