import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocked = vi.hoisted(() => ({ read: vi.fn(), limit: vi.fn() }))
vi.mock('../../../../lib/recheck', () => ({ recheckJob: mocked.read }))
vi.mock('../../../../lib/limits', () => ({ clientKey: () => 'fixture', checkWindow: mocked.limit }))
import { POST } from './route'

const request = (body: string) => new Request('https://example.invalid/api/v1/recheck', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
beforeEach(() => { vi.useRealTimers(); mocked.read.mockReset(); mocked.limit.mockReturnValue({ ok: true }) })
describe('read-only recheck boundary', () => {
  it('rejects malformed, unsupported-network and extra-field requests before reading', async () => {
    for (const body of ['{', JSON.stringify({ chainId: 1, jobId: '1' }), JSON.stringify({ chainId: 56, jobId: '1', sign: true })]) expect((await POST(request(body))).status).toBe(400)
    expect(mocked.read).not.toHaveBeenCalled()
  })
  it('limits body bytes before calling the comparison', async () => {
    expect((await POST(request(' '.repeat(513)))).status).toBe(413)
    expect(mocked.read).not.toHaveBeenCalled()
  })
  it('enforces the client rate limit without a chain or observation read', async () => {
    mocked.limit.mockReturnValue({ ok: false, detail: 'Wait', retryAfterSeconds: 42 })
    const r = await POST(request(JSON.stringify({ chainId: 56, jobId: '1' })))
    expect(r.status).toBe(429); expect(r.headers.get('Retry-After')).toBe('42'); expect(mocked.read).not.toHaveBeenCalled()
  })
  it('returns its four-second deadline without replacing original results with an empty success', async () => {
    vi.useFakeTimers(); mocked.read.mockReturnValue(new Promise(() => {}))
    const r = POST(request(JSON.stringify({ chainId: 56, jobId: '1' })))
    await vi.advanceTimersByTimeAsync(4001)
    expect((await r).status).toBe(503)
    vi.useRealTimers()
  })
})
