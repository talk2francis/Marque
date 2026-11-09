import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const lib = vi.hoisted(() => ({ listGuards: vi.fn(), guardDetail: vi.fn(), guardQuote: vi.fn(), guardStats: vi.fn(), agentActs: vi.fn() }))
vi.mock('../../../../lib/guards', () => lib)
const v2 = vi.hoisted(() => ({ listChartersV2: vi.fn(), charterV2Detail: vi.fn(), chartersV2Stats: vi.fn(), quoteV2: vi.fn(), claimsFor: vi.fn() }))
vi.mock('../../../../lib/charters-v2', () => v2)
vi.mock('@marque/commerce', () => ({ teamWallets: () => ['0x0cc5db909cece1856d1896d633d32bd305ce26c2'] }))

import { previewCookieValue } from '../../../../lib/charters-access'
import { GET as list } from './route'
import { GET as detail } from './[chainId]/[address]/route'
import { GET as quote } from './quote/route'
import { GET as stats } from './stats/route'
import { GET as agent } from './agent/route'
import { GET as preview } from './preview/route'

const TOKEN = 'preview-token-for-tests-0123456789'
const TEAM_OWNER = '0x0cC5DB909cEcE1856d1896d633d32Bd305ce26c2'
const OUTSIDE_OWNER = '0x1111111111111111111111111111111111111111'
const GUARD = '0xbd96B36F0EaB6003B8c53Bd8230969603Baa658A'
let ip = 0
const req = (path: string, cookie?: string) =>
  new Request(`https://marque.test${path}`, { headers: { 'x-forwarded-for': `10.0.0.${++ip % 250}`, ...(cookie ? { cookie } : {}) } })
const withPreview = `mq_charters_preview=${previewCookieValue(TOKEN)}`
const params = (chainId: string, address: string) => ({ params: Promise.resolve({ chainId, address }) })

beforeEach(() => {
  vi.stubEnv('CHARTERS_PUBLIC', '0')
  vi.stubEnv('CHARTERS_PREVIEW_TOKEN', TOKEN)
  for (const f of Object.values(lib)) f.mockReset()
  for (const f of Object.values(v2)) f.mockReset()
  v2.listChartersV2.mockResolvedValue({ charters: [], nextCursor: null, readAt: '2026-11-09T00:00:00.000Z' })
  v2.charterV2Detail.mockResolvedValue(null)
  v2.chartersV2Stats.mockResolvedValue({ chains: [], readAt: '2026-11-09T00:00:00.000Z' })
})
afterEach(() => vi.unstubAllEnvs())

it('hides every discovery route behind the flag, answering like a missing route', async () => {
  for (const r of [await list(req('/api/v1/guards')), await stats(req('/api/v1/guards/stats')),
    await quote(req(`/api/v1/guards/quote?chainId=97&account=${OUTSIDE_OWNER}`)), await agent(req('/api/v1/guards/agent?agentId=97:0x8004a818bfb912233c491871b3d84c89a494bd9e:2238'))]) {
    expect(r.status).toBe(404)
    expect(await r.json()).toEqual({ error: 'not_found' })
  }
  expect(lib.listGuards).not.toHaveBeenCalled()
  expect(lib.guardQuote).not.toHaveBeenCalled()
})

it('opens with the preview cookie or the public flag, and never caches', async () => {
  lib.listGuards.mockResolvedValue({ guards: [], nextCursor: null, readAt: 'now' })
  const a = await list(req('/api/v1/guards?chainId=97&state=armed', withPreview))
  expect(a.status).toBe(200)
  expect(a.headers.get('cache-control')).toBe('no-store')
  expect(lib.listGuards).toHaveBeenCalledWith({ chainId: 97, state: 'armed', limit: 50 })
  vi.stubEnv('CHARTERS_PUBLIC', '1')
  expect((await list(req('/api/v1/guards'))).status).toBe(200)
})

it('rejects a wrong cookie and a cookie when no token is configured', async () => {
  expect((await list(req('/api/v1/guards', `mq_charters_preview=${previewCookieValue('another-token-of-enough-length')}`))).status).toBe(404)
  vi.stubEnv('CHARTERS_PREVIEW_TOKEN', '')
  expect((await list(req('/api/v1/guards', withPreview))).status).toBe(404)
})

it('validates queries: unknown chains, bad addresses, unknown fields, bad healths', async () => {
  vi.stubEnv('CHARTERS_PUBLIC', '1')
  for (const q of ['/api/v1/guards?chainId=1', '/api/v1/guards?owner=0x12', '/api/v1/guards?limit=500', '/api/v1/guards?sort=x',
    `/api/v1/guards/quote?chainId=97&account=${OUTSIDE_OWNER}&trigger=1.234`, '/api/v1/guards/quote?chainId=56', '/api/v1/guards/agent?agentId=keel']) {
    const r = q.includes('/quote') ? await quote(req(q)) : q.includes('/agent') ? await agent(req(q)) : await list(req(q))
    expect(r.status, q).toBe(400)
    expect((await r.json()).error).toBe('bad_request')
  }
  expect(lib.listGuards).not.toHaveBeenCalled()
  expect(lib.guardQuote).not.toHaveBeenCalled()
})

it('passes a valid quote through with the chain narrowed', async () => {
  vi.stubEnv('CHARTERS_PUBLIC', '1')
  lib.guardQuote.mockResolvedValue({ chainId: 97 })
  const r = await quote(req(`/api/v1/guards/quote?chainId=97&account=${OUTSIDE_OWNER}&trigger=1.30&target=1.6`))
  expect(r.status).toBe(200)
  expect(lib.guardQuote).toHaveBeenCalledWith({ chainId: 97, account: OUTSIDE_OWNER, trigger: '1.30', target: '1.6' })
})

