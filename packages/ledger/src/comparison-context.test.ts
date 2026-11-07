import { describe, expect, it } from 'vitest'
import { recoverComparisonTask } from './comparison-context.js'
import { comparisonMissing, type CompletionRun } from './completion.js'
import { hashContent } from './manifest.js'

const task = ({ block }: { block: string }) => `The original task.\nBlock: ${block}.`
const originalHash = hashContent(task({ block: '123' }))
const registered = { task: task({ block: '456' }), taskHash: hashContent(task({ block: '456' })), inputHash: 'input', rubricHash: 'rubric' }
type Run = CompletionRun & { id: number; blockRecoveryTaskHash?: string }
const runs = (): Run[] => (['agent', 'manual'] as const).flatMap((arm, armIndex) => [1, 2].map(rep => ({
  id: armIndex * 2 + rep, arm, rep, blockNumber: '123', scoreTotal: 0, scoreOutOf: 100, scoredBlind: true,
  manifest: { block: '123', task_hash: originalHash, input_hash: 'input', rubric_hash: 'rubric' },
})))

describe('original comparison context', () => {
  it('recovers only a block-only registration drift without changing raw data or zero grades', () => {
    const rows = runs(), before = JSON.stringify({ registered, rows })
    expect(comparisonMissing(registered, rows)).toHaveLength(1)
    const recovery = recoverComparisonTask(registered, rows, task)
    expect(recovery).toMatchObject({ task: task({ block: '123' }), taskHash: originalHash, block: '123', registrationBlock: '456', runIds: [1, 2, 3, 4] })
    expect(comparisonMissing({ ...registered, taskHash: recovery!.taskHash }, rows)).toEqual([])
    expect(JSON.stringify({ registered, rows })).toBe(before)
  })
  it('requires the prior block supplement to name the same original task', () => {
    const rows = runs()
    rows[2] = { ...rows[2]!, blockNumber: '0', effectiveBlock: '123', blockRecovered: true, blockRecoveryTaskHash: originalHash }
    expect(recoverComparisonTask(registered, rows, task)).not.toBeNull()
    rows[2]!.blockRecoveryTaskHash = hashContent('another task')
    expect(recoverComparisonTask(registered, rows, task)).toBeNull()
  })
  it.each(['task_hash', 'input_hash', 'rubric_hash'])('does not conceal a mismatched %s', key => {
    const rows = runs(); rows[0]!.manifest[key] = hashContent('different')
    expect(recoverComparisonTask(registered, rows, task)).toBeNull()
  })
  it('does not complete missing, ungraded or different-block repetitions', () => {
    const rows = runs()
    expect(recoverComparisonTask(registered, rows.slice(1), task)).toBeNull()
    rows[0]!.scoredBlind = false
    expect(recoverComparisonTask(registered, rows, task)).toBeNull()
    rows[0]!.scoredBlind = true; rows[0]!.blockNumber = '124'; rows[0]!.manifest.block = '124'
    expect(recoverComparisonTask(registered, rows, task)).toBeNull()
  })
  it('refuses altered task words, a corrupted registration hash and an unrelated template', () => {
    expect(recoverComparisonTask({ ...registered, task: 'Different words.\nBlock: 456.' }, runs(), task)).toBeNull()
    expect(recoverComparisonTask({ ...registered, taskHash: hashContent('corrupted') }, runs(), task)).toBeNull()
    expect(recoverComparisonTask(registered, runs(), ({ block }) => `Another task.\nBlock: ${block}.`)).toBeNull()
  })
})
