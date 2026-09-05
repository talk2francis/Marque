import { createHash } from 'node:crypto'

/**
 * Sealed calls.
 *
 * A win rate quoted with no window and no prior commitment is unfalsifiable:
 * the set of calls being averaged was chosen after the outcomes were known.
 * Sealing fixes that. Every recommendation any Marque agent issues is hashed
 * and written to `MarqueRegistry.sealCall` AT ISSUE TIME, before the outcome
 * exists. A scorer resolves it later against chain state.
 *
 * What a seal proves is narrow and worth stating exactly: this recommendation
 * existed at this block and has not been edited since. It does not prove the
 * recommendation was good, and the agent profile says so.
 *
 * And a rule that costs us the headline number: NEVER render a bare win-rate
 * percentage. Six resolved calls out of a nine-call window is not "67%
 * accurate", it is six calls — a number small enough that one more resolution
 * moves it by seventeen points. The profile shows n, the window, the outcome
 * breakdown, and an explicit small-sample warning.
 */

export type SealOutcome = 'correct' | 'incorrect' | 'unresolved' | 'void'

export interface SealedCallInput {
  agentId: string
  /** The recommendation exactly as issued. Hashed whole. */
  recommendation: unknown
  /** Block at issue time. The seal precedes the outcome by construction. */
  blockNumber: string
  timestamp: string
  /** What would have to be true later for this to count as correct. */
  resolutionRule: string
  /** When it can be resolved, in seconds from issue. */
  resolveAfterSeconds: number
}

/** keccak-style content hash: recommendation ‖ block ‖ agentId ‖ timestamp. */
export function sealHash(input: Pick<SealedCallInput, 'recommendation' | 'blockNumber' | 'agentId' | 'timestamp'>): string {
  const payload = JSON.stringify({
    version: '1',
    agentId: input.agentId,
    blockNumber: input.blockNumber,
    timestamp: input.timestamp,
    recommendation: input.recommendation,
  })
  return `0x${createHash('sha256').update(payload).digest('hex')}`
}

/** The agent id, as bytes32, for the contract's indexed filter. */
export function agentIdBytes32(agentId: string): `0x${string}` {
  return `0x${createHash('sha256').update(agentId).digest('hex')}` as `0x${string}`
}

export interface TrackRecord {
  agentId: string
  /** Number of sealed calls in the window. The headline number, not a rate. */
  n: number
  windowFrom: string
  windowTo: string
  resolved: number
  correct: number
  incorrect: number
  unresolved: number
  void: number
  /**
   * True whenever the sample is too small to support a rate. At n below 30 a
   * single resolution moves any percentage by more than three points, so the
   * profile refuses to render one.
   */
  smallSample: boolean
  warning: string
}

export const SMALL_SAMPLE_BELOW = 30

export function trackRecord(input: {
  agentId: string
  windowFrom: string
  windowTo: string
  outcomes: SealOutcome[]
}): TrackRecord {
  const counts = { correct: 0, incorrect: 0, unresolved: 0, void: 0 }
  for (const o of input.outcomes) counts[o]++
  const n = input.outcomes.length
  const resolved = counts.correct + counts.incorrect
  const smallSample = resolved < SMALL_SAMPLE_BELOW

  return {
    agentId: input.agentId,
    n,
    windowFrom: input.windowFrom,
    windowTo: input.windowTo,
    resolved,
    ...counts,
    smallSample,
    warning: smallSample
      ? `${resolved} resolved call${resolved === 1 ? '' : 's'} is too few to support a rate. One more resolution would move any percentage by ${resolved === 0 ? 'an unbounded amount' : `${(100 / (resolved + 1)).toFixed(0)} points`}, so none is shown.`
      : `${resolved} resolved calls in this window.`,
  }
}
