import { afterEach, expect, it, vi } from 'vitest'
import { RpcPool } from './pool'
import { createPublicClient } from 'viem'

afterEach(() => vi.unstubAllGlobals())

it('aborts active reads without retrying other endpoints or marking them unhealthy', async () => {
  let started!: () => void
  const ready = new Promise<void>(resolve => { started = resolve })
  const fetch = vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    started()
    init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true })
  }))
  vi.stubGlobal('fetch', fetch)
  const pool = new RpcPool(['https://first.invalid', 'https://second.invalid'], 56, { failureThreshold: 1 })
  const stop = new AbortController(), work = pool.request({ method: 'eth_blockNumber' }, stop.signal)
  const rejected = expect(work).rejects.toThrow('Stop this scan')
  await ready; stop.abort(Error('Stop this scan')); await rejected
  expect(fetch).toHaveBeenCalledOnce()
  expect(pool.stats().every(e => e.healthy && e.totalFailed === 0)).toBe(true)
  await expect(pool.request({ method: 'eth_blockNumber' }, stop.signal)).rejects.toThrow('Stop this scan')
  expect(fetch).toHaveBeenCalledOnce()
})

it('keeps the original per-endpoint timeout when a longer scan signal is present', async () => {
  let calls = 0, timedOut = false
  vi.stubGlobal('fetch', vi.fn((_input: unknown, init?: RequestInit) => {
    calls++
    if (calls === 1) return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => { timedOut = true; reject(init!.signal!.reason) }, { once: true }))
    return Promise.resolve(new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x123' }), { headers: { 'content-type': 'application/json' } }))
  }))
  const pool = new RpcPool(['https://first.invalid', 'https://second.invalid'], 56, { timeoutMs: 30, failureThreshold: 1 })
  const scan = new AbortController()
  expect(await pool.request({ method: 'eth_blockNumber' }, scan.signal)).toBe('0x123')
  expect(timedOut).toBe(true); expect(scan.signal.aborted).toBe(false)
  expect(pool.stats()[0]!.totalFailed).toBe(1)
  expect(pool.stats()[1]!.totalOk).toBe(1)
})

it('leaves ordinary shared-client reads and successful scoped reads working', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x456' }), { headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetch)
  const pool = new RpcPool(['https://first.invalid'], 56)
  expect(await pool.request({ method: 'eth_blockNumber' })).toBe('0x456')
  expect(await pool.request({ method: 'eth_blockNumber' }, new AbortController().signal)).toBe('0x456')
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(pool.stats()[0]!.totalOk).toBe(2)
  const client = createPublicClient({ transport: pool.transport() })
  expect(await client.request({ method: 'eth_blockNumber' }, { retryCount: 0 })).toBe('0x456')
  const scoped = createPublicClient({ transport: pool.transport(new AbortController().signal) })
  expect(await scoped.getBlockNumber({ cacheTime: 0 })).toBe(0x456n)
  expect(pool.stats()[0]!.totalOk).toBe(4)
})
