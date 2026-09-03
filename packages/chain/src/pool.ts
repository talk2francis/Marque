import { http, type Transport, type EIP1193RequestFn } from 'viem'

/** The shape every JSON-RPC call takes, independent of viem's generic plumbing. */
export interface RpcRequest {
  method: string
  params?: unknown
}

/**
 * A round-robin RPC pool with per-endpoint failover.
 *
 * Why not viem's built-in `fallback`: fallback prefers a ranked head and only
 * moves on when it errors, which concentrates indexing load on one provider and
 * gets us rate-limited (AGENTS.md gotcha 11). We want load *spread* across
 * every healthy endpoint, with a failed endpoint benched rather than retried
 * on every call.
 */

export interface PoolOptions {
  /** Consecutive failures before an endpoint is benched. */
  failureThreshold?: number
  /** How long a benched endpoint sits out, in ms. */
  cooldownMs?: number
  /** Per-request timeout handed to each underlying http transport. */
  timeoutMs?: number
  /** Attempts per request, each on the next healthy endpoint. */
  maxAttempts?: number
}

interface Endpoint {
  url: string
  request: EIP1193RequestFn
  consecutiveFailures: number
  /** Epoch ms until which this endpoint is benched. 0 = healthy. */
  benchedUntil: number
  totalOk: number
  totalFailed: number
}

export interface PoolStats {
  url: string
  healthy: boolean
  consecutiveFailures: number
  totalOk: number
  totalFailed: number
}

/** Errors that mean "this endpoint is unhappy", as opposed to "your call is wrong". */
function isEndpointFault(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  // A revert or invalid-params is our fault and will fail identically everywhere;
  // retrying it on another endpoint just multiplies the latency.
  if (/revert|invalid params|execution reverted|-32602|-32000: |already known/i.test(msg)) {
    return false
  }
  return true
}

export class RpcPool {
  private readonly endpoints: Endpoint[]
  private cursor = 0
  private readonly failureThreshold: number
  private readonly cooldownMs: number
  private readonly maxAttempts: number

  constructor(urls: readonly string[], chainId: number, opts: PoolOptions = {}) {
    if (urls.length === 0) throw new Error('RpcPool requires at least one URL')
    this.failureThreshold = opts.failureThreshold ?? 2
    this.cooldownMs = opts.cooldownMs ?? 30_000
    this.maxAttempts = opts.maxAttempts ?? Math.min(urls.length, 4)
    const timeout = opts.timeoutMs ?? 10_000

    this.endpoints = urls.map((url) => ({
      url,
      // retryCount 0: the pool owns retries, so a dead endpoint is benched
      // immediately instead of being hammered three times first.
      request: http(url, { timeout, retryCount: 0 })({ chain: undefined, retryCount: 0 }).request,
      consecutiveFailures: 0,
      benchedUntil: 0,
      totalOk: 0,
      totalFailed: 0,
    }))
    void chainId
  }

  get size(): number {
    return this.endpoints.length
  }

  stats(): PoolStats[] {
    const now = Date.now()
    return this.endpoints.map((e) => ({
      url: e.url,
      healthy: e.benchedUntil <= now,
      consecutiveFailures: e.consecutiveFailures,
      totalOk: e.totalOk,
      totalFailed: e.totalFailed,
    }))
  }

  /** Next endpoint in rotation, preferring healthy ones but never returning none. */
  private next(now: number): Endpoint {
    const n = this.endpoints.length
    for (let i = 0; i < n; i++) {
      const idx = this.cursor++ % n
      const ep = this.endpoints[idx]
      if (ep && ep.benchedUntil <= now) return ep
    }
    // Everything is benched. Use the one closest to coming back rather than
    // failing outright — a degraded answer beats no answer.
    let best = this.endpoints[0]!
    for (const ep of this.endpoints) if (ep.benchedUntil < best.benchedUntil) best = ep
    return best
  }

  private succeed(ep: Endpoint): void {
    ep.consecutiveFailures = 0
    ep.benchedUntil = 0
    ep.totalOk++
  }

  private fail(ep: Endpoint): void {
    ep.consecutiveFailures++
    ep.totalFailed++
    if (ep.consecutiveFailures >= this.failureThreshold) {
      ep.benchedUntil = Date.now() + this.cooldownMs
    }
  }

  /** Perform one JSON-RPC request, moving to the next endpoint on endpoint faults. */
  request = async (args: RpcRequest): Promise<unknown> => {
    let lastError: unknown
    const attempts = Math.max(1, Math.min(this.maxAttempts, this.endpoints.length))
    for (let attempt = 0; attempt < attempts; attempt++) {
      const ep = this.next(Date.now())
      try {
        const result = await ep.request(args as Parameters<EIP1193RequestFn>[0])
        this.succeed(ep)
        return result
      } catch (err) {
        lastError = err
        this.fail(ep)
        if (!isEndpointFault(err)) throw err
      }
    }
    throw lastError
  }

  /**
   * A viem Transport backed by this pool.
   *
   * viem's EIP1193RequestFn is generic over the RPC schema so that callers get
   * a typed return per method. The pool is method-agnostic by design, so the
   * cast happens here, once, at the boundary — rather than leaking `any` into
   * every call site.
   */
  transport(): Transport {
    const request = this.request as unknown as EIP1193RequestFn
    return (() => ({
      config: { key: 'marque-pool', name: 'Marque RPC pool', type: 'marque-pool', request },
      request,
      value: undefined,
    })) as unknown as Transport
  }
}
