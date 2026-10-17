import { safeFetch } from '@marque/probe'
import type { StructuredTask } from '../tasks.js'
import { inspectPaymentChallenge } from '@marque/probe/payment-challenge'
import { extractJson, parsePriceWithAsset } from '../parse.js'
import type {
  AgentExecutor, CapabilityManifest, ExecutionContext, FailureReason,
  PreflightResult, Quote, RunResult,
} from '../types.js'

/**
 * Legacy x402 / B402 adapter, observation only.
 * inspect/quote make an unsigned guarded GET without payment credentials.
 * A discovery response or HTTP error is never a free task quote. Task preflight
 * and execution fail before any provider request until a consented exact-service
 * adapter and payment path are independently established. Use the versioned
 * captured-response inspector for atomic terms; this adapter never pays.
 */

export interface PaymentChallenge {
  /** x402 protocol version the server speaks, when it says. */
  version: string | null
  /** Amount as the server stated it. */
  amount: number | null
  /** Settlement asset, read from the challenge. Never defaulted. */
  asset: string | null
  /** Chain the payment must settle on. */
  chainId: number | null
  /** Where payment goes. */
  payTo: string | null
  /** The raw challenge, kept verbatim for the receipt. */
  raw: unknown
}

/** Legacy display parser retained for compatibility. Never a verifier, atomic amount parser or payment authorization. */
export function parseChallenge(headers: Record<string, string>, body: string): PaymentChallenge | null {
  if (body.length > 65_536) return null
  const header = headers['www-authenticate'] ?? headers['x-payment'] ?? headers['payment-required'] ?? ''
  const parsed = extractJson(body) as Record<string, unknown> | null

  // The modern shape: { x402Version, accepts: [{ maxAmountRequired, asset, network, payTo }] }
  const accepts = Array.isArray(parsed?.['accepts']) ? (parsed['accepts'] as Array<Record<string, unknown>>) : []
  const first = accepts[0]

  const num = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string') {
      if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v)) return null
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    return null
  }
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

  if (first) {
    return {
      version: str(parsed?.['x402Version']) ?? str(parsed?.['version']),
      amount: num(first['maxAmountRequired'] ?? first['amount'] ?? first['price']),
      asset: str(first['asset']) ?? str(first['currency']) ?? str(first['token']),
      chainId: num(first['chainId'] ?? first['network']),
      payTo: str(first['payTo']) ?? str(first['recipient']) ?? str(first['address']),
      raw: parsed,
    }
  }

  // The header dialect: WWW-Authenticate: Payment price="0.10 USDC" ...
  if (/payment/i.test(header)) {
    const priceMatch = header.match(/price="?([^",]+)"?/i)
    const price = parsePriceWithAsset(priceMatch?.[1])
    const payTo = header.match(/(?:address|payTo)="?(0x[a-fA-F0-9]{40})"?/i)?.[1] ?? null
    const chain = header.match(/chain(?:Id)?="?(\d+)"?/i)?.[1]
    return {
      version: null,
      amount: price?.amount ?? null,
      asset: price?.asset ?? null,
      chainId: chain ? Number(chain) : null,
      payTo,
      raw: header,
    }
  }

  return null
}

export class X402Executor implements AgentExecutor {
  readonly kind = 'x402' as const

  constructor(
    readonly agentId: string,
    private readonly endpoint: string,
    private readonly name: string | null = null,
  ) {}

  async inspect(): Promise<CapabilityManifest | { ok: false; reason: FailureReason; detail: string }> {
    const started = Date.now()
    const res = await safeFetch(this.endpoint, { timeoutMs: 15_000 })
    if (!res.ok) {
      return { ok: false, reason: res.failure === 'timeout' ? 'timeout' : 'unreachable', detail: `${res.failure}: ${res.detail}` }
    }


    if (res.status >= 400 && res.status !== 402) return { ok: false, reason: 'unreachable', detail: `http ${res.status}` }
    return {
      kind: this.kind,
      agentId: this.agentId,
      name: this.name,
      endpoint: this.endpoint,
      skills: [],
      // A 200 discovery response does not prove a free task-compatible operation.
      supportsFreePreflight: false,
      declaredPrice: null,
      reachedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
    }
  }

  async quote(_task: StructuredTask): Promise<Quote> {
    const started = Date.now()
    const res = await safeFetch(this.endpoint, { timeoutMs: 15_000 })
    if (!res.ok) {
      return {
        ok: false, status: 'failed', provenance: 'none', agentId: this.agentId, kind: this.kind, feeUsd: null,
        declaredPrice: null, settlementAsset: null, latencyMs: Date.now() - started,
        reason: res.failure === 'timeout' ? 'timeout' : 'unreachable', detail: res.detail,
      }
    }

    const inspection = inspectPaymentChallenge({ status: res.status, headers: res.headers, body: res.body })
    return {
      ok: false, status: 'price_unknown', provenance: inspection.state === 'OBSERVED' ? 'protocol' : 'none',
      agentId: this.agentId, kind: this.kind, feeUsd: null, declaredPrice: null, settlementAsset: null,
      latencyMs: Date.now() - started,
      reason: res.status === 402 ? 'payment_required' : res.status >= 400 ? 'unreachable' : 'no_compatible_interface',
      detail: res.status === 402
        ? 'Payment requirements are untrusted observations. Paid execution is unavailable; no payment option has been selected.'
        : 'HTTP reachability does not establish a free task-compatible operation.',
    }
  }

  async preflight(_task: StructuredTask): Promise<PreflightResult> {
    const started = Date.now()
    return {
      ok: false, agentId: this.agentId, plan: null, calls: [], estimatedGasNative: null,
      feeUsd: null, maxSlippageBps: null, conformance: null, latencyMs: Date.now() - started, nothingSubmitted: true,
      reason: 'blocked', detail: 'x402 preflight is unavailable without a consented task adapter. No provider request was sent.',
    }
  }

  async execute(_task: StructuredTask, _ctx: ExecutionContext): Promise<RunResult> {
    const started = Date.now(), at = new Date(started).toISOString()
    return {
      ok: false, agentId: this.agentId, kind: this.kind, result: null, txHashes: [], feeUsd: null,
      latencyMs: Date.now() - started, startedAt: at, finishedAt: new Date().toISOString(), reason: 'blocked',
      detail: 'Paid x402 execution is unavailable. No provider request or payment was sent.',
    }
  }
}
