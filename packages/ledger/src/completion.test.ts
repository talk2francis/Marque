import { describe, expect, it } from 'vitest'
import { comparisonMissing, trustedBlock, type CompletionRun } from './completion.js'

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

  // A manual run that recorded block 0 but whose task hash matches the frozen
  // task: an append-only provenance supplement recovers the pinned block. The
  // comparison completes ONLY through effectiveBlock — blockNumber stays '0'.
  it('accepts a provenance-recovered block for a run that recorded none', () => {
    const rows = runs()
    for (const i of [2, 3]) {
      rows[i]!.blockNumber = '0'
      rows[i]!.manifest['block'] = ''
      rows[i]!.effectiveBlock = '123'
      rows[i]!.blockRecovered = true
    }
    expect(comparisonMissing(benchmark, rows)).toEqual([])
  })

  it('still fails when a recovered block is itself absent or non-numeric', () => {
    const rows = runs()
    rows[2]!.blockNumber = '0'
    rows[2]!.manifest['block'] = ''
    rows[2]!.effectiveBlock = ''      // nothing was recovered
    rows[2]!.blockRecovered = true
    expect(comparisonMissing(benchmark, rows))
      .toContain('a verifiable chain block in every run and its manifest')
  })

  it('a recovered block that disagrees with the agent block is not one sitting', () => {
    const rows = runs()
    rows[2]!.blockNumber = '0'; rows[2]!.manifest['block'] = ''
    rows[2]!.effectiveBlock = '999'; rows[2]!.blockRecovered = true
    rows[3]!.blockNumber = '0'; rows[3]!.manifest['block'] = ''
    rows[3]!.effectiveBlock = '999'; rows[3]!.blockRecovered = true
    expect(comparisonMissing(benchmark, rows))
      .toContain('the same pinned chain block across both arms and repetitions')
  })

  it('trustedBlock prefers a valid recovered block, else the raw one', () => {
    expect(trustedBlock({ ...runs()[0]!, blockNumber: '0', effectiveBlock: '555', blockRecovered: true })).toBe('555')
    expect(trustedBlock({ ...runs()[0]!, blockNumber: '123', effectiveBlock: '555' })).toBe('123')
    expect(trustedBlock({ ...runs()[0]!, blockNumber: '0', effectiveBlock: 'x' })).toBe('0')
  })
})
