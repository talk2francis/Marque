import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * safeFetch — the ONLY way Marque talks to an agent endpoint.
 *
 * Agent endpoints are hostile input (AGENTS.md, Security). Anyone can register
 * an ERC-8004 identity for a few cents and point its service URL at
 * `http://127.0.0.1:5432` or `http://169.254.169.254/latest/meta-data/`, then
 * wait for a marketplace to fetch it. Without this guard, our own probe worker
 * becomes an SSRF proxy into the VPS that also runs Postgres and four other
 * products.
 *
 * The guard:
 *   1. resolve DNS FIRST and check every resolved address, so a hostname that
 *      resolves to a private range is rejected before a socket is opened;
 *   2. reject private, loopback, link-local, CGNAT, multicast, reserved and
 *      cloud-metadata addresses;
 *   3. re-validate after EVERY redirect — a public host that 302s to
 *      169.254.169.254 defeats a check done only on the original URL;
 *   4. hard timeout;
 *   5. response size cap, enforced while streaming rather than after.
 *
 * Used by the probe worker and, from P5, by execution. Never bypass it.
 */

export interface SafeFetchOptions {
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  headers?: Record<string, string>
  method?: 'GET' | 'POST'
  body?: string
}

export type SafeFetchFailure =
  | 'dns'
  | 'tls'
  | 'timeout'
  | 'refused'
  | 'blocked_ssrf'
  | 'too_large'
  | 'too_many_redirects'
  | 'bad_url'
  | 'unknown'

export type SafeFetchResult =
  | {
      ok: true
      status: number
      headers: Record<string, string>
      body: string
      bytes: number
      latencyMs: number
      finalUrl: string
      redirects: number
    }
  | {
      ok: false
      failure: SafeFetchFailure
      detail: string
      latencyMs: number
      /** Present when the server answered but we rejected or errored afterwards. */
      status?: number
    }

const DEFAULTS = {
  timeoutMs: 8_000,
  maxBytes: 512 * 1024,
  maxRedirects: 3,
}

/** Parse an IPv4 dotted quad into its four octets, or null. */
function v4Octets(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((p) => Number(p))
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
  return [nums[0] as number, nums[1] as number, nums[2] as number, nums[3] as number]
}

/**
 * True when an address must never be contacted.
 *
 * Deliberately a denylist of ranges rather than an allowlist of public ones:
 * the reserved space is finite and enumerable, whereas "public" is not.
 */
export function isBlockedAddress(ip: string): boolean {
  const version = isIP(ip)
  if (version === 0) return true // not an IP at all: fail closed

  if (version === 4) {
    const o = v4Octets(ip)
    if (!o) return true
    const [a, b] = o

    if (a === 0) return true // 0.0.0.0/8 "this network"
    if (a === 10) return true // private
    if (a === 127) return true // loopback
    if (a === 100 && b >= 64 && b <= 127) return true // 100.64/10 CGNAT
    if (a === 169 && b === 254) return true // link-local INCLUDING 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true // private
    if (a === 192 && b === 0) return true // 192.0.0/24 + 192.0.2/24 protocol assignments
    if (a === 192 && b === 88) return true // 6to4 relay anycast
    if (a === 192 && b === 168) return true // private
    if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
    if (a === 198 && b === 51) return true // TEST-NET-2
    if (a === 203 && b === 0) return true // TEST-NET-3
    if (a >= 224) return true // multicast, reserved, broadcast
    return false
  }

  // IPv6
  const lower = ip.toLowerCase()
  if (lower === '::' || lower === '::1') return true // unspecified, loopback
  if (lower.startsWith('fe80')) return true // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // unique local
  if (lower.startsWith('ff')) return true // multicast
  // IPv4-mapped (::ffff:127.0.0.1) and IPv4-compatible: re-check the v4 part,
  // otherwise loopback sneaks through in v6 clothing.
  const mapped = lower.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped?.[1]) return isBlockedAddress(mapped[1])
  if (lower.startsWith('2002:')) return true // 6to4, can encode private v4
  if (lower.startsWith('64:ff9b:')) return true // NAT64, can encode private v4
  return false
}

export interface UrlCheck {
  allowed: boolean
  reason?: string
  addresses?: string[]
}

/**
 * Validate one URL: scheme, port, and every address its host resolves to.
 * Exported so a caller can pre-screen a URL without fetching it.
 */
