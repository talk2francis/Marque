// marque-edge (PM2): the cache and request coalescer in front of the web slot. See ./edge.mjs and
// docs/operations/EDGE-CACHE.md. Public values only; this process is given no secret.
//
//   EDGE_PORT=3190  EDGE_CACHE=on|off  EDGE_MAX_MB=256  EDGE_ORIGIN_CONCURRENCY=4  EDGE_BACKGROUND_CONCURRENCY=2
import { createEdge } from './edge.mjs'

const int = (name, fallback, min, max) => {
  const n = Number(process.env[name])
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}
const log = (event, data = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), service: 'marque-edge', event, ...data }))

const port = int('EDGE_PORT', 3190, 1024, 65535)
const edge = createEdge({
  cache: process.env['EDGE_CACHE'] !== 'off',
  maxBytes: int('EDGE_MAX_MB', 256, 16, 2048) * 1024 * 1024,
  concurrency: int('EDGE_ORIGIN_CONCURRENCY', 4, 1, 32),
  bgConcurrency: int('EDGE_BACKGROUND_CONCURRENCY', 2, 1, 32),
  log,
})

edge.server.listen(port, '127.0.0.1', () => log('listening', { port, cache: process.env['EDGE_CACHE'] !== 'off' }))
edge.server.on('error', (err) => { log('listen_error', { message: err.message }); process.exit(1) })

// One line a minute while there is traffic: the evidence for how much the origin was spared.
let last = 0
setInterval(() => {
  const s = edge.stats()
  if (s.requests === last) return
  last = s.requests
  log('stats', s)
}, 60_000).unref()

let closing = false
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (closing) return
    closing = true
    log('closing', { signal })
    setTimeout(() => process.exit(0), 3000).unref()
    edge.close().then(() => process.exit(0))
  })
}
// Fail fast: PM2 restarts this process in about a second and Caddy sends traffic straight to the web slot meanwhile.
process.on('uncaughtException', (err) => { log('uncaught', { message: err.message }); process.exit(1) })
