import { createHash } from 'node:crypto'
import { z } from 'zod'
import { boundedJson } from '@marque/probe'
import { canonicalJson } from './description.js'
import { network } from './config.js'
import { SDK_VERSION } from './generated.js'

export const digest = z.string().regex(/^0x[\da-fA-F]{64}$/)
export const address = z.string().regex(/^0x[\da-fA-F]{40}$/)
export const uint = z.string().regex(/^(0|[1-9]\d{0,77})$/).refine(s => BigInt(s) < 2n ** 256n)
export const sourceSchema = z.object({
  chainId: z.union([z.literal(56), z.literal(97)]), jobId: uint,
  provider: address.nullable(), client: address.nullable(), evaluator: address.nullable(),
  amount: uint.nullable(), token: z.object({ address: address.nullable(), symbol: z.string().nullable(), decimals: z.number().int().min(0).max(255).nullable() }).nullable(),
  deliverable: z.object({ hash: digest.nullable(), url: z.string().nullable() }),
  events: z.array(z.object({ name: z.string().max(80), contract: z.union([address, z.enum(['commerce', 'router', 'policy'])]), tx: digest, logIndex: z.number().int().nonnegative(), block: z.number().int().nonnegative().safe(), at: z.string().nullable(), args: z.record(z.unknown()) })).max(128),
  intent: z.object({ agent_id: z.string(), quote_id: z.number().int().nullable(), description_hash: digest.nullable() }).passthrough().nullable(),
  selectionCommitments: z.object({ version: z.literal(1), status: z.enum(['PRESERVED', 'PARTIAL', 'UNAVAILABLE']), reason: z.string().nullable(), agentId: z.string().nullable(), serviceId: z.number().int().positive().nullable(), quoteId: z.number().int().positive().nullable(), quoteHash: digest.nullable(), quoteHashVersion: z.literal(1), quoteHashAlgorithm: z.literal('Keccak-256/JSON.stringify(provider-envelope)'), signatureEvidence: z.enum(['provider_signed', 'identity_matched_unsigned', 'unknown']), endpointSha256: digest.nullable(), provider: address.nullable(), token: address.nullable(), chainId: z.union([z.literal(56), z.literal(97)]).nullable(), amountRaw: uint.nullable() }).strict().optional(),
}).passthrough()
export const bundleSchema = z.object({
  schema: z.literal('marque.commerce.bundle.v2'), hash: digest,
  payload: z.object({ version: z.literal(2), observedAt: z.string().datetime(), sourceComputedAt: z.string().datetime().nullable(), source: z.unknown(), references: z.array(z.object({ name: z.string(), contract: address, txHash: digest, logIndex: z.number().int().nonnegative(), blockNumber: uint }).strict()).max(128), bindings: z.unknown() }).strict(),
}).strict()
const sha = (v: unknown) => `0x${createHash('sha256').update(canonicalJson(v), 'utf8').digest('hex')}`
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
function derived(source: z.infer<typeof sourceSchema>) {
  const c = source.selectionCommitments && source.selectionCommitments.status !== 'UNAVAILABLE' ? source.selectionCommitments : null
  if (c?.status === 'PRESERVED' && (!c.serviceId || !c.quoteHash)) throw new Error('Complete selection metadata is missing')
  if (c && (!c.quoteId || !c.provider || !c.token || c.agentId !== source.intent?.agent_id || c.quoteId !== source.intent?.quote_id || c.chainId !== source.chainId || !source.provider || !source.token?.address || !same(c.provider, source.provider) || !same(c.token, source.token.address) || c.amountRaw !== source.amount)) throw new Error('Preserved selection disagrees with job projection')
  return {
    chainId: source.chainId, jobId: source.jobId, commerce: network(source.chainId).commerce,
    agentId: source.intent?.agent_id ?? null,
    serviceId: c?.serviceId ?? null, serviceBinding: c?.serviceId ? 'PRESERVED_SELECTION_NOT_HISTORICAL_OWNER_PROOF' : 'UNAVAILABLE_NOT_PRESERVED_IN_PUBLIC_PROJECTION',
    endpointSha256: c?.endpointSha256 ?? null,
    quoteId: source.intent?.quote_id ?? null, quoteHash: c?.quoteHash ?? null, quoteHashVersion: c?.quoteHash ? c.quoteHashVersion : null, quoteHashAlgorithm: c?.quoteHash ? c.quoteHashAlgorithm : null, quoteMode: c?.signatureEvidence ?? 'UNAVAILABLE_NOT_PRESERVED_IN_PUBLIC_PROJECTION',
    quoteBinding: c?.quoteHash ? 'PRESERVED_COMMITMENT_NOT_SIGNATURE_REPLAY' : 'UNAVAILABLE_ORIGINAL_QUOTE_HASH_NOT_PRESERVED',
    descriptionHash: source.intent?.description_hash ?? null,
    provider: source.provider, buyer: source.client, token: source.token, amountRaw: source.amount,
    deliverableHash: source.deliverable.hash,
    contractMapping: { source: 'pinned_sdk_configuration_not_historical_emitter_record', sdkVersion: SDK_VERSION },
  }
}

