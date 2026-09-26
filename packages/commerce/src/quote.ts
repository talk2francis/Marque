import { z } from 'zod'
import { recoverMessageAddress, getAddress, keccak256, toBytes, type PublicClient } from 'viem'
import { safeFetch } from '@marque/probe'
import { assetAt, isSupportedChain, network, type ChainId } from './config.js'

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
  negotiation: Negotiation
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
    negotiation: neg,
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

/**
 * Deep check with the SDK's own verifier: recomputes negotiation_hash over the signed
 * content and checks chain and expiry against a live block. Server only (loads the SDK).
 */
export async function sdkVerify(neg: Negotiation, provider: `0x${string}`, client: PublicClient): Promise<{ valid: boolean; reason?: string }> {
  const { verifyQuoteSignature } = await import('@bnbagent/sdk/erc8183')
  const chainId = neg.chain_id
  const expected = isSupportedChain(chainId) ? network(chainId).commerce : undefined
  const r = await verifyQuoteSignature({ envelope: neg as never, provider, publicClient: client as never, expectedVerifyingContract: expected } as never) as { valid: boolean; reason?: string }
  return r
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
  // Text-only A2A adapters (Foundry) take the skill envelope as a JSON string.
  if (!neg && res.ok && res.status < 500) {
    res = await attempt(true)
    found = res.ok ? parseJson(res.body) : null
    neg = found ? extractNegotiation(found) : null
  }
  const latencyMs = Date.now() - started
  if (!res.ok) return { ok: false, reason: 'unreachable', detail: `${res.failure}: ${res.detail}`.slice(0, 200), latencyMs }
  if (res.status >= 400) return { ok: false, reason: 'unreachable', detail: `http ${res.status}`, latencyMs }
  if (found === null) return { ok: false, reason: 'not_a2a', detail: 'response was not JSON', latencyMs }
  if (!neg) return { ok: false, reason: 'no_quote', detail: 'no NegotiationResult in the A2A response', latencyMs }
  const parsed = NegotiationSchema.safeParse(neg)
  if (!parsed.success) return { ok: false, reason: 'malformed', detail: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), latencyMs }
  return verifyNegotiation(parsed.data, ctx, latencyMs)
}

function parseJson(body: string): unknown {
  try { return JSON.parse(body) } catch { return null }
}

/** The fixed, harmless probe task (SPEC-COMMERCE 4.2). Never carries user data. */
export function probeTask(category: string): NegotiateTask {
  return {
    task_description: `marque-quote-probe: price check for a ${category} task. No job will be created from this quote.`,
    terms: { deliverables: 'price quote only', quality_standards: 'n/a', client_ref: 'marque.trade', category },
  }
}
