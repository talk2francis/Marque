import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { verifyPreviousAssets } from './previous-assets.mjs'

async function fixture(html, serve, check) {
  const previous = createServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end(html) })
  const candidate = createServer(serve)
  await Promise.all([previous, candidate].map(server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))))
  try { await check(`http://127.0.0.1:${candidate.address().port}`, `http://127.0.0.1:${previous.address().port}`) }
  finally { for (const server of [previous, candidate]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) } }
}
const html = '<script src="/_next/static/chunks/old.js"></script><link href="/_next/static/css/old.css" rel="stylesheet"><script src="https://outside.invalid/ignored.js"></script>'

test('loads previous JavaScript and CSS using complete candidate responses only', async () => {
  const seen = []
  await fixture(html, (req, res) => { seen.push(req.url); res.setHeader('content-type', req.url.endsWith('.js') ? 'application/javascript' : 'text/css'); res.end('/* preserved public asset */') }, async (base, previous) => {
    assert.equal(await verifyPreviousAssets(base, previous), 2)
    assert.deepEqual(seen, ['/_next/static/chunks/old.js', '/_next/static/css/old.css'])
  })
})
test('rejects a missing old chunk before cutover', async () => {
  await fixture(html, (_req, res) => { res.writeHead(404); res.end('missing') }, async (base, previous) => {
    await assert.rejects(verifyPreviousAssets(base, previous), /previous asset unavailable/)
  })
})
test('rejects HTTP 200 with an incomplete asset body', async () => {
  await fixture(html, (_req, res) => { res.writeHead(200, { 'content-type': 'application/javascript', 'content-length': '500', connection: 'close' }); res.end('short') }, async (base, previous) => {
    await assert.rejects(verifyPreviousAssets(base, previous))
  })
})
test('rejects a successful HTML fallback instead of JavaScript', async () => {
  await fixture(html, (_req, res) => { res.setHeader('content-type', 'text/html'); res.end('<html>wrong route</html>') }, async (base, previous) => {
    await assert.rejects(verifyPreviousAssets(base, previous), /previous asset unavailable/)
  })
})
test('rejects a previous error page without script or style evidence', async () => {
  await fixture('<html>unavailable</html>', (_req, res) => res.end('unused'), async (base, previous) => {
    await assert.rejects(verifyPreviousAssets(base, previous), /no static assets/)
  })
})
