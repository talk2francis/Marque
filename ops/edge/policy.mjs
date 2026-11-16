// Route policy for the Marque edge cache (ops/edge/server.mjs). Pure functions, no I/O.
//
// Two ways a response becomes cacheable:
//   1. The origin says so: `s-maxage=N`, or `public, max-age=N` (ISR pages, the Set and Earn API, images).
//   2. The route is listed in ROUTES below: an anonymous GET that Next marks `no-store` only because it is rendered
//      per request, and whose output depends on nothing but the URL and the clock.
//
// A route may be added to ROUTES only when its server code reads no cookie and no request header. If it starts
// reading one, add that cookie to BYPASS_COOKIES (or remove the route) in the same change (AGENTS.md invariant).

/** Cookies the server reads. A request carrying one is never served from, or stored in, the cache. */
export const BYPASS_COOKIES = ['mq_charters_preview']

/** Request headers that select a different response for the same URL (Next's own Vary set, plus Caddy's mirror). */
export const VARIANT_HEADERS = ['rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-router-segment-prefetch', 'next-url', 'x-marque-router-state']

/** In-app navigation and router.refresh(): coalesced for this long, never served stale. */
export const RSC_FRESH_S = 2
/** A reload (Cache-Control: max-age=0 or no-cache) is answered with a render at most this old. */
export const RELOAD_FLOOR_S = 2
/** How long past its stale window an entry may still answer when the origin fails. */
export const ERROR_GRACE_S = 300

const DAY = 86_400

/**
 * fresh: seconds a stored response is served without asking the origin.
 * stale: further seconds it may be served while one background render replaces it.
 * query: 'none' (any query string leaves the route uncached) or 'any' (the query is part of the key).
 */
export const ROUTES = [
  {
    name: 'job-room', test: /^\/jobs\/(?:56|97)\/\d{1,20}$/, query: 'none', fresh: 5, stale: 120,
    // The page marks a job where nothing more can happen (apps/web/app/jobs/[chainId]/[jobId]/page.tsx).
    settled: { token: 'data-marque-edge="settled"', fresh: 300, stale: DAY },
  },
  { name: 'judge', test: /^\/judge$/, query: 'none', fresh: 10, stale: 60 },
  { name: 'builders', test: /^\/builders$/, query: 'none', fresh: 10, stale: 60 },
  { name: 'public-page', test: /^\/(?:adopt|proof|why|standard|pancakeswap|pancakeswap\/proof)$/, query: 'none', fresh: 10, stale: 60 },
  { name: 'status', test: /^\/status$/, query: 'none', fresh: 5, stale: 15 },
  // The human listing only. `format=machine` carries quote expiry and keeps the origin's own Cache-Control.
  { name: 'marketplace', test: /^\/api\/v1\/marketplace$/, query: 'any', denyParams: ['format'], fresh: 5, stale: 10 },
  { name: 'set-and-earn-api', test: /^\/api\/v1\/phase2\/(?:coverage|stats|config|ratings\/\d{1,12}|wallet\/0x[0-9a-fA-F]{40})$/, query: 'any', fresh: 3, stale: 15 },
]

const TRACKING = /^(?:utm_[a-z_]+|fbclid|gclid|msclkid|mc_cid|mc_eid|ref_src)$/i
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|facebookcatalog|whatsapp|telegram|ia_archiver|yeti|mediapartners|google|embedly|quora|pinterest|vkshare|tumblr|bitly|skypeuri|duckduck|baidu|yandex|sogou/i
const HTML_LIKE = /^(?:text\/html|text\/x-component|application\/json)/i
const COMPRESSIBLE = /^(?:text\/|application\/(?:json|javascript|xml|xhtml\+xml|manifest\+json|ld\+json)|image\/svg\+xml)/i

/** '/a/b?x=1' -> { path: '/a/b', query: 'x=1' }. The raw path is kept exactly as sent. */
export function splitUrl(url) {
  const i = url.indexOf('?')
  return i === -1 ? { path: url, query: '' } : { path: url.slice(0, i), query: url.slice(i + 1) }
}

/** The query as it counts for the key: tracking parameters and Next's `_rsc` buster dropped, the rest sorted. */
export function normalQuery(query) {
  if (!query) return { key: '', names: [] }
  const kept = []
  for (const [k, v] of new URLSearchParams(query)) {
    if (k === '_rsc' || TRACKING.test(k)) continue
    kept.push([k, v])
  }
  kept.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1))
  return { key: kept.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&'), names: kept.map(([k]) => k) }
}

export function routeFor(path, queryNames, routes = ROUTES) {
  for (const r of routes) {
    if (!r.test.test(path)) continue
    if (r.query === 'none' && queryNames.length) return null
    if (r.denyParams && queryNames.some((n) => r.denyParams.includes(n))) return null
    return r
  }
  return null
}

export const uaClass = (ua) => (ua && BOT.test(ua) ? 'bot' : 'std')

