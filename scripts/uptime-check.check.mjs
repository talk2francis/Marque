import test from 'node:test'
import assert from 'node:assert/strict'
import { observe, UPTIME_PATHS } from './uptime-check.mjs'

test('records six bounded public GET observations including HTTP failures', async () => {
  const seen = []
  const r = await observe('https://example.invalid', async (url, options) => {
    seen.push({ url, method: options.method ?? 'GET', redirect: options.redirect })
    return new globalThis.Response('{}', { status: url.endsWith('/proof') ? 503 : 200 })
  }, new Date('2026-11-06T06:00:00Z'))
  assert.equal(r.checks.length, UPTIME_PATHS.length)
  assert(seen.every(s => s.method === 'GET' && s.redirect === 'manual'))
  assert.equal(r.checks.find(c => c.path === '/proof').status, 503)
  assert(r.checks.every(c => c.totalMs >= c.ttfbMs))
})
test('connection failures stay failures without storing infrastructure details', async () => {
  const r = await observe('https://example.invalid', async () => { throw new Error('private transport detail') })
  assert(r.checks.every(c => c.status === 0 && c.error === 'request_failed'))
  assert(!JSON.stringify(r).includes('private transport'))
})
