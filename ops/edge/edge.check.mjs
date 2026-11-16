// node --test ops/edge/edge.check.mjs
// The edge against a scripted origin: what is stored, for how long, for whom, and what is never stored.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import zlib from 'node:zlib'
import { createEdge } from './edge.mjs'
import { classify, storable, normalQuery, pickEncoding, wantsFresh, uaClass } from './policy.mjs'

const NO_STORE = 'private, no-cache, no-store, max-age=0, must-revalidate'
const open = []
after(async () => { for (const s of open) await s.close() })

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}
/** A scripted origin. `routes[path]` is a function (req, n) -> { status?, headers?, body?, delay? } or a stream handler. */
async function origin(routes) {
  const calls = new Map()
  const seen = []
  let live = 0, peak = 0
  const server = http.createServer(async (req, res) => {
    const path = req.url.split('?')[0]
    const n = (calls.get(req.url) ?? 0) + 1
    calls.set(req.url, n)
    seen.push({ url: req.url, method: req.method, headers: req.headers })
    live += 1; peak = Math.max(peak, live)
    res.on('close', () => { live -= 1 })
    const h = routes[path] ?? (() => ({ status: 404, headers: { 'cache-control': NO_STORE }, body: 'not found' }))
    const chunks = []
    for await (const c of req) chunks.push(c)
    const r = await h(req, n, res, Buffer.concat(chunks))
    if (!r) return
    if (r.delay) await new Promise((x) => setTimeout(x, r.delay))
    res.writeHead(r.status ?? 200, { 'content-type': 'text/html; charset=utf-8', vary: 'rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding', ...(r.headers ?? {}) })
    res.end(r.body ?? '')
  })
  const port = await listen(server)
  const o = { port, calls, seen, count: (url) => calls.get(url) ?? 0, peak: () => peak, close: () => new Promise((x) => { server.close(() => x()); server.closeAllConnections() }) }
  open.push(o)
  return o
}
async function edgeFor(ports, extra = {}) {
  const clock = { t: 1_000_000 }
  const edge = createEdge({ ports, defaultPort: ports[0], now: () => clock.t, carryDelayMs: 20, switchHoldMs: 15_000, ...extra })
  const port = await listen(edge.server)
  open.push(edge)
  const via = (originPort) => ({ 'x-forwarded-for': '203.0.113.9', 'x-marque-upstream-port': String(originPort), host: 'marque.trade' })
  const ask = (path, headers = {}, method = 'GET', body = null) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers, agent: false }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.end(body ?? undefined)
  })
  return { edge, port, clock, via, ask, get: (o, path, headers = {}) => ask(path, { ...via(o.port), ...headers }) }
}
const settle = (ms = 30) => new Promise((x) => setTimeout(x, ms))
const page = (text, extra = {}) => ({ headers: { 'cache-control': NO_STORE, ...extra }, body: `<html><main>${text}</main>${'x'.repeat(4000)}</html>` })

test('a listed page is rendered once, then served from memory with the origin headers intact', async () => {
  const o = await origin({ '/judge': (_r, n) => page(`render ${n}`) })
  const x = await edgeFor([o.port])
  const a = await x.get(o, '/judge')
  const b = await x.get(o, '/judge')
  assert.equal(a.headers['x-marque-edge'], 'MISS'); assert.equal(b.headers['x-marque-edge'], 'HIT')
  assert.equal(o.count('/judge'), 1)
  assert.equal(b.body.toString(), a.body.toString())
  assert.equal(b.headers['cache-control'], NO_STORE, 'browsers still must not keep their own copy')
  assert.match(b.headers['vary'], /Accept-Encoding/)
  assert.equal(b.headers['age'], '0')
})

test('past fresh, the stored page is served at once while one background render replaces it', async () => {
  const o = await origin({ '/judge': (_r, n) => page(`render ${n}`) })
  const x = await edgeFor([o.port])
  await x.get(o, '/judge')
  x.clock.t += 31_000
  const stale = await x.get(o, '/judge')
  assert.equal(stale.headers['x-marque-edge'], 'STALE'); assert.match(stale.body.toString(), /render 1/)
  assert.equal(stale.headers['age'], '31')
  await settle()
  const next = await x.get(o, '/judge')
  assert.equal(next.headers['x-marque-edge'], 'HIT'); assert.match(next.body.toString(), /render 2/)
  x.clock.t += 160_000 // past fresh + stale: nobody is given a copy this old
  const cold = await x.get(o, '/judge')
  assert.equal(cold.headers['x-marque-edge'], 'MISS'); assert.match(cold.body.toString(), /render 3/)
})