function directives(value) {
  const out = new Map()
  for (const part of String(value ?? '').split(',')) {
    const s = part.trim().toLowerCase()
    if (!s) continue
    const eq = s.indexOf('=')
    if (eq === -1) out.set(s, true)
    else out.set(s.slice(0, eq).trim(), s.slice(eq + 1).trim().replace(/^"|"$/g, ''))
  }
  return out
}

/** A browser reload, or a client fetch that asked for no cache. */
export function wantsFresh(headers) {
  const cc = directives(headers['cache-control'])
  if (cc.has('no-cache') || cc.has('no-store') || cc.get('max-age') === '0') return true
  return /no-cache/i.test(String(headers['pragma'] ?? ''))
}

/**
 * What to do with a request before the origin is asked.
 *   { mode: 'pass' }                                     never cached
 *   { mode: 'cache', route, key, docKey, rsc, reload }   look it up; `route` is null when only the origin can allow it
 */
export function classify(method, url, headers, port, routes = ROUTES) {
  if (method !== 'GET' && method !== 'HEAD') return { mode: 'pass', why: 'method' }
  if (headers['authorization'] || headers['range'] || headers['upgrade'] || headers['next-action'] || headers['expect']) return { mode: 'pass', why: 'header' }
  const cookie = headers['cookie']
  if (cookie && BYPASS_COOKIES.some((name) => new RegExp(`(?:^|;\\s*)${name}=`).test(cookie))) return { mode: 'pass', why: 'cookie' }
  const { path, query } = splitUrl(url)
  if (path === '/api/health' || path === '/api/ready' || path.startsWith('/api/mcp') || path.startsWith('/__edge/')) return { mode: 'pass', why: 'path' }
  const q = normalQuery(query)
  const route = routeFor(path, q.names, routes)
  const variant = VARIANT_HEADERS.map((h) => headers[h] ?? '').join('\u0001')
  const rsc = variant.length > VARIANT_HEADERS.length - 1
  const base = `${port}|${uaClass(headers['user-agent'])}|${path}?${q.key}`
  return { mode: 'cache', route, path, key: rsc ? `${base}|${variant}` : `${base}|`, docKey: `${base}|`, rsc, reload: wantsFresh(headers) }
}

/**
 * Whether, and for how long, a complete origin response may be stored.
 * Returns null (do not store) or { fresh, stale } in seconds.
 */
export function storable({ route, rsc, status, headers, body }) {
  const get = (name) => headers.filter(([k]) => k.toLowerCase() === name).map(([, v]) => v).join(', ')
  if (get('set-cookie')) return null
  for (const v of get('vary').split(',')) {
    const name = v.trim().toLowerCase()
    if (name && name !== 'accept-encoding' && !VARIANT_HEADERS.includes(name)) return null
  }
  const cc = directives(get('cache-control'))
  let ttl = null
  if (route) {
    if (status === 200) {
      const settled = route.settled && !rsc && body && body.includes(route.settled.token)
      ttl = settled ? { fresh: route.settled.fresh, stale: route.settled.stale } : { fresh: route.fresh, stale: route.stale }
    } else if (status === 301 || status === 308) ttl = { fresh: route.fresh, stale: route.stale }
    else if (status === 302 || status === 307 || status === 404) ttl = { fresh: Math.min(route.fresh, 5), stale: 0 }
  } else if ((status === 200 || status === 301 || status === 308) && !cc.has('private') && !cc.has('no-store') && !cc.has('no-cache')) {
    const shared = cc.has('s-maxage') ? Number(cc.get('s-maxage')) : cc.has('public') && cc.has('max-age') ? Number(cc.get('max-age')) : 0
    if (Number.isFinite(shared) && shared > 0) {
      // Documents and JSON stay close to the origin's own freshness; immutable media may stay longer.
      const fresh = Math.min(shared, HTML_LIKE.test(get('content-type')) || status !== 200 ? 10 : 3600)
      ttl = { fresh, stale: Math.min(60, cc.has('stale-while-revalidate') ? Number(cc.get('stale-while-revalidate')) || 0 : fresh) }
    }
  }
  if (!ttl) return null
  return rsc ? { fresh: Math.min(ttl.fresh, RSC_FRESH_S), stale: 0 } : ttl
}

export const isCompressible = (contentType) => COMPRESSIBLE.test(String(contentType ?? ''))

/** Which stored encoding a client accepts: 'br', 'gzip' or null (identity). q=0 means refused. */
export function pickEncoding(acceptEncoding, has) {
  if (!acceptEncoding) return null
  const ok = new Set()
  for (const part of String(acceptEncoding).split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';')
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
    if (q && Number(q.slice(2)) === 0) continue
    ok.add(name.trim())
  }
  if (has.br && ok.has('br')) return 'br'
  if (has.gzip && ok.has('gzip')) return 'gzip'
  return null
}
