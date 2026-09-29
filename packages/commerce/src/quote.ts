import { z } from 'zod'
import { recoverMessageAddress, getAddress, keccak256, toBytes } from 'viem'
import { safeFetch } from '@marque/probe'
import { assetAt, isSupportedChain, network, type ChainId } from './config.js'
import { negotiationHashOf } from './description.js'

/**
 * ERC-8183 quotes, server side (SPEC-COMMERCE 4.2 and 7.1).
 *
 * `negotiate` goes to the exact service through safeFetch (SSRF guard, timeout, size cap).
 * The answer is parsed strictly, then verified: the signature must recover, the quote
 * must be bound to a supported chain and the canonical escrow contract, the currency
 * must be in the SDK catalog, the price must be positive, and the signer must be the
 * agent's own registered wallet. Every failed check is a named reason, never a throw,
 * because a failed quote is a published observation, not an error.
 */

/** The seller's NegotiationResult envelope, as the Agent Studio runtime returns it. */
export const NegotiationSchema = z.object({
  request: z.record(z.unknown()),
  request_hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  response: z.object({
    accepted: z.boolean(),
    terms: z.object({
      price: z.string().regex(/^\d+$/).optional(),
      currency: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
    }).passthrough().optional(),
    estimated_completion_seconds: z.number().int().nonnegative().optional(),
    quote_expires_at: z.number().int().positive().optional(),
    negotiated_at: z.number().int().positive().optional(),
    reason: z.string().optional(),
  }).passthrough(),
  response_hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  negotiation_hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  provider_sig: z.string().regex(/^0x[0-9a-fA-F]+$/).optional(),
  chain_id: z.number().int().positive().optional(),
  verifying_contract: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
}).passthrough()
export type Negotiation = z.infer<typeof NegotiationSchema>

/**
 * The plain quote some production sellers return instead of a signed NegotiationResult
 * (for example Brain on BNB): the provider address, price, token, chain and escrow
 * contract, with no provider signature.
 */
export const SimpleQuoteSchema = z.object({
  accepted: z.boolean(),
  provider: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  price: z.string().regex(/^\d+$/),
  payment_token: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  currency: z.string().optional(),
  chain_id: z.number().int().positive(),
  verifying_contract: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  estimated_completion_seconds: z.number().int().nonnegative().optional(),
  quote_expires_at: z.number().int().positive().optional(),
  service: z.string().optional(),
  deliverables: z.string().optional(),
  needs: z.record(z.unknown()).optional(),
  instructions: z.string().optional(),
}).passthrough()
export type SimpleQuote = z.infer<typeof SimpleQuoteSchema>

export type QuoteFailure =
  | 'unreachable'
  | 'not_a2a'
  | 'no_quote'
  | 'malformed'
  | 'declined'
  | 'unsigned'
  | 'bad_signature'
  | 'chain_unsupported'
  | 'wrong_contract'
  | 'currency_unsupported'
  | 'no_price'
  | 'expired'
  | 'provider_mismatch'

export interface VerifiedQuote {
  ok: true
  /** True for a provider-signed NegotiationResult; false for a plain quote whose provider is the registered wallet. */
  signed: boolean
  /** Present when signed. */
  negotiation: Negotiation | null
  /** Present when unsigned. */
  simple: SimpleQuote | null
  chainId: ChainId
  provider: `0x${string}`
  price: bigint
  token: { address: `0x${string}`; symbol: string; decimals: number; isDefault: boolean }
  expiresAt: number
  estimatedCompletionSeconds: number | null
  /** keccak256 of the canonical envelope bytes we stored, for binding intents to quotes. */
  quoteHash: `0x${string}`
  latencyMs: number
}

export interface FailedQuote {
  ok: false
  reason: QuoteFailure
  detail: string
  latencyMs: number
  negotiation?: Negotiation
  simple?: SimpleQuote
  chainId?: number
  provider?: `0x${string}`
}

export type QuoteResult = VerifiedQuote | FailedQuote

export interface NegotiateTask {
  task_description: string
  terms: { deliverables: string; quality_standards: string } & Record<string, unknown>
}

