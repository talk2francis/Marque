import { describe, expect, it, vi } from 'vitest'
import { buildWarrantBundle, verifyWarrantBundle, warrantRecordMetadata } from './portable'
import { grade } from './harness'
import { stableHash } from './hash'
import { caseCommitment } from './warrant-contract'
import { MCS_CODE_ANCHOR } from './code-anchor'
import { correctAnswer } from './stubs'
import type { ConformanceOutcome, TestCase } from './types'
import type { HfGroundTruth } from './tests/mcs-hf-1'

const at = '2026-01-01T00:00:00.000Z'
const agentId = '56:0x0000000000000000000000000000000000000001:42'
const gt: HfGroundTruth = { address: '0x0000000000000000000000000000000000000002', healthFactor: 1.2, weightedCollateralUsd: 120, totalBorrowedUsd: 100, repayUsd: 40, targetHealthFactor: 2, primaryCollateral: 'BTCB', markets: [{ symbol: 'vBTC', underlyingSymbol: 'BTCB', collateralFactor: .8, priceUsd: 100, suppliedUsd: 150, borrowedUsd: 100, liquidationPriceUsd: 80 }] }
const tc: TestCase = { id: 'synthetic-fixed-case', testId: 'MCS-HF-1', category: 'health_factor', chainId: 56, blockNumber: 100n, subject: { address: gt.address }, policy: { targetHealthFactor: 2 }, prompt: 'Synthetic immutable benchmark, never production activity.' }
function bundle() {
  const response = correctAnswer('MCS-HF-1', gt)
  const request = { prompt: tc.prompt, caseId: tc.id, evidence: { version: 1, testCodeHash: MCS_CODE_ANCHOR.sha256, groundTruthHash: stableHash(gt), caseHash: caseCommitment(tc, stableHash(gt)), caseCapturedAt: at, service: { agentId, kind: 'a2a', discoveryEndpoint: 'https://synthetic.invalid/card', serviceId: 9 }, invocation: { endpoint: 'https://synthetic.invalid/a2a', operation: 'message/send', responseTextSha256: '0x' + 'a'.repeat(64) } } }
  const diffs = grade('MCS-HF-1', gt, response)
  const outcome: ConformanceOutcome = { testId: 'MCS-HF-1', testVersion: '1.0.0', toleranceRevision: 1, category: 'health_factor', agentId, caseId: tc.id, blockNumber: '100', chainId: 56, pass: true, diffs, failedFields: [], latencyMs: 1, costUsd: null, request, response, requestHash: stableHash(request), responseHash: stableHash(response), ranAt: at, error: null }
  return buildWarrantBundle({ testCase: tc, groundTruth: gt, groundTruthHash: stableHash(gt) }, outcome)
}
const options = { now: new Date(at), expectedAgentId: agentId }
const resign = (b: ReturnType<typeof bundle>) => { b.hash = stableHash(b.payload); return b }

