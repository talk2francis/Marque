import { z } from 'zod'

/**
 * Client for the 8004scan REST API.
 *
 * Two behaviours here are not optional (AGENTS.md gotchas 5 and 7):
 *  - every list response is RE-FILTERED server side on chain_id, because their
 *    filters are not reliably honoured across endpoints;
 *  - rate-limit headers are read and respected rather than assumed.
 */

const BASE = process.env.SCAN_API_BASE ?? 'https://api.8004scan.io/api/v1'

export const scanAgentListItem = z.object({
  agent_id: z.string(),
  token_id: z.string(),
  chain_id: z.number(),
  contract_address: z.string(),
  owner_address: z.string().nullish(),
  name: z.string().nullish(),
  description: z.string().nullish(),
  image_url: z.string().nullish(),
  supported_protocols: z.array(z.string()).nullish(),
  x402_supported: z.boolean().nullish(),
  total_score: z.number().nullish(),
  health_score: z.number().nullish(),
  created_at: z.string().nullish(),
}).passthrough()

export type ScanAgentListItem = z.infer<typeof scanAgentListItem>

const scanListResponse = z.object({
  items: z.array(z.unknown()),
  total: z.number().nullish(),
  limit: z.number().nullish(),
  offset: z.number().nullish(),
})

/**
 * Detail schema.
 *
 * Deliberately permissive on everything except identity. 8004scan changes field
 * shapes without notice — `health_status` ships as both a string and an object —
 * and a strict schema turns one surprise field into a silently discarded agent.
 * Identity is validated; everything else is coerced at the point of use.
 */
export const scanAgentDetail = scanAgentListItem.extend({
  agent_wallet: z.unknown().nullish(),
  tags: z.unknown().nullish(),
  services: z.unknown().nullish(),
  raw_metadata: z.unknown().nullish(),
  parse_status: z.unknown().nullish(),
  health_status: z.unknown().nullish(),
  health_checked_at: z.unknown().nullish(),
  is_endpoint_verified: z.unknown().nullish(),
  a2a_endpoint: z.unknown().nullish(),
  mcp_server: z.unknown().nullish(),
  agent_url: z.unknown().nullish(),
}).passthrough()

type RawScanAgentDetail = z.infer<typeof scanAgentDetail>

/**
 * The detail record after coercion, which is what the rest of the code uses.
 *
 * Written out explicitly rather than derived with Omit<RawScanAgentDetail, ...>:
 * the raw schema is `.passthrough()`, whose index signature collapses every
 * property to `unknown` once Omit touches it.
 */
export interface ScanAgentDetail {
  agent_id: string
  token_id: string
  chain_id: number
  contract_address: string
  owner_address?: string | null
  name?: string | null
  description?: string | null
  image_url?: string | null
  supported_protocols?: string[] | null
  x402_supported?: boolean | null
  total_score?: number | null
  created_at?: string | null
  services: unknown
  raw_metadata: unknown
  parse_status: unknown
  agent_wallet: string | null
  tags: string[]
  health_status: string | null
  health_checked_at: string | null
  is_endpoint_verified: boolean
  a2a_endpoint: string | null
  mcp_server: string | null
  agent_url: string | null
}

/** Coerce a field that upstream ships as a string, an object, or nothing. */
function coerceString(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() === '' ? null : v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v && typeof v === 'object') {
    // e.g. health_status arriving as { status: 'degraded', ... }
    const rec = v as Record<string, unknown>
    for (const k of ['status', 'value', 'state', 'name']) {
      const inner = rec[k]
      if (typeof inner === 'string' && inner.trim() !== '') return inner
    }
  }
  return null
}

function coerceStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function coerceBool(v: unknown): boolean {
  return v === true || v === 'true'
}

