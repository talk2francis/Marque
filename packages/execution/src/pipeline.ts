import { randomUUID } from 'node:crypto'
import { loadCase, grade, type TestId } from '@marque/conformance'
import { TASK_TEST, type StructuredTask } from './tasks.js'
import { buildReceipt, type Receipt } from './receipt.js'
import type { AgentExecutor, ExecutionContext, PreflightResult, Quote, RunResult } from './types.js'

/**
 * The run pipeline.
 *
 *   quote → authority check → execute → grade → receipt
 *
 * Two things about the order are deliberate.
 *
 * The AUTHORITY CHECK sits before execution, not after. Checking afterwards
 * tells you that you were robbed; checking first is the product.
 *
 * The GRADE sits after execution but before the receipt, and it runs against
 * the same MCS case the agent's public warrant was earned on. So the receipt
 * can say "this answer passed the same test we publish", which is a materially
 * stronger claim than "the agent responded".
 */

/**
 * One thing that actually happened, at the moment it happened.
 *
 * The Run Room renders these and nothing else. It is tempting to synthesise
 * plausible intermediate steps so a timeline looks busy; that would be a
 * fabricated metric wearing a clock (AGENTS.md invariant 4). If the pipeline
 * did not emit it, the timeline does not show it.
 */
export interface RunEventInput {
  kind: 'quote' | 'authority' | 'execute' | 'tx' | 'grade' | 'receipt' | 'refused' | 'error'
  label: string
  detail?: string | null
  txHash?: string | null
  data?: Record<string, unknown>
}

export interface RunOptions {
  executor: AgentExecutor
  task: StructuredTask
  ctx: ExecutionContext
  /** Skip persistence, e.g. in a dry run. */
  persist?: boolean
  /**
   * Supplied by a caller that has already created the run record, so the
   * buyer can be handed a URL before the work finishes.
   */
  runId?: string
  /**
   * Called as each stage completes. Awaited, so an event is durable before the
   * next stage runs — a timeline that loses the step before a crash is worse
   * than no timeline, because it points at the wrong stage.
   */
  onEvent?: (event: RunEventInput) => void | Promise<void>
}

export interface PipelineOutcome {
  runId: string
  ok: boolean
  stage: 'quote' | 'authority' | 'execute' | 'grade' | 'complete'
  quote: Quote | null
  run: RunResult | null
  receipt: Receipt | null
  receiptHash: string | null
  /** Plain-English statement of what stopped the run, when something did. */
  failure: string | null
  elapsedMs: number
}

/**
 * Does this run stay inside the authority it was granted?
 *
 * An empty allowlist means read-only, which is the safe default: a run that has
 * not been given any contract to touch may not touch any.
 */
export function checkAuthority(
  task: StructuredTask,
  ctx: ExecutionContext,
): { ok: true } | { ok: false; detail: string } {
  if (task.maxSpendUsd > ctx.maxSpendUsd) {
    return {
      ok: false,
      detail: `the task's ceiling of ${task.maxSpendUsd} USD exceeds the ${ctx.maxSpendUsd} USD this run was authorised for`,
    }
  }
  if (ctx.charterId && (!ctx.allowlist || ctx.allowlist.length === 0)) {
    return {
      ok: false,
      detail: 'a charter was named but carries no contract allowlist, so no contract call is permitted under it',
    }
  }
  return { ok: true }
}

/** A dry run. Nothing is submitted, and the result says so in those words. */
export async function preflight(executor: AgentExecutor, task: StructuredTask): Promise<PreflightResult> {
  if (!executor.preflight) {
    return {
      ok: false, agentId: executor.agentId, plan: null, calls: [],
      estimatedGasNative: null, feeUsd: null, maxSlippageBps: null,
      conformance: null, latencyMs: 0, nothingSubmitted: true,
      reason: 'no_compatible_interface',
      detail: `the ${executor.kind} adapter cannot preflight; this agent must be hired to be seen`,
    }
  }

  const result = await executor.preflight(task)
  if (!result.ok || result.plan === null) return result

  // Grade the plan before any money moves. A plan that fails its own category's
  // published test should never reach a signature, and saying so is free here.
  const graded = await gradeAgainstCase(task, result.plan)
  return { ...result, conformance: graded }
}

