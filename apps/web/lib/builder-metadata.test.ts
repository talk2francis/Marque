import { beforeEach, describe, expect, it, vi } from 'vitest'
const { readContract, safeFetch } = vi.hoisted(() => ({ readContract: vi.fn(), safeFetch: vi.fn() }))
vi.mock('@marque/commerce', async original => ({ ...await original<object>(), chainClient: () => ({ readContract }) }))
vi.mock('../../../packages/probe/src/safe-fetch.js', () => ({ safeFetch }))
import { readIdentity, readMetadata } from './builder'
const uri = (v: unknown) => 'data:application/json;base64,' + Buffer.from(JSON.stringify(v)).toString('base64')
beforeEach(() => { readContract.mockReset(); safeFetch.mockReset() })
describe('hostile registration metadata', () => {
  it.each([null, [], { services: {} }, { services: 'x' }, { endpoints: Array.from({ length: 65 }, () => ({})) }])('rejects invalid root/array shape %j', async v => {
    expect(await readMetadata(uri(v))).toBeNull()
  })
  it('bounds inline data and rejects unsupported URI types', async () => {
    expect(await readMetadata(uri({ name: 'x'.repeat(256 * 1024) }))).toBeNull()
    expect(await readMetadata('file:///etc/passwd')).toBeNull()
    expect(safeFetch).not.toHaveBeenCalled()
  })
  it('ignores null/primitive/oversized endpoints without throwing; retains valid A2A and MCP', async () => {
    readContract.mockImplementation(async ({ functionName }) => functionName === 'ownerOf' ? '0x1111111111111111111111111111111111111111' : uri({ services: [null, 1, [], { endpoint: 'https://' + 'x'.repeat(3000) }, { endpoint: 'https://example.org/a2a', name: 'A2A' }, { endpoint: 'https://example.org/mcp', type: 'MCP' }] }))
    const id = await readIdentity(56, '1')
    expect(id.services).toEqual([{ kind: 'a2a', endpoint: 'https://example.org/a2a' }, { kind: 'mcp', endpoint: 'https://example.org/mcp' }])
  })
  it('retains the shared SSRF/timeout/size guard on remote metadata', async () => {
    safeFetch.mockResolvedValue({ ok: false, failure: 'ssrf', detail: 'private IP' })
    expect(await readMetadata('https://127.0.0.1/private')).toBeNull()
    expect(safeFetch).toHaveBeenCalledWith('https://127.0.0.1/private', { timeoutMs: 6000, maxBytes: 256 * 1024 })
  })
})