/** The JSON-RPC body for an A2A `message/send` carrying a negotiate data part. */
export function negotiateBody(task: NegotiateTask, messageId: string, asText = false) {
  const envelope = { skill: 'negotiate', ...task }
  return {
    jsonrpc: '2.0',
    id: messageId,
    method: 'message/send',
    params: {
      message: {
        kind: 'message',
        role: 'user',
        messageId,
        parts: asText ? [{ kind: 'text', text: JSON.stringify(envelope) }] : [{ kind: 'data', data: envelope }],
      },
    },
  }
}

/** Pull the NegotiationResult out of whatever A2A shape came back (message, task, artifact, text). */
export function extractNegotiation(body: unknown): unknown {
  const seen = new Set<unknown>()
  const candidates: unknown[] = []
  const visit = (v: unknown, depth: number): void => {
    if (depth > 8 || v === null || typeof v !== 'object' || seen.has(v)) return
    seen.add(v)
    const o = v as Record<string, unknown>
    if (typeof o['negotiation_hash'] === 'string' && o['response']) candidates.push(o)
    if (typeof o['text'] === 'string' && o['text'].includes('negotiation_hash')) {
      try { candidates.push(JSON.parse(o['text'] as string)) } catch { /* not JSON */ }
    }
    for (const k of Object.keys(o)) visit(o[k], depth + 1)
  }
  visit(body, 0)
  return candidates[0] ?? null
}

export interface QuoteVerifyContext {
  /** The agent's ERC-8004 wallet (getAgentWallet) and owner. The signer must be one of them. */
  agentWallet?: string | null
  agentOwner?: string | null
  /** Seconds since epoch; injectable for tests. */
  now?: number
}

/** Verify a parsed negotiation against the protocol and the agent's identity. Pure except for ECDSA recovery. */
export async function verifyNegotiation(neg: Negotiation, ctx: QuoteVerifyContext, latencyMs = 0): Promise<QuoteResult> {
  const fail = (reason: QuoteFailure, detail: string, extra: Partial<FailedQuote> = {}): FailedQuote => ({ ok: false, reason, detail, latencyMs, negotiation: neg, ...extra })
  if (!neg.response.accepted) return fail('declined', neg.response.reason ?? 'the seller declined the task')
  if (!neg.provider_sig) return fail('unsigned', 'the quote carries no provider signature')
  const chainId = neg.chain_id
  if (!isSupportedChain(chainId)) return fail('chain_unsupported', `quote is bound to chain ${String(chainId)}`, { chainId })
  const net = network(chainId)
  if (!neg.verifying_contract || neg.verifying_contract.toLowerCase() !== net.commerce.toLowerCase()) {
    return fail('wrong_contract', `quote names ${neg.verifying_contract ?? 'no contract'}, expected ${net.commerce}`, { chainId })
  }
  const terms = neg.response.terms
  const currency = terms?.currency
  const asset = currency ? assetAt(chainId, currency) : null
  if (!asset) return fail('currency_unsupported', `currency ${currency ?? 'missing'} is not a catalog asset on chain ${chainId}`, { chainId })
  const price = terms?.price ? BigInt(terms.price) : 0n
  if (price <= 0n) return fail('no_price', 'quote has no positive price', { chainId })
  const now = ctx.now ?? Math.floor(Date.now() / 1000)
  const expiresAt = neg.response.quote_expires_at ?? 0
  if (!expiresAt || expiresAt <= now) return fail('expired', `quote expired at ${expiresAt}`, { chainId })

  // The seller recomputes this hash from the description we put on chain; if it does not
  // match the content now, the seller would refuse the funded job.
  let recomputed: string
  try { recomputed = negotiationHashOf(neg) } catch (e) { return fail('malformed', e instanceof Error ? e.message : 'unbuildable description', { chainId }) }
  if (recomputed.toLowerCase() !== neg.negotiation_hash.toLowerCase()) {
    return fail('bad_signature', 'negotiation_hash does not match the quoted terms', { chainId })
  }
  let signer: `0x${string}`
  try {
    signer = await recoverMessageAddress({ message: neg.negotiation_hash, signature: neg.provider_sig as `0x${string}` })
  } catch {
    return fail('bad_signature', 'provider_sig does not recover to an address', { chainId })
  }
  const allowed = [ctx.agentWallet, ctx.agentOwner].filter((a): a is string => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a) && !/^0x0{40}$/i.test(a))
  if (!allowed.some((a) => a.toLowerCase() === signer.toLowerCase())) {
    return fail('provider_mismatch', `quote is signed by ${signer}, which is not this agent's registered wallet`, { chainId, provider: signer })
  }
  return {
    ok: true,
    signed: true,
    negotiation: neg,
    simple: null,
    chainId,
    provider: getAddress(signer),
    price,
    token: { address: asset.address, symbol: asset.symbol, decimals: asset.decimals, isDefault: asset.isDefault },
    expiresAt,
    estimatedCompletionSeconds: neg.response.estimated_completion_seconds ?? null,
    quoteHash: keccak256(toBytes(JSON.stringify(neg))),
    latencyMs,
  }
}

