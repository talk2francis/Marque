import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { checksFor, grade, loadCaseById } from '@marque/conformance'
import { normalizeAnswer, questJob, type ChainId } from '@marque/commerce'
import { onchainJobTask } from './job-description'

export type ReplayTarget = { caseId: string } | { chainId: ChainId; jobId: string }

/** Supplied JSON only, at the original block. Never asks an endpoint, writes a grade or enters a paid path. */
export async function replaySuppliedAnswer(target: ReplayTarget, answer: unknown) {
  if ('caseId' in target) {
    const loaded = await loadCaseById(target.caseId)
    if (!loaded) throw new Error('case_unavailable')
    const diffs = grade(loaded.testCase.testId, loaded.groundTruth, answer)
    return { kind: 'case' as const, at: new Date().toISOString(), block: loaded.testCase.blockNumber.toString(), source: loaded.testCase.id,
      rows: diffs.map(d => ({ field: d.field, label: d.field.replace(/([a-z])([A-Z])/g, '$1 $2'), actual: d.actual, expected: d.expected, pass: d.pass as boolean | null, detail: `${d.tolerance}. ${d.detail}` })) }
  }
  const kept = await db().transaction(async tx => {
    await tx.execute(sql`set transaction read only`); await tx.execute(sql`set local statement_timeout = '1500ms'`)
    const r = await tx.execute(sql`select block from lens_result where chain_id = ${target.chainId} and job_id = ${target.jobId} limit 1`)
    return ((r as unknown as { rows?: Array<{ block: string | null }> }).rows ?? r as unknown as Array<{ block: string | null }>)[0]
  })
  if (!kept?.block || !/^[1-9]\d{0,15}$/.test(kept.block)) throw new Error('block_unavailable')
  const [job, task] = await Promise.all([questJob(target.chainId, target.jobId), onchainJobTask(target.chainId, target.jobId)])
  if (!job?.agent?.category) throw new Error('category_unavailable')
  const lens = normalizeAnswer(job.agent.category, answer)
  if (lens.meta.block !== null && lens.meta.block !== kept.block) throw new Error('block_mismatch')
  const checks = await checksFor(lens, task?.task ?? null, BigInt(kept.block))
  return { kind: 'job' as const, at: new Date().toISOString(), block: kept.block, source: `${target.chainId}:${target.jobId}`,
    rows: checks.map(c => ({ field: c.key, label: c.label, actual: c.agent, expected: c.marque, pass: c.state === 'unavailable' ? null : c.state === 'match' || c.state === 'holds', detail: [c.how === 'chain' ? 'Read at the original block.' : 'Arithmetic on the supplied answer.', c.detail].filter(Boolean).join(' ') })) }
}
