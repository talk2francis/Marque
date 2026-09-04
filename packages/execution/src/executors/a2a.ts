import { safeFetch } from '@marque/probe'
import { renderTaskPrompt, type StructuredTask } from '../tasks.js'
import { extractJson, parseFeeUsd } from '../parse.js'
import type {
  AgentExecutor, CapabilityManifest, ExecutionContext, FailureReason,
  PreflightResult, Quote, RunResult,
} from '../types.js'

/**
 * A2A executor.
 *
 * A2A is a two-step protocol and this is the part everyone gets wrong: the
 * `.well-known/agent-card.json` URL is a DESCRIPTOR fetched with GET, and the
 * JSON-RPC endpoint you send work to is named inside it under `url`. POSTing at
 * the card returns 404, which is indistinguishable from a dead agent unless you
 * know. We learned that by mis-scoring thirty real projects in P3.
 *
 * This executor also handles TermiX-registered agents with no special casing.
 * Their endpoints are URL templates containing a literal `{agentId}`; the
 * generic resolver in packages/registry substitutes it during ingest, so by the
 * time an endpoint reaches here it is already concrete. There is deliberately
 * no TermixExecutor — a sponsor-specific executor would be plumbing, and the
 * only genuinely TermiX-specific thing is metadata normalisation.
 */

interface A2ACard {
  name?: string
  url?: string
  endpoint?: string
  skills?: Array<{ id?: string; name?: string }>
  card?: Record<string, unknown>
  status?: string
  capabilities?: unknown
}

function fail(reason: FailureReason, detail: string) {
  return { ok: false as const, reason, detail }
}

