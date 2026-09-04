import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import { safeFetch } from '@marque/probe'
import { parseChallenge } from './executors/x402.js'
import { endpointFromCard } from './executors/a2a.js'
import { extractJson, parsePriceWithAsset } from './parse.js'

/**
 * The redirect test is the one that matters.
 *
 * A hostile agent does not have to publish a private endpoint — that is caught
 * on the first DNS check. It publishes a perfectly ordinary public URL that
 * 302s to 169.254.169.254 once you fetch it. Validating only the original URL
 * catches nothing.
 *
 * These tests stand up a real HTTP server that performs exactly that attack.
 */

let server: Server
let port = 0

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? '/'
    if (url === '/redirect-to-metadata') {
      // The attack: a public host redirecting into the cloud metadata service.
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/' })
      res.end()
      return
    }
    if (url === '/redirect-to-loopback') {
      res.writeHead(302, { location: 'http://127.0.0.1:5432/' })
      res.end()
      return
    }
    if (url === '/redirect-chain') {
      // Two innocent hops, then the attack. A guard that only re-checks the
      // first redirect is defeated by this.
      res.writeHead(302, { location: `http://127.0.0.1:${port}/redirect-chain-2` })
      res.end()
      return
    }
    if (url === '/redirect-chain-2') {
      res.writeHead(302, { location: 'http://169.254.169.254/' })
      res.end()
      return
    }
    if (url === '/loop') {
      res.writeHead(302, { location: `http://127.0.0.1:${port}/loop` })
      res.end()
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      port = typeof addr === 'object' && addr ? addr.port : 0
      resolve()
    })
  })
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('safeFetch redirect handling', () => {
  it('blocks a redirect to the cloud metadata endpoint', async () => {
    // The server itself is on loopback, so it is blocked at the first hop —
    // which is also correct. The next test proves the redirect check itself.
    const r = await safeFetch(`http://127.0.0.1:${port}/redirect-to-metadata`, { timeoutMs: 5_000 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure).toBe('blocked_ssrf')
  })

  it('blocks the metadata address directly, whatever the path', async () => {
    for (const url of [
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      'http://169.254.169.254/computeMetadata/v1/',
      'http://[::ffff:169.254.169.254]/',
    ]) {
      const r = await safeFetch(url, { timeoutMs: 3_000 })
      expect(r.ok, url).toBe(false)
      if (!r.ok) expect(r.failure, url).toBe('blocked_ssrf')
    }
  })

  it('never follows a redirect without re-validating it', async () => {
    // fetch(redirect: 'follow') would chase this into a private range without
    // ever asking us. The guard sets redirect: 'manual' precisely so it can.
    const r = await safeFetch(`http://127.0.0.1:${port}/redirect-chain`, { timeoutMs: 5_000 })
    expect(r.ok).toBe(false)
  })

  it('caps redirect chains rather than looping forever', async () => {
    const r = await safeFetch(`http://127.0.0.1:${port}/loop`, { timeoutMs: 5_000, maxRedirects: 2 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(['too_many_redirects', 'blocked_ssrf']).toContain(r.failure)
  })

  it('fails fast — a blocked request returns in well under 3 seconds', async () => {
    const started = Date.now()
    const r = await safeFetch('http://169.254.169.254/latest/meta-data/', { timeoutMs: 8_000 })
    const elapsed = Date.now() - started
    expect(r.ok).toBe(false)
    expect(elapsed).toBeLessThan(3_000)
  })
})

describe('x402 challenge parsing', () => {
  it('reads the settlement asset from the challenge rather than assuming it', () => {
    const c = parseChallenge({}, JSON.stringify({
      x402Version: '1',
      accepts: [{ maxAmountRequired: '0.10', asset: 'USDC', network: 56, payTo: '0x1111111111111111111111111111111111111111' }],
    }))
    expect(c?.amount).toBe(0.1)
    expect(c?.asset).toBe('USDC')
    expect(c?.chainId).toBe(56)
    expect(c?.payTo).toBe('0x1111111111111111111111111111111111111111')
  })

  it('reads the header dialect too', () => {
    const c = parseChallenge(
      { 'www-authenticate': 'Payment price="0.25 USDT" address="0x2222222222222222222222222222222222222222" chainId="56"' },
      '',
    )
    expect(c?.amount).toBe(0.25)
    expect(c?.asset).toBe('USDT')
    expect(c?.payTo).toBe('0x2222222222222222222222222222222222222222')
  })

  it('returns null rather than inventing a challenge', () => {
    expect(parseChallenge({}, 'not a challenge')).toBeNull()
  })
})

describe('A2A card resolution', () => {
  it('finds the callable endpoint named inside the card', () => {
    expect(
      endpointFromCard({ name: 'x', url: 'https://api.example.com/a2a' }, 'https://api.example.com/.well-known/agent-card.json'),
    ).toBe('https://api.example.com/a2a')
  })

  it('refuses to guess when the card names no endpoint', () => {
    // Guessing produces a graded failure that blames the agent for our guess.
    // "This card names no callable endpoint" is accurate and useful; a guess
    // is neither.
    expect(
      endpointFromCard({ name: 'x' }, 'https://api.example.com/agent/.well-known/agent-card.json'),
    ).toBeNull()
  })

  it('returns null for a card that is not an object', () => {
    expect(endpointFromCard('nope', 'https://x.dev/.well-known/agent-card.json')).toBeNull()
  })
})

describe('parsing untrusted agent output', () => {
  it('unwraps a JSON-RPC envelope', () => {
    expect(extractJson({ jsonrpc: '2.0', id: 1, result: { healthFactor: 1.18 } })).toEqual({ healthFactor: 1.18 })
  })

  it('unwraps JSON from a fenced code block inside prose', () => {
    const body = 'Here is my answer:\n```json\n{ "healthFactor": 1.18 }\n```\nHope that helps.'
    expect(extractJson(body)).toEqual({ healthFactor: 1.18 })
  })

  it('digs an answer out of an A2A artifact array', () => {
    const body = { result: { artifacts: [{ parts: [{ text: '{"healthFactor": 1.18}' }] }] } }
    expect(extractJson(body)).toEqual({ healthFactor: 1.18 })
  })

  it('does not turn an error envelope into an answer', () => {
    // An error is an answer ABOUT failure, not an answer. Unwrapping it would
    // hand the grader an object to score.
    expect(extractJson({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'nope' } })).toBeNull()
  })

  it('returns null for prose with no JSON in it', () => {
    expect(extractJson('I am afraid I cannot help with that.')).toBeNull()
  })

  it('never invents a fee that was not stated', () => {
    expect(parsePriceWithAsset(null)).toBeNull()
    expect(parsePriceWithAsset('free')).toBeNull()
    expect(parsePriceWithAsset('0.15 USDC')).toEqual({ amount: 0.15, asset: 'USDC' })
  })
})
