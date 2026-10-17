import { stableHash } from './hash.js'
export { hash, stableHash } from './hash.js'
import { caseCommitment } from './warrant-contract.js'
import { eq, and, desc } from 'drizzle-orm'
import { db, conformanceCase, conformanceResult, type NewConformanceCase } from '@marque/db'
import { publicClient } from '@marque/chain'
import { MCS_VERSION, MCS_TOLERANCE_REVISION, type TestId } from './tolerances.js'
import type { Category, ConformanceAdapter, ConformanceOutcome, FieldDiff, TestCase } from './types.js'
import { rebGroundTruth, rebPrompt, gradeReb, type RebPolicy, type RebGroundTruth } from './tests/mcs-reb-1.js'
import { hfGroundTruth, hfPrompt, gradeHf, type HfPolicy, type HfGroundTruth } from './tests/mcs-hf-1.js'
import { gridGroundTruth, gridPrompt, gradeGrid, type GridPolicy, type GridGroundTruth } from './tests/mcs-grid-1.js'
import { yieldGroundTruth, yieldPrompt, gradeYield, type YieldPolicy, type YieldGroundTruth } from './tests/mcs-yield-1.js'
import { REB_FALLBACK_SUBJECTS } from './cases.js'
import { MCS_CODE_ANCHOR } from './code-anchor.js'

/**
 * The conformance harness.
 *
 * For a given agent and category it:
 *   1. loads a materialised case (a real position, a fixed block, a supplied policy),
 *   2. grades the agent's answer against ground truth WE computed,
 *   3. writes a result row carrying the per-field diff and the raw evidence.
 *
 * No LLM grades anything here. Every check is arithmetic or compliance with a
 * constraint the case itself supplied (AGENTS.md invariant 8).
 */

/** Every test's ground-truth shape, keyed by test id. */
export type GroundTruth = RebGroundTruth | HfGroundTruth | GridGroundTruth | YieldGroundTruth

const TEST_CATEGORY: Record<TestId, Category> = {
  'MCS-REB-1': 'rebalancing',
  'MCS-GRID-1': 'grid',
  'MCS-YIELD-1': 'yield',
  'MCS-HF-1': 'health_factor',
}

/**
 * Capture a case: read chain state now, freeze it, and store it.
 *
 * Called once per case. Re-capturing produces a NEW case id rather than
 * mutating the old one, because changing a frozen snapshot would silently
 * invalidate every result already graded against it.
 */
export async function observeCase(spec: {
  id: string
  testId: TestId
  subject: Record<string, string>
  policy: RebPolicy | HfPolicy | GridPolicy | YieldPolicy
  blockNumber?: bigint
}): Promise<{ testCase: TestCase; groundTruth: GroundTruth; groundTruthHash: string; prompt: string }> {
  const client = publicClient()
  const blockNumber = spec.blockNumber ?? (await client.getBlockNumber())

  const testCase: TestCase = {
    id: spec.id,
    testId: spec.testId,
    category: TEST_CATEGORY[spec.testId],
    chainId: 56,
    blockNumber,
    subject: spec.subject,
    policy: spec.policy,
    prompt: '',
  }

  let groundTruth: GroundTruth
  let prompt: string

  switch (spec.testId) {
    case 'MCS-REB-1': {
      const gt = await rebGroundTruth(testCase as TestCase<RebPolicy>)
      groundTruth = gt
      prompt = rebPrompt(testCase as TestCase<RebPolicy>, gt)
      break
    }
    case 'MCS-HF-1': {
      const gt = await hfGroundTruth(testCase as TestCase<HfPolicy>)
      groundTruth = gt
      prompt = hfPrompt(testCase as TestCase<HfPolicy>, gt)
      break
    }
    case 'MCS-GRID-1': {
      const gt = await gridGroundTruth(testCase as TestCase<GridPolicy>)
      groundTruth = gt
      prompt = gridPrompt(testCase as TestCase<GridPolicy>, gt)
      break
    }
    case 'MCS-YIELD-1': {
      const gt = await yieldGroundTruth(testCase as TestCase<YieldPolicy>)
      groundTruth = gt
      prompt = yieldPrompt(testCase as TestCase<YieldPolicy>, gt)
      break
    }
  }

  testCase.prompt = prompt
  const groundTruthHash = stableHash(groundTruth)

  return { testCase, groundTruth, groundTruthHash, prompt }
}

