import { getAddress, keccak256, toBytes } from 'viem'
import type { Negotiation, SimpleQuote } from './quote.js'

/**
 * The on-chain job description (ERC-8183 `createJob(..., description, ...)`).
 *
 * For a signed quote this must be byte-identical to @bnbagent/sdk 0.6.0
 * `buildJobDescription`, because the seller recomputes negotiation_hash from it and
 * refuses a job whose description does not match what it signed (the buyer's money
 * would then sit in escrow until expiry). description.test.ts checks equality against
 * the real SDK. Ported rather than imported so the browser bundle stays small.
 */
export const MAX_DESCRIPTION_BYTES = 4096

function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue)
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = sortValue((v as Record<string, unknown>)[k])
    return out
  }
  if (typeof v === 'number' && !Number.isFinite(v)) throw new TypeError(`canonicalJson: non-finite numbers are not allowed (got ${v})`)
  return v
}

/** Sorted keys, no whitespace, every code point above 0x7e escaped as \uXXXX (SDK canonicalJson). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value)).replace(/[\u007f-￿]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

/** SDK sanitizeForClaim: square brackets become parentheses, control characters other than tab and newline are dropped. */
export function sanitizeForClaim(s: unknown): string {
  if (typeof s !== 'string') return String(s)
  const result = s.replaceAll('[', '(').replaceAll(']', ')')
  let out = ''
  for (const ch of result) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 32 || ch === '\t' || ch === '\n') out += ch
  }
  return out
}

type Terms = { deliverables?: unknown; quality_standards?: unknown; success_criteria?: unknown[]; price?: string; currency?: string }

/** SDK buildDescriptionContent: the fields a provider signature covers. */
export function buildDescriptionContent(neg: Negotiation, chainId: number | null, verifyingContract: string | null): Record<string, unknown> {
  const response = (neg.response ?? {}) as Negotiation['response'] & { negotiated_at?: number; quote_expires_at?: number }
  const request = (neg.request ?? {}) as { task_description?: unknown }
  if (!response.accepted) throw new Error('Cannot build description from a rejected negotiation')
  const rt = (response.terms ?? {}) as Terms
  const price = rt.price || ''
  const currency = rt.currency || ''
  if (!price) throw new Error('Negotiation response missing price')
  if (!currency) throw new Error('Negotiation response missing currency')
  const terms: Record<string, unknown> = {
    deliverables: sanitizeForClaim(rt.deliverables ?? ''),
    quality_standards: sanitizeForClaim(rt.quality_standards ?? ''),
  }
  if (Array.isArray(rt.success_criteria) && rt.success_criteria.length > 0) terms['success_criteria'] = rt.success_criteria.map((c) => sanitizeForClaim(c))
  const top = neg as Record<string, unknown>
  const negotiatedAt = (top['negotiated_at'] as number | undefined) || response.negotiated_at || Math.floor(Date.now() / 1000)
  const quoteExpiresAt = (top['quote_expires_at'] as number | undefined) || response.quote_expires_at
  const content: Record<string, unknown> = {
    version: 1,
    negotiated_at: negotiatedAt,
    task: sanitizeForClaim(request.task_description ?? ''),
    terms,
    price,
    currency,
  }
  if (quoteExpiresAt !== undefined && quoteExpiresAt !== null) content['quote_expires_at'] = quoteExpiresAt
  if (chainId !== undefined && chainId !== null) content['chain_id'] = chainId
  if (verifyingContract !== undefined && verifyingContract !== null) content['verifying_contract'] = getAddress(verifyingContract)
  return content
}

/** SDK buildJobDescription for a signed NegotiationResult. */
export function buildJobDescription(neg: Negotiation, maxLength = MAX_DESCRIPTION_BYTES): string {
  const content = buildDescriptionContent(neg, neg.chain_id ?? null, neg.verifying_contract ?? null)
  if (neg.negotiation_hash) content['negotiation_hash'] = neg.negotiation_hash
  if (neg.provider_sig) content['provider_sig'] = neg.provider_sig
  const description = canonicalJson(content)
  if (description.length > maxLength) {
    throw new Error(`on-chain description is ${description.length} bytes, exceeds ${maxLength}; shorten the task. Truncating would invalidate the provider signature.`)
  }
  return description
}

/** Recompute negotiation_hash over the signed content (SDK verifyQuoteSignature step). */
export function negotiationHashOf(neg: Negotiation): `0x${string}` {
  return keccak256(toBytes(canonicalJson(buildDescriptionContent(neg, neg.chain_id ?? null, neg.verifying_contract ?? null))))
}

/**
 * The description for a plain (unsigned) quote. There is no seller signature to match,
 * so Marque writes the same canonical shape, naming the task, price, token, provider and
 * the Marque intent, so the job on chain says exactly what was bought and through whom.
 */
export function buildPlainDescription(q: SimpleQuote, task: string, intentId: string): string {
  const content = {
    version: 1,
    task: sanitizeForClaim(task),
    terms: { deliverables: sanitizeForClaim(q.deliverables ?? q.service ?? ''), quality_standards: '' },
    price: q.price,
    currency: getAddress(q.payment_token as string),
    provider: getAddress(q.provider),
    chain_id: q.chain_id,
    verifying_contract: getAddress(q.verifying_contract),
    client_ref: 'marque.trade',
    marque_intent: intentId,
  }
  const d = canonicalJson(content)
  if (d.length > MAX_DESCRIPTION_BYTES) throw new Error(`on-chain description is ${d.length} bytes, exceeds ${MAX_DESCRIPTION_BYTES}; shorten the task`)
  return d
}

export function descriptionHash(description: string): `0x${string}` {
  return keccak256(toBytes(description))
}
