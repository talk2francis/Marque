import { z } from 'zod'

const uint = z.string().regex(/^(0|[1-9]\d{0,77})$/).refine(s => BigInt(s) < 2n ** 256n)
const address = z.string().regex(/^0x[\da-fA-F]{40}$/).refine(s => !/^0x0{40}$/i.test(s))
const chain = z.union([z.literal(56), z.literal(97)])
const expectedSchema = z.object({ chainId: chain, asset: address, payTo: address, maxAmountRaw: uint }).strict()
export type ExpectedPaymentTerms = z.infer<typeof expectedSchema>
const offerSchema = z.object({
  scheme: z.string().min(1).max(64), network: z.string().min(1).max(128),
  amount: uint.optional(), maxAmountRequired: uint.optional(),
  asset: z.string().min(1).max(200), payTo: z.string().min(1).max(200),
  maxTimeoutSeconds: z.number().int().positive().max(86_400), extra: z.record(z.unknown()).optional(),
})
const challengeSchema = z.object({
  x402Version: z.union([z.literal(1), z.literal(2)]),
  accepts: z.array(offerSchema).min(1).max(16),
  resource: z.object({ url: z.string().max(2048) }).optional(),
  extensions: z.record(z.unknown()).optional(),
})
const inputSchema = z.object({
  status: z.number().int().min(100).max(599),
  headers: z.record(z.string().max(90_000)).refine(h => Object.keys(h).length <= 64 && Object.entries(h).reduce((n, [k, v]) => n + k.length + v.length, 0) <= 90_000),
  body: z.string().max(65_536),
}).strict()
const base = {
  schema: 'marque.payment-challenge-inspection.v1', version: 1, mode: 'BETA_READ_ONLY', provenance: 'CLAIMED',
  executionAllowed: false, payerAuthentication: 'NOT_CHECKED', payeeAuthentication: 'NOT_CHECKED',
  tokenSupport: 'NOT_CHECKED', tokenDecimals: null, replayProtection: 'NOT_CHECKED', idempotency: 'NOT_CHECKED',
  absoluteExpiry: 'UNAVAILABLE', settlement: 'NOT_CHECKED', escrow: 'NOT_IMPLIED',
} as const
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** Captured response only. No URL fetch, wallet, option selection, authorization or payment replay. */
export function inspectPaymentChallenge(input: unknown, expected?: ExpectedPaymentTerms) {
  const fail = (reason: string, state: 'INVALID' | 'UNSUPPORTED' | 'NOT_PAYMENT_REQUIRED' = 'INVALID') => ({ ...base, state, reason, offers: [] })
  try {
    const p = inputSchema.safeParse(input)
    if (!p.success) return fail('invalid_or_oversized_capture')
    const { status, headers, body } = p.data
    if (new TextEncoder().encode(body).byteLength > 65_536) return fail('invalid_or_oversized_capture')
    if (status !== 402) return fail(status >= 400 ? 'http_error_is_not_a_free_service' : 'response_is_not_a_payment_challenge', 'NOT_PAYMENT_REQUIRED')
    const checkedExpected = expected === undefined ? null : expectedSchema.safeParse(expected)
    if (checkedExpected && !checkedExpected.success) return fail('invalid_expected_terms')
    const h: Record<string, string> = {}
    for (const [key, value] of Object.entries(headers)) {
      const name = key.toLowerCase()
      if (Object.hasOwn(h, name)) return fail('duplicate_header')
      h[name] = value
    }
    if (h['www-authenticate']?.match(/^Payment\b/i)) return fail('mpp_or_mixed_payment_protocol_requires_separate_inspection', 'UNSUPPORTED')
    let payload: unknown, source: 'PAYMENT_REQUIRED_HEADER' | 'V1_RESPONSE_BODY'
    const header = h['payment-required']
    if (header !== undefined) {
      if (!header || header.length > 87_384 || !/^[A-Za-z0-9+/]+={0,2}$/.test(header)) return fail('invalid_payment_required_encoding')
      const raw = atob(header)
      if (raw.length > 65_536) return fail('invalid_or_oversized_capture')
      payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, c => c.charCodeAt(0))))
      source = 'PAYMENT_REQUIRED_HEADER'
    } else {
      payload = JSON.parse(body)
      source = 'V1_RESPONSE_BODY'
    }
    const parsed = challengeSchema.safeParse(payload)
    if (!parsed.success) return fail('invalid_challenge_shape_or_version')
    const c = parsed.data
    if ((source === 'PAYMENT_REQUIRED_HEADER' && c.x402Version !== 2) || (source === 'V1_RESPONSE_BODY' && c.x402Version !== 1)) return fail('version_transport_mismatch', 'UNSUPPORTED')
    if (source === 'PAYMENT_REQUIRED_HEADER') {
      if (!c.resource) return fail('missing_v2_resource')
      let url: URL
      try { url = new URL(c.resource.url) } catch { return fail('invalid_v2_resource') }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return fail('invalid_v2_resource')
      // A second challenge in the optional body must not contradict the canonical header.
      try {
        const other: unknown = JSON.parse(body)
        if (other && typeof other === 'object' && Object.hasOwn(other, 'x402Version')) {
          const q = challengeSchema.safeParse(other)
          if (!q.success || JSON.stringify(q.data) !== JSON.stringify(c)) return fail('conflicting_body_challenge')
        }
      } catch { /* The v2 body need not be JSON or repeat the header. */ }
    }
    if (c.accepts.some(o => (c.x402Version === 2 ? o.amount : o.maxAmountRequired) === undefined || (o.amount !== undefined && o.maxAmountRequired !== undefined && o.amount !== o.maxAmountRequired))) return fail('missing_or_conflicting_atomic_amount')
    const offers = c.accepts.map((o, index) => {
      const amountRaw = c.x402Version === 2 ? o.amount : o.maxAmountRequired
      const issues: string[] = []
      if (amountRaw === undefined || (o.amount !== undefined && o.maxAmountRequired !== undefined && o.amount !== o.maxAmountRequired)) issues.push('missing_or_conflicting_atomic_amount')
      const chainId = o.network === 'eip155:56' ? 56 as const : o.network === 'eip155:97' ? 97 as const : null
      if (chainId === null) issues.push('unsupported_or_unverified_network')
      if (o.scheme !== 'exact') issues.push('unsupported_scheme')
      if (!address.safeParse(o.asset).success) issues.push('unsupported_asset_shape')
      if (!address.safeParse(o.payTo).success) issues.push('unsupported_payee_shape')
      const mismatches: string[] = []
      const e = checkedExpected?.success ? checkedExpected.data : null
      if (e) {
        if (chainId !== e.chainId) mismatches.push('wrong_chain')
        if (!same(o.asset, e.asset)) mismatches.push('wrong_asset')
        if (!same(o.payTo, e.payTo)) mismatches.push('wrong_payee')
        if (amountRaw === undefined || BigInt(amountRaw) > BigInt(e.maxAmountRaw)) mismatches.push('cap_exceeded_or_unknown')
      }
      return { index, scheme: o.scheme, network: o.network, chainId, asset: o.asset, payTo: o.payTo, amountRaw: amountRaw ?? null,
        maxTimeoutSeconds: o.maxTimeoutSeconds, issues,
        extensionsNeedReview: Boolean(c.extensions && Object.keys(c.extensions).length || o.extra && Object.keys(o.extra).length),
        comparison: { state: !e ? 'NOT_REQUESTED' : issues.length || mismatches.length ? 'MISMATCH_OR_UNSUPPORTED' : 'MATCHED_DECLARED_TERMS_ONLY', mismatches },
      }
    })
    return { ...base, state: 'OBSERVED', reason: 'untrusted_payment_requirements_only', protocolVersion: c.x402Version, source, offers }
  } catch { return fail('invalid_challenge_capture') }
}
