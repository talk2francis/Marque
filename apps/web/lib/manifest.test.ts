import { beforeEach, describe, expect, it, vi } from 'vitest'
import { keccak256, sha256, toBytes } from 'viem'
import type { SafeFetchResult } from '@marque/probe'
import { jobManifest, readManifest } from './manifest'
const h = vi.hoisted(() => ({ reads: 0, response: { ok: true, status: 200, headers: {}, body: '', bytes: 0, latencyMs: 1, finalUrl: 'https://example.invalid/file', redirects: 0 } as SafeFetchResult }))
vi.mock('@marque/probe', () => ({ safeFetch: async () => { h.reads++; return h.response } }))
const http = (status: number, body: string): Extract<SafeFetchResult, { ok: true }> => ({ ok: true, status, body, headers: {}, bytes: body.length, latencyMs: 1, finalUrl: 'https://example.invalid/file', redirects: 0 })
const currentHttp = () => { if (!h.response.ok) throw Error('Expected the HTTP fixture'); return h.response }
beforeEach(() => { h.reads = 0; h.response = http(200, JSON.stringify({ response: { content: JSON.stringify({ recommend: false, netAprPct: 0 }) } })) })
describe('shared verified job answers', () => {
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
