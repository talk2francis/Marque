import { z } from 'zod'
import type { TestId } from './tolerances.js'

/**
 * Conformance types and the diff engine.
 *
 * A failure must always name the exact field that was wrong and show both
 * numbers. "Failed" on its own is not evidence, and publishing failures is the
 * most credible thing this marketplace does (AGENTS.md invariant 7) — which
 * only works if the failure is legible.
 */

export type Category = 'rebalancing' | 'grid' | 'yield' | 'health_factor'

/** How a single checked field came out. */
export interface FieldDiff {
  /** Tolerance id, e.g. 'proposedTickSpacing'. */
  field: string
  pass: boolean
  /** What we computed from chain state, or the constraint we supplied. */
  expected: string
  /** What the agent said. */
  actual: string
  /** The bound applied, rendered for display. */
  tolerance: string
  /** Plain-English statement of what went wrong. Empty when the field passed. */
  detail: string
  /**
   * True when the agent simply did not provide the field. Distinguished from a
   * wrong value because "omitted the slippage bound" and "stated 40% slippage"
   * are different failures with different fixes.
   */
  missing: boolean
}

export interface ConformanceOutcome {
  testId: TestId
  testVersion: string
  toleranceRevision: number
  category: Category
  agentId: string
  /** The pinned case this was run against. */
  caseId: string
  blockNumber: string
  chainId: number
  pass: boolean
  diffs: FieldDiff[]
  /** Fields that failed, by id — the headline of a failure. */
  failedFields: string[]
  latencyMs: number
  /** Agent fee in the settlement asset, when the run was paid. */
  costUsd: number | null
  /** Exactly what we sent and exactly what came back, both hashed. */
  request: unknown
  response: unknown
  requestHash: string
  responseHash: string
  ranAt: string
  /** Set when the agent could not be reached or answered unusably. */
  error: string | null
}

/** A pinned test case: a real position at a fixed block plus a supplied policy. */
export interface TestCase<Policy = unknown> {
  id: string
  testId: TestId
  category: Category
  chainId: number
  blockNumber: bigint
  /** The subject: an address, or an address + position id. */
  subject: Record<string, string>
  /**
   * The policy the agent must comply with. Supplied by the case, never inferred
   * — this is what makes compliance checkable rather than a matter of taste.
   */
  policy: Policy
  /** The exact question put to the agent, rendered from the policy. */
  prompt: string
}

/** What an agent is asked to be, for the harness to call. */
export interface ConformanceAdapter {
  /** Stable id, used in results. */
  agentId: string
  name: string
  /** Answer one case. Implementations must not throw; return an error string. */
  ask(testCase: TestCase, prompt: string): Promise<{
    response: unknown
    latencyMs: number
    costUsd?: number | null
    error?: string | null
  }>
}

// ---------------------------------------------------------------------------
// Diff helpers
// ---------------------------------------------------------------------------

export function fmt(n: number, dp = 6): string {
  if (!Number.isFinite(n)) return String(n)
  return Number(n.toFixed(dp)).toString()
}

/** A field the agent omitted entirely. */
export function missingField(field: string, expected: string, tolerance: string): FieldDiff {
  return {
    field, pass: false, expected, actual: '(not provided)', tolerance,
    detail: `The response did not include ${field}.`, missing: true,
  }
}

/** Numeric comparison with an absolute tolerance. */
export function diffAbsolute(
  field: string, expected: number, actual: number | undefined | null,
  tolerance: number, unit: string, label?: string,
): FieldDiff {
  const toleranceText = `±${fmt(tolerance)} ${unit}`
  if (actual === undefined || actual === null || !Number.isFinite(actual)) {
    return missingField(field, fmt(expected), toleranceText)
  }
  const delta = Math.abs(actual - expected)
  const pass = delta <= tolerance
  return {
    field, pass, expected: fmt(expected), actual: fmt(actual), tolerance: toleranceText,
    detail: pass ? '' : `${label ?? field} is off by ${fmt(delta)} ${unit}, which exceeds the ${fmt(tolerance)} ${unit} tolerance.`,
    missing: false,
  }
}

/** Numeric comparison with a relative (percentage) tolerance. */
export function diffRelative(
  field: string, expected: number, actual: number | undefined | null,
  tolerancePct: number, label?: string,
): FieldDiff {
  const toleranceText = `±${fmt(tolerancePct)}%`
  if (actual === undefined || actual === null || !Number.isFinite(actual)) {
    return missingField(field, fmt(expected), toleranceText)
  }
  // A zero expectation cannot be compared proportionally; fall back to exact.
  if (expected === 0) {
    const pass = actual === 0
    return {
      field, pass, expected: '0', actual: fmt(actual), tolerance: toleranceText,
      detail: pass ? '' : `${label ?? field} should be exactly 0.`, missing: false,
    }
  }
  const pctOff = Math.abs((actual - expected) / expected) * 100
  const pass = pctOff <= tolerancePct
  return {
    field, pass, expected: fmt(expected), actual: fmt(actual), tolerance: toleranceText,
    detail: pass ? '' : `${label ?? field} is off by ${fmt(pctOff, 3)}%, which exceeds the ${fmt(tolerancePct)}% tolerance.`,
    missing: false,
  }
}

/** Exact equality on a value with one right answer. */
export function diffExact(
  field: string, expected: string | number | boolean,
  actual: string | number | boolean | undefined | null, label?: string,
): FieldDiff {
  if (actual === undefined || actual === null) {
    return missingField(field, String(expected), 'exact match')
  }
  const pass = String(expected) === String(actual)
  return {
    field, pass, expected: String(expected), actual: String(actual), tolerance: 'exact match',
    detail: pass ? '' : `${label ?? field} must be exactly ${String(expected)}.`, missing: false,
  }
}

/** A boolean requirement the agent either satisfied or did not. */
export function diffAssert(
  field: string, pass: boolean, expected: string, actual: string, detail: string,
): FieldDiff {
  return {
    field, pass, expected, actual, tolerance: 'must hold',
    detail: pass ? '' : detail, missing: false,
  }
}

/**
 * Parse an agent response defensively.
 *
 * Agent output is hostile input like any other (AGENTS.md, Security), and a
 * malformed payload must produce a legible conformance failure rather than an
 * exception that loses the evidence.
 */
export function safeParse<T>(schema: z.ZodType<T>, value: unknown): { ok: true; data: T } | { ok: false; issues: string } {
  const r = schema.safeParse(value)
  if (r.success) return { ok: true, data: r.data }
  return { ok: false, issues: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ') }
}

/** Coerce loosely-typed agent numbers without silently accepting nonsense. */
export function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    // Agents commonly return "1,234.5" or "6.8%".
    const cleaned = v.replace(/[,\s%]/g, '')
    const n = Number(cleaned)
    if (Number.isFinite(n) && cleaned !== '') return n
  }
  return undefined
}

export function bool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    if (/^(true|yes|in[- ]?range)$/i.test(v.trim())) return true
    if (/^(false|no|out[- ]?of[- ]?range)$/i.test(v.trim())) return false
  }
  return undefined
}

export function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}