/** Persist a fresh observation without overwriting any existing frozen bytes. */
export async function captureCase(spec: Parameters<typeof observeCase>[0]): ReturnType<typeof observeCase> {
  const observed = await observeCase(spec)
  const { testCase, groundTruth, groundTruthHash, prompt } = observed
  const blockNumber = testCase.blockNumber

  const row: NewConformanceCase = {
    id: spec.id,
    testId: spec.testId,
    category: TEST_CATEGORY[spec.testId],
    chainId: 56,
    blockNumber: blockNumber.toString(),
    subject: spec.subject,
    policy: spec.policy as unknown as Record<string, unknown>,
    groundTruth: groundTruth as unknown as Record<string, unknown>,
    groundTruthHash,
    prompt,
    active: true,
  }
  const inserted = await db().insert(conformanceCase).values(row)
    .onConflictDoNothing()
    .returning({ id: conformanceCase.id })
  if (inserted.length === 0) {
    const [existing] = await db().select({
      blockNumber: conformanceCase.blockNumber,
      groundTruthHash: conformanceCase.groundTruthHash,
      prompt: conformanceCase.prompt,
    }).from(conformanceCase).where(eq(conformanceCase.id, spec.id)).limit(1)
    const same = existing?.blockNumber === row.blockNumber
      && existing.groundTruthHash === groundTruthHash
      && existing.prompt === prompt
    if (!same) {
      throw new Error(`conformance case ${spec.id} already exists with different immutable evidence; use a new case id`)
    }
  }

  return { testCase, groundTruth, groundTruthHash, prompt }
}

/**
 * Capture a published case against current chain state. V3 position NFTs can be
 * withdrawn at any time, so try the independently verified backup roster only
 * when the primary cannot be captured. The stored subject is always the exact
 * owner/NFT actually read; no old snapshot or substitute answer is reused.
 */
export async function capturePublishedCase(spec: Parameters<typeof captureCase>[0]): ReturnType<typeof captureCase> {
  if (spec.testId !== 'MCS-REB-1') return captureCase(spec)
  return firstCapturable([spec.subject, ...REB_FALLBACK_SUBJECTS], (subject) => captureCase({ ...spec, subject }))
}

