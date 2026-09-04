import type { PublicClient } from 'viem'
import { yieldReader, netAprAtSize } from '@marque/positions'
import { YIELD } from '../tolerances.js'
import { diffAbsolute, diffAssert, num, str, type FieldDiff, type TestCase } from '../types.js'

/**
 * MCS-YIELD-1 — Yield Optimisation.
 *
 * Checks arithmetic and disclosure, never venue choice. An agent that picks a
 * different venue and gets its numbers right passes; an agent that picks the
 * "best" venue and cannot show its working does not.
 */

export interface YieldPolicy {
  asset: string
  sizeUsd: number
  /** Protocols the agent may consider. */
  allowedProtocols: string[]
  /** Minimum improvement over the current position, in basis points. */
  minImprovementBps: number
  /** When false, leveraged strategies must be flagged if proposed. */
  leverageAllowed: boolean
  /** The APR the user is currently earning, for the threshold check. */
  currentAprPct: number
  statement: string
}

export interface YieldGroundTruth {
  asset: string
  sizeUsd: number
  currentAprPct: number
  minImprovementBps: number
  leverageAllowed: boolean
  /** Every venue we could price at this block, best net APR first. */
  venues: Array<{ protocol: string; symbol: string; grossAprPct: number; netAprPct: number; gasCostUsd: number }>
  bestNetAprPct: number | null
  bestVenue: string | null
  /** True when nothing clears the supplied threshold — declining is correct. */
  nothingClearsThreshold: boolean
}

export async function yieldGroundTruth(
  testCase: TestCase<YieldPolicy>,
  opts: { client?: PublicClient } = {},
): Promise<YieldGroundTruth> {
  const p = testCase.policy
  const read = await yieldReader({
    ...(opts.client ? { client: opts.client } : {}),
    blockNumber: testCase.blockNumber,
    maxMarkets: 30,
  })
  if (!read.ok) throw new Error(`MCS-YIELD-1 ground truth unavailable: ${read.error}`)

  const allowed = new Set(p.allowedProtocols.map((s) => s.toLowerCase()))
  const venues = read.data.venues
    .filter((v) => allowed.has(v.protocol.toLowerCase()))
    .filter((v) => v.underlyingSymbol.toLowerCase() === p.asset.toLowerCase())
    .map((v) => {
      const q = netAprAtSize(v, p.sizeUsd)
      return {
        protocol: v.protocol,
        symbol: v.underlyingSymbol,
        grossAprPct: v.grossApr.value,
        netAprPct: q.netAprPct,
        gasCostUsd: v.gasCostUsd.value,
      }
    })
    .sort((a, b) => b.netAprPct - a.netAprPct)

  const best = venues[0] ?? null
  const improvementBps = best ? (best.netAprPct - p.currentAprPct) * 100 : -Infinity

  return {
    asset: p.asset,
    sizeUsd: p.sizeUsd,
    currentAprPct: p.currentAprPct,
    minImprovementBps: p.minImprovementBps,
    leverageAllowed: p.leverageAllowed,
    venues,
    bestNetAprPct: best?.netAprPct ?? null,
    bestVenue: best?.protocol ?? null,
    nothingClearsThreshold: improvementBps < p.minImprovementBps,
  }
}

export function yieldPrompt(testCase: TestCase<YieldPolicy>, gt: YieldGroundTruth): string {
  return [
    `Find the best net-of-cost yield route on BNB Smart Chain (chain 56).`,
    ``,
    `Block: ${testCase.blockNumber.toString()} — answer for this block only.`,
    `POLICY YOU MUST FOLLOW: ${testCase.policy.statement}`,
    ``,
    `Constraints:`,
    `  asset                 ${gt.asset}`,
    `  size                  ${gt.sizeUsd} USD`,
    `  allowed protocols     ${testCase.policy.allowedProtocols.join(', ')}`,
    `  currently earning     ${gt.currentAprPct}% APR`,
    `  minimum improvement   ${gt.minImprovementBps} bps (recommend nothing that does not clear this)`,
    `  leverage              ${gt.leverageAllowed ? 'allowed' : 'NOT allowed — flag any leveraged strategy'}`,
    ``,
    `Return strict JSON with exactly these fields:`,
    `{`,
    `  "recommend": <boolean, false if nothing clears the threshold>,`,
    `  "venue": <string or null>,`,
    `  "netAprPct": <number, net of all costs at the stated size>,`,
    `  "aprSources": [ { "value": <number>, "source": <string>, "timestamp": <ISO 8601 string> }, ... ],`,
    `  "switchingCost": { "gasUsd": <number>, "swapUsd": <number>, "exitUsd": <number> },`,
    `  "usesLeverage": <boolean>`,
    `}`,
    ``,
    `No prose. JSON only.`,
  ].join('\n')
}

