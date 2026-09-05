import { createHash } from 'node:crypto'

/**
 * The benchmark manifest.
 *
 * One object per arm per repetition, carrying everything a reader needs to
 * check the claim without trusting us. The fields are not decoration: each one
 * closes a specific way a "our agent beat a human" claim is usually
 * unfalsifiable.
 *
 *   task_hash            the two arms answered the SAME question
 *   input_hash           they were given the SAME inputs
 *   rubric_version/hash  they were graded by a rubric fixed BEFORE the run
 *   *_output_hash        the outputs shown are the outputs graded
 *   block                the chain state both arms saw
 *   elapsed_ms           wall clock, measured — never estimated
 *   cost_breakdown       itemized, so the reader sees what actually dominates
 *
 * Publishing an aggregate without these is publishing a feeling.
 */

export type Arm = 'agent' | 'manual'

export interface CostBreakdown {
  /** Gas actually spent by this arm, in USD. Zero for a read-only arm. */
  gasUsd: number
  /** LLM spend, in USD. Zero when no model was used, and stated as zero. */
  llmUsd: number
  /** Anything paid to the agent itself. */
  agentFeeUsd: number
  /** Human time at a stated rate, for the manual arm. Null for the agent. */
  humanUsd: number | null
  /** The rate used for humanUsd, so a reader can re-price it themselves. */
  humanRateUsdPerHour: number | null
  totalUsd: number
}

export interface BenchmarkManifest {
  version: '1'
  benchmark_id: string
  arm: Arm
  /** Which repetition. Every arm is run twice; a single run is an anecdote. */
  rep: number

  /** Hash of the exact task text both arms were given. */
  task_hash: string
  /** Hash of the pinned inputs (subject, block, policy). */
  input_hash: string
  manual_output_hash: string | null
  agent_output_hash: string | null

  agent_id: string | null
  /** Block both arms answered for. */
  block: string
  /** ERC-8183 job id, when the arm was hired through the commerce rail. */
  job_id: string | null
  tx_hashes: string[]

  cost_breakdown: CostBreakdown
  /** Wall clock. Measured. Never estimated (escalation gate 4). */
  elapsed_ms: number

  rubric_version: string
  rubric_hash: string
  score_breakdown: Record<string, number>
  score_total: number
  score_out_of: number

  /** When this arm ran, not when the manifest was written. */
  ran_at: string
}

/** Deterministic ordering, so identical content always hashes identically. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>
    return Object.fromEntries(Object.keys(rec).sort().map((k) => [k, canonical(rec[k])]))
  }
  return value
}

export function hashContent(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(canonical(value))
  return `0x${createHash('sha256').update(text).digest('hex')}`
}

export function manifestHash(manifest: BenchmarkManifest): string {
  return hashContent(canonical(manifest))
}

export function totalCost(c: Omit<CostBreakdown, 'totalUsd'>): CostBreakdown {
  return { ...c, totalUsd: c.gasUsd + c.llmUsd + c.agentFeeUsd + (c.humanUsd ?? 0) }
}
