/** Completion is a claim about comparable evidence, not just populated scores. */
export interface CompletionRun {
  arm: 'agent' | 'manual'
  rep: number
  /** The block as the run recorded it. `0` / '' means it was not recorded. */
  blockNumber: string
  /**
   * The block trusted FOR THE COMPARISON. Equal to `blockNumber` when that is
   * valid. When `blockNumber` was not recorded, this may be a value recovered
   * from an append-only provenance supplement — but ONLY when that supplement
   * derives it from the immutable frozen task the run's hash matches. The raw
   * `blockNumber` is never rewritten; this is a separate, auditable view.
   */
  effectiveBlock?: string
  /** True when `effectiveBlock` came from a provenance supplement, not the raw row. */
  blockRecovered?: boolean
  scoreTotal: number | null
  scoreOutOf: number | null
  scoredBlind: boolean
  manifest: Record<string, unknown>
}

const isBlock = (s: string | undefined): s is string => typeof s === 'string' && /^[1-9]\d*$/.test(s)

/** The block that counts for the comparison: the raw block when it is valid,
 * otherwise a provenance-recovered value, otherwise the raw string as-is. */
export function trustedBlock(r: CompletionRun): string {
  if (isBlock(r.blockNumber)) return r.blockNumber
  if (isBlock(r.effectiveBlock)) return r.effectiveBlock
  return r.blockNumber
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

  // Every run must resolve to a verifiable chain block. A raw block is verified
  // against its own manifest; a recovered block is trusted only because a
  // provenance supplement tied it to the frozen task — the check still fails if
  // NOTHING gives a block.
  const blockless = runs.filter((r) => {
    if (r.blockRecovered) return !isBlock(r.effectiveBlock)
    return !isBlock(r.blockNumber) || r.manifest['block'] !== r.blockNumber
  })
  if (blockless.length) missing.push('a verifiable chain block in every run and its manifest')

  const blocks = new Set(runs.map(trustedBlock).filter(isBlock))
  if (blocks.size > 1) missing.push('the same pinned chain block across both arms and repetitions')

  return missing
}