function coerceDetail(raw: RawScanAgentDetail): ScanAgentDetail {
  return {
    agent_id: raw.agent_id,
    token_id: raw.token_id,
    chain_id: raw.chain_id,
    contract_address: raw.contract_address,
    owner_address: raw.owner_address ?? null,
    name: raw.name ?? null,
    description: raw.description ?? null,
    image_url: raw.image_url ?? null,
    supported_protocols: raw.supported_protocols ?? [],
    x402_supported: raw.x402_supported ?? false,
    total_score: raw.total_score ?? null,
    created_at: raw.created_at ?? null,
    services: raw.services ?? null,
    raw_metadata: raw.raw_metadata ?? null,
    parse_status: raw.parse_status ?? null,
    agent_wallet: coerceString(raw.agent_wallet),
    tags: coerceStringArray(raw.tags),
    health_status: coerceString(raw.health_status),
    health_checked_at: coerceString(raw.health_checked_at),
    is_endpoint_verified: coerceBool(raw.is_endpoint_verified),
    a2a_endpoint: coerceString(raw.a2a_endpoint),
    mcp_server: coerceString(raw.mcp_server),
    agent_url: coerceString(raw.agent_url),
  }
}

export interface RateLimitState {
  remainingMinute: number | null
  remainingDay: number | null
  limitMinute: number | null
  limitDay: number | null
}

/**
 * The upstream is temporarily unavailable.
 *
 * Distinct from "not found" because the caller MUST NOT mark the agent as
 * fetched: doing so during an outage permanently discards it from the index.
 */
export class ScanTransientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScanTransientError'
  }
}