/** Unsigned quotes live 15 minutes from when we received them (the SDK's cap for signed quotes). */
export const UNSIGNED_QUOTE_TTL_S = 900

/**
 * Verify a plain (unsigned) quote. Without a signature, the protection is the provider:
 * it must be the agent's own ERC-8004 wallet (or owner), so escrowed money can only ever
 * be released to the identity the buyer chose, never to a substitute.
 */
export function verifySimpleQuote(q: SimpleQuote, ctx: QuoteVerifyContext, latencyMs = 0): QuoteResult {
  const fail = (reason: QuoteFailure, detail: string, extra: Partial<FailedQuote> = {}): FailedQuote => ({ ok: false, reason, detail, latencyMs, simple: q, ...extra })
  if (!q.accepted) return fail('declined', 'the seller declined the task')
  const chainId = q.chain_id
  if (!isSupportedChain(chainId)) return fail('chain_unsupported', `quote is bound to chain ${chainId}`, { chainId })
  const net = network(chainId)
  if (q.verifying_contract.toLowerCase() !== net.commerce.toLowerCase()) {
    return fail('wrong_contract', `quote names ${q.verifying_contract}, expected ${net.commerce}`, { chainId })
  }
  const asset = q.payment_token ? assetAt(chainId, q.payment_token) : null
  if (!asset) return fail('currency_unsupported', `payment token ${q.payment_token ?? 'missing'} is not a catalog asset on chain ${chainId}`, { chainId })
  const price = BigInt(q.price)
  if (price <= 0n) return fail('no_price', 'quote has no positive price', { chainId })
  const provider = getAddress(q.provider)
  const allowed = [ctx.agentWallet, ctx.agentOwner].filter((a): a is string => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a) && !/^0x0{40}$/i.test(a))
  if (!allowed.some((a) => a.toLowerCase() === provider.toLowerCase())) {
    return fail('provider_mismatch', `quote names provider ${provider}, which is not this agent's registered wallet`, { chainId, provider })
  }
  const now = ctx.now ?? Math.floor(Date.now() / 1000)
  const expiresAt = q.quote_expires_at && q.quote_expires_at > now ? q.quote_expires_at : now + UNSIGNED_QUOTE_TTL_S
  return {
    ok: true,
    signed: false,
    negotiation: null,
    simple: q,
    chainId,
    provider,
    price,
    token: { address: asset.address, symbol: asset.symbol, decimals: asset.decimals, isDefault: asset.isDefault },
    expiresAt,
    estimatedCompletionSeconds: q.estimated_completion_seconds ?? null,
    quoteHash: keccak256(toBytes(JSON.stringify(q))),
    latencyMs,
  }
}

/** Find a plain quote object anywhere in an A2A response. */
export function extractSimpleQuote(body: unknown): unknown {
  const seen = new Set<unknown>()
  let found: unknown = null
  const visit = (v: unknown, depth: number): void => {
    if (found || depth > 8 || v === null || typeof v !== 'object' || seen.has(v)) return
    seen.add(v)
    const o = v as Record<string, unknown>
    if (typeof o['provider'] === 'string' && typeof o['price'] === 'string' && 'verifying_contract' in o && 'accepted' in o) { found = o; return }
    if (typeof o['text'] === 'string' && o['text'].includes('verifying_contract')) {
      try { const j = JSON.parse(o['text'] as string); visit(j, depth + 1) } catch { /* not JSON */ }
    }
    for (const k of Object.keys(o)) visit(o[k], depth + 1)
  }
  visit(body, 0)
  return found
}