it('turns a failing read into an honest 503 without the error text', async () => {
  vi.stubEnv('CHARTERS_PUBLIC', '1')
  lib.guardStats.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.1:5432 password=hunter2'))
  const r = await stats(req('/api/v1/guards/stats'))
  expect(r.status).toBe(503)
  const body = await r.text()
  expect(body).not.toMatch(/ECONNREFUSED|hunter2/)
  expect(JSON.parse(body).error).toBe('unavailable')
})

it('keeps an outside owner\'s guard reachable with the flag off (ending always works)', async () => {
  lib.guardDetail.mockResolvedValue({ guard: { owner: OUTSIDE_OWNER } })
  expect((await detail(req(`/api/v1/guards/97/${GUARD}`), params('97', GUARD))).status).toBe(200)
})

it('hides a team-owned guard with the flag off, unless previewing', async () => {
  lib.guardDetail.mockResolvedValue({ guard: { owner: TEAM_OWNER } })
  expect((await detail(req(`/api/v1/guards/97/${GUARD}`), params('97', GUARD))).status).toBe(404)
  expect((await detail(req(`/api/v1/guards/97/${GUARD}`, withPreview), params('97', GUARD))).status).toBe(200)
})

it('answers an unknown guard, chain or address shape without touching the chain', async () => {
  lib.guardDetail.mockResolvedValue(null)
  expect((await detail(req(`/api/v1/guards/97/${GUARD}`), params('97', GUARD))).status).toBe(404)
  expect((await detail(req('/api/v1/guards/1/x'), params('1', GUARD))).status).toBe(400)
  expect((await detail(req('/api/v1/guards/97/x'), params('97', '0xnope'))).status).toBe(400)
  expect(lib.guardDetail).toHaveBeenCalledTimes(1)
})

it('sets the preview cookie only for the right token, as a hash, and clears it', async () => {
  const bad = await preview(req('/api/v1/guards/preview?token=wrong'))
  expect(bad.status).toBe(404)
  expect(bad.headers.get('set-cookie')).toBeNull()
  const ok = await preview(req(`/api/v1/guards/preview?token=${TOKEN}`))
  expect(ok.status).toBe(303)
  expect(new URL(ok.headers.get('location')!).pathname).toBe('/charters')
  const cookie = ok.headers.get('set-cookie')!
  expect(cookie).toContain(`mq_charters_preview=${previewCookieValue(TOKEN)}`)
  expect(cookie).not.toContain(TOKEN)
  expect(cookie).toMatch(/HttpOnly/i)
  expect(cookie).toMatch(/Secure/i)
  const end = await preview(req('/api/v1/guards/preview?end=1'))
  expect(end.status).toBe(303)
  expect(end.headers.get('set-cookie')).toMatch(/Max-Age=0/i)
})

it('lists v2 charters beside v1 guards, and a v2 kind without touching v1', async () => {
  vi.stubEnv('CHARTERS_PUBLIC', '1')
  lib.listGuards.mockResolvedValue({ guards: [{ address: GUARD }], nextCursor: null, readAt: 'x' })
  v2.listChartersV2.mockResolvedValue({ charters: [{ address: OUTSIDE_OWNER, kind: 'grid' }], nextCursor: '5', readAt: 'y' })
  const all = await (await list(req('/api/v1/guards?chainId=97'))).json()
  expect(all.guards).toHaveLength(1)
  expect(all.charters).toHaveLength(1)
  expect(all.nextCursor).toBe('5')
  lib.listGuards.mockClear()
  const grid = await list(req('/api/v1/guards?chainId=97&kind=grid'))
  expect(grid.status).toBe(200)
  expect(lib.listGuards).not.toHaveBeenCalled()
  expect((await list(req('/api/v1/guards?kind=swap'))).status).toBe(400)
})

it('serves a v2 charter of any kind by address, owner visibility unchanged', async () => {
  vi.stubEnv('CHARTERS_PUBLIC', '0')
  v2.charterV2Detail.mockResolvedValue({ charter: { owner: OUTSIDE_OWNER, kind: 'range' }, live: {}, events: [], key: null, history: [], readAt: 'z' })
  const r = await detail(req(`/api/v1/guards/97/${GUARD}`), params('97', GUARD))
  expect(r.status).toBe(200)
  expect((await r.json()).version).toBe(2)
  expect(lib.guardDetail).not.toHaveBeenCalled()
  v2.charterV2Detail.mockResolvedValue({ charter: { owner: TEAM_OWNER, kind: 'grid' }, live: {}, events: [], key: null, history: [], readAt: 'z' })
  expect((await detail(req(`/api/v1/guards/97/${GUARD}`), params('97', GUARD))).status).toBe(404)
})

it('routes a kind quote to the v2 reader and keeps claims behind the flag', async () => {
  vi.stubEnv('CHARTERS_PUBLIC', '1')
  v2.quoteV2.mockResolvedValue({ kind: 'yield', markets: [] })
  const r = await quote(req(`/api/v1/guards/quote?chainId=97&account=${OUTSIDE_OWNER}&kind=yield`))
  expect(r.status).toBe(200)
  expect(v2.quoteV2).toHaveBeenCalledWith('yield', 97, OUTSIDE_OWNER)
  expect(lib.guardQuote).not.toHaveBeenCalled()
  vi.stubEnv('CHARTERS_PUBLIC', '0')
  const { GET: claims } = await import('./claims/route')
  expect((await claims(req(`/api/v1/guards/claims?chainId=97&owner=${OUTSIDE_OWNER}`))).status).toBe(404)
})