export async function checkUrl(rawUrl: string): Promise<UrlCheck> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { allowed: false, reason: 'malformed url' }
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { allowed: false, reason: `scheme ${url.protocol} is not allowed` }
  }

  // Block ports that are only interesting to an attacker probing our host.
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  const BLOCKED_PORTS = new Set([22, 23, 25, 445, 3306, 5432, 6379, 9200, 11211, 27017])
  if (BLOCKED_PORTS.has(port)) {
    return { allowed: false, reason: `port ${port} is not allowed` }
  }

  const host = url.hostname.replace(/^\[|\]$/g, '')

  // A literal IP needs no DNS, but still needs checking.
  if (isIP(host) !== 0) {
    return isBlockedAddress(host)
      ? { allowed: false, reason: `address ${host} is in a blocked range`, addresses: [host] }
      : { allowed: true, addresses: [host] }
  }

  let resolved: Array<{ address: string }>
  try {
    resolved = await lookup(host, { all: true })
  } catch (err) {
    return { allowed: false, reason: `dns: ${err instanceof Error ? err.message : String(err)}` }
  }

  if (resolved.length === 0) return { allowed: false, reason: 'dns returned no addresses' }

  const addresses = resolved.map((r) => r.address)
  // ALL addresses must be safe. If a host round-robins between a public and a
  // private address, connecting is a coin flip we must not take.
  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      return { allowed: false, reason: `${host} resolves to blocked address ${address}`, addresses }
    }
  }
  return { allowed: true, addresses }
}

/** Read a response body with a hard byte cap, aborting mid-stream if exceeded. */
async function readCapped(res: Response, maxBytes: number): Promise<{ body: string; bytes: number; truncated: boolean }> {
  const declared = Number(res.headers.get('content-length') ?? '0')
  if (declared > maxBytes) {
    // Do not download something we already know is too big.
    return { body: '', bytes: declared, truncated: true }
  }

  const reader = res.body?.getReader()
  if (!reader) return { body: '', bytes: 0, truncated: false }

  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return { body: '', bytes: total, truncated: true }
      }
      chunks.push(value)
    }
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.byteLength
  }
  return { body: new TextDecoder().decode(merged), bytes: total, truncated: false }
}

function classifyError(err: unknown): { failure: SafeFetchFailure; detail: string } {
  const msg = err instanceof Error ? err.message : String(err)
  const cause = (err as { cause?: { code?: string } } | undefined)?.cause
  const code = cause?.code ?? ''

  if (err instanceof Error && err.name === 'AbortError') return { failure: 'timeout', detail: 'aborted at timeout' }
  if (/ENOTFOUND|EAI_AGAIN|ENODATA/.test(code + msg)) return { failure: 'dns', detail: msg }
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EPIPE/.test(code + msg)) return { failure: 'refused', detail: msg }
  if (/ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|timeout/i.test(code + msg)) return { failure: 'timeout', detail: msg }
  if (/certificate|CERT_|SSL|TLS|DEPTH_ZERO|self-signed|ERR_TLS/i.test(code + msg)) return { failure: 'tls', detail: msg }
  return { failure: 'unknown', detail: msg }
}

/**
 * Fetch an untrusted URL safely.
 *
 * Redirects are followed manually (`redirect: 'manual'`) so that each hop can
 * be re-validated. Handing `redirect: 'follow'` to fetch would let the runtime
 * chase a redirect into a private address without ever asking us.
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULTS.timeoutMs
  const maxBytes = opts.maxBytes ?? DEFAULTS.maxBytes
  const maxRedirects = opts.maxRedirects ?? DEFAULTS.maxRedirects
  const started = Date.now()

  let currentUrl = rawUrl
  let redirects = 0
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    for (;;) {
      const check = await checkUrl(currentUrl)
      if (!check.allowed) {
        return {
          ok: false,
          failure: 'blocked_ssrf',
          detail: check.reason ?? 'blocked',
          latencyMs: Date.now() - started,
        }
      }

      let res: Response
      try {
        res = await fetch(currentUrl, {
          method: opts.method ?? 'GET',
          headers: { accept: 'application/json, text/plain;q=0.9, */*;q=0.8', ...(opts.headers ?? {}) },
          ...(opts.body === undefined ? {} : { body: opts.body }),
          redirect: 'manual',
          signal: controller.signal,
        })
      } catch (err) {
        const { failure, detail } = classifyError(err)
        return { ok: false, failure, detail, latencyMs: Date.now() - started }
      }

      // Manual redirect handling, so each hop is re-validated.
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        if (!location) {
          return {
            ok: false, failure: 'unknown', status: res.status,
            detail: `redirect ${res.status} with no location header`,
            latencyMs: Date.now() - started,
          }
        }
        redirects++
        if (redirects > maxRedirects) {
          return {
            ok: false, failure: 'too_many_redirects', status: res.status,
            detail: `exceeded ${maxRedirects} redirects`, latencyMs: Date.now() - started,
          }
        }
        currentUrl = new URL(location, currentUrl).toString()
        continue
      }

      const { body, bytes, truncated } = await readCapped(res, maxBytes)
      if (truncated) {
        return {
          ok: false, failure: 'too_large', status: res.status,
          detail: `response exceeded ${maxBytes} bytes`, latencyMs: Date.now() - started,
        }
      }

      const headers: Record<string, string> = {}
      res.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v
      })

      return {
        ok: true,
        status: res.status,
        headers,
        body,
        bytes,
        latencyMs: Date.now() - started,
        finalUrl: currentUrl,
        redirects,
      }
    }
  } finally {
    clearTimeout(timer)
  }
}