/** The callable endpoint an A2A card points at. */
export function endpointFromCard(card: unknown, _cardUrl?: string): string | null {
  if (!card || typeof card !== 'object') return null
  const rec = card as Record<string, unknown>
  const nested = (rec['card'] && typeof rec['card'] === 'object' ? rec['card'] : {}) as Record<string, unknown>

  for (const key of ['url', 'endpoint', 'serviceEndpoint', 'rpcUrl']) {
    const v = rec[key] ?? nested[key]
    if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v
  }
  const interfaces = rec['additionalInterfaces'] ?? nested['additionalInterfaces']
  if (Array.isArray(interfaces)) {
    for (const i of interfaces) {
      const u = (i as Record<string, unknown> | null)?.['url']
      if (typeof u === 'string' && /^https?:\/\//i.test(u)) return u
    }
  }
  /*
   * No fallback to the service origin.
   *
   * Guessing an endpoint produces a graded FAILURE that blames the agent for
   * our guess. TermiX cards name no `url` at all; falling back to the origin
   * POSTed JSON-RPC at a page that is not an A2A endpoint, and the resulting
   * garbage failed all five MCS fields — attributing our mis-addressing to
   * twenty real projects.
   *
   * "This card names no callable endpoint" is an accurate, useful statement
   * about the agent. A guess is not.
   */
  return null
}

export class A2AExecutor implements AgentExecutor {
  readonly kind = 'a2a' as const

  constructor(
    readonly agentId: string,
    private readonly cardUrl: string,
    private readonly name: string | null = null,
  ) {}

  private cached: { endpoint: string; card: A2ACard } | null = null

  /** Resolve the card once per executor instance. */
  private async resolve(): Promise<{ endpoint: string; card: A2ACard } | { ok: false; reason: FailureReason; detail: string }> {
    if (this.cached) return this.cached

    const res = await safeFetch(this.cardUrl, { timeoutMs: 15_000 })
    if (!res.ok) return fail('unreachable', `${res.failure}: ${res.detail}`)
    if (res.status >= 400) return fail('unreachable', `agent card returned http ${res.status}`)

    let card: A2ACard
    try {
      card = JSON.parse(res.body) as A2ACard
    } catch {
      return fail('no_compatible_interface', 'agent card was not JSON')
    }

    const endpoint = endpointFromCard(card, this.cardUrl)
    if (!endpoint) {
      return fail('no_compatible_interface', 'the agent card names no callable endpoint (no `url` field)')
    }
    this.cached = { endpoint, card }
    return this.cached
  }

  async inspect(): Promise<CapabilityManifest | { ok: false; reason: FailureReason; detail: string }> {
    const started = Date.now()
    const r = await this.resolve()
    if ('ok' in r) return r

    const nested = (r.card.card ?? {}) as Record<string, unknown>
    const rawSkills = r.card.skills ?? (nested['skills'] as A2ACard['skills'])
    const skills = Array.isArray(rawSkills)
      ? rawSkills.map((s) => s?.name ?? s?.id).filter((s): s is string => typeof s === 'string')
      : []

    return {
      kind: this.kind,
      agentId: this.agentId,
      name: r.card.name ?? this.name,
      endpoint: r.endpoint,
      skills,
      // A2A has no standard "free preflight" flag, so we do not claim one.
      supportsFreePreflight: true,
      declaredPrice: null,
      reachedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
    }
  }

  /** Send one task and return whatever structured answer comes back. */
  private async send(prompt: string, timeoutMs: number): Promise<
    { ok: true; payload: unknown; latencyMs: number } | { ok: false; reason: FailureReason; detail: string; latencyMs: number }
  > {
    const started = Date.now()
    const r = await this.resolve()
    if ('ok' in r) return { ...r, latencyMs: Date.now() - started }

    const res = await safeFetch(r.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'message/send',
        params: {
          message: {
            role: 'user',
            messageId: `marque-${Date.now()}`,
            parts: [{ kind: 'text', text: prompt }],
          },
        },
      }),
      timeoutMs,
    })
    const latencyMs = Date.now() - started

    if (!res.ok) {
      const reason: FailureReason = res.failure === 'timeout' ? 'timeout' : 'unreachable'
      return { ok: false, reason, detail: `${res.failure}: ${res.detail}`, latencyMs }
    }
    if (res.status === 402) {
      return { ok: false, reason: 'payment_required', detail: 'agent requires payment for this call', latencyMs }
    }
    if (res.status >= 400) {
      return { ok: false, reason: 'unreachable', detail: `http ${res.status}`, latencyMs }
    }

    const payload = extractJson(res.body)
    if (payload === null) {
      return { ok: false, reason: 'unusable_response', detail: 'reply contained no structured JSON answer', latencyMs }
    }
    return { ok: true, payload, latencyMs }
  }

  async quote(_task: StructuredTask): Promise<Quote> {
    const started = Date.now()
    const r = await this.resolve()
    if ('ok' in r) {
      return {
        ok: false, agentId: this.agentId, kind: this.kind, feeUsd: null,
        declaredPrice: null, settlementAsset: null,
        latencyMs: Date.now() - started, reason: r.reason, detail: r.detail,
      }
    }
    // A2A carries no price field. We report that honestly rather than
    // inventing a number: an unpriced agent is a fact about the agent.
    return {
      ok: true, agentId: this.agentId, kind: this.kind,
      feeUsd: null, declaredPrice: null, settlementAsset: null,
      latencyMs: Date.now() - started,
      detail: 'A2A declares no price; cost is settled out of band or is free',
    }
  }

  async preflight(task: StructuredTask): Promise<PreflightResult> {
    const sent = await this.send(renderTaskPrompt(task), 45_000)
    if (!sent.ok) {
      return {
        ok: false, agentId: this.agentId, plan: null, calls: [],
        estimatedGasNative: null, feeUsd: null, maxSlippageBps: null,
        conformance: null, latencyMs: sent.latencyMs, nothingSubmitted: true,
        reason: sent.reason, detail: sent.detail,
      }
    }
    const plan = sent.payload as Record<string, unknown>
    return {
      ok: true, agentId: this.agentId, plan, calls: [],
      // We do not estimate gas we did not simulate. Null is the honest value;
      // a plausible-looking guess here would be an estimate presented as a
      // measurement, which AGENTS.md treats as an escalation-level error.
      estimatedGasNative: null,
      feeUsd: parseFeeUsd(plan),
      maxSlippageBps: typeof plan['maxSlippageBps'] === 'number' ? plan['maxSlippageBps'] : null,
      conformance: null,
      latencyMs: sent.latencyMs,
      nothingSubmitted: true,
    }
  }

  async execute(task: StructuredTask, ctx: ExecutionContext): Promise<RunResult> {
    const startedAt = new Date().toISOString()
    const sent = await this.send(renderTaskPrompt(task), ctx.deadlineMs ?? 60_000)
    const finishedAt = new Date().toISOString()

    if (!sent.ok) {
      return {
        ok: false, agentId: this.agentId, kind: this.kind, result: null, txHashes: [],
        feeUsd: null, latencyMs: sent.latencyMs, startedAt, finishedAt,
        reason: sent.reason, detail: sent.detail,
      }
    }
    return {
      ok: true, agentId: this.agentId, kind: this.kind,
      result: sent.payload,
      // A2A returns a plan. Signing it is a separate, bounded step under a
      // charter (P6); an executor that broadcast on its own would be exactly
      // the unbounded authority this product exists to replace.
      txHashes: [],
      feeUsd: parseFeeUsd(sent.payload),
      latencyMs: sent.latencyMs, startedAt, finishedAt,
    }
  }
}
