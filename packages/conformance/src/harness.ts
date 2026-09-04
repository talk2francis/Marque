import { createHash } from 'node:crypto'
import { sql, eq, and, desc } from 'drizzle-orm'
import { db, conformanceCase, conformanceResult, type NewConformanceCase } from '@marque/db'
import { publicClient } from '@marque/chain'
import { MCS_VERSION, MCS_TOLERANCE_REVISION, type TestId } from './tolerances.js'
import type { Category, ConformanceAdapter, ConformanceOutcome, FieldDiff, TestCase } from './types.js'
import { rebGroundTruth, rebPrompt, gradeReb, type RebPolicy, type RebGroundTruth } from './tests/mcs-reb-1.js'
import { hfGroundTruth, hfPrompt, gradeHf, type HfPolicy, type HfGroundTruth } from './tests/mcs-hf-1.js'
import { gridGroundTruth, gridPrompt, gradeGrid, type GridPolicy, type GridGroundTruth } from './tests/mcs-grid-1.js'
import { yieldGroundTruth, yieldPrompt, gradeYield, type YieldPolicy, type YieldGroundTruth } from './tests/mcs-yield-1.js'

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

export function hash(value: unknown): string {
  return `0x${createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex')}`
}

/** Deterministic ordering so the same content always hashes the same way. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>
    return Object.fromEntries(Object.keys(rec).sort().map((k) => [k, stable(rec[k])]))
  }
  return value
}

export function stableHash(value: unknown): string {
  return hash(stable(value))
}

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
export async function captureCase(spec: {
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
  await db().insert(conformanceCase).values(row).onConflictDoUpdate({
    target: conformanceCase.id,
    set: {
      blockNumber: sql`excluded.block_number`,
      groundTruth: sql`excluded.ground_truth`,
      groundTruthHash: sql`excluded.ground_truth_hash`,
      prompt: sql`excluded.prompt`,
      policy: sql`excluded.policy`,
      capturedAt: sql`now()`,
    },
  })

  return { testCase, groundTruth, groundTruthHash, prompt }
}

/** Load the active case for a test, without touching the chain. */
export async function loadCase(testId: TestId): Promise<{
  testCase: TestCase
  groundTruth: GroundTruth
  groundTruthHash: string
} | null> {
  const rows = await db()
    .select().from(conformanceCase)
    .where(and(eq(conformanceCase.testId, testId), eq(conformanceCase.active, true)))
    .orderBy(desc(conformanceCase.capturedAt)).limit(1)
  const row = rows[0]
  if (!row) return null

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
  }
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
  persist?: boolean
}): Promise<ConformanceOutcome> {
  const loaded = await loadCase(opts.testId)
  if (!loaded) throw new Error(`no active case for ${opts.testId} — run captureCase first`)
  const { testCase, groundTruth } = loaded

  type Asked = { response: unknown; latencyMs: number; costUsd?: number | null; error?: string | null }
  const asked: Asked = await opts.adapter.ask(testCase, testCase.prompt).catch((err: unknown) => ({
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
    request: { prompt: testCase.prompt, caseId: testCase.id },
    response: asked.response ?? null,
    requestHash: stableHash({ prompt: testCase.prompt, caseId: testCase.id }),
    responseHash: stableHash(asked.response ?? null),
    ranAt: new Date().toISOString(),
    error,
  }

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