/** Send negotiate to one exact service and verify the answer. */
export async function requestQuote(endpoint: string, task: NegotiateTask, ctx: QuoteVerifyContext & { timeoutMs?: number } = {}): Promise<QuoteResult> {
  const started = Date.now()
  const attempt = async (asText: boolean) => {
    const id = `marque-${started}-${Math.random().toString(36).slice(2, 8)}`
    return safeFetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(negotiateBody(task, id, asText)),
      timeoutMs: ctx.timeoutMs ?? 8_000,
      maxBytes: 64 * 1024,
    })
  }
  let res = await attempt(false)
  let found: unknown = res.ok ? parseJson(res.body) : null
  let neg = found ? extractNegotiation(found) : null
  // Text-only A2A adapters (Foundry) take the skill envelope as a JSON string. Retry that
  // way only when the first answer held no quote of either shape.
  if (!neg && !(found && extractSimpleQuote(found)) && res.ok && res.status < 500) {
    res = await attempt(true)
    found = res.ok ? parseJson(res.body) : null
    neg = found ? extractNegotiation(found) : null
  }
  const latencyMs = Date.now() - started
  if (!res.ok) return { ok: false, reason: 'unreachable', detail: `${res.failure}: ${res.detail}`.slice(0, 200), latencyMs }
  if (res.status >= 400) return { ok: false, reason: 'unreachable', detail: `http ${res.status}`, latencyMs }
  if (found === null) return { ok: false, reason: 'not_a2a', detail: 'response was not JSON', latencyMs }
  if (!neg) {
    const simple = extractSimpleQuote(found)
    if (simple) {
      const parsedSimple = SimpleQuoteSchema.safeParse(simple)
      if (parsedSimple.success) return verifySimpleQuote(parsedSimple.data, ctx, latencyMs)
      return { ok: false, reason: 'malformed', detail: parsedSimple.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), latencyMs }
    }
    return { ok: false, reason: 'no_quote', detail: 'no quote in the A2A response', latencyMs }
  }
  // An explicit refusal is a decline with the seller's own reason, not a malformed quote
  // (29 Sep: chainhelix began refusing plain-English tasks; we logged it as malformed).
  const refusal = declineOf(neg)
  if (refusal !== null) return { ok: false, reason: 'declined', detail: refusal.slice(0, 300), latencyMs }
  const parsed = NegotiationSchema.safeParse(neg)
  if (!parsed.success) return { ok: false, reason: 'malformed', detail: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), latencyMs }
  return verifyNegotiation(parsed.data, ctx, latencyMs)
}

/** The seller's stated reason when a negotiation says accepted: false, else null. */
export function declineOf(neg: unknown): string | null {
  if (!neg || typeof neg !== 'object') return null
  const o = neg as Record<string, unknown>
  const r = (o['response'] && typeof o['response'] === 'object' ? o['response'] : {}) as Record<string, unknown>
  if (o['accepted'] !== false && r['accepted'] !== false) return null
  const why = [r['reason'], o['reason'], r['reason_code']].find((x) => typeof x === 'string' && x.trim() !== '')
  return typeof why === 'string' ? why : 'the seller declined the task'
}

function parseJson(body: string): unknown {
  try { return JSON.parse(body) } catch { return null }
}

/** The fixed, harmless probe task (SPEC-COMMERCE 4.2). Never carries user data. */
const CATEGORY_WORDS: Record<string, string> = {
  yield: 'yield optimization', grid: 'grid trading', rebalancing: 'portfolio rebalancing',
  health_factor: 'health factor monitoring', security: 'security review',
}

export function probeTask(category: string): NegotiateTask {
  return {
    task_description: `marque-quote-probe: price check for a ${CATEGORY_WORDS[category] ?? category} task. No job will be created from this quote.`,
    terms: { deliverables: 'price quote only', quality_standards: 'n/a', client_ref: 'marque.trade', category },
  }
}
