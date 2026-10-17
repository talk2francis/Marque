import { describe, expect, it, vi } from 'vitest'
import { safeFetch } from './safe-fetch'
import { probeX402 } from './liveness'
vi.mock('./safe-fetch', () => ({ safeFetch: vi.fn() }))
describe('x402 probe labels structure without proving payment', () => {
  it('rejects a version marker without requirements', async () => {
    vi.mocked(safeFetch).mockResolvedValue({ ok: true, status: 402, headers: {}, body: '{"x402Version":2}', bytes: 17, latencyMs: 1, finalUrl: 'https://provider.invalid', redirects: 0 })
    expect(await probeX402('https://provider.invalid')).toMatchObject({ ok: false, liveness: 'bad_schema' })
  })
  it('recognizes header-only v2 while retaining unverified compatibility', async () => {
    const c = { x402Version: 2, resource: { url: 'https://provider.invalid/task' }, accepts: [{ scheme: 'exact', network: 'eip155:56', amount: '1', asset: '0x1111111111111111111111111111111111111111', payTo: '0x2222222222222222222222222222222222222222', maxTimeoutSeconds: 60 }] }
    vi.mocked(safeFetch).mockResolvedValue({ ok: true, status: 402, headers: { 'payment-required': btoa(JSON.stringify(c)) }, body: '', bytes: 0, latencyMs: 1, finalUrl: 'https://provider.invalid', redirects: 0 })
    expect(await probeX402('https://provider.invalid')).toMatchObject({ ok: true, liveness: 'live', detail: '402 with structured untrusted payment requirements; payment compatibility unverified' })
  })
})