/** Export only the already public projection. Never reads private quote/task tables. */
export function buildCommerceBundle(source: unknown, observedAt: string, sourceComputedAt: string | null = null) {
  if (boundedJson(source) !== 'OK') throw new Error('Invalid or oversized job projection')
  const s = sourceSchema.parse(source)
  if (!z.string().datetime().safeParse(observedAt).success) throw new Error('Missing bundle observation time')
  if (sourceComputedAt !== null && !z.string().datetime().safeParse(sourceComputedAt).success) throw new Error('Invalid projection computation time')
  const payload = {
    version: 2 as const, observedAt, sourceComputedAt, source,
    references: s.events.map(e => ({ name: e.name, contract: e.contract === 'commerce' || e.contract === 'router' || e.contract === 'policy' ? network(s.chainId)[e.contract] : e.contract, txHash: e.tx, logIndex: e.logIndex, blockNumber: String(e.block) })),
    bindings: derived(s),
  }
  const envelope = { schema: 'marque.commerce.bundle.v2' as const, payload }
  return { ...envelope, hash: sha(envelope) }
}

export function inspectCommerceContent(input: unknown) {
  try {
    if (boundedJson(input) !== 'OK') return { state: 'FAILED', reason: 'invalid_or_oversized_bundle' }
    const b = bundleSchema.safeParse(input)
    if (!b.success || !Object.hasOwn(b.data.payload, 'source') || !Object.hasOwn(b.data.payload, 'bindings')) return { state: 'UNAVAILABLE', reason: 'missing_metadata_or_unsupported_bundle' }
    const s = sourceSchema.safeParse(b.data.payload.source)
    if (!s.success) return { state: 'UNAVAILABLE', reason: 'missing_public_job_metadata' }
    const expected = buildCommerceBundle(b.data.payload.source, b.data.payload.observedAt, b.data.payload.sourceComputedAt)
    if (expected.hash !== b.data.hash.toLowerCase() || sha(b.data) !== sha(expected)) return { state: 'FAILED', reason: 'bundle_digest_or_binding_mismatch' }
    return { state: 'VERIFIABLE', reason: 'offline_content_only', integrity: 'MATCH', bundleDigest: { algorithm: 'SHA-256', canonicalization: 'bnbagent-0.6.0-canonical-json/unicode-escape', scope: 'schema-and-payload', encoding: 'UTF-8' }, independence: 'UNKNOWN', signatureVerification: 'UNAVAILABLE_NO_PRIVATE_QUOTE_EXPORT' }
  } catch { return { state: 'FAILED', reason: 'invalid_bundle' } }
}
