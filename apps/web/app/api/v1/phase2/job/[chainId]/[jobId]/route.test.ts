import { beforeEach, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
const { served } = vi.hoisted(() => ({ served: vi.fn() }))
vi.mock('../../../../../../../lib/phase2-api', async () => ({ ...await vi.importActual<typeof import('../../../../../../../lib/phase2-api')>('../../../../../../../lib/phase2-api'), served }))
import { GET } from './route'
import { inspectCommerceContent } from '@marque/commerce/evidence'

const body = { chainId: 56, jobId: '1', provider: null, client: null, evaluator: null, amount: null, token: null, deliverable: { hash: null, url: null }, events: [], intent: null }
const headers = { 'X-Marque-Projection-Computed-At': '2026-10-16T00:00:00.000Z', 'X-Marque-Projection-Age-Ms': '60000', 'X-Marque-Projection-Stale': 'true', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
const call = (suffix = '') => GET(new Request('https://candidate.invalid/api/v1/phase2/job/56/1' + suffix), { params: Promise.resolve({ chainId: '56', jobId: '1' }) })
beforeEach(() => served.mockReset())
it('preserves the default job API and cached headers without modifying public data', async () => {
  served.mockImplementation(async () => NextResponse.json(body, { headers }))
  const before = JSON.stringify(body)
  for (let i = 0; i < 2; i++) {
    const res = await call()
    expect(await res.json()).toEqual(body)
    expect(res.headers.get('X-Marque-Projection-Stale')).toBe('true')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  }
  expect(JSON.stringify(body)).toBe(before)
  expect(served.mock.calls[0]![0]).toBe('phase2:job:56:1')
})
it('exports an opt-in container with source time separate from export time and unknown private bindings', async () => {
  served.mockResolvedValue(NextResponse.json(body, { headers }))
  const res = await call('?format=bundle'), data = await res.json()
  expect(inspectCommerceContent(data)).toMatchObject({ integrity: 'MATCH' })
  expect(data.payload.source).toEqual(body)
  expect(data.payload.sourceComputedAt).toBe(headers['X-Marque-Projection-Computed-At'])
  expect(data.payload.observedAt).not.toBe(data.payload.sourceComputedAt)
  expect(data.payload.bindings).toMatchObject({ serviceId: null, quoteHash: null, quoteMode: 'UNAVAILABLE_NOT_PRESERVED_IN_PUBLIC_PROJECTION' })
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  expect(res.headers.get('X-Marque-Projection-Age-Ms')).toBe('60000')
  expect(served.mock.calls[0]![0]).toBe('phase2:job-evidence:56:1')
})
it('retains unavailable/not-found behavior and fails missing bundle metadata safely', async () => {
  served.mockResolvedValueOnce(NextResponse.json({ error: 'job_unavailable' }, { status: 503, headers }))
  expect((await call('?format=bundle')).status).toBe(503)
  served.mockResolvedValueOnce(NextResponse.json({ notFound: true }, { headers }))
  expect((await call('?format=bundle')).status).toBe(404)
  served.mockResolvedValueOnce(NextResponse.json({}, { headers }))
  const res = await call('?format=bundle')
  expect(res.status).toBe(422)
  expect(res.headers.get('Cache-Control')).toBe('no-store')
})
