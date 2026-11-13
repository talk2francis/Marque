import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { warmWorkerRoutes } from './warm-worker-routes.mjs'

async function fixture(run, page = '<html></html>') {
  let sequence = 0
  const sockets = new Map(), visits = new Set()
  const server = http.createServer((request, response) => {
    if (!sockets.has(request.socket)) sockets.set(request.socket, sequence++ % 4)
    const worker = sockets.get(request.socket)
    if (request.url === '/api/ready') response.end(JSON.stringify({ ready: true, instance: `${String(worker).padStart(8, '0')}-0000-4000-8000-000000000000` }))
    else { visits.add(worker); if (typeof page === 'function') page(response); else response.end(page) }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try { await run(`http://127.0.0.1:${server.address().port}`, visits) }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
}

test('warms the featured route on four distinct workers over their own connections', async () => {
  await fixture(async (base, visits) => {
    assert.deepEqual(await warmWorkerRoutes(base, { instances: 4, routes: ['/featured-job'] }), { workers: 4, routes: ['/featured-job'] })
    assert.deepEqual([...visits].sort(), [0, 1, 2, 3])
  })
})
test('a partial HTML response cannot initialize a worker', async () => {
  await fixture(async base => {
    await assert.rejects(warmWorkerRoutes(base, { instances: 4, routes: ['/featured-job'] }), /Incomplete worker page/)
  }, '<html>')
})
test('refuses proxy or public origins as evidence of a particular worker', async () => {
  await assert.rejects(warmWorkerRoutes('https://example.com', { instances: 4, routes: ['/'] }), /loopback slot/)
})
test('fails when transport closes before the featured page completes', async () => {
  await fixture(async base => {
    await assert.rejects(warmWorkerRoutes(base, { instances: 4, routes: ['/featured-job'] }), /socket hang up|reset|Incomplete/)
  }, response => response.destroy())
})
test('refuses to credit another worker after a keep-alive connection is replaced', async () => {
  await fixture(async base => {
    await assert.rejects(warmWorkerRoutes(base, { instances: 4, routes: ['/featured-job'] }), /Worker changed/)
  }, response => { response.setHeader('Connection', 'close'); response.end('<html></html>') })
})