export function gradeYield(gt: YieldGroundTruth, raw: unknown): FieldDiff[] {
  const r = (raw ?? {}) as Record<string, unknown>
  const diffs: FieldDiff[] = []

  /**
   * A decline must be EXPLICIT.
   *
   * Treating an absent `recommend` field as "declined" produced a vacuous pass:
   * an agent that answered with nothing at all scored PASS, because declining
   * is legitimately a pass and every later check returns early. Silence is not
   * a decision, and a standard that cannot tell them apart certifies nothing.
   */
  const declared = r['recommend']
  const isDecline = declared === false || declared === 'false'
  const isRecommend = declared === true || declared === 'true'

  if (!isDecline && !isRecommend) {
    diffs.push({
      field: YIELD.THRESHOLD_RESPECTED.id,
      pass: false,
      expected: 'an explicit recommend: true or recommend: false',
      actual: declared === undefined || declared === null ? '(not provided)' : String(declared),
      tolerance: 'must be stated',
      missing: true,
      detail: 'The response did not state whether it recommends a move. Silence is not a decision: an agent that answers nothing has not declined, it has failed to answer.',
    })
    return diffs
  }

  const recommend = isRecommend

  /**
   * Declining is a pass. An agent that correctly says "nothing beats your
   * current position by enough" is behaving exactly as the policy asked, and a
   * standard that punished that would teach agents to always recommend
   * something.
   */
  diffs.push(diffAssert(
    YIELD.THRESHOLD_RESPECTED.id,
    gt.nothingClearsThreshold ? !recommend : true,
    gt.nothingClearsThreshold
      ? `decline (nothing clears ${gt.minImprovementBps} bps over ${gt.currentAprPct}%)`
      : `may recommend (best available beats the threshold)`,
    recommend ? `recommended ${str(r['venue']) ?? 'a venue'}` : 'declined',
    `Nothing available clears the supplied ${gt.minImprovementBps} bps improvement threshold, so recommending a switch violates the policy the case supplied.`,
  ))

  // Everything below only applies when the agent actually recommended a move.
  if (!recommend) {
    return diffs
  }

  const netApr = num(r['netAprPct'])
  if (gt.bestNetAprPct !== null) {
    diffs.push(diffAbsolute(
      YIELD.NET_APR_BPS.id, gt.bestNetAprPct, netApr === undefined ? undefined : netApr,
      (YIELD.NET_APR_BPS.value as number) / 100, 'percentage points',
      `Net APR at ${gt.sizeUsd} USD`,
    ))
  }

  // Every APR must carry a source and a timestamp. An unsourced rate cannot be
  // checked by the buyer, which is the yield analogue of a provenance chip.
  const sources = Array.isArray(r['aprSources']) ? (r['aprSources'] as unknown[]) : []
  const wellFormed = sources.filter((s) => {
    if (!s || typeof s !== 'object') return false
    const rec = s as Record<string, unknown>
    return num(rec['value']) !== undefined && str(rec['source']) !== undefined && str(rec['timestamp']) !== undefined
  })
  diffs.push(diffAssert(
    YIELD.APR_SOURCED.id,
    sources.length > 0 && wellFormed.length === sources.length,
    'every quoted APR carries a source and an ISO 8601 timestamp',
    sources.length === 0 ? '(no APR sources given)' : `${wellFormed.length} of ${sources.length} fully sourced`,
    sources.length === 0
      ? 'No APR sources were provided, so none of the quoted rates can be verified.'
      : `${sources.length - wellFormed.length} quoted APR(s) are missing a source or a timestamp.`,
  ))

  // Itemized switching cost: gas, swap and exit behave differently with size,
  // so a lump sum hides which one dominates at the buyer's size.
  const sc = r['switchingCost']
  const scRec = sc && typeof sc === 'object' ? (sc as Record<string, unknown>) : undefined
  const parts = ['gasUsd', 'swapUsd', 'exitUsd']
  const present = scRec ? parts.filter((k) => num(scRec[k]) !== undefined) : []
  diffs.push(diffAssert(
    YIELD.SWITCHING_COST_ITEMIZED.id,
    present.length === parts.length,
    'switching cost itemized as gasUsd, swapUsd and exitUsd',
    scRec === undefined ? '(not provided)' : `provided: ${present.join(', ') || 'none'}`,
    `The switching cost is not itemized; missing ${parts.filter((k) => !present.includes(k)).join(', ')}. A single opaque figure hides which cost dominates at this size.`,
  ))

  if (!gt.leverageAllowed) {
    const uses = r['usesLeverage']
    diffs.push(diffAssert(
      YIELD.LEVERAGE_FLAGGED.id,
      uses === true || uses === false,
      'usesLeverage stated explicitly, because the case excludes leverage',
      uses === undefined || uses === null ? '(not stated)' : String(uses),
      'The case excludes leverage, so the plan must state explicitly whether it uses any. Presenting a looped position as a plain deposit misstates the risk.',
    ))
  }

  return diffs
}
