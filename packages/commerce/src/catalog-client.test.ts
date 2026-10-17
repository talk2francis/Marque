import { describe, expect, it, vi } from 'vitest'
import { CatalogReadError, readMachineCatalog, parseCatalogQuery, machineCatalogSchema } from './catalog-client'

const empty = () => ({ schema: 'marque.catalog.v1', version: 1, generatedAt: '2026-10-17T00:00:00.000Z', sourceComputedAt: null, provenance: 'MEASURED_PROJECTION', sourceAgeMs: null, stale: true, page: { count: 0, total: 0, offset: 0, limit: 10, hasMore: false, nextOffset: null, population: 'FILTERED_DEDUPLICATED_MARKETPLACE_ENTRIES' }, agents: [], cacheMaxAgeSeconds: 0, limitations: ['Synthetic schema fixture, no market observation.'] })
describe('versioned catalog client and controlled filters', () => {
  it('uses only GET with no credentials, redirects, retries or task invocation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(empty()))
    expect(await readMachineCatalog('https://catalog.invalid', { category: 'grid', network: 56, thirdParty: true, limit: 10, offset: 20 }, { fetch: fetcher })).toEqual(empty())
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0]!
    expect(String(url)).toContain('/api/v1/marketplace?format=machine')
    expect(String(url)).toContain('thirdParty=true')
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error' })
    expect(init).not.toHaveProperty('body')
  })
  it.each(['limit=301', 'limit=0', 'offset=-1', 'network=1', 'iface=exec', 'q=' + 'x'.repeat(121), 'live=yes', 'firstParty=1&thirdParty=1', 'limit=1&limit=2', 'maxPrice=Infinity', 'unknown=true'])('rejects unsupported query %s', text => {
    expect(parseCatalogQuery(new URLSearchParams(text))).toBeNull()
  })
  it('accepts documented filters and explicit false', () => {
    expect(parseCatalogQuery(new URLSearchParams('format=machine&category=yield&hireable=false&offset=10&limit=3&network=97'))).toEqual({ category: 'yield', hireable: false, offset: 10, limit: 3, network: 97 })
  })
  it.each(['not a URL', 'file:///tmp/none', 'https://user:password@catalog.invalid', 'https://catalog.invalid?key=secret'])('rejects unsafe client base %s before fetching', async base => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(readMachineCatalog(base, {}, { fetch: fetcher })).rejects.toMatchObject({ code: 'invalid_query' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('exposes bounded Retry-After without retrying', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '12' } }))
    await expect(readMachineCatalog('https://catalog.invalid', {}, { fetch: fetcher })).rejects.toMatchObject({ code: 'rate_limited', retryAfterSeconds: 12 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each(['schema', 'html', 'oversize', 'json'])('fails closed on %s response', async kind => {
    const response = kind === 'schema' ? Response.json({ ...empty(), page: { ...empty().page, count: 1 } }) : kind === 'html' ? new Response('<html/>', { headers: { 'Content-Type': 'text/html' } }) : new Response(kind === 'oversize' ? 'x'.repeat(2 * 1024 * 1024 + 1) : '{', { headers: { 'Content-Type': 'application/json' } })
    await expect(readMachineCatalog('https://catalog.invalid', {}, { fetch: vi.fn<typeof fetch>().mockResolvedValue(response) })).rejects.toBeInstanceOf(CatalogReadError)
  })
  it('aborts an unresponsive transport and never retries', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('synthetic abort')))))
    await expect(readMachineCatalog('https://catalog.invalid', {}, { fetch: fetcher, timeoutMs: 100 })).rejects.toMatchObject({ code: 'timeout' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('does not accept a fabricated population or version', () => {
    expect(machineCatalogSchema.safeParse({ ...empty(), version: 2 }).success).toBe(false)
    expect(machineCatalogSchema.safeParse({ ...empty(), page: { ...empty().page, count: 1 } }).success).toBe(false)
  })
})
