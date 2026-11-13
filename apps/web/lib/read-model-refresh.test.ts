import { expect, it, vi } from 'vitest'
import { maintainReadModels, readModelPaths, refreshReadModels } from './read-model-refresh'

it('refreshes both networks through public projections without individual Job Rooms or money writes', async () => {
  const reads: string[] = []
  const read = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    expect(url.origin).toBe('http://127.0.0.1:3297')
    expect(init?.method).toBeUndefined()
    expect(init?.redirect).toBe('error')
    expect(init?.cache).toBe('no-store')
    reads.push(url.pathname + url.search)
    return new Response('{}')
  })
  await refreshReadModels('http://127.0.0.1:3297', { read })
  expect(reads).toEqual(expect.arrayContaining([...readModelPaths]))
  expect(reads).toHaveLength(readModelPaths.length)
  expect(reads.some(path => path.startsWith('/jobs/'))).toBe(false)
})

it('bounds concurrency, consumes complete responses and continues after failed reads', async () => {
  let active = 0, maximum = 0, consumed = 0
  const failed = vi.fn()
  const read = vi.fn(async () => {
    active++; maximum = Math.max(maximum, active)
    await Promise.resolve()
    const response = new Response('{}', { status: consumed === 0 ? 503 : 200 })
    const consume = response.arrayBuffer.bind(response)
    response.arrayBuffer = async () => { const body = await consume(); consumed++; active--; return body }
    return response
  })
  await refreshReadModels('http://127.0.0.1:3297', { read, failed })
  expect(maximum).toBe(2)
  expect(consumed).toBe(readModelPaths.length)
  expect(failed).toHaveBeenCalled()
})

it('does not overlap refresh cycles and stops before another pass after cancellation', async () => {
  const controller = new AbortController(), read = vi.fn(async () => new Response('{}'))
  const pause = vi.fn(async (ms: number) => {
    expect(ms).toBe(5_000)
    expect(read).toHaveBeenCalledTimes(readModelPaths.length)
    controller.abort()
  })
  await maintainReadModels('http://127.0.0.1:3297', { read, signal: controller.signal, pause })
  expect(pause).toHaveBeenCalledOnce()
  expect(read).toHaveBeenCalledTimes(readModelPaths.length)
})

it('refuses public destinations and performs no read after cancellation', async () => {
  const read = vi.fn(), controller = new AbortController()
  await expect(refreshReadModels('https://marque.trade', { read })).rejects.toThrow('loopback')
  controller.abort()
  await refreshReadModels('http://127.0.0.1:3297', { read, signal: controller.signal })
  expect(read).not.toHaveBeenCalled()
})

it('counts a truncated response as unavailable rather than a completed refresh', async () => {
  const failed = vi.fn(), read = vi.fn(async () => new Response(new ReadableStream({
    start(controller) { controller.error(Error('Synthetic truncated body')) },
  })))
  await refreshReadModels('http://127.0.0.1:3297', { read, failed })
  expect(failed).toHaveBeenCalledTimes(readModelPaths.length)
})
