// The Marque edge: a small cache and request coalescer between Caddy and the Next.js web slot.
//
// Why it exists: almost every route is rendered per request, and a render costs a large share of a CPU second. A few
// renders at once block every worker's event loop, so even pages Next has cached wait behind them. This process answers
// repeat anonymous reads from memory without touching a worker, lets exactly one render per URL run at a time, and
// bounds how many renders it asks the origin for at once. Everything else is piped through untouched.
//
// It holds no secret and reads no database. If it is down, Caddy sends requests straight to the web slot
// (ops/web-upstream.caddy), so the site keeps working without it.
import http from 'node:http'
import net from 'node:net'
import zlib from 'node:zlib'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { ROUTES, VARIANT_HEADERS, RSC_FRESH_S, RELOAD_FLOOR_S, ERROR_GRACE_S, classify, storable, splitUrl, isCompressible, pickEncoding } from './policy.mjs'

const gzip = promisify(zlib.gzip)
const brotli = promisify(zlib.brotliCompress)

const HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'])
const NOT_STORED = new Set([...HOP, 'content-length', 'content-encoding', 'date', 'age', 'vary', 'x-marque-edge'])
/** The only request headers a shared render is allowed to see. */
const SHARED_REQUEST = new Set(['host', 'user-agent', 'accept', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host', 'x-real-ip', ...VARIANT_HEADERS])
const PORT_HEADER = 'x-marque-upstream-port'
const FG = 0, BG = 1, WARM = 2
const HARD_BODY_CAP = 32 * 1024 * 1024
const MIB = 1024 * 1024

const pairs = (raw) => { const out = []; for (let i = 0; i < raw.length; i += 2) out.push([raw[i], raw[i + 1]]); return out }
const first = (headers, name) => headers.find(([k]) => k.toLowerCase() === name)?.[1]

export function createEdge(options = {}) {
  const cfg = {
    host: '127.0.0.1', ports: [3200, 3201], defaultPort: 3200, routes: ROUTES,
    maxBytes: 256 * MIB, maxObjectBytes: 4 * MIB,
    concurrency: 4, bgConcurrency: 2, fetchTimeoutMs: 45_000, queueWaitMs: 20_000,
    switchHoldMs: 15_000, carryDelayMs: 20_000, carryMax: 300, carryWindowMs: 24 * 3600_000,
    compress: true, cache: true, now: Date.now, log: () => {},
    ...options,
  }
  const entries = new Map() // key -> entry, in least-recently-used order
  const inflight = new Map() // key -> { promise, task }
  const state = { port: null, previousPort: null, gen: 0, switchedAt: 0, cache: cfg.cache, bytes: 0, startedAt: cfg.now() }
  const stats = { requests: 0, hit: 0, stale: 0, miss: 0, bypass: 0, passed: 0, staleError: 0, errors: 0, renders: 0, revalidations: 0, warmed: 0, stored: 0, evicted: 0, notModified: 0, switches: 0 }

  // ---- bounded origin work: foreground first, then the revalidation closest to expiry, then deploy warm-up -------
  const queue = []
  let active = 0, activeBg = 0
  function schedule(prio, deadline, fn) {
    const task = { prio, deadline, fn, started: false, timer: null }
    task.promise = new Promise((resolve, reject) => { task.resolve = resolve; task.reject = reject })
    queue.push(task)
    if (prio === FG) armWait(task)
    pump()
    return task
  }
  // A waiting visitor is never refused: after queueWaitMs the render starts regardless of the limit.
  function armWait(task) {
    if (cfg.queueWaitMs <= 0 || task.started) return
    task.timer = setTimeout(() => start(task), cfg.queueWaitMs)
    task.timer.unref?.()
  }
  function start(task) {
    if (task.started) return
    const i = queue.indexOf(task)
    if (i !== -1) queue.splice(i, 1)
    task.started = true
    clearTimeout(task.timer)
    const bg = task.prio !== FG
    active += 1
    if (bg) activeBg += 1
    Promise.resolve().then(task.fn).then(task.resolve, task.reject).finally(() => { active -= 1; if (bg) activeBg -= 1; pump() })
  }
  function pump() {
    while (active < cfg.concurrency && queue.length) {
      let best = -1
      for (let i = 0; i < queue.length; i++) {
        const t = queue[i]
        if (t.prio !== FG && activeBg >= cfg.bgConcurrency) continue
        if (best === -1 || t.prio < queue[best].prio || (t.prio === queue[best].prio && t.deadline < queue[best].deadline)) best = i
      }
      if (best === -1) return
      start(queue[best])
    }
  }
  function promote(task) {
    if (task.started || task.prio === FG) return
    task.prio = FG
    armWait(task)
    pump()
  }

  // ---- storage -----------------------------------------------------------------------------------------------
  const sizeOf = (e) => e.body.length + (e.gz?.length ?? 0) + (e.br?.length ?? 0) + 1024
  function drop(key) {
    const e = entries.get(key)
    if (!e) return
    entries.delete(key)
    state.bytes -= sizeOf(e)
  }
  function store(key, e) {
    drop(key)
    entries.set(key, e)
    state.bytes += sizeOf(e)
    stats.stored += 1
    for (const oldest of entries.keys()) {
      if (state.bytes <= cfg.maxBytes || oldest === key) break
      drop(oldest)
      stats.evicted += 1
    }
  }
  async function compress(e) {
    if (!cfg.compress || e.body.length < 1024 || !isCompressible(e.contentType) || e.freshUntil - e.storedAt < 3000) return
    try {
      const [gz, br] = await Promise.all([
        gzip(e.body, { level: 6 }),
        brotli(e.body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: e.body.length } }),
      ])
      if (entries.get(e.d.key) !== e) return
      state.bytes -= sizeOf(e)
      e.gz = gz
      e.br = br
      state.bytes += sizeOf(e)
    } catch { /* the identity body is still served */ }
  }
  function makeEntry(d, raw, ttl, request) {
    const now = cfg.now()
    const headers = raw.headers.filter(([k]) => !NOT_STORED.has(k.toLowerCase()))
    const vary = new Set(raw.headers.filter(([k]) => k.toLowerCase() === 'vary').flatMap(([, v]) => v.split(',').map((s) => s.trim()).filter(Boolean)))
    if (![...vary].some((v) => v.toLowerCase() === 'accept-encoding')) vary.add('Accept-Encoding')
    headers.push(['Vary', [...vary].join(', ')])
    let etag = first(headers, 'etag')
    if (!etag && raw.status === 200) {
      etag = `W/"${createHash('sha1').update(raw.body).digest('base64url')}"`
      headers.push(['ETag', etag])
    }
    return {
      d: { key: d.key, docKey: d.docKey, route: d.route, rsc: d.rsc, path: d.path }, request,
      status: raw.status, headers, body: raw.body, gz: null, br: null, etag: etag ?? null,
      contentType: first(headers, 'content-type') ?? '',
      storedAt: now, freshUntil: now + ttl.fresh * 1000, staleUntil: now + (ttl.fresh + ttl.stale) * 1000, lastHit: now,
    }
  }

  // ---- origin ------------------------------------------------------------------------------------------------
  function sharedHeaders(headers) {
    const out = {}
    for (const [k, v] of Object.entries(headers)) if (SHARED_REQUEST.has(k)) out[k] = v
    out['accept-encoding'] = 'identity'
    return out
  }
  function fetchOrigin(port, url, headers) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: cfg.host, port, method: 'GET', path: url, headers, agent: false })
      const chunks = []
      let size = 0, settled = false
      const fail = (err) => { if (settled) return; settled = true; clearTimeout(timer); req.destroy(); reject(err) }
      const timer = setTimeout(() => fail(new Error('origin_timeout')), cfg.fetchTimeoutMs)
      req.on('error', fail)
      req.on('response', (res) => {
        res.on('data', (c) => { size += c.length; if (size > HARD_BODY_CAP) fail(new Error('origin_too_large')); else chunks.push(c) })
        res.on('aborted', () => fail(new Error('origin_aborted')))
        res.on('error', fail)
        res.on('end', () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve({ status: res.statusCode, statusMessage: res.statusMessage, headers: pairs(res.rawHeaders), body: Buffer.concat(chunks, size) })
        })
      })
      req.end()
    })
  }
  /** One render for a key, shared by everyone who asks while it runs. Resolves { entry } or { raw } (not storable). */
  function load(d, port, request, prio, deadline = 0) {
    const running = inflight.get(d.key)
    if (running) {
      if (prio === FG) promote(running.task)
      return { promise: running.promise, leader: false }
    }
    const gen = state.gen
    const task = schedule(prio, deadline, async () => {
      stats.renders += 1
      const raw = await fetchOrigin(port, request.url, request.headers)
      const ttl = raw.body.length <= cfg.maxObjectBytes ? storable({ route: d.route, rsc: d.rsc, status: raw.status, headers: raw.headers, body: raw.body }) : null
      if (!ttl || gen !== state.gen) return { raw }
      const entry = makeEntry(d, raw, ttl, request)
      store(d.key, entry)
      void compress(entry)
      // A viewer's own refresh just rendered this page: bring the stored document up to date as well.
      if (d.rsc && d.route) touchDocument(d, port)
      return { entry }
    })
    const promise = task.promise.finally(() => { if (inflight.get(d.key)?.task === task) inflight.delete(d.key) })
    promise.catch(() => {})
    inflight.set(d.key, { promise, task })
    return { promise, leader: true }
  }
  function revalidate(e, port, headers) {
    if (inflight.has(e.d.key)) return
    stats.revalidations += 1
    load(e.d, port, headers ? { url: e.request.url, headers: sharedHeaders(headers) } : e.request, BG, e.staleUntil)
  }
  function touchDocument(d, port) {
    const doc = entries.get(d.docKey)
    if (doc && cfg.now() - doc.storedAt > RSC_FRESH_S * 1000) revalidate(doc, port, null)
  }

  // ---- which web slot ----------------------------------------------------------------------------------------
  function portOf(req) {
    const h = req.headers[PORT_HEADER]
    if (h === undefined) return state.port ?? cfg.defaultPort
    const n = Number(h)
    return cfg.ports.includes(n) ? n : null
  }
  /** A deploy points Caddy at the other slot. The new release starts with an empty cache; recent pages are re-rendered. */
  function switchTo(port) {
    const now = cfg.now()
    const carry = state.port === null ? [] : [...entries.values()]
      .filter((e) => !e.d.rsc && e.status === 200 && now - e.lastHit < cfg.carryWindowMs)
      .sort((a, b) => b.lastHit - a.lastHit).slice(0, cfg.carryMax)
      .map((e) => ({ d: { ...e.d, key: `${port}|${e.d.key.slice(e.d.key.indexOf('|') + 1)}`, docKey: `${port}|${e.d.docKey.slice(e.d.docKey.indexOf('|') + 1)}` }, request: e.request }))
    entries.clear()
    state.bytes = 0
    state.previousPort = state.port
    state.port = port
    state.gen += 1
    state.switchedAt = now
    stats.switches += 1
    cfg.log('switch', { port, carry: carry.length })
    if (!carry.length) return
    const gen = state.gen
    const timer = setTimeout(() => {
      for (const c of carry) {
        if (gen !== state.gen) return
        if (entries.has(c.d.key) || inflight.has(c.d.key)) continue
        stats.warmed += 1
        load(c.d, port, c.request, WARM, Number.MAX_SAFE_INTEGER)
      }
    }, cfg.carryDelayMs)
    timer.unref?.()
  }
  function generation(port) {
    if (state.port === port) return true
    // A request Caddy accepted for the previous slot while it was switching is passed through uncached, so the two
    // releases never share a cache and a late request cannot flip the cache back.
    if (port === state.previousPort && cfg.now() - state.switchedAt < cfg.switchHoldMs) return false
    switchTo(port)
    return true
  }

  // ---- answers -----------------------------------------------------------------------------------------------
  function plain(res, status, text, tag) {
    if (res.headersSent) { res.destroy(); return }
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Marque-Edge': tag })
    res.end(text)
  }
  function etagMatches(header, etag) {
    if (!header || !etag) return false
    const strip = (s) => s.trim().replace(/^W\//, '')
    return header.split(',').some((t) => t.trim() === '*' || strip(t) === strip(etag))
  }
  function serve(req, res, e, tag) {
    const now = cfg.now()
    e.lastHit = now
    if (entries.get(e.d.key) === e) { entries.delete(e.d.key); entries.set(e.d.key, e) }
    const age = Math.max(0, now - e.storedAt)
    const out = []
    for (const [k, v] of e.headers) {
      // The origin dated this projection when it rendered; keep that age true for a stored copy.
      if (k.toLowerCase() === 'x-marque-projection-age-ms' && /^\d+$/.test(v)) out.push(k, String(Number(v) + age))
      else out.push(k, v)
    }
    out.push('Age', String(Math.floor(age / 1000)), 'X-Marque-Edge', tag)
    if (e.status === 200 && etagMatches(req.headers['if-none-match'], e.etag)) {
      stats.notModified += 1
      res.writeHead(304, out)
      res.end()
      return
    }
    const encoding = pickEncoding(req.headers['accept-encoding'], { br: Boolean(e.br), gzip: Boolean(e.gz) })
    const body = encoding === 'br' ? e.br : encoding === 'gzip' ? e.gz : e.body
    if (encoding) out.push('Content-Encoding', encoding)
    out.push('Content-Length', String(body.length))
    res.writeHead(e.status, out)
    res.end(req.method === 'HEAD' ? undefined : body)
  }
  function sendRaw(req, res, raw, tag) {
    const out = []
    for (const [k, v] of raw.headers) if (!HOP.has(k.toLowerCase()) && k.toLowerCase() !== 'content-length') out.push(k, v)
    out.push('Content-Length', String(raw.body.length), 'X-Marque-Edge', tag)
    res.writeHead(raw.status, raw.statusMessage, out)
    res.end(req.method === 'HEAD' ? undefined : raw.body)
  }
  /** Pipe a request to the origin and its answer back, unchanged. With `tee`, keep a copy if the origin allows it. */
  function pass(req, res, port, tag, tee = null) {
    stats.passed += 1
    const headers = {}
    for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k) && k !== PORT_HEADER) headers[k] = v
    if (tee) headers['accept-encoding'] = 'identity'
    const up = http.request({ host: cfg.host, port, method: req.method, path: req.url, headers, agent: false })
    let finished = false
    up.on('response', (ur) => {
      const out = []
      for (let i = 0; i < ur.rawHeaders.length; i += 2) if (!HOP.has(ur.rawHeaders[i].toLowerCase())) out.push(ur.rawHeaders[i], ur.rawHeaders[i + 1])
      out.push('X-Marque-Edge', tag)
      res.writeHead(ur.statusCode, ur.statusMessage, out)
      const gen = state.gen
      const responseHeaders = pairs(ur.rawHeaders)
      const ttl = tee && req.method === 'GET' ? storable({ route: null, rsc: tee.rsc, status: ur.statusCode, headers: responseHeaders, body: null }) : null
      let chunks = ttl ? [] : null, size = 0
      ur.on('data', (c) => {
        if (chunks) { size += c.length; if (size > cfg.maxObjectBytes) chunks = null; else chunks.push(c) }
        if (!res.write(c)) ur.pause()
      })
      res.on('drain', () => ur.resume())
      ur.on('aborted', () => { chunks = null; res.destroy() })
      ur.on('error', () => { chunks = null; res.destroy() })
      ur.on('end', () => {
        finished = true
        res.end()
        if (!chunks || gen !== state.gen) return
        const entry = makeEntry(tee, { status: ur.statusCode, headers: responseHeaders, body: Buffer.concat(chunks, size) }, ttl, { url: req.url, headers: sharedHeaders(req.headers) })
        store(tee.key, entry)
        void compress(entry)
      })
    })
    up.on('error', () => { finished = true; plain(res, 502, 'Bad Gateway', 'ERROR') })
    res.on('close', () => { if (!finished) up.destroy() })
    // A read has no body to wait for; anything with one is streamed.
    if (Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'] !== undefined) req.pipe(up)
    else up.end()
  }

  // ---- local operator endpoints (never reachable through Caddy, which always adds X-Forwarded-For) ---------------
  function snapshot() {
    const served = stats.hit + stats.stale + stats.staleError
    return {
      service: 'marque-edge', cache: state.cache, upstreamPort: state.port, generation: state.gen,
      uptimeSeconds: Math.round((cfg.now() - state.startedAt) / 1000),
      entries: entries.size, megabytes: Math.round((state.bytes / MIB) * 10) / 10,
      origin: { active, queued: queue.length, inflight: inflight.size },
      servedFromCacheShare: stats.requests ? Math.round((served / stats.requests) * 1000) / 1000 : null,
      ...stats,
    }
  }
  function admin(req, res) {
    const { path, query } = splitUrl(req.url)
    const q = new URLSearchParams(query)
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body) + '\n') }
    if (req.method === 'GET' && path === '/__edge/health') return json(200, { ok: true, service: 'marque-edge', cache: state.cache, upstreamPort: state.port })
    if (req.method === 'GET' && path === '/__edge/stats') return json(200, snapshot())
    if (req.method === 'POST' && path === '/__edge/purge') {
      const target = q.get('path')
      let n = 0
      for (const [key, e] of [...entries]) if (!target || e.d.path === target) { drop(key); n += 1 }
      cfg.log('purge', { path: target, entries: n })
      return json(200, { purged: n })
    }
    if (req.method === 'POST' && path === '/__edge/cache') {
      const mode = q.get('mode')
      if (mode !== 'on' && mode !== 'off') return json(400, { error: 'mode must be on or off' })
      state.cache = mode === 'on'
      if (!state.cache) { entries.clear(); state.bytes = 0 }
      cfg.log('cache', { mode })
      return json(200, { cache: state.cache })
    }
    if (req.method === 'POST' && path === '/__edge/release') {
      const port = Number(q.get('port'))
      if (!cfg.ports.includes(port)) return json(400, { error: 'unknown port' })
      if (port !== state.port) switchTo(port)
      return json(200, { upstreamPort: state.port, generation: state.gen })
    }
    return json(404, { error: 'not_found' })
  }

  // ---- the request path --------------------------------------------------------------------------------------
  async function handle(req, res) {
    stats.requests += 1
    const direct = req.headers['x-forwarded-for'] === undefined && req.headers[PORT_HEADER] === undefined
    if (direct && req.url.startsWith('/__edge/')) return admin(req, res)
    const port = portOf(req)
    if (port === null) return plain(res, 502, 'Unknown upstream', 'ERROR')
    const d = state.cache ? classify(req.method, req.url, req.headers, port, cfg.routes) : { mode: 'pass' }
    if (d.mode === 'pass' || !generation(port)) { stats.bypass += 1; return pass(req, res, port, 'BYPASS') }

    const now = cfg.now()
    const e = entries.get(d.key)
    if (e) {
      const recent = !d.reload || now - e.storedAt <= RELOAD_FLOOR_S * 1000
      if (now < e.freshUntil && recent) { stats.hit += 1; return serve(req, res, e, 'HIT') }
      if (now < e.staleUntil && !d.reload) { stats.stale += 1; revalidate(e, port, req.headers); return serve(req, res, e, 'STALE') }
    }
    stats.miss += 1
    // Not on the route list and never stored: only the origin's own headers can allow a copy.
    if (!d.route && !e) return pass(req, res, port, 'MISS', d)

    const { promise, leader } = load(d, port, { url: req.url, headers: sharedHeaders(req.headers) }, FG)
    const usable = e && now < e.staleUntil + ERROR_GRACE_S * 1000
    let result
    try { result = await promise } catch {
      stats.errors += 1
      if (usable) { stats.staleError += 1; return serve(req, res, e, 'STALE-ERROR') }
      return plain(res, 502, 'Bad Gateway', 'ERROR')
    }
    if (res.destroyed) return
    if (result.entry) return serve(req, res, result.entry, 'MISS')
    if (result.raw.status >= 500 && usable) { stats.staleError += 1; return serve(req, res, e, 'STALE-ERROR') }
    // Not storable (an error, a cookie, a private answer). The one who asked first gets it; the rest ask for themselves.
    if (leader) return sendRaw(req, res, result.raw, 'MISS')
    return pass(req, res, port, 'BYPASS')
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      stats.errors += 1
      cfg.log('error', { message: err instanceof Error ? err.message : String(err) })
      plain(res, 502, 'Bad Gateway', 'ERROR')
    })
  })
  server.keepAliveTimeout = 15_000
  server.headersTimeout = 20_000
  // A protocol upgrade is tunnelled as bytes; the edge never interprets it.
  server.on('upgrade', (req, socket, head) => {
    const port = portOf(req) ?? cfg.defaultPort
    const up = net.connect(port, cfg.host, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`]
      for (let i = 0; i < req.rawHeaders.length; i += 2) if (req.rawHeaders[i].toLowerCase() !== PORT_HEADER) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
      up.write(lines.join('\r\n') + '\r\n\r\n')
      if (head?.length) up.write(head)
      up.pipe(socket)
      socket.pipe(up)
    })
    up.on('error', () => socket.destroy())
    socket.on('error', () => up.destroy())
  })

  const sweep = setInterval(() => {
    const now = cfg.now()
    for (const [key, e] of entries) if (now > e.staleUntil + ERROR_GRACE_S * 1000) drop(key)
  }, 30_000)
  sweep.unref?.()

  return {
    server, stats: snapshot, entries,
    purge() { entries.clear(); state.bytes = 0 },
    close() { clearInterval(sweep); for (const t of queue) clearTimeout(t.timer); return new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.() }) },
  }
}
