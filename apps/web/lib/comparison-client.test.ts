import { afterEach, expect, it, vi } from 'vitest'
const configured = vi.hoisted(() => ({ urls: ['https://slow.example.invalid', 'https://healthy.example.invalid'] }))
vi.mock('@marque/chain', async importOriginal => {
  const actual = await importOriginal<typeof import('@marque/chain')>()
  return { ...actual, rpcPool: () => ({ stats: () => configured.urls.map(url => ({ url })) }) }
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.resetModules() })

it('fails over a hanging read before the four-second comparison deadline, preserving its pinned block', async () => {
  vi.useFakeTimers()
  const requests: Array<{ host: string; body: { id: number; method: string; params: unknown[] } }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { id: number; method: string; params: unknown[] }
    const host = new URL(String(url)).hostname
    requests.push({ host, body })
    if (host === 'slow.example.invalid') return new Promise<Response>((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    })
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x01' }), { headers: { 'content-type': 'application/json' } })
  }))
  const { comparisonClient } = await import('./comparison-client')
  const started = Date.now()
  const result = comparisonClient().request({ method: 'eth_call', params: [{ to: `0x${'1'.repeat(40)}`, data: '0x' }, '0x1234'] })
  await vi.advanceTimersByTimeAsync(800)
  expect(await result).toBe('0x01')
  expect(Date.now() - started).toBeLessThan(4000)
  expect(requests.map(r => r.host)).toEqual(['slow.example.invalid', 'healthy.example.invalid'])
  expect(requests.every(r => r.body.method === 'eth_call' && r.body.params[1] === '0x1234')).toBe(true)
  // The failing provider is benched; the next real read avoids another timeout.
  expect(await comparisonClient().request({ method: 'eth_blockNumber' })).toBe('0x01')
  expect(requests.at(-1)?.host).toBe('healthy.example.invalid')
})

it('rejects transaction submission before any transport call', async () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  const { comparisonClient } = await import('./comparison-client')
  await expect(comparisonClient().request({ method: 'eth_sendRawTransaction', params: ['0x'] } as never)).rejects.toThrow('comparison_rpc_read_only')
  expect(fetcher).not.toHaveBeenCalled()
})

it('allows the yield reader to obtain a gas price without permitting a transaction', async () => {
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { id: number; method: string }
    expect(body.method).toBe('eth_gasPrice')
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x3b9aca00' }), { headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetcher)
  const { comparisonClient } = await import('./comparison-client')
  expect(await comparisonClient().getGasPrice()).toBe(1_000_000_000n)
  expect(fetcher).toHaveBeenCalledTimes(1)
})