test('forty simultaneous first readers cost one render', async () => {
  const o = await origin({ '/builders': (_r, n) => ({ ...page(`render ${n}`), delay: 60 }) })
  const x = await edgeFor([o.port])
  const all = await Promise.all(Array.from({ length: 40 }, () => x.get(o, '/builders')))
  assert.equal(o.count('/builders'), 1)
  assert.ok(all.every((r) => r.status === 200 && /render 1/.test(r.body.toString())))
})

test('the origin is never asked for more renders at once than the limit, and waiting readers are still answered', async () => {
  const routes = {}
  for (let i = 0; i < 30; i++) routes[`/jobs/56/${i}`] = () => ({ ...page(`job ${i}`), delay: 25 })
  const o = await origin(routes)
  const x = await edgeFor([o.port], { concurrency: 4 })
  const all = await Promise.all(Array.from({ length: 30 }, (_v, i) => x.get(o, `/jobs/56/${i}`)))
  assert.ok(all.every((r) => r.status === 200))
  assert.ok(o.peak() <= 4, `origin saw ${o.peak()} at once`)
})

test('an unlisted dynamic page is piped through and never stored', async () => {
  const o = await origin({ '/me': (_r, n) => page(`me ${n}`) })
  const x = await edgeFor([o.port])
  const a = await x.get(o, '/me'); const b = await x.get(o, '/me')
  assert.match(a.body.toString(), /me 1/); assert.match(b.body.toString(), /me 2/)
  assert.equal(x.edge.entries.size, 0)
})