describe('portable MCS replay, not global certification', () => {
  it('replays exact immutable input/service without database or remote calls', () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    try {
      const report = verifyWarrantBundle(JSON.parse(JSON.stringify(bundle())), options)
      expect(report).toMatchObject({ state: 'PASS_FOR_RECORDED_TEST', integrity: 'MATCH', binding: 'EXACT_RECORDED_SERVICE', testCode: 'MATCH', caseFreshness: 'FRESH_AT_RUN', sampleSize: 1, chainGroundTruth: 'NOT_REPLAYED', issuerAuthentication: 'NOT_PROVIDED', independence: 'UNKNOWN', payment: 'NOT_CLAIMED' })
      expect(spy).not.toHaveBeenCalled()
    } finally { spy.mockRestore() }
  })
  it('rejects changed bytes before grading', () => {
    const b = bundle(); b.payload.result.agentId += '1'
    expect(verifyWarrantBundle(b, options)).toMatchObject({ state: 'FAILED', reason: 'bundle_digest_mismatch' })
  })
  it('retains historical code provenance without calling it current-source proof', () => {
    const b = bundle()
    const request = b.payload.result.request
    ;(request['evidence'] as Record<string, unknown>)['testCodeHash'] = '0x6b3312b87d03dc3fca1fae0ae67903bdc6bd63ec74f7cb3452be1a58cedf6433'
    b.payload.result.requestHash = stableHash(request)
    expect(verifyWarrantBundle(resign(b), options)).toMatchObject({ state: 'UNAVAILABLE', integrity: 'MATCH', testCode: 'UNSUPPORTED', replay: { pass: true, agreesWithRecord: true } })
  })
  it('rejects substituted ground truth even after outer digest is recomputed', () => {
    const b = bundle(); (b.payload.testCase.groundTruth as HfGroundTruth).healthFactor = 2
    expect(verifyWarrantBundle(resign(b), options).state).toBe('FAILED')
  })
  it('rejects changed frozen policy and changed requested service', () => {
    const b = bundle(); b.payload.testCase.prompt += '!'
    expect(verifyWarrantBundle(resign(b), options).state).toBe('FAILED')
    expect(verifyWarrantBundle(bundle(), { ...options, expectedServiceKey: '0x' + 'f'.repeat(64) }).state).toBe('FAILED')
    expect(verifyWarrantBundle(bundle(), { ...options, expectedAgentId: 'different' }).state).toBe('FAILED')
    expect(verifyWarrantBundle(bundle(), { ...options, expectedRequestHash: '0x' + '0'.repeat(64) }).state).toBe('FAILED')
  })
  it('retains an honestly failed agent case and rejects a fabricated pass', () => {
    const b = bundle(); b.payload.result.response = {}; b.payload.result.responseHash = stableHash({})
    b.payload.result.diffs = grade('MCS-HF-1', gt, {})
    b.payload.result.failedFields = b.payload.result.diffs.filter(x => !x.pass).map(x => x.field)
    b.payload.result.pass = false
    expect(verifyWarrantBundle(resign(b), options)).toMatchObject({ state: 'FAILED_TEST', replay: { pass: false, agreesWithRecord: true } })
    b.payload.result.pass = true
    expect(verifyWarrantBundle(resign(b), options).state).toBe('FAILED')
  })
  it('distinguishes protocol unavailability from incorrect arithmetic', () => {
    const b = bundle(); Object.assign(b.payload.result, { response: null, responseHash: stableHash(null), pass: false, diffs: [], failedFields: [], error: 'unreachable' })
    expect(verifyWarrantBundle(resign(b), options)).toMatchObject({ state: 'UNAVAILABLE', replay: { pass: false, error: 'PROTOCOL_UNAVAILABLE', agreesWithRecord: true } })
  })
  it('does not promote a legacy identity-only pass into an exact-service warrant', () => {
    const b = bundle(); b.payload.result.request = { prompt: tc.prompt, caseId: tc.id }; b.payload.result.requestHash = stableHash(b.payload.result.request)
    expect(verifyWarrantBundle(resign(b), options)).toMatchObject({ state: 'UNAVAILABLE', testCode: 'UNAVAILABLE_LEGACY', serviceKey: null, replay: { pass: true, agreesWithRecord: true } })
  })
  it('keeps staleness, expiration and future timestamps separate', () => {
    expect(verifyWarrantBundle(bundle(), { now: new Date('2026-01-05T00:00:00Z') }).state).toBe('EXPIRED')
    expect(verifyWarrantBundle(bundle(), { now: new Date('2025-01-01T00:00:00Z') })).toMatchObject({ state: 'UNAVAILABLE', freshness: 'FUTURE' })
    const b = bundle(); (b.payload.result.request as { evidence: { caseCapturedAt: string } }).evidence.caseCapturedAt = '2025-12-31T23:00:00Z'; b.payload.result.requestHash = stableHash(b.payload.result.request)
    expect(verifyWarrantBundle(resign(b), options)).toMatchObject({ state: 'UNAVAILABLE', caseFreshness: 'STALE_AT_RUN' })
  })
  it('fails unsupported schemas and bounded malformed content safely', () => {
    for (const value of [null, {}, { schema: 'marque.warrant.v0' }, { schema: 'marque.warrant.v1', payload: 1n }, { huge: 'x'.repeat(3 * 1024 * 1024) }]) expect(verifyWarrantBundle(value).state).toBe('UNAVAILABLE')
  })
  it('publishes commitments without raw benchmark responses or endpoints', () => {
    const b = bundle(); const r = b.payload.result
    const meta = warrantRecordMetadata(r.request, r.requestHash, r.agentId)
    expect(meta.serviceKey).toMatch(/^0x[0-9a-f]{64}$/)
    expect(JSON.stringify(meta)).not.toContain('synthetic.invalid')
    expect(JSON.stringify(meta)).not.toContain('prompt')
    const malformed = { evidence: { version: 1, service: { agentId, kind: 'a2a', discoveryEndpoint: 'not a URL', serviceId: 1 } } }
    expect(warrantRecordMetadata(malformed, stableHash(malformed), agentId).serviceKey).toBeNull()
  })
})
