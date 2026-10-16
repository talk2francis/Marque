import { beforeEach, expect, it, vi } from 'vitest'
const { cachedProjection } = vi.hoisted(() => ({ cachedProjection: vi.fn() }))
vi.mock('@marque/db', () => ({ cachedProjection }))
vi.mock('@marque/commerce', () => ({ campaignChainId: () => 56, isSupportedChain: (v: number) => v === 56 || v === 97 }))
import { served } from './phase2-api'
beforeEach(() => { cachedProjection.mockReset() })
it('preserves the response body and exposes snapshot age to cross-origin clients', async () => {
  const body = { jobs: 3 }
  cachedProjection.mockResolvedValue({ value: body, computedAt: '2026-10-16T00:00:00.000Z', ageMs: 4500, stale: false })
  const response = await served('test', 'test', async () => body)
  expect(await response.json()).toEqual(body)
  expect(response.headers.get('X-Marque-Projection-Age-Ms')).toBe('4500')
  expect(response.headers.get('X-Marque-Projection-Stale')).toBe('false')
  expect(response.headers.get('Cache-Control')).toBe('public, max-age=10')
  expect(response.headers.get('Access-Control-Expose-Headers')).toContain('X-Marque-Projection-Computed-At')
})
it('does not cache a stale last-good response as fresh', async () => {
  cachedProjection.mockResolvedValue({ value: { jobs: 3 }, computedAt: '2026-10-15T00:00:00Z', ageMs: 86400000, stale: true })
  const response = await served('test', 'test', async () => ({}))
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(response.headers.get('X-Marque-Projection-Stale')).toBe('true')
})
it('reports an unavailable projection without a false success or missing CORS', async () => {
  cachedProjection.mockRejectedValue(new Error('synthetic unavailable'))
  const response = await served('test', 'test', async () => ({}))
  expect(response.status).toBe(503)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  expect(response.headers.get('Cache-Control')).toBe('no-store')
})