test('what the origin itself marks shared is stored for at most thirty seconds of freshness', async () => {
  const o = await origin({
    '/': (_r, n) => page(`home ${n}`, { 'cache-control': 's-maxage=30, stale-while-revalidate=31535970' }),
    '/api/v1/phase2/owner/x': (_r, n) => ({ headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=15' }, body: JSON.stringify({ n }) }),
    '/img/p/1': () => ({ headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' }, body: Buffer.alloc(2048, 1) }),
  })
  const x = await edgeFor([o.port])
  for (const p of ['/', '/api/v1/phase2/owner/x', '/img/p/1']) { await x.get(o, p); const again = await x.get(o, p); assert.equal(again.headers['x-marque-edge'], 'HIT', p) }
  x.clock.t += 30_500
  assert.equal((await x.get(o, '/')).headers['x-marque-edge'], 'STALE')
  assert.equal((await x.get(o, '/img/p/1')).headers['x-marque-edge'], 'HIT')
  await settle()
  assert.equal(o.count('/'), 2)
})

test('a response that sets a cookie, or varies on something else, is never stored', async () => {
  const o = await origin({
    '/judge': (_r, n) => page(`j ${n}`, { 'set-cookie': 'a=1; Path=/' }),
    '/builders': (_r, n) => page(`b ${n}`, { vary: 'Cookie' }),
  })
  const x = await edgeFor([o.port])
  await x.get(o, '/judge'); await x.get(o, '/judge'); await x.get(o, '/builders'); await x.get(o, '/builders')
  assert.equal(o.count('/judge'), 2); assert.equal(o.count('/builders'), 2); assert.equal(x.edge.entries.size, 0)
})

test('requests that carry identity or the preview cookie bypass the cache in both directions', async () => {
  const o = await origin({ '/judge': (req, n) => page(`render ${n} cookie:${req.headers.cookie ?? '-'} auth:${req.headers.authorization ?? '-'}`) })
  const x = await edgeFor([o.port])
  await x.get(o, '/judge')
  const preview = await x.get(o, '/judge', { cookie: 'theme=day; mq_charters_preview=abc' })
  assert.equal(preview.headers['x-marque-edge'], 'BYPASS'); assert.match(preview.body.toString(), /mq_charters_preview=abc/)
  const authed = await x.get(o, '/judge', { authorization: 'Bearer t' })
  assert.equal(authed.headers['x-marque-edge'], 'BYPASS'); assert.match(authed.body.toString(), /auth:Bearer t/)
  const other = await x.get(o, '/judge', { cookie: 'theme=day' })
  assert.equal(other.headers['x-marque-edge'], 'HIT'); assert.match(other.body.toString(), /render 1 cookie:-/)
  assert.equal(x.edge.entries.size, 1)
})

test('a shared render never sees a visitor cookie or an unlisted header', async () => {
  const o = await origin({ '/judge': () => page('ok') })
  const x = await edgeFor([o.port])
  await x.get(o, '/judge', { cookie: 'theme=day', 'x-secret': 'v', 'accept-encoding': 'gzip, br', 'user-agent': 'Mozilla/5.0' })
  const h = o.seen[0].headers
  assert.equal(h.cookie, undefined); assert.equal(h['x-secret'], undefined); assert.equal(h['x-marque-upstream-port'], undefined)
  assert.equal(h['accept-encoding'], 'identity'); assert.equal(h['x-forwarded-for'], '203.0.113.9'); assert.equal(h.host, 'marque.trade')
})

test('in-app navigation is its own variant, held two seconds, never stale, and refreshes the stored document', async () => {
  const o = await origin({ '/jobs/56/7': (req, n) => page(`${req.headers.rsc ? 'flight' : 'document'} ${n}`) })
  const x = await edgeFor([o.port])
  const rsc = { rsc: '1', 'next-router-state-tree': '%5B%22%22%5D', 'x-marque-router-state': 'present:%5B%22%22%5D' }
  const doc = await x.get(o, '/jobs/56/7')
  const f1 = await x.get(o, '/jobs/56/7?_rsc=abc', rsc)
  assert.match(doc.body.toString(), /document 1/); assert.match(f1.body.toString(), /flight 1/)
  assert.equal((await x.get(o, '/jobs/56/7?_rsc=abc', rsc)).headers['x-marque-edge'], 'HIT')
  x.clock.t += 2_500
  const f2 = await x.get(o, '/jobs/56/7?_rsc=abc', rsc)
  assert.equal(f2.headers['x-marque-edge'], 'MISS'); assert.match(f2.body.toString(), /flight 2/)
  await settle()
  // The viewer's refresh rendered the job again, so the stored document was replaced too.
  const doc2 = await x.get(o, '/jobs/56/7')
  assert.equal(doc2.headers['x-marque-edge'], 'HIT'); assert.match(doc2.body.toString(), /document 2/)
  assert.equal(o.seen.at(-1).headers.rsc, undefined)
})

test('a reload is answered with a render at most two seconds old', async () => {
  const o = await origin({ '/judge': (_r, n) => page(`render ${n}`) })
  const x = await edgeFor([o.port])
  await x.get(o, '/judge')
  x.clock.t += 1_000
  assert.match((await x.get(o, '/judge', { 'cache-control': 'max-age=0' })).body.toString(), /render 1/)
  x.clock.t += 2_000
  const reloaded = await x.get(o, '/judge', { 'cache-control': 'max-age=0' })
  assert.equal(reloaded.headers['x-marque-edge'], 'MISS'); assert.match(reloaded.body.toString(), /render 2/)
  x.clock.t += 3_000
  assert.match((await x.get(o, '/judge', { pragma: 'no-cache' })).body.toString(), /render 3/)
  assert.match((await x.get(o, '/judge')).body.toString(), /render 3/)
})

test('a settled job room is kept for a day; a live one for two minutes', async () => {
  const o = await origin({
    '/jobs/56/1': (_r, n) => ({ headers: { 'cache-control': NO_STORE }, body: `<main data-marque-edge="settled">paid ${n}</main>` }),
    '/jobs/56/2': (_r, n) => ({ headers: { 'cache-control': NO_STORE }, body: `<main data-marque-edge="live">funded ${n}</main>` }),
  })
  const x = await edgeFor([o.port])
  await x.get(o, '/jobs/56/1'); await x.get(o, '/jobs/56/2')
  x.clock.t += 200_000
  assert.equal((await x.get(o, '/jobs/56/1')).headers['x-marque-edge'], 'HIT')
  assert.equal((await x.get(o, '/jobs/56/2')).headers['x-marque-edge'], 'MISS')
  x.clock.t += 6 * 3600_000
  assert.equal((await x.get(o, '/jobs/56/1')).headers['x-marque-edge'], 'STALE')
  assert.equal((await x.get(o, '/jobs/56/1/act')).headers['x-marque-edge'], 'MISS', 'the act page is not on the list')
  assert.equal(o.count('/jobs/56/1/act'), 1)
})

test('when the origin fails, a stored page still answers; with nothing stored the failure is passed on', async () => {
  let down = false
  const o = await origin({
    '/judge': (_r, n) => (down ? { status: 503, headers: { 'cache-control': 'no-store' }, body: 'busy' } : page(`render ${n}`)),
    '/builders': () => ({ status: 503, headers: { 'cache-control': 'no-store' }, body: 'busy' }),
  })
  const x = await edgeFor([o.port])
  await x.get(o, '/judge')
  down = true
  x.clock.t += 160_000
  const kept = await x.get(o, '/judge')
  assert.equal(kept.status, 200); assert.equal(kept.headers['x-marque-edge'], 'STALE-ERROR')
  const failed = await x.get(o, '/builders')
  assert.equal(failed.status, 503); assert.equal(failed.body.toString(), 'busy')
  assert.equal(x.edge.entries.size, 1, 'an error is never stored')
  await o.close()
  x.clock.t += 100_000
  assert.equal((await x.get(o, '/judge')).headers['x-marque-edge'], 'STALE-ERROR')
  assert.equal((await x.get(o, '/builders')).status, 502)
})

test('a deploy switches slot: the cache starts empty and recently read pages are rendered again for the new release', async () => {
  const a = await origin({ '/judge': () => page('release A'), '/jobs/56/9': () => page('job on A') })
  const b = await origin({ '/judge': () => page('release B'), '/jobs/56/9': () => page('job on B') })
  const x = await edgeFor([a.port, b.port])
  await x.get(a, '/judge'); await x.get(a, '/jobs/56/9')
  const first = await x.get(b, '/judge')
  assert.match(first.body.toString(), /release B/); assert.equal(first.headers['x-marque-edge'], 'MISS')
  // A request Caddy accepted for the old slot during the switch is passed through, never mixed into the new cache.
  const late = await x.get(a, '/judge')
  assert.match(late.body.toString(), /release A/); assert.equal(late.headers['x-marque-edge'], 'BYPASS')
  await settle(80)
  assert.equal(b.count('/jobs/56/9'), 1, 'the job room read before the deploy was rendered again without a visitor')
  const warm = await x.get(b, '/jobs/56/9')
  assert.equal(warm.headers['x-marque-edge'], 'HIT'); assert.match(warm.body.toString(), /job on B/)
})

test('compressed copies are exact, chosen by what the client accepts, and HEAD and If-None-Match are honoured', async () => {
  const text = `<html>${'Marque job room '.repeat(600)}</html>`
  const o = await origin({ '/judge': () => ({ headers: { 'cache-control': NO_STORE }, body: text }) })
  const x = await edgeFor([o.port])
  const plain = await x.get(o, '/judge')
  await settle(80)
  const br = await x.get(o, '/judge', { 'accept-encoding': 'gzip, deflate, br, zstd' })
  const gz = await x.get(o, '/judge', { 'accept-encoding': 'gzip' })
  const refused = await x.get(o, '/judge', { 'accept-encoding': 'br;q=0, gzip;q=0' })
  assert.equal(br.headers['content-encoding'], 'br'); assert.equal(zlib.brotliDecompressSync(br.body).toString(), text)
  assert.equal(gz.headers['content-encoding'], 'gzip'); assert.equal(zlib.gunzipSync(gz.body).toString(), text)
  assert.equal(refused.headers['content-encoding'], undefined); assert.equal(refused.body.toString(), text)
  assert.equal(plain.body.toString(), text)
  assert.ok(br.body.length < text.length / 5)
  const head = await x.ask('/judge', x.via(o.port), 'HEAD')
  assert.equal(head.status, 200); assert.equal(head.body.length, 0); assert.equal(head.headers['content-length'], String(text.length))
  const cond = await x.get(o, '/judge', { 'if-none-match': plain.headers.etag })
  assert.equal(cond.status, 304); assert.equal(cond.body.length, 0)
  assert.equal(o.count('/judge'), 1)
})

test('the marketplace listing is keyed by its query; the machine catalogue and its quote expiry are left to the origin', async () => {
  const json = (n, cc) => ({ headers: { 'content-type': 'application/json', 'cache-control': cc, 'x-marque-projection-age-ms': '400' }, body: JSON.stringify({ n }) })
  const o = await origin({ '/api/v1/marketplace': (req, n) => json(n, 'no-store') })
  const x = await edgeFor([o.port])
  const a = await x.get(o, '/api/v1/marketplace?limit=24&offset=0&q=venus')
  const b = await x.get(o, '/api/v1/marketplace?q=venus&offset=0&limit=24&utm_source=x')
  const c = await x.get(o, '/api/v1/marketplace?limit=24&offset=0&q=yield')
  assert.equal(b.headers['x-marque-edge'], 'HIT'); assert.equal(b.body.toString(), a.body.toString())
  assert.equal(c.headers['x-marque-edge'], 'MISS')
  x.clock.t += 4_000
  assert.equal((await x.get(o, '/api/v1/marketplace?limit=24&offset=0&q=venus')).headers['x-marque-projection-age-ms'], '4400', 'the projection age stays true for a stored copy')
  await x.get(o, '/api/v1/marketplace?format=machine'); await x.get(o, '/api/v1/marketplace?format=machine')
  assert.equal(o.count('/api/v1/marketplace?format=machine'), 2)
  x.clock.t += 50_000
  assert.equal((await x.get(o, '/api/v1/marketplace?limit=24&offset=0&q=venus')).headers['x-marque-edge'], 'MISS', 'a listing is never served more than 45 s old')
})

test('link-preview bots get their own render; a query on a page that takes none is not stored', async () => {
  const o = await origin({ '/judge': (req, n) => page(`${req.headers['user-agent']} ${n}`), '/builders': (_r, n) => page(`b ${n}`) })
  const x = await edgeFor([o.port])
  await x.get(o, '/judge', { 'user-agent': 'Mozilla/5.0 Chrome' })
  const bot = await x.get(o, '/judge', { 'user-agent': 'Twitterbot/1.0' })
  assert.match(bot.body.toString(), /Twitterbot/); assert.equal(o.count('/judge'), 2)
  assert.match((await x.get(o, '/judge', { 'user-agent': 'k6/0.54.0 (https://k6.io/)' })).body.toString(), /Chrome 1/)
  await x.get(o, '/builders?wallet=0xabc'); await x.get(o, '/builders?wallet=0xabc')
  assert.equal(o.count('/builders?wallet=0xabc'), 2)
})

test('writes, health and streamed answers pass through unchanged', async () => {
  const o = await origin({
    '/api/v1/hire/intent': (req, _n, _res, body) => ({ status: 201, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify({ method: req.method, echoed: body.toString(), ip: req.headers['x-forwarded-for'] }) }),
    '/api/health': (_r, n) => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, n }) }),
    '/api/v1/tender': (_req, _n, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })
      res.write('data: one\n\n'); setTimeout(() => res.end('data: two\n\n'), 40)
      return null
    },
  })
  const x = await edgeFor([o.port])
  const posted = await x.ask('/api/v1/hire/intent', { ...x.via(o.port), 'content-type': 'application/json', 'content-length': '9' }, 'POST', '{"a":"b"}')
  assert.equal(posted.status, 201); assert.deepEqual(JSON.parse(posted.body.toString()), { method: 'POST', echoed: '{"a":"b"}', ip: '203.0.113.9' })
  await x.get(o, '/api/health'); assert.equal(JSON.parse((await x.get(o, '/api/health')).body.toString()).n, 2)
  const firstChunkAt = await new Promise((resolve, reject) => {
    const t0 = Date.now()
    http.get({ host: '127.0.0.1', port: x.port, path: '/api/v1/tender', headers: x.via(o.port), agent: false }, (res) => {
      let first = null, all = ''
      res.on('data', (c) => { first ??= Date.now() - t0; all += c })
      res.on('end', () => (all === 'data: one\n\ndata: two\n\n' ? resolve(first) : reject(new Error(all))))
    }).on('error', reject)
  })
  assert.ok(firstChunkAt < 35, `first event arrived after ${firstChunkAt} ms: the stream was buffered`)
  assert.equal(x.edge.entries.size, 0)
})

