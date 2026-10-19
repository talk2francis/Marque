import { beforeEach, describe, expect, it, vi } from 'vitest'
import { keccak256, toBytes } from 'viem'
import { readManifest } from './manifest'
const h = vi.hoisted(() => ({ response: { status: 200, ok: true, body: '' } }))
vi.mock('@marque/probe', () => ({ safeFetch: async () => h.response }))
beforeEach(() => { h.response = { status: 200, ok: true, body: JSON.stringify({ response: { content: JSON.stringify({ recommend: false, netAprPct: 0 }) } }) } })
describe('delivery file integrity and withheld observations', () => {
  it('verifies the actual complete original bytes and preserves valid zero values', async () => {
    const hash = keccak256(toBytes(h.response.body))
    expect(await readManifest('https://example.invalid/file', hash)).toMatchObject({ hash, matches: true, content: { recommend: false, netAprPct: 0 } })
    expect(await readManifest('https://example.invalid/file', `0x${'0'.repeat(64)}`)).toMatchObject({ matches: false })
  })
  it('does not turn a claimed original digest into independent verification after withholding', async () => {
    const claimed = `0x${'1'.repeat(64)}`
    h.response = { status: 409, ok: false, body: JSON.stringify({ schema: 'marque.withheld-error-deliverable.v1', originalPreserved: true, originalContentHash: claimed }) }
    const result = await readManifest('https://example.invalid/file', claimed)
    expect(result).toMatchObject({ raw: '', pretty: '', matches: null, withheld: { originalContentHash: claimed } })
    expect(result?.hash).not.toBe(claimed)
    expect(result?.content).toHaveProperty('error')
  })
  it.each([null, [], 'wrong shape', 0])('does not pass malformed response content into a category renderer: %j', content => {
    h.response.body = JSON.stringify({ response: { content: JSON.stringify(content) } })
    return expect(readManifest('https://example.invalid/file', null)).resolves.toMatchObject({ content: null })
  })
  it('refuses an unrecognized or malformed withholding response', async () => {
    h.response = { status: 409, ok: false, body: JSON.stringify({ originalContentHash: 'not a digest' }) }
    expect(await readManifest('https://example.invalid/file', null)).toBeNull()
  })
})
