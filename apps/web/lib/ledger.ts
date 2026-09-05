import 'server-only'
import { desc, eq } from 'drizzle-orm'
import { db, benchmark as benchmarkTable, benchmarkRun, sealedCall } from '@marque/db'
import { trackRecord, type SealOutcome } from '@marque/ledger'

/**
 * The Ledger, as the web process reads it.
 *
 * Every number here is a stored measurement. Nothing is computed to fill a gap:
 * a benchmark whose manual arm has not been run shows as awaiting the manual
 * arm, not as a partial result, and certainly not as a win.
 */

export interface LedgerRun {
  id: number
  arm: 'agent' | 'manual'
  rep: number
  output: unknown
  outputHash: string
  elapsedMs: number
  timingMethod: string
  blockNumber: string
  costBreakdown: Record<string, unknown>
  scoreTotal: number | null
  scoreOutOf: number | null
  scoreBreakdown: Record<string, number> | null
  scoreReasons: Record<string, string> | null
  scoredBlind: boolean
  manifestHash: string
  manifest: Record<string, unknown>
  evidenceUrl: string | null
  note: string | null
  ranAt: string
}

export interface LedgerBenchmark {
  id: string
  title: string
  category: string
  agentId: string
  agentName: string | null
  task: string
  taskHash: string
  input: Record<string, unknown>
  inputHash: string
  rubricVersion: string
  rubricHash: string
  rubric: Record<string, unknown>
  rubricRegisteredAt: string
  method: string
  runs: LedgerRun[]
  /** What is still missing before this can be published as a result. */
  missing: string[]
  complete: boolean
}

function toRun(r: typeof benchmarkRun.$inferSelect): LedgerRun {
  return {
    id: r.id,
    arm: r.arm,
    rep: r.rep,
    output: r.output,
    outputHash: r.outputHash,
    elapsedMs: r.elapsedMs,
    timingMethod: r.timingMethod,
    blockNumber: r.blockNumber,
    costBreakdown: r.costBreakdown,
    scoreTotal: r.scoreTotal,
    scoreOutOf: r.scoreOutOf,
    scoreBreakdown: r.scoreBreakdown,
    scoreReasons: r.scoreReasons,
    scoredBlind: r.scoredBlind,
    manifestHash: r.manifestHash,
    manifest: r.manifest,
    evidenceUrl: r.evidenceUrl,
    note: r.note,
    ranAt: r.ranAt.toISOString(),
  }
}

export async function readLedger(): Promise<LedgerBenchmark[]> {
  const [benchmarks, runs] = await Promise.all([
    db().select().from(benchmarkTable).orderBy(benchmarkTable.id),
    db().select().from(benchmarkRun).orderBy(benchmarkRun.benchmarkId, benchmarkRun.arm, benchmarkRun.rep),
  ])
  return benchmarks.map((b) => {
    const mine = runs.filter((r) => r.benchmarkId === b.id).map(toRun)
    const agentReps = mine.filter((r) => r.arm === 'agent').length
    const manualReps = mine.filter((r) => r.arm === 'manual').length
    const scored = mine.filter((r) => r.scoreTotal !== null).length
    const missing: string[] = []
    if (agentReps < 2) missing.push(`${2 - agentReps} more agent repetition${2 - agentReps === 1 ? '' : 's'}`)
    if (manualReps < 2) missing.push(`${2 - manualReps} manual repetition${2 - manualReps === 1 ? '' : 's'}, run by hand with a stopwatch`)
    if (missing.length === 0 && scored < mine.length) missing.push('blind scoring of both arms')
    return {
      id: b.id,
      title: b.title,
      category: b.category,
      agentId: b.agentId,
      agentName: b.agentName,
      task: b.task,
      taskHash: b.taskHash,
      input: b.input,
      inputHash: b.inputHash,
      rubricVersion: b.rubricVersion,
      rubricHash: b.rubricHash,
      rubric: b.rubric,
      rubricRegisteredAt: b.rubricRegisteredAt.toISOString(),
      method: b.method,
      runs: mine,
      missing,
      complete: missing.length === 0,
    }
  })
}

export async function readBenchmark(id: string): Promise<LedgerBenchmark | null> {
  const all = await readLedger()
  return all.find((b) => b.id === id) ?? null
}

export interface SealView {
  hash: string
  agentId: string
  category: string
  subject: string
  blockNumber: string
  issuedAt: string
  resolutionRule: string
  resolveAfter: string
  sealTxHash: string | null
  sealBlock: string | null
  outcome: SealOutcome
  resolvedAt: string | null
  recommendation: Record<string, unknown>
}

export async function readSeals(limit = 100): Promise<SealView[]> {
  const rows = await db().select().from(sealedCall).orderBy(desc(sealedCall.issuedAt)).limit(limit)
  return rows.map((r) => ({
    hash: r.hash,
    agentId: r.agentId,
    category: r.category,
    subject: r.subject,
    blockNumber: r.blockNumber,
    issuedAt: r.issuedAt.toISOString(),
    resolutionRule: r.resolutionRule,
    resolveAfter: r.resolveAfter.toISOString(),
    sealTxHash: r.sealTxHash,
    sealBlock: r.sealBlock,
    outcome: r.outcome as SealOutcome,
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    recommendation: r.recommendation,
  }))
}

/** The public track record for one agent. Never a bare percentage. */
export async function readTrackRecord(agentId: string) {
  const rows = await db().select().from(sealedCall)
    .where(eq(sealedCall.agentId, agentId))
    .orderBy(desc(sealedCall.issuedAt))
  if (rows.length === 0) {
    const now = new Date().toISOString()
    return trackRecord({ agentId, windowFrom: now, windowTo: now, outcomes: [] })
  }
  const times = rows.map((r) => r.issuedAt.getTime())
  return trackRecord({
    agentId,
    windowFrom: new Date(Math.min(...times)).toISOString(),
    windowTo: new Date(Math.max(...times)).toISOString(),
    outcomes: rows.map((r) => r.outcome as SealOutcome),
  })
}