test('operator endpoints answer only a direct local call, and the switch turns the cache off without a restart', async () => {
  const o = await origin({ '/judge': (_r, n) => page(`render ${n}`) })
  const x = await edgeFor([o.port])
  await x.get(o, '/judge')
  const outside = await x.get(o, '/__edge/stats')
  assert.equal(outside.status, 404, 'through Caddy this is just an unknown page')
  const stats = JSON.parse((await x.ask('/__edge/stats')).body.toString())
  assert.equal(stats.entries, 1); assert.equal(stats.upstreamPort, o.port)
  assert.equal(JSON.parse((await x.ask('/__edge/purge?path=/judge', {}, 'POST')).body.toString()).purged, 1)
  await x.ask('/__edge/cache?mode=off', {}, 'POST')
  await x.get(o, '/judge'); const off = await x.get(o, '/judge')
  assert.equal(off.headers['x-marque-edge'], 'BYPASS'); assert.equal(o.count('/judge'), 3)
  const bad = await x.ask('/judge', { 'x-forwarded-for': '203.0.113.9', 'x-marque-upstream-port': '22' })
  assert.equal(bad.status, 502, 'only the two web slots can ever be addressed')
})

test('the store stays inside its memory budget by dropping what was read longest ago', async () => {
  const routes = {}
  for (let i = 0; i < 40; i++) routes[`/jobs/56/${i}`] = () => ({ headers: { 'cache-control': NO_STORE, 'content-type': 'application/octet-stream' }, body: Buffer.alloc(100_000, i) })
  const o = await origin(routes)
  const x = await edgeFor([o.port], { maxBytes: 1_000_000 })
  for (let i = 0; i < 40; i++) await x.get(o, `/jobs/56/${i}`)
  assert.ok(x.edge.entries.size <= 10 && x.edge.entries.size >= 8, String(x.edge.entries.size))
  assert.equal((await x.get(o, '/jobs/56/39')).headers['x-marque-edge'], 'HIT')
  assert.equal((await x.get(o, '/jobs/56/0')).headers['x-marque-edge'], 'MISS')
})

