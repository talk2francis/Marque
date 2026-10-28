import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRetry } from './fetch-retry'

afterEach(() => { vi.unstubAllGlobals() })
const res = (status: number) => new Response('{}', { status })

describe('fetchRetry', () => {
  it('tries again after a 503 and a network drop, then returns the good answer', async () => {
    const f = vi.fn().mockResolvedValueOnce(res(503)).mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(res(200))
    vi.stubGlobal('fetch', f)
    expect((await fetchRetry('/x', {}, [1, 1])).status).toBe(200)
    expect(f).toHaveBeenCalledTimes(3)
  })
  it('returns a non-retryable failure at once, and the last answer when retries run out', async () => {
    const f = vi.fn().mockResolvedValue(res(404))
    vi.stubGlobal('fetch', f)
    expect((await fetchRetry('/x', {}, [1, 1])).status).toBe(404)
    expect(f).toHaveBeenCalledTimes(1)
    const g = vi.fn().mockResolvedValue(res(503))
    vi.stubGlobal('fetch', g)
    expect((await fetchRetry('/x', {}, [1, 1])).status).toBe(503)
    expect(g).toHaveBeenCalledTimes(3)
  })
  it('stops when the caller aborts', async () => {
    const c = new AbortController()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(503)))
    const p = fetchRetry('/x', { signal: c.signal }, [50, 50])
    c.abort()
    await expect(p).rejects.toBeTruthy()
  })
})
