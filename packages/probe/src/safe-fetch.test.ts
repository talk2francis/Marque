import { describe, it, expect } from 'vitest'
import { isBlockedAddress, checkUrl, safeFetch } from './safe-fetch.js'

/**
 * These are security tests. Every case is a real way a hostile agent endpoint
 * could try to reach inside the VPS, which also runs Postgres and four other
 * products. A regression here is a vulnerability, not a failing test.
 */

describe('isBlockedAddress', () => {
  it('blocks loopback', () => {
    expect(isBlockedAddress('127.0.0.1')).toBe(true)
    expect(isBlockedAddress('127.1.2.3')).toBe(true)
    expect(isBlockedAddress('::1')).toBe(true)
  })

  it('blocks the cloud metadata address', () => {
    // The single most valuable SSRF target on any VPS or cloud instance.
    expect(isBlockedAddress('169.254.169.254')).toBe(true)
  })

  it('blocks RFC1918 private ranges', () => {
    expect(isBlockedAddress('10.0.0.1')).toBe(true)
    expect(isBlockedAddress('172.16.0.1')).toBe(true)
    expect(isBlockedAddress('172.31.255.255')).toBe(true)
    expect(isBlockedAddress('192.168.1.1')).toBe(true)
  })

  it('does not over-block the public neighbours of private ranges', () => {
    // 172.15 and 172.32 are public; blocking them would lose real supply.
    expect(isBlockedAddress('172.15.0.1')).toBe(false)
    expect(isBlockedAddress('172.32.0.1')).toBe(false)
    expect(isBlockedAddress('11.0.0.1')).toBe(false)
  })

  it('blocks CGNAT, link-local, multicast and reserved', () => {
    expect(isBlockedAddress('100.64.0.1')).toBe(true)
    expect(isBlockedAddress('169.254.1.1')).toBe(true)
    expect(isBlockedAddress('224.0.0.1')).toBe(true)
    expect(isBlockedAddress('255.255.255.255')).toBe(true)
    expect(isBlockedAddress('0.0.0.0')).toBe(true)
  })

  it('blocks IPv4-mapped IPv6 loopback', () => {
    // ::ffff:127.0.0.1 is loopback wearing a v6 costume.
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isBlockedAddress('::ffff:169.254.169.254')).toBe(true)
    expect(isBlockedAddress('::ffff:10.0.0.1')).toBe(true)
  })

  it('blocks IPv6 link-local and unique-local', () => {
    expect(isBlockedAddress('fe80::1')).toBe(true)
    expect(isBlockedAddress('fd00::1')).toBe(true)
    expect(isBlockedAddress('fc00::1')).toBe(true)
  })

  it('fails closed on anything that is not an IP', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true)
    expect(isBlockedAddress('')).toBe(true)
  })

  it('allows ordinary public addresses', () => {
    expect(isBlockedAddress('8.8.8.8')).toBe(false)
    expect(isBlockedAddress('62.171.182.75')).toBe(false)
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false)
  })
})

describe('checkUrl', () => {
  it('rejects non-http schemes', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.com', 'gopher://example.com']) {
      const r = await checkUrl(url)
      expect(r.allowed, url).toBe(false)
      expect(r.reason).toMatch(/scheme/)
    }
  })

  it('rejects a literal loopback URL', async () => {
    const r = await checkUrl('http://127.0.0.1:5432/')
    expect(r.allowed).toBe(false)
  })

  it('rejects sensitive ports even on a public host', async () => {
    const r = await checkUrl('http://93.184.216.34:5432/')
    expect(r.allowed).toBe(false)
    expect(r.reason).toMatch(/port/)
  })

  it('rejects a malformed url', async () => {
    expect((await checkUrl('http://')).allowed).toBe(false)
    expect((await checkUrl('nonsense')).allowed).toBe(false)
  })

  it('rejects a hostname that resolves to loopback', async () => {
    // localhost is the simplest DNS-based bypass and must not work.
    const r = await checkUrl('http://localhost:8080/agent')
    expect(r.allowed).toBe(false)
    expect(r.reason).toMatch(/blocked address|blocked range/)
  })

  it('allows a normal public https endpoint', async () => {
    const r = await checkUrl('https://platform-backend.prod.termix.live/api/v1/a2a/agents/318810/card')
    expect(r.allowed).toBe(true)
    expect(r.addresses?.length).toBeGreaterThan(0)
  }, 20_000)
})