test('policy: keys, freshness and encodings', () => {
  assert.equal(normalQuery('b=2&a=1&utm_campaign=x&_rsc=9').key, 'a=1&b=2')
  assert.equal(classify('POST', '/judge', {}, 3200).mode, 'pass')
  assert.equal(classify('GET', '/judge', { range: 'bytes=0-1' }, 3200).mode, 'pass')
  assert.equal(classify('GET', '/api/mcp', {}, 3200).mode, 'pass')
  assert.equal(classify('GET', '/judge', {}, 3200).route.name, 'judge')
  assert.equal(classify('GET', '/judge/', {}, 3200).route, null)
  assert.equal(classify('GET', '/jobs/1/5', {}, 3200).route, null)
  assert.notEqual(classify('GET', '/judge', {}, 3200).key, classify('GET', '/judge', {}, 3201).key)
  assert.equal(classify('GET', '/api/v1/phase2/wallet/0x4bfD3f9c81a743F852Fb424FD487A1c53d7786D5', {}, 3200).route.name, 'set-and-earn-wallet')
  assert.equal(storable({ route: null, rsc: false, status: 200, headers: [['Cache-Control', NO_STORE]], body: null }), null)
  assert.equal(storable({ route: null, rsc: false, status: 200, headers: [['Cache-Control', 'public, max-age=0']], body: null }), null)
  assert.equal(storable({ route: null, rsc: false, status: 200, headers: [['Cache-Control', 'private, max-age=3600']], body: null }), null)
  assert.deepEqual(storable({ route: { fresh: 10, stale: 60 }, rsc: false, status: 404, headers: [], body: null }), { fresh: 5, stale: 0 })
  assert.equal(storable({ route: { fresh: 10, stale: 60 }, rsc: false, status: 500, headers: [], body: null }), null)
  assert.equal(pickEncoding('gzip, br', { br: true, gzip: true }), 'br')
  assert.equal(pickEncoding('gzip, br', { br: false, gzip: false }), null)
  assert.equal(pickEncoding(undefined, { br: true, gzip: true }), null)
  assert.equal(wantsFresh({ 'cache-control': 'max-age=0' }), true); assert.equal(wantsFresh({ 'cache-control': 'max-age=60' }), false)
  assert.equal(uaClass('Mozilla/5.0 (compatible; bingbot/2.0)'), 'bot'); assert.equal(uaClass('k6/0.54.0 (https://k6.io/)'), 'std')
})
