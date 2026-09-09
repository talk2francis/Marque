import { describe, expect, it } from 'vitest'
import { comparisonMissing, type CompletionRun } from './completion.js'

const benchmark = { taskHash: 'task', inputHash: 'input', rubricHash: 'rubric' }
const runs = (): CompletionRun[] => (['agent', 'manual'] as const).flatMap((arm) =>
  [1, 2].map((rep) => ({ arm, rep, blockNumber: '123', scoreTotal: 0,
    scoreOutOf: 100, scoredBlind: true,
    manifest: { block: '123', task_hash: 'task', input_hash: 'input', rubric_hash: 'rubric' },
  })))

describe('comparison completion', () => {
  it('accepts matching evidence, including a legitimately blind zero score', () => {
    expect(comparisonMissing(benchmark, runs())).toEqual([])
  })
  it('does not turn missing manual block provenance into a completed comparison', () => {
    const rows = runs()
    rows[2]!.blockNumber = '0'
    rows[2]!.manifest['block'] = ''
    expect(comparisonMissing(benchmark, rows)).toContain('a verifiable chain block in every run and its manifest')
  })
  it('rejects changed tasks and distinct blocks even when every score exists', () => {
    const rows = runs()
    rows[0]!.manifest['task_hash'] = 'earlier task'
    rows[0]!.blockNumber = '122'
    rows[0]!.manifest['block'] = '122'
    expect(comparisonMissing(benchmark, rows)).toHaveLength(2)
  })
  it('requires blind grades and distinct repetitions', () => {
    const rows = runs()
    rows[1]!.rep = 1
    rows[0]!.scoredBlind = false
    expect(comparisonMissing(benchmark, rows)).toEqual([
      '1 more agent repetition(s)', 'blind grades for 1 recorded repetition(s)',
    ])
  })
})