describe('safeFetch', () => {
  it('returns blocked_ssrf rather than connecting to loopback', async () => {
    // Port 8080 is not on the blocked-port list, so this exercises the
    // ADDRESS check rather than the port check.
    const r = await safeFetch('http://127.0.0.1:8080/agent-card')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.failure).toBe('blocked_ssrf')
      expect(r.detail).toMatch(/blocked range/)
    }
  })

  it('blocks a sensitive port on loopback via the port check', async () => {
    const r = await safeFetch('http://127.0.0.1:5432/')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.failure).toBe('blocked_ssrf')
      expect(r.detail).toMatch(/port 5432/)
    }
  })

  it('returns blocked_ssrf for the metadata endpoint', async () => {
    const r = await safeFetch('http://169.254.169.254/latest/meta-data/')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure).toBe('blocked_ssrf')
  })

  it('never opens a socket to a blocked host', async () => {
    // Postgres is listening on 5432 on this box. If the guard leaked, this
    // would take measurably longer than an immediate pre-flight rejection.
    const r = await safeFetch('http://127.0.0.1:5432/')
    expect(r.ok).toBe(false)
    expect(r.latencyMs).toBeLessThan(1000)
  })

  // These two hit a real network endpoint, so they target our own host rather
  // than a third party's: a suite that fails when someone else rate-limits us
  // reports our code as broken when it is not.
  const OWN_ENDPOINT = 'https://marque.trade/api/health'

  it('fetches a real public endpoint', async () => {
    const r = await safeFetch(OWN_ENDPOINT, { timeoutMs: 15_000 })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.status).toBe(200)
      expect(r.bytes).toBeGreaterThan(0)
      expect(r.body.length).toBeGreaterThan(0)
    }
  }, 30_000)

  it('enforces the byte cap', async () => {
    const r = await safeFetch(OWN_ENDPOINT, { maxBytes: 10, timeoutMs: 15_000 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure).toBe('too_large')
  }, 30_000)

  it('times out rather than hanging', async () => {
    // 10.255.255.1 is private, so this is rejected before any connection —
    // proving the guard runs first and the caller is never left waiting.
    const r = await safeFetch('http://10.255.255.1/', { timeoutMs: 1_000 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(['blocked_ssrf', 'timeout']).toContain(r.failure)
  }, 10_000)
})

describe('IPv4-mapped IPv6 in hex notation', () => {
  it('blocks the metadata address written as ::ffff:a9fe:a9fe', () => {
    // Node's URL parser rewrites [::ffff:169.254.169.254] into this form, and
    // the first version of the guard only matched the dotted notation — so the
    // cloud metadata endpoint was reachable THROUGH the guard. Found by a test,
    // not by reading the code.
    expect(isBlockedAddress('::ffff:a9fe:a9fe')).toBe(true)
    expect(isBlockedAddress('::ffff:7f00:1')).toBe(true)   // 127.0.0.1
    expect(isBlockedAddress('::ffff:a00:1')).toBe(true)    // 10.0.0.1
    expect(isBlockedAddress('::ffff:c0a8:1')).toBe(true)   // 192.168.0.1
  })

  it('still allows a public address in the same notation', () => {
    expect(isBlockedAddress('::ffff:808:808')).toBe(false) // 8.8.8.8
  })

  it('blocks it end to end through safeFetch', async () => {
    const r = await safeFetch('http://[::ffff:169.254.169.254]/latest/meta-data/', { timeoutMs: 3_000 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failure).toBe('blocked_ssrf')
  }, 10_000)
})
