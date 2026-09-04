import { safeFetch } from '@marque/probe'
import { renderTaskPrompt, type StructuredTask } from '../tasks.js'
import { extractJson, parseFeeUsd, parsePriceWithAsset } from '../parse.js'
import type {
  AgentExecutor, CapabilityManifest, ExecutionContext, FailureReason,
  PreflightResult, Quote, RunResult,
} from '../types.js'

/**
 * x402 / B402 executor.
 *
 * The flow is: call → 402 with a payment challenge → pay → retry with proof.
 * This executor implements everything up to and including reading the
 * challenge, and deliberately STOPS before paying.
 *
 * Paying requires signing with a funded key, which is a mainnet state change
 * and one of the four hard escalation gates in AGENTS.md. So a run that reaches
 * a real 402 returns `payment_required` with the parsed challenge attached: the
 * buyer sees exactly what is being asked for, in which asset, on which chain,
 * before anyone signs anything.
 *
 * The settlement asset is READ from the challenge, never assumed. Guessing USDT
 * and being wrong wastes a swap and half a morning (AGENTS.md gotcha 13).
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

/** Parse a 402 challenge from headers and body, tolerating both dialects. */
export function parseChallenge(headers: Record<string, string>, body: string): PaymentChallenge | null {
  const header = headers['www-authenticate'] ?? headers['x-payment'] ?? headers['payment-required'] ?? ''
  const parsed = extractJson(body) as Record<string, unknown> | null

  // The modern shape: { x402Version, accepts: [{ maxAmountRequired, asset, network, payTo }] }
  const accepts = Array.isArray(parsed?.['accepts']) ? (parsed['accepts'] as Array<Record<string, unknown>>) : []
  const first = accepts[0]

  const num = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string') {
      const n = Number(v.replace(/[^\d.]/g, ''))
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

    let declaredPrice: string | null = null
    if (res.status === 402) {
      const challenge = parseChallenge(res.headers, res.body)
      declaredPrice = challenge?.amount !== null && challenge?.amount !== undefined
        ? `${challenge.amount}${challenge.asset ? ` ${challenge.asset}` : ''}`
        : null
    }

    return {
      kind: this.kind,
      agentId: this.agentId,
      name: this.name,
      endpoint: this.endpoint,
      skills: [],
      // A 200 on an unpaid request means the endpoint is not actually charging.
      supportsFreePreflight: res.status === 200,
      declaredPrice,
      reachedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
    }
  }

  async quote(_task: StructuredTask): Promise<Quote> {
    const started = Date.now()
    const res = await safeFetch(this.endpoint, { timeoutMs: 15_000 })
    if (!res.ok) {
      return {
        ok: false, agentId: this.agentId, kind: this.kind, feeUsd: null,
        declaredPrice: null, settlementAsset: null, latencyMs: Date.now() - started,
        reason: res.failure === 'timeout' ? 'timeout' : 'unreachable', detail: res.detail,
      }
    }

    if (res.status === 402) {
      const c = parseChallenge(res.headers, res.body)
      if (!c) {
        return {
          ok: false, agentId: this.agentId, kind: this.kind, feeUsd: null,
          declaredPrice: null, settlementAsset: null, latencyMs: Date.now() - started,
          reason: 'unusable_response',
          detail: '402 returned with no parseable payment challenge',
        }
      }
      return {
        ok: true, agentId: this.agentId, kind: this.kind,
        // Only call it USD when the asset actually is a dollar stablecoin.
        feeUsd: c.asset && /^(USD|USDC|USDT|BUSD|DAI)/i.test(c.asset) ? c.amount : null,
        declaredPrice: c.amount !== null ? `${c.amount}${c.asset ? ` ${c.asset}` : ''}` : null,
        settlementAsset: c.asset,
        latencyMs: Date.now() - started,
      }
    }

    return {
      ok: true, agentId: this.agentId, kind: this.kind, feeUsd: 0,
      declaredPrice: 'free', settlementAsset: null,
      latencyMs: Date.now() - started,
      detail: 'endpoint answered without requiring payment',
    }
  }

  private async call(task: StructuredTask, timeoutMs: number) {
    const started = Date.now()
    const res = await safeFetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: renderTaskPrompt(task), address: task.subject, blockNumber: task.blockNumber }),
      timeoutMs,
    })
    const latencyMs = Date.now() - started

    if (!res.ok) {
      return { ok: false as const, reason: (res.failure === 'timeout' ? 'timeout' : 'unreachable') as FailureReason, detail: `${res.failure}: ${res.detail}`, latencyMs, challenge: null }
    }
    if (res.status === 402) {
      const c = parseChallenge(res.headers, res.body)
      /*
       * We stop here, deliberately.
       *
       * Paying means signing with a funded key on mainnet, which is one of the
       * four hard escalation gates. The buyer is shown exactly what is being
       * asked for, in which asset, on which chain, and decides.
       */
      return {
        ok: false as const,
        reason: 'payment_required' as FailureReason,
        detail: c
          ? `agent requires ${c.amount ?? '?'} ${c.asset ?? 'unknown asset'}${c.chainId ? ` on chain ${c.chainId}` : ''}${c.payTo ? ` to ${c.payTo}` : ''}`
          : 'agent returned 402 with an unparseable challenge',
        latencyMs,
        challenge: c,
      }
    }
    if (res.status >= 400) {
      return { ok: false as const, reason: 'unreachable' as FailureReason, detail: `http ${res.status}`, latencyMs, challenge: null }
    }

    const payload = extractJson(res.body)
    if (payload === null) {
      return { ok: false as const, reason: 'unusable_response' as FailureReason, detail: 'no structured JSON answer', latencyMs, challenge: null }
    }
    return { ok: true as const, payload, latencyMs, challenge: null }
  }

  async preflight(task: StructuredTask): Promise<PreflightResult> {
    const r = await this.call(task, 45_000)
    if (!r.ok) {
      return {
        ok: false, agentId: this.agentId, plan: null, calls: [],
        estimatedGasNative: null, feeUsd: null, maxSlippageBps: null,
        conformance: null, latencyMs: r.latencyMs, nothingSubmitted: true,
        reason: r.reason, detail: r.detail,
      }
    }
    return {
      ok: true, agentId: this.agentId, plan: r.payload, calls: [],
      estimatedGasNative: null, feeUsd: parseFeeUsd(r.payload), maxSlippageBps: null,
      conformance: null, latencyMs: r.latencyMs, nothingSubmitted: true,
    }
  }

  async execute(task: StructuredTask, ctx: ExecutionContext): Promise<RunResult> {
    const startedAt = new Date().toISOString()
    const r = await this.call(task, ctx.deadlineMs ?? 60_000)
    const finishedAt = new Date().toISOString()
    if (!r.ok) {
      return {
        ok: false, agentId: this.agentId, kind: this.kind, result: null, txHashes: [],
        feeUsd: null, latencyMs: r.latencyMs, startedAt, finishedAt,
        reason: r.reason, detail: r.detail,
      }
    }
    return {
      ok: true, agentId: this.agentId, kind: this.kind, result: r.payload,
      txHashes: [], feeUsd: parseFeeUsd(r.payload),
      latencyMs: r.latencyMs, startedAt, finishedAt,
    }
  }
}
