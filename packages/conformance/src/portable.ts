import { z } from 'zod'
import { boundedJson } from '@marque/probe'
import { grade, type GroundTruth } from './harness.js'
import { hash, stableHash } from './hash.js'
import { caseCommitment } from './warrant-contract.js'
import { MCS_CODE_ANCHOR } from './code-anchor.js'
import { MCS_VERSION, MCS_TOLERANCE_REVISION, type TestId } from './tolerances.js'
import type { ConformanceOutcome, TestCase } from './types.js'

const testId = z.enum(['MCS-REB-1', 'MCS-HF-1', 'MCS-GRID-1', 'MCS-YIELD-1', 'MCS-RYIELD-1'])
const digest = z.string().regex(/^0x[0-9a-f]{64}$/)
const http = z.string().max(500).url().refine(value => {
  try {
    const u = new URL(value)
    return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password
  } catch { return false }
})
const serviceSchema = z.object({
  agentId: z.string().regex(/^(56|97):0x[0-9a-fA-F]{40}:\d+$/),
  kind: z.enum(['a2a', 'mcp']), discoveryEndpoint: http,
  serviceId: z.number().int().positive().nullable(),
})
const invocationSchema = z.object({ endpoint: http, operation: z.string().min(1).max(100), responseTextSha256: digest, tool: z.string().max(200).optional() })
const schema = z.object({
  schema: z.literal('marque.warrant.v1'), hash: digest,
  payload: z.object({
    version: z.literal(1),
    testCase: z.object({
      id: z.string(), testId, category: z.enum(['rebalancing', 'health_factor', 'grid', 'yield']),
      chainId: z.literal(56), blockNumber: z.string().regex(/^\d{1,30}$/),
      subject: z.record(z.string()), policy: z.unknown(), prompt: z.string(),
      groundTruth: z.record(z.unknown()), groundTruthHash: digest,
    }),
    result: z.object({
      testId, testVersion: z.string(), toleranceRevision: z.number().int(), category: z.string(),
      agentId: z.string(), caseId: z.string(), chainId: z.number().int(), blockNumber: z.string(),
      pass: z.boolean(), diffs: z.array(z.unknown()), failedFields: z.array(z.string()),
      request: z.record(z.unknown()), response: z.unknown(), requestHash: digest, responseHash: digest,
      ranAt: z.string(), error: z.string().nullable(),
    }).passthrough(),
  }).passthrough(),
}).passthrough()

/** Safe public commitments only: never returns prompts, responses or endpoint URLs. */
export function warrantRecordMetadata(request: unknown, requestHash: string, agentId: string) {
  if (boundedJson(request) !== 'OK' || !request || typeof request !== 'object' || Array.isArray(request)) return { version: 1, integrity: 'UNAVAILABLE', serviceKey: null, testCodeHash: null, caseHash: null }
  const rec = request as Record<string, unknown>
  const evidence = rec['evidence'] as Record<string, unknown> | undefined
  const integrity = stableHash(request) === requestHash ? 'MATCH' : 'UNAVAILABLE'
  const s = serviceSchema.safeParse(evidence?.['service'])
  const i = invocationSchema.safeParse(evidence?.['invocation'])
  const bound = integrity === 'MATCH' && evidence?.['version'] === 1 && s.success && i.success && s.data.agentId === agentId && i.data.operation === (s.data.kind === 'a2a' ? 'message/send' : 'tools/call')
  return {
    version: 1, integrity,
    serviceKey: bound ? stableHash({ ...s.data, executableEndpoint: i.data.endpoint }) : null,
    testCodeHash: integrity === 'MATCH' && digest.safeParse(evidence?.['testCodeHash']).success ? String(evidence?.['testCodeHash']) : null,
    caseHash: integrity === 'MATCH' && digest.safeParse(evidence?.['caseHash']).success ? String(evidence?.['caseHash']) : null,
  }
}

export function buildWarrantBundle(observed: { testCase: TestCase; groundTruth: GroundTruth; groundTruthHash: string }, result: ConformanceOutcome) {
  const payload = {
    version: 1 as const,
    testCase: { ...observed.testCase, blockNumber: observed.testCase.blockNumber.toString(), groundTruth: observed.groundTruth, groundTruthHash: observed.groundTruthHash },
    result,
  }
  return { schema: 'marque.warrant.v1' as const, payload, hash: stableHash(payload) }
}