/** Preserve candidate order and the last real failure; never return fabricated evidence. */
export async function firstCapturable<T>(subjects: readonly Record<string, string>[], capture: (subject: Record<string, string>) => Promise<T>): Promise<T> {
  let lastError: unknown
  for (const subject of subjects) {
    try {
      return await capture(subject)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error('no conformance subjects supplied')
}

type LoadedCase = {
  testCase: TestCase
  groundTruth: GroundTruth
  groundTruthHash: string
  capturedAt?: string
}

function hydrateCase(row: typeof conformanceCase.$inferSelect): LoadedCase {
  return {
    testCase: {
      id: row.id,
      testId: row.testId as TestId,
      category: row.category as Category,
      chainId: row.chainId,
      blockNumber: BigInt(row.blockNumber),
      subject: row.subject,
      policy: row.policy,
      prompt: row.prompt,
    },
    groundTruth: row.groundTruth as GroundTruth,
    groundTruthHash: row.groundTruthHash,
    capturedAt: row.capturedAt.toISOString(),
  }
}

/** Load the latest active case for a test, without touching the chain. */
export async function loadCase(testId: TestId): Promise<LoadedCase | null> {
  const rows = await db()
    .select().from(conformanceCase)
    .where(and(eq(conformanceCase.testId, testId), eq(conformanceCase.active, true)))
    .orderBy(desc(conformanceCase.capturedAt)).limit(1)
  return rows[0] ? hydrateCase(rows[0]) : null
}

/** Bind a run to its own immutable snapshot, even while another tester captures. */
export async function loadCaseById(caseId: string): Promise<LoadedCase | null> {
  const rows = await db().select().from(conformanceCase)
    .where(and(eq(conformanceCase.id, caseId), eq(conformanceCase.active, true))).limit(1)
  return rows[0] ? hydrateCase(rows[0]) : null
}

/** Grade a raw agent response against frozen ground truth. Pure, no I/O. */
export function grade(testId: TestId, groundTruth: GroundTruth, response: unknown): FieldDiff[] {
  switch (testId) {
    case 'MCS-REB-1': return gradeReb(groundTruth as RebGroundTruth, response)
    case 'MCS-HF-1': return gradeHf(groundTruth as HfGroundTruth, response)
    case 'MCS-GRID-1': return gradeGrid(groundTruth as GridGroundTruth, response)
    case 'MCS-YIELD-1': return gradeYield(groundTruth as YieldGroundTruth, response)
  }
}

/**
 * Run one test against one agent and persist the result.
 *
 * An unreachable agent produces a FAILED result with an error, not an
 * exception: "we asked and it did not answer" is itself a conformance outcome
 * and belongs in the public record.
 */
export async function runConformance(opts: {
  adapter: ConformanceAdapter
  testId: TestId
  caseId?: string
  persist?: boolean
  serviceId?: number | null
  selectionSource?: 'current_owner_claim' | 'first_party_config' | 'indexed_service' | 'user_declared_endpoint'
}): Promise<ConformanceOutcome> {
  const loaded = opts.caseId ? await loadCaseById(opts.caseId) : await loadCase(opts.testId)
  if (!loaded) throw new Error(`no active case for ${opts.testId} — run captureCase first`)
  const { testCase, groundTruth } = loaded
  if (testCase.testId !== opts.testId) throw new Error(`case ${testCase.id} belongs to ${testCase.testId}, not ${opts.testId}`)

  type Asked = Awaited<ReturnType<ConformanceAdapter['ask']>>
  const capturedAt = loaded.capturedAt ? Date.parse(loaded.capturedAt) : NaN
  const stale = Number.isFinite(capturedAt) && (Date.now() < capturedAt || Date.now() - capturedAt > 5 * 60_000)
  const asked: Asked = stale ? { response: null, latencyMs: 0, costUsd: null, error: 'case_stale: capture a fresh frozen input before asking this agent' } : await opts.adapter.ask(testCase, testCase.prompt).catch((err: unknown) => ({
    response: null,
    latencyMs: 0,
    costUsd: null,
    error: err instanceof Error ? err.message : String(err),
  }))

  const error = asked.error ?? null
  const diffs = error ? [] : grade(opts.testId, groundTruth, asked.response)
  const failedFields = diffs.filter((d) => !d.pass).map((d) => d.field)
  // An agent that could not be reached has not passed, whatever else is true.
  const pass = error === null && diffs.length > 0 && failedFields.length === 0

  const outcome: ConformanceOutcome = {
    testId: opts.testId,
    testVersion: MCS_VERSION,
    toleranceRevision: MCS_TOLERANCE_REVISION,
    category: testCase.category,
    agentId: opts.adapter.agentId,
    caseId: testCase.id,
    blockNumber: testCase.blockNumber.toString(),
    chainId: testCase.chainId,
    pass,
    diffs,
    failedFields,
    latencyMs: asked.latencyMs,
    costUsd: asked.costUsd ?? null,
    request: {
      prompt: testCase.prompt, caseId: testCase.id,
      evidence: {
        version: 1, testCodeHash: MCS_CODE_ANCHOR.sha256,
        groundTruthHash: loaded.groundTruthHash, caseHash: caseCommitment(testCase, loaded.groundTruthHash), caseCapturedAt: loaded.capturedAt ?? null,
        service: opts.adapter.service ? { ...opts.adapter.service, agentId: opts.adapter.agentId, serviceId: opts.serviceId ?? opts.adapter.service.serviceId ?? null } : null,
        invocation: asked.invocation ?? null,
        independence: 'UNKNOWN', payment: 'NOT_CLAIMED',
        selectionSource: opts.selectionSource ?? 'user_declared_endpoint',
      },
    },
    response: asked.response ?? null,
    requestHash: '',
    responseHash: stableHash(asked.response ?? null),
    ranAt: new Date().toISOString(),
    error,
  }
  outcome.requestHash = stableHash(outcome.request)

  if (opts.persist !== false) {
    await db().insert(conformanceResult).values({
      agentId: outcome.agentId,
      testId: outcome.testId,
      testVersion: outcome.testVersion,
      toleranceRevision: outcome.toleranceRevision,
      category: outcome.category,
      caseId: outcome.caseId,
      chainId: outcome.chainId,
      blockNumber: outcome.blockNumber,
      pass: outcome.pass,
      diffs: outcome.diffs as unknown[],
      failedFields: outcome.failedFields,
      latencyMs: outcome.latencyMs,
      costUsd: outcome.costUsd,
      request: outcome.request as Record<string, unknown>,
      response: outcome.response as Record<string, unknown>,
      requestHash: outcome.requestHash,
      responseHash: outcome.responseHash,
      error: outcome.error,
    })
  }

  return outcome
}

/** Render an outcome as a legible block. Used by the CLI and the phase report. */
export function formatOutcome(o: ConformanceOutcome): string {
  const head = `${o.testId}  ${o.pass ? 'PASS' : 'FAIL'}  ${o.agentId}  (${o.latencyMs}ms, case ${o.caseId}, block ${o.blockNumber})`
  if (o.error) return `${head}\n    error: ${o.error}`
  const lines = o.diffs.map((d) => {
    const mark = d.pass ? '  ok  ' : ' FAIL '
    const base = `  ${mark} ${d.field.padEnd(22)} expected ${d.expected}  ·  got ${d.actual}  ·  tol ${d.tolerance}`
    return d.pass ? base : `${base}\n         → ${d.detail}`
  })
  return [head, ...lines].join('\n')
}
