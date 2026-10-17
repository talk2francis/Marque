import { boundedJson } from '@marque/probe/bounded-json'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalise, type Receipt } from './receipt.js'
import { structuredTask } from './tasks.js'

/** Compatibility contract, not RFC 8785 JCS. Changing it changes historical hashes. */
export const RECEIPT_DIGEST_CONTRACT = {
  version: 1,
  receiptVersions: ['1', '2'],
  algorithm: 'SHA-256',
  canonicalization: 'marque-sorted-json-v1',
  encoding: 'UTF-8',
  domainPrefix: '',
  unicodeNormalization: 'none',
  scope: 'complete-receipt-json',
} as const

const protocol = z.enum(['erc8183', 'x402', 'a2a', 'mcp'])
const strings = z.array(z.string())
const MAX_RECEIPT_BYTES = 2 * 1024 * 1024
// Validate without coercion. Hash the ORIGINAL object, including unknown keys.
// Passthrough keeps future optional fields from being silently omitted in replay.
const receiptSchema = z.object({
  version: z.enum(['1', '2']), runId: z.string(), issuedAt: z.string(),
  task: structuredTask,
  artifactType: z.enum(['execution', 'settlement', 'failure']).optional(),
  service: z.object({
    serviceId: z.number().int().nullable(), protocol,
    discoveryEndpoint: z.string().nullable(), executableEndpoint: z.string().nullable(),
    probeId: z.number().int().nullable(),
  }).passthrough().optional(),
  commercial: z.object({
    agentId: z.string(), executorKind: protocol, declaredPrice: z.string().nullable(),
    quoteStatus: z.enum(['quoted', 'free', 'price_unknown', 'failed']).optional(),
    quoteProvenance: z.enum(['protocol', 'declared_metadata', 'none']).optional(),
    paidAmount: z.number().nullable(), paidAsset: z.string().nullable(),
    maxSpendUsd: z.number(), settled: z.boolean(), settlementNote: z.string().nullable(),
  }).passthrough(),
  execution: z.object({
    chainId: z.number().int(), blockNumber: z.string(), txHashes: strings,
    startedAt: z.string(), finishedAt: z.string(), latencyMs: z.number(),
    ok: z.boolean(), failureReason: z.string().nullable(),
  }).passthrough(),
  authority: z.object({
    charterId: z.string().nullable(), allowlist: strings, spendCapUsd: z.number(),
    expiresAt: z.string().nullable(), withinAuthority: z.boolean(),
  }).passthrough(),
  quality: z.object({
    testId: z.string().nullable(), pass: z.boolean().nullable(), failedFields: strings,
    caseId: z.string().nullable(), groundTruthHash: z.string().nullable(),
    testVersion: z.string().optional(), toleranceRevision: z.number().int().optional(),
  }).passthrough(),
  agentResponse: z.unknown(),
  failure: z.object({
    stage: z.enum(['quote', 'authority', 'execute', 'settlement', 'internal']),
    class: z.string(), detail: z.string(),
  }).passthrough().nullable().optional(),
}).passthrough()

export type ReceiptIntegrityStatus = 'MATCH' | 'MISMATCH' | 'UNSUPPORTED_VERSION' | 'INVALID_RECEIPT' | 'INVALID_HASH' | 'LIMIT_EXCEEDED'

/** Offline content check ONLY: no chain, issuer, payment, MCS or authority verification. */
export function verifyReceiptIntegrity(body: unknown, expectedHash: unknown): {
  status: ReceiptIntegrityStatus
  computedHash: string | null
} {
  try {
    return checkIntegrity(body, expectedHash)
  } catch {
    return { status: 'INVALID_RECEIPT', computedHash: null }
  }
}

function checkIntegrity(body: unknown, expectedHash: unknown): ReturnType<typeof verifyReceiptIntegrity> {
  // Count keys/strings before canonicalization: repeated references to a large
  // string must not expand into an unbounded serialized allocation.
  const json = boundedJson(body)
  if (json !== 'OK') return { status: json === 'LIMIT' ? 'LIMIT_EXCEEDED' : 'INVALID_RECEIPT', computedHash: null }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { status: 'INVALID_RECEIPT', computedHash: null }
  const version = (body as Record<string, unknown>)['version']
  if (version !== '1' && version !== '2') return { status: 'UNSUPPORTED_VERSION', computedHash: null }
  if (!Object.hasOwn(body, 'agentResponse') || !receiptSchema.safeParse(body).success) return { status: 'INVALID_RECEIPT', computedHash: null }
  if (typeof expectedHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(expectedHash)) return { status: 'INVALID_HASH', computedHash: null }
  const bytes = canonicalise(body as Receipt)
  if (Buffer.byteLength(bytes, 'utf8') > MAX_RECEIPT_BYTES) return { status: 'LIMIT_EXCEEDED', computedHash: null }
  const computedHash = `0x${createHash('sha256').update(bytes, 'utf8').digest('hex')}`
  return { status: computedHash === expectedHash.toLowerCase() ? 'MATCH' : 'MISMATCH', computedHash }
}
