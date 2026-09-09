/** Completion is a claim about comparable evidence, not just populated scores. */
export interface CompletionRun {
  arm: 'agent' | 'manual'
  rep: number
  blockNumber: string
  scoreTotal: number | null
  scoreOutOf: number | null
  scoredBlind: boolean
  manifest: Record<string, unknown>
}

export function comparisonMissing(
  benchmark: { taskHash: string; inputHash: string; rubricHash: string },
  runs: readonly CompletionRun[],
): string[] {
  const missing: string[] = []
  for (const arm of ['agent', 'manual'] as const) {
    const reps = new Set(runs.filter((r) => r.arm === arm).map((r) => r.rep))
    if (reps.size < 2) missing.push(`${2 - reps.size} more ${arm} repetition(s)`)
  }
  const ungraded = runs.filter((r) => !r.scoredBlind || r.scoreTotal === null ||
    r.scoreOutOf === null || !Number.isFinite(r.scoreTotal) ||
    !Number.isFinite(r.scoreOutOf) || r.scoreOutOf <= 0 || r.scoreTotal < 0 ||
    r.scoreTotal > r.scoreOutOf)
  if (ungraded.length) missing.push(`blind grades for ${ungraded.length} recorded repetition(s)`)
  if (runs.some((r) => r.manifest['task_hash'] !== benchmark.taskHash ||
    r.manifest['input_hash'] !== benchmark.inputHash ||
    r.manifest['rubric_hash'] !== benchmark.rubricHash)) {
    missing.push('matching task, input and rubric hashes across the compared runs')
  }
  if (runs.some((r) => !/^[1-9]\d*$/.test(r.blockNumber) ||
    r.manifest['block'] !== r.blockNumber)) {
    missing.push('a verifiable chain block in every run and its manifest')
  }
  const blocks = new Set(runs.map((r) => r.blockNumber).filter((b) => /^[1-9]\d*$/.test(b)))
  if (blocks.size > 1) missing.push('the same pinned chain block across both arms and repetitions')
  return missing
}