/**
 * Does this hire ask the same question the published case asks?
 *
 * The published case fixes a subject, a block AND a policy. Grading an answer
 * to a different question against it produces a meaningless verdict in both
 * directions: a correct answer to the buyer's question fails, and — worse — an
 * agent that ignores the buyer and answers the CASE's question passes.
 *
 * That second case is not hypothetical. A reference agent whose target parser
 * silently defaulted to 2.5 answered a request for 1.6 with the 2.5 number and
 * scored PASS, because the case also uses 2.5. The grade certified the bug.
 */
function comparableToCase(task: StructuredTask, caseSubject: Record<string, string>, casePolicy: unknown): boolean {
  const subjectMatches = Object.values(caseSubject).some(
    (v) => typeof v === 'string' && v.toLowerCase() === task.subject.toLowerCase(),
  )
  if (!subjectMatches) return false

  const p = casePolicy as Record<string, unknown> | null
  if (!p) return false

  switch (task.kind) {
    case 'health_factor':
      return Number(p['targetHealthFactor']) === task.policy.targetHealthFactor
    case 'rebalance':
      return Number(p['rangePct']) === task.policy.rangePct && Number(p['feeTier']) === task.policy.feeTier
    case 'yield':
      return Number(p['sizeUsd']) === task.policy.sizeUsd
        && String(p['asset']).toLowerCase() === task.policy.asset.toLowerCase()
        && Number(p['minImprovementBps']) === task.policy.minImprovementBps
    case 'grid':
      return Number(p['levels']) === task.policy.levels
        && Number(p['lowerBound']) === task.policy.lowerBound
        && Number(p['upperBound']) === task.policy.upperBound
  }
}

/**
 * Grade an answer against the live MCS case for its category.
 *
 * Returns null when the hire is not comparable to the published case. A null
 * quality proof reads as "not graded against the published standard", which is
 * true and useful. A FAIL or a PASS there would be neither.
 */
async function gradeAgainstCase(
  task: StructuredTask,
  answer: unknown,
): Promise<{ testId: string; pass: boolean; failedFields: string[] } | null> {
  const testId = TASK_TEST[task.kind] as TestId
  try {
    const loaded = await loadCase(testId)
    if (!loaded) return null
    if (!comparableToCase(task, loaded.testCase.subject, loaded.testCase.policy)) return null
    const diffs = grade(testId, loaded.groundTruth, answer)
    const failedFields = diffs.filter((dd) => !dd.pass).map((dd) => dd.field)
    return { testId, pass: diffs.length > 0 && failedFields.length === 0, failedFields }
  } catch {
    return null
  }
}