export class ScanRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`8004scan rate limited; retry in ${retryAfterMs}ms`)
    this.name = 'ScanRateLimitError'
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export class ScanClient {
  private readonly apiKey: string | undefined
  readonly rateLimit: RateLimitState = {
    remainingMinute: null, remainingDay: null, limitMinute: null, limitDay: null,
  }

  constructor(apiKey = process.env.SCAN_API_KEY) {
    this.apiKey = apiKey && apiKey.length > 0 ? apiKey : undefined
    if (!this.apiKey) {
      console.warn('[scan] no SCAN_API_KEY set; running anonymous with much lower limits')
    }
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { accept: 'application/json' }
    if (this.apiKey) h['X-API-Key'] = this.apiKey
    return h
  }

  private absorbRateLimit(res: Response): void {
    const num = (k: string): number | null => {
      const v = res.headers.get(k)
      if (v === null) return null
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    this.rateLimit.remainingMinute = num('x-ratelimit-remaining-minute')
    this.rateLimit.remainingDay = num('x-ratelimit-remaining-day')
    this.rateLimit.limitMinute = num('x-ratelimit-limit-minute')
    this.rateLimit.limitDay = num('x-ratelimit-limit-day')
  }

  /**
   * Client-side rate limiting.
   *
   * Reacting to the response headers alone does not work: several concurrent
   * requests read the same `remaining` value before any of them lands, so the
   * budget is overspent and the API answers 429. Pacing locally prevents the
   * 429 instead of recovering from it.
   *
   * Paced under the real ceiling so a second consumer sharing the same key
   * (the probe worker, a one-off script) does not push us over.
   */
  private readonly targetPerMinute = Number(process.env.SCAN_TARGET_RPM ?? 420)
  private windowStart = Date.now()
  private windowCount = 0
  /** Serialises the pacing decision so concurrent callers cannot race past it. */
  private gate: Promise<void> = Promise.resolve()

  private async respectBudget(): Promise<void> {
    const wait = this.gate.then(async () => {
      const now = Date.now()
      if (now - this.windowStart >= 60_000) {
        this.windowStart = now
        this.windowCount = 0
      }
      if (this.windowCount >= this.targetPerMinute) {
        const until = this.windowStart + 60_000 - now
        if (until > 0) await sleep(until)
        this.windowStart = Date.now()
        this.windowCount = 0
      }
      this.windowCount++

      // Belt and braces: if the server says we are nearly out, stop regardless.
      const { remainingMinute } = this.rateLimit
      if (remainingMinute !== null && remainingMinute <= 3) {
        await sleep(5_000)
        this.windowStart = Date.now()
        this.windowCount = 0
      }
    })
    this.gate = wait.catch(() => {})
    await wait
  }

  private async get(path: string, params: Record<string, string | number | boolean> = {}): Promise<unknown> {
    await this.respectBudget()
    const url = new URL(`${BASE}${path}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))

    let lastErr: unknown
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(30_000) })
        this.absorbRateLimit(res)

        if (res.status === 429) {
          // Our local window is out of step with the server's; reset it so we
          // resume from a known-good baseline rather than drifting further.
          this.windowStart = Date.now()
          this.windowCount = this.targetPerMinute
          const retryAfter = Number(res.headers.get('retry-after') ?? '0')
          const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(60_000, 5_000 * 2 ** attempt)
          await sleep(waitMs)
          continue
        }
        if (res.status >= 500) {
          // Their backend flakes. Retry briefly, but do not spend 30s per agent
          // during an outage — the caller re-queues transient failures.
          if (attempt >= 1) {
            throw new ScanTransientError(`8004scan ${res.status} on ${path}`)
          }
          await sleep(500)
          continue
        }
        if (!res.ok) throw new Error(`8004scan ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`)
        return await res.json()
      } catch (err) {
        lastErr = err
        await sleep(1_000 * 2 ** attempt)
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`8004scan request failed: ${path}`)
  }

  /**
   * One page of agents. Always pass chainId; the result is re-filtered on it
   * regardless of what the API returns, and the drop count is reported so a
   * silently-ignored filter shows up as a number rather than as bad data.
   */
  async listAgents(opts: {
    chainId: number
    limit?: number
    offset?: number
    extra?: Record<string, string | number | boolean>
  }): Promise<{ items: ScanAgentListItem[]; total: number | null; droppedOffChain: number }> {
    const raw = await this.get('/agents', {
      chain_id: opts.chainId,
      limit: opts.limit ?? 100,
      offset: opts.offset ?? 0,
      ...(opts.extra ?? {}),
    })
    const parsed = scanListResponse.parse(raw)

    let droppedOffChain = 0
    const items: ScanAgentListItem[] = []
    for (const entry of parsed.items) {
      const r = scanAgentListItem.safeParse(entry)
      if (!r.success) continue
      // AGENTS.md gotcha 5 — never trust the upstream filter.
      if (r.data.chain_id !== opts.chainId) {
        droppedOffChain++
        continue
      }
      items.push(r.data)
    }
    return { items, total: parsed.total ?? null, droppedOffChain }
  }

  /** Total count for a filter combination, fetched as cheaply as possible. */
  async countAgents(chainId: number, extra: Record<string, string | number | boolean> = {}): Promise<number> {
    const raw = await this.get('/agents', { chain_id: chainId, limit: 1, offset: 0, ...extra })
    return scanListResponse.parse(raw).total ?? 0
  }

  /** Counts of why detail fetches failed. Surfaced by the worker, never swallowed. */
  readonly detailFailures = { http: 0, parse: 0, wrongChain: 0 }

  /**
   * One agent's detail record.
   *
   * Returns a discriminated result rather than `null`, because the caller has to
   * treat "this agent does not exist" and "8004scan is down" completely
   * differently. Collapsing them marks agents permanently fetched during an
   * outage and silently shrinks the index.
   */
  async getAgentResult(chainId: number, tokenId: string): Promise<
    { status: 'ok'; detail: ScanAgentDetail } | { status: 'not_found' } | { status: 'transient'; reason: string }
  > {
    let raw: unknown
    try {
      raw = await this.get(`/agents/${chainId}/${tokenId}`)
    } catch (err) {
      this.detailFailures.http++
      const reason = err instanceof Error ? err.message : String(err)
      // Anything that is not a definitive 404 is treated as transient.
      if (err instanceof ScanTransientError || !/\b404\b/.test(reason)) {
        return { status: 'transient', reason }
      }
      return { status: 'not_found' }
    }

    const parsed = scanAgentDetail.safeParse(raw)
    if (!parsed.success) {
      this.detailFailures.parse++
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      console.warn(`[scan] detail ${chainId}/${tokenId} failed schema: ${issues}`)
      return { status: 'not_found' }
    }
    if (parsed.data.chain_id !== chainId) {
      this.detailFailures.wrongChain++
      return { status: 'not_found' }
    }
    return { status: 'ok', detail: coerceDetail(parsed.data) }
  }

  /** Convenience wrapper. Prefer getAgentResult where the distinction matters. */
  async getAgent(chainId: number, tokenId: string): Promise<ScanAgentDetail | null> {
    const r = await this.getAgentResult(chainId, tokenId)
    return r.status === 'ok' ? r.detail : null
  }


}
