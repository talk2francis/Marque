import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { keccak256, sha256, toBytes } from 'viem'
import type { SafeFetchResult } from '@marque/probe'
import { jobManifest, readManifest } from './manifest'
const h = vi.hoisted(() => ({ reads: 0, stored: null as unknown, cacheError: false, override: null as null | ((url: string) => Promise<SafeFetchResult>), response: { ok: true, status: 200, headers: {}, body: '', bytes: 0, latencyMs: 1, finalUrl: 'https://example.invalid/file', redirects: 0 } as SafeFetchResult }))
vi.mock('@marque/probe', () => ({ safeFetch: async (url: string) => { h.reads++; return h.override ? h.override(url) : h.response } }))
const kept = vi.hoisted(() => new Map<string, { matches: true; hash: string; raw: string; url: string | null; source: string | null }>())
vi.mock('./answer-store', async original => {
  const real = await original<typeof import('./answer-store')>()
  return { ...real,
    readKeptAnswer: async (c: number, j: string, hash: string) => kept.get(`${c}:${j}:${hash.toLowerCase()}`) ?? null,
    keepAnswer: async (c: number, j: string, m: { hash: string; raw: string; url?: string; source?: string }) => { const k = `${c}:${j}:${m.hash.toLowerCase()}`; if (!kept.has(k)) kept.set(k, { matches: true, hash: m.hash.toLowerCase(), raw: m.raw, url: m.url ?? null, source: m.source ?? null }) },
  }
})
vi.mock('@marque/db', async original => ({ ...await original<typeof import('@marque/db')>(), peekProjection: async () => { if (h.cacheError) throw Error('Synthetic cache outage'); return h.stored } }))
const http = (status: number, body: string): Extract<SafeFetchResult, { ok: true }> => ({ ok: true, status, body, headers: {}, bytes: body.length, latencyMs: 1, finalUrl: 'https://example.invalid/file', redirects: 0 })
const currentHttp = () => { if (!h.response.ok) throw Error('Expected the HTTP fixture'); return h.response }
beforeEach(() => { kept.clear(); h.reads = 0; h.stored = null; h.cacheError = false; h.override = null; h.response = http(200, JSON.stringify({ response: { content: JSON.stringify({ recommend: false, netAprPct: 0 }) } })) })
afterEach(() => vi.useRealTimers())
describe('guarded deliverable gateway hedging', () => {
  it('uses a verified alternate without waiting for a stalled primary and starts no extra read after winning', async () => {
    vi.useFakeTimers()
    const good = currentHttp().body, hash = keccak256(toBytes(good))
    let complete!: (value: SafeFetchResult) => void
    h.override = url => url.includes('filebase') ? new Promise(resolve => { complete = resolve }) : Promise.resolve(http(200, good))
    const read = readManifest('ipfs://synthetic-cid/answer', hash)
    await vi.advanceTimersByTimeAsync(149)
    expect(h.reads).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(await read).toMatchObject({ matches: true, hash })
    complete(http(200, '{"wrong":true}'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(h.reads).toBe(2)
  })
  it('never accepts a fast mismatch or withheld disclosure in place of the committed gateway bytes', async () => {
    const good = currentHttp().body, hash = keccak256(toBytes(good))
    h.override = async url => url.includes('filebase') ? http(200, '{"wrong":true}')
      : url.includes('ipfs.io') ? http(409, JSON.stringify({ schema: 'marque.withheld-error-deliverable.v1', originalPreserved: true, originalContentHash: hash }))
      : http(200, good)
    expect(await readManifest('ipfs://synthetic-cid/answer', hash)).toMatchObject({ matches: true, hash })
    expect(h.reads).toBe(3)
  })
  it('keeps at most two locations active and advances only when one finishes', async () => {
    vi.useFakeTimers()
    const good = currentHttp().body, hash = keccak256(toBytes(good))
    const finishes: Array<(value: SafeFetchResult) => void> = []
    h.override = () => new Promise(resolve => { finishes.push(resolve) })
    const read = readManifest('ipfs://synthetic-bounded-cid/answer', hash)
    await vi.advanceTimersByTimeAsync(1000)
    expect(h.reads).toBe(2)
    finishes[0]!(http(404, ''))
    await vi.advanceTimersByTimeAsync(0)
    expect(h.reads).toBe(3)
    finishes[2]!(http(200, good))
    expect(await read).toMatchObject({ matches: true })
    finishes[1]!(http(404, ''))
    await vi.advanceTimersByTimeAsync(1000)
    expect(h.reads).toBe(3)
  })
})
describe('shared verified job answers', () => {
  it('recovers verified bytes from a no-check projection without another provider or RPC read', async () => {
    const raw = currentHttp().body, hash = keccak256(toBytes(raw))
    h.stored = { value: { state: 'no-check', checks: [], manifest: { raw, hash, matches: true, url: 'https://example.invalid/file' } }, computedAt: '2026-01-01T00:00:00Z' }
    expect(await jobManifest(56, '910001', { deliverable: { hash, url: 'https://example.invalid/file' } })).toMatchObject({ matches: true, content: { recommend: false, netAprPct: 0 } })
    expect(h.reads).toBe(0)
  })
  it('falls back to the guarded provider read when saved bytes changed or the cache fails', async () => {
    const hash = keccak256(toBytes(currentHttp().body))
    h.stored = { value: { manifest: { raw: '{"changed":true}', hash, matches: true } } }
    expect(await jobManifest(56, '910002', { deliverable: { hash, url: 'https://example.invalid/file' } })).toMatchObject({ matches: true })
    h.cacheError = true
    expect(await jobManifest(56, '910003', { deliverable: { hash, url: 'https://example.invalid/file' } })).toMatchObject({ matches: true })
    expect(h.reads).toBe(2)
  })
  it('deduplicates concurrent page/lens reads, binds inputs and returns isolated values', async () => {
    const hash = keccak256(toBytes(currentHttp().body))
    const job = { provider: `0x${'1'.repeat(40)}`, deliverable: { hash, url: 'https://example.invalid/deduplicated' } }
    const [a, b] = await Promise.all([jobManifest(56, '900001', job), jobManifest(56, '900001', job)])
    expect(h.reads).toBe(1)
    expect(a?.matches).toBe(true)
    expect(b).toEqual(a)
    a!.content = { tampered: true }
    expect((await jobManifest(56, '900001', job))?.content).not.toEqual(a!.content)
    await jobManifest(97, '900001', job)
    kept.clear() // the kept copy would answer any read of this job; this checks the in-process cache binding
    await jobManifest(56, '900001', { ...job, provider: `0x${'2'.repeat(40)}` })
    expect(h.reads).toBe(3)
  })
  it('returns legacy unmatched reads without storing them as verified answers', async () => {
    const good = currentHttp().body
    const hash = keccak256(toBytes(good))
    const job = { deliverable: { hash, url: 'https://example.invalid/unmatched' } }
    h.response = http(200, '{"different":true}')
    expect(await jobManifest(56, '900002', job)).toMatchObject({ matches: false })
    h.response = http(200, good)
    expect(await jobManifest(56, '900002', job)).toMatchObject({ matches: true })
    expect(h.reads).toBe(2)
  })
})
describe('Marque keeps verified answers after the seller host goes away (26 Nov 2026)', () => {
  it('keeps the first verified read and serves it once the host is gone and the cache expired', async () => {
    const raw = currentHttp().body, hash = keccak256(toBytes(raw))
    expect(await jobManifest(56, '920001', { deliverable: { hash, url: 'https://tunnel-a.example.invalid/file' } })).toMatchObject({ matches: true })
    expect([...kept.values()]).toEqual([{ matches: true, hash: hash.toLowerCase(), raw, url: 'https://tunnel-a.example.invalid/file', source: null }])
    h.override = async () => ({ ok: false, error: 'dns', detail: 'host is gone' } as unknown as SafeFetchResult)
    const before = h.reads
    // A later visit (new URL in the record, nothing in the cache): answered from the kept copy, no network read.
    expect(await jobManifest(56, '920001', { deliverable: { hash, url: 'https://tunnel-b.example.invalid/file' } })).toMatchObject({ matches: true, content: { recommend: false, netAprPct: 0 } })
    expect(h.reads).toBe(before)
  })
  it('never keeps an unmatched read and refuses a kept copy whose bytes no longer hash to the chain', async () => {
    const good = currentHttp().body, hash = keccak256(toBytes(good))
    h.response = http(200, '{"different":true}')
    expect(await jobManifest(56, '920002', { deliverable: { hash, url: 'https://example.invalid/x' } })).toMatchObject({ matches: false })
    expect(kept.size).toBe(0)
    kept.set(`56:920003:${hash.toLowerCase()}`, { matches: true, hash: hash.toLowerCase(), raw: '{"tampered":true}', url: null, source: null })
    h.response = http(200, good)
    expect(await jobManifest(56, '920003', { deliverable: { hash, url: 'https://example.invalid/y' } })).toMatchObject({ matches: true, content: { recommend: false, netAprPct: 0 } })
  })
})
describe('delivery file integrity and withheld observations', () => {
  it('verifies the actual complete original bytes and preserves valid zero values', async () => {
    const hash = keccak256(toBytes(currentHttp().body))
    expect(await readManifest('https://example.invalid/file', hash)).toMatchObject({ hash, matches: true, content: { recommend: false, netAprPct: 0 } })
    expect(await readManifest('https://example.invalid/file', `0x${'0'.repeat(64)}`)).toMatchObject({ matches: false })
  })
  it('supports direct JSON answers and identifies a SHA-256 commitment explicitly',async()=>{
    const body=JSON.stringify({result:{health_factor:2.3}})
    h.response=http(200,body)
    expect(await readManifest('https://example.invalid/file',sha256(toBytes(body)))).toMatchObject({hashAlgorithm:'sha256',matches:true,content:{result:{health_factor:2.3}}})
  })
  it('does not turn a claimed original digest into independent verification after withholding', async () => {
    const claimed = `0x${'1'.repeat(64)}`
    h.response = http(409, JSON.stringify({ schema: 'marque.withheld-error-deliverable.v1', originalPreserved: true, originalContentHash: claimed }))
    const result = await readManifest('https://example.invalid/file', claimed)
    expect(result).toMatchObject({ raw: '', pretty: '', matches: null, withheld: { originalContentHash: claimed } })
    expect(result?.hash).not.toBe(claimed)
    expect(result?.content).toHaveProperty('error')
  })
  it.each([null, [], 'wrong shape', 0])('does not pass malformed response content into a category renderer: %j', content => {
    currentHttp().body = JSON.stringify({ response: { content: JSON.stringify(content) } })
    return expect(readManifest('https://example.invalid/file', null)).resolves.toMatchObject({ content: null })
  })
  it('refuses an unrecognized or malformed withholding response', async () => {
    h.response = http(409, JSON.stringify({ originalContentHash: 'not a digest' }))
    expect(await readManifest('https://example.invalid/file', null)).toBeNull()
  })
  it('does not treat a rejected transport result as a readable HTTP disclosure', async () => {
    h.response = { ok: false, status: 409, failure: 'too_large', detail: 'private diagnostic', latencyMs: 1 }
    expect(await readManifest('https://example.invalid/file', null)).toBeNull()
  })
})
