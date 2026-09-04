import { createHash } from 'node:crypto'
import type { StructuredTask } from './tasks.js'
import type { ExecutorKind, RunResult } from './types.js'

/**
 * The receipt.
 *
 * Four proofs, because "it worked" is four separate claims and a marketplace
 * that blurs them is asking to be trusted rather than checked:
 *
 *   commercial  — what was agreed and what was paid
 *   execution   — what actually happened on chain
 *   authority   — what the agent was permitted to do at the time
 *   quality     — whether the answer passed its own category's published test
 *
 * Serialised canonically (sorted keys, no incidental whitespace) so the hash is
 * reproducible by anyone holding the same content. A receipt whose hash depends
 * on key order proves nothing.
 */

export interface CommercialProof {
  agentId: string
  executorKind: ExecutorKind
  /** What the agent said it would charge, in its own words. */
  declaredPrice: string | null
  /** What was actually paid, when anything was. */
  paidAmount: number | null
  paidAsset: string | null
  /** The buyer's own ceiling for this run. */
  maxSpendUsd: number
  settled: boolean
  /** Why settlement did not happen, when it did not. */
  settlementNote: string | null
}

export interface ExecutionProof {
  chainId: number
  blockNumber: string
  txHashes: string[]
  startedAt: string
  finishedAt: string
  latencyMs: number
  ok: boolean
  failureReason: string | null
}

export interface AuthorityProof {
  /** Charter under which the run executed, when there was one. */
  charterId: string | null
  /** Contracts the run was permitted to touch. Empty means read-only. */
  allowlist: string[]
  spendCapUsd: number
  expiresAt: string | null
  /** True when the run stayed inside every bound it was given. */
  withinAuthority: boolean
}

export interface QualityProof {
  testId: string | null
  pass: boolean | null
  failedFields: string[]
  /** The case the answer was graded against, so the grade is reproducible. */
  caseId: string | null
  groundTruthHash: string | null
}

export interface Receipt {
  version: '1'
  runId: string
  issuedAt: string
  task: StructuredTask
  commercial: CommercialProof
  execution: ExecutionProof
  authority: AuthorityProof
  quality: QualityProof
  /** Exactly what the agent returned. Kept whole; the hash covers it. */
  agentResponse: unknown
}

/** Deterministic ordering so identical content always hashes identically. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(rec).sort().map((k) => [k, canonical(rec[k])]),
    )
  }
  return value
}

export function canonicalise(receipt: Receipt): string {
  return JSON.stringify(canonical(receipt))
}

/**
 * keccak-style content hash of a receipt.
 *
 * This is the value anchored on MarqueRegistry. Anchoring proves the receipt
 * existed at a block and has not been edited since; it does not prove the
 * receipt is true, and we never claim otherwise.
 */
export function receiptHash(receipt: Receipt): string {
  return `0x${createHash('sha256').update(canonicalise(receipt)).digest('hex')}`
}

export function buildReceipt(input: {
  runId: string
  task: StructuredTask
  run: RunResult
  commercial: Omit<CommercialProof, 'agentId' | 'executorKind'>
  authority: AuthorityProof
  quality: QualityProof
}): { receipt: Receipt; hash: string } {
  const receipt: Receipt = {
    version: '1',
    runId: input.runId,
    issuedAt: new Date().toISOString(),
    task: input.task,
    commercial: {
      agentId: input.run.agentId,
      executorKind: input.run.kind,
      ...input.commercial,
    },
    execution: {
      chainId: input.task.chainId,
      blockNumber: input.task.blockNumber,
      txHashes: input.run.txHashes,
      startedAt: input.run.startedAt,
      finishedAt: input.run.finishedAt,
      latencyMs: input.run.latencyMs,
      ok: input.run.ok,
      failureReason: input.run.reason ?? null,
    },
    authority: input.authority,
    quality: input.quality,
    agentResponse: input.run.result,
  }
  return { receipt, hash: receiptHash(receipt) }
}

/**
 * The hash sealed BEFORE an outcome is known.
 *
 * keccak(recommendation ‖ block ‖ agentId ‖ timestamp). Publishing this at a
 * block that precedes the outcome is what makes a track record falsifiable —
 * without it, any win rate is assembled after the fact and unverifiable.
 */
export function sealedCallHash(input: {
  recommendation: unknown
  blockNumber: string
  agentId: string
  timestamp: string
}): string {
  const payload = canonicalise({
    version: '1',
    recommendation: input.recommendation,
    blockNumber: input.blockNumber,
    agentId: input.agentId,
    timestamp: input.timestamp,
  } as unknown as Receipt)
  return `0x${createHash('sha256').update(payload).digest('hex')}`
}