export async function runHire(opts: RunOptions): Promise<PipelineOutcome> {
  const runId = opts.runId ?? randomUUID()
  const started = Date.now()
  const base = { runId, quote: null, run: null, receipt: null, receiptHash: null }
  const emit = async (event: RunEventInput) => {
    if (opts.onEvent) await opts.onEvent(event)
  }

  // ---- 1. Quote -----------------------------------------------------------
  const quote = await opts.executor.quote(opts.task)
  if (!quote.ok) {
    await emit({
      kind: 'refused',
      label: 'No quote',
      detail: quote.detail ?? quote.reason ?? 'the agent did not answer with a price',
    })
    return {
      ...base, ok: false, stage: 'quote', quote,
      failure: `could not get a quote: ${quote.detail ?? quote.reason ?? 'unknown'}`,
      elapsedMs: Date.now() - started,
    }
  }
  await emit({
    kind: 'quote',
    label: quote.feeUsd === null
      ? `Quoted, no machine-readable price (${quote.kind})`
      : `Quoted ${quote.feeUsd} USD (${quote.kind})`,
    detail: quote.declaredPrice,
    data: { feeUsd: quote.feeUsd, latencyMs: quote.latencyMs, settlementAsset: quote.settlementAsset },
  })

  if (quote.feeUsd !== null && quote.feeUsd > opts.ctx.maxSpendUsd) {
    await emit({
      kind: 'refused',
      label: 'Refused on price',
      detail: `the agent asks ${quote.feeUsd} USD, above the ${opts.ctx.maxSpendUsd} USD ceiling set for this run`,
    })
    return {
      ...base, ok: false, stage: 'quote', quote,
      failure: `the agent asks ${quote.feeUsd} USD, above the ${opts.ctx.maxSpendUsd} USD ceiling set for this run`,
      elapsedMs: Date.now() - started,
    }
  }

  // ---- 2. Authority, BEFORE anything happens -------------------------------
  const authority = checkAuthority(opts.task, opts.ctx)
  if (!authority.ok) {
    await emit({ kind: 'refused', label: 'Refused before execution', detail: authority.detail })
    return {
      ...base, ok: false, stage: 'authority', quote,
      failure: `refused before execution: ${authority.detail}`,
      elapsedMs: Date.now() - started,
    }
  }

  await emit({
    kind: 'authority',
    label: opts.ctx.charterId
      ? `Authority checked against charter ${opts.ctx.charterId}`
      : 'Authority checked — read-only, no contract call permitted',
    detail: `ceiling ${opts.ctx.maxSpendUsd} USD · ${opts.ctx.allowlist?.length ?? 0} contract(s) permitted`,
    data: { charterId: opts.ctx.charterId ?? null, allowlist: opts.ctx.allowlist ?? [] },
  })

  // ---- 3. Execute ----------------------------------------------------------
  await emit({ kind: 'execute', label: `Sent to the agent over ${opts.executor.kind}` })
  const run = await opts.executor.execute(opts.task, opts.ctx)

  for (const txHash of run.txHashes) {
    await emit({ kind: 'tx', label: 'Transaction included', txHash })
  }

  await emit({
    kind: run.ok ? 'execute' : 'error',
    label: run.ok ? `Agent answered in ${run.latencyMs} ms` : `Agent failed: ${run.reason ?? 'unknown'}`,
    detail: run.ok ? null : (run.detail ?? null),
    data: { latencyMs: run.latencyMs },
  })

  // ---- 4. Grade ------------------------------------------------------------
  const graded = run.ok ? await gradeAgainstCase(opts.task, run.result) : null

  await emit({
    kind: 'grade',
    label: graded === null
      ? 'Not graded against the published case'
      : graded.pass
        ? `Passed ${graded.testId}`
        : `Failed ${graded.testId} on ${graded.failedFields.join(', ')}`,
    detail: graded === null
      ? 'this hire asks a different question from the published case, so grading it against that case would be meaningless in both directions'
      : null,
    data: graded ? { ...graded } : {},
  })

  // ---- 5. Receipt. Issued for failures too. --------------------------------
  // A failed run with a legible reason is evidence the system is real, and
  // publishing failures is the most credible thing this marketplace does.
  const loaded = graded ? await loadCase(graded.testId as TestId).catch(() => null) : null

  const { receipt, hash } = buildReceipt({
    runId,
    task: opts.task,
    run,
    commercial: {
      declaredPrice: quote.declaredPrice,
      paidAmount: null,
      paidAsset: quote.settlementAsset,
      maxSpendUsd: opts.ctx.maxSpendUsd,
      settled: false,
      settlementNote: 'settlement stays with the buyer; Marque never settles on their behalf',
    },
    authority: {
      charterId: opts.ctx.charterId ?? null,
      allowlist: opts.ctx.allowlist ?? [],
      spendCapUsd: opts.ctx.maxSpendUsd,
      expiresAt: null,
      withinAuthority: true,
    },
    quality: {
      testId: graded?.testId ?? null,
      pass: graded?.pass ?? null,
      failedFields: graded?.failedFields ?? [],
      caseId: loaded?.testCase.id ?? null,
      groundTruthHash: loaded?.groundTruthHash ?? null,
    },
  })

  await emit({
    kind: 'receipt',
    label: 'Receipt issued',
    detail: hash,
    data: { hash },
  })

  return {
    runId,
    ok: run.ok,
    stage: run.ok ? 'complete' : 'execute',
    quote,
    run,
    receipt,
    receiptHash: hash,
    failure: run.ok ? null : `${run.reason ?? 'failed'}: ${run.detail ?? 'no detail'}`,
    elapsedMs: Date.now() - started,
  }
}