/** Snapshot replay, never issuer authentication, chain truth or payment verification. */
export function verifyWarrantBundle(input: unknown, options: { now?: Date; expectedAgentId?: string; expectedServiceKey?: string; expectedRequestHash?: string; expectedResponseHash?: string } = {}) {
  const unavailable = (reason: string) => ({ version: 1, state: 'UNAVAILABLE', reason, chainGroundTruth: 'NOT_REPLAYED', independence: 'UNKNOWN' })
  try {
    if (boundedJson(input) !== 'OK') return unavailable('invalid_or_oversized_json')
    const parsed = schema.safeParse(input)
    if (!parsed.success) return unavailable('unsupported_or_malformed_bundle')
    const { payload } = parsed.data
    const raw = input as { payload: unknown }
    if (stableHash(raw.payload) !== parsed.data.hash) return { ...unavailable('bundle_digest_mismatch'), state: 'FAILED' }
    const c = payload.testCase
    const r = payload.result
    if ((options.expectedRequestHash && options.expectedRequestHash !== r.requestHash) || (options.expectedResponseHash && options.expectedResponseHash !== r.responseHash)) return { ...unavailable('stored_record_commitment_mismatch'), state: 'FAILED' }
    const mode = (value: unknown, expected: string) => stableHash(value) === expected ? 'SORTED_JSON_SHA256' : hash(value) === expected ? 'LEGACY_UNSORTED_JSON_SHA256' : 'MISMATCH'
    const requestDigest = mode(r.request, r.requestHash)
    const responseDigest = mode(r.response, r.responseHash)
    if (requestDigest === 'MISMATCH' || responseDigest === 'MISMATCH' || stableHash(c.groundTruth) !== c.groundTruthHash) return { ...unavailable('content_digest_mismatch'), state: 'FAILED' }
    if (c.id !== r.caseId || c.testId !== r.testId || c.category !== r.category || c.chainId !== r.chainId || c.blockNumber !== r.blockNumber || r.request['caseId'] !== c.id || r.request['prompt'] !== c.prompt) return { ...unavailable('case_or_task_substitution'), state: 'FAILED' }
    if (options.expectedAgentId && options.expectedAgentId !== r.agentId) return { ...unavailable('wrong_agent'), state: 'FAILED' }
    const evidence = r.request['evidence'] as Record<string, unknown> | null | undefined
    const hasEvidence = evidence?.['version'] === 1
    const code = !hasEvidence ? 'UNAVAILABLE_LEGACY' : evidence['testCodeHash'] === MCS_CODE_ANCHOR.sha256 && r.testVersion === MCS_VERSION && r.toleranceRevision === MCS_TOLERANCE_REVISION ? 'MATCH' : 'UNSUPPORTED'
    if (hasEvidence && (evidence['groundTruthHash'] !== c.groundTruthHash || evidence['caseHash'] !== caseCommitment({ ...c, policy: c.policy, blockNumber: BigInt(c.blockNumber) }, c.groundTruthHash) || requestDigest !== 'SORTED_JSON_SHA256')) return { ...unavailable('frozen_input_mismatch'), state: 'FAILED' }
    const service = serviceSchema.safeParse(evidence?.['service'])
    const invocation = invocationSchema.safeParse(evidence?.['invocation'])
    const serviceKey = service.success && invocation.success && service.data.agentId === r.agentId && invocation.data.operation === (service.data.kind === 'a2a' ? 'message/send' : 'tools/call')
      ? stableHash({ ...service.data, executableEndpoint: invocation.data.endpoint }) : null
    if (options.expectedServiceKey && options.expectedServiceKey !== serviceKey) return { ...unavailable('wrong_or_unavailable_service'), state: 'FAILED' }
    const at = Date.parse(r.ranAt)
    const now = (options.now ?? new Date()).getTime()
    const freshness = !Number.isFinite(at) || !Number.isFinite(now) ? 'UNKNOWN' : at > now ? 'FUTURE' : now - at > 72 * 3_600_000 ? 'EXPIRED' : 'CURRENT'
    const captured = typeof evidence?.['caseCapturedAt'] === 'string' ? Date.parse(evidence['caseCapturedAt']) : NaN
    const caseFreshness = !Number.isFinite(captured) || !Number.isFinite(at) ? 'UNKNOWN' : at < captured || at - captured > 5 * 60_000 ? 'STALE_AT_RUN' : 'FRESH_AT_RUN'
    const diffs = r.error ? [] : grade(r.testId as TestId, c.groundTruth as unknown as GroundTruth, r.response)
    const fields = diffs.filter(d => !d.pass).map(d => d.field)
    const replayPass = r.error === null && diffs.length > 0 && fields.length === 0
    const agrees = replayPass === r.pass && stableHash(fields) === stableHash(r.failedFields) && stableHash(diffs) === stableHash(r.diffs)
    const state = !agrees ? 'FAILED' : r.error ? 'UNAVAILABLE' : !replayPass ? 'FAILED_TEST' : code !== 'MATCH' || !serviceKey || caseFreshness !== 'FRESH_AT_RUN' || freshness === 'UNKNOWN' || freshness === 'FUTURE' ? 'UNAVAILABLE' : freshness === 'EXPIRED' ? 'EXPIRED' : 'PASS_FOR_RECORDED_TEST'
    return {
      version: 1, state, integrity: 'MATCH', requestDigest, responseDigest,
      replay: { checker: 'CURRENT_SOURCE', recordedPass: r.pass, pass: replayPass, agreesWithRecord: agrees, failedFields: fields, error: r.error?.startsWith('case_stale:') ? 'CASE_STALE' : r.error ? 'PROTOCOL_UNAVAILABLE' : null },
      testCode: code, currentCodeHash: MCS_CODE_ANCHOR.sha256, serviceKey,
      binding: serviceKey ? 'EXACT_RECORDED_SERVICE' : 'UNAVAILABLE', freshness, caseFreshness,
      observedAt: r.ranAt, expiresAt: Number.isFinite(at) ? new Date(at + 72 * 3_600_000).toISOString() : null,
      sampleSize: 1, chainGroundTruth: 'NOT_REPLAYED', issuerAuthentication: 'NOT_PROVIDED', independence: 'UNKNOWN', payment: 'NOT_CLAIMED',
      transportTextVerification: 'COMMITMENT_ONLY_BYTES_NOT_INCLUDED',
      limits: ['One fixed case and its asserted fields, not a safety or return guarantee.', 'Structured response digest and decoded UTF-8 response-text digest are distinct from original wire bytes.', 'A matching bundle can be assembled by anyone; compare record digests, code and service with independently trusted sources.'],
    }
  } catch { return unavailable('invalid_case_or_verifier_error') }
}
