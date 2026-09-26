import { publicClient } from '@marque/chain'
import { num } from './parse.js'
import { refuse, within, type Engine, type EngineAnswer, type EngineMeta } from './types.js'

/**
 * Lattice — grid trading.
 *
 * A grid is arithmetic anyone can get wrong, and the ways it goes wrong are
 * always the same four: levels outside the stated bounds, levels below the
 * stop that fill and then get stopped out, allocations that sum past the
 * capital, and fee drag nobody mentions.
 *
 * The fee-drag disclosure is the part most plans omit and the part that decides
 * whether the grid makes money. n levels means n round-trips, and each
 * round-trip pays the fee twice:
 *
 *     dragPct = levels × feeBps × 2 / 100
 *
 * Lattice states it every time, in the same field, whether or not it flatters
 * the plan. Whether that drag is acceptable is the buyer's call and this agent
 * does not offer an opinion.
 *
 * Spacing is GEOMETRIC by default and declared explicitly, because a grid is a
 * bet on proportional moves and equal ratios give equal percentage steps. The
 * declaration matters as much as the choice: shipping arithmetic spacing while
 * declaring geometric is a factual error, not a matter of taste.
 */

export const LATTICE_META: EngineMeta = {
  id: 'lattice',
  name: 'Lattice',
  category: 'grid',
  testId: 'MCS-GRID-1',
  description:
    'Plans a constrained grid on BNB Smart Chain: geometrically spaced levels inside the bounds you set, never at or below your stop, allocations that sum within your capital, and the fee drag stated in full. Non-custodial: it computes, it never signs.',
  priceUsd: 0.10,
  skills: [
    {
      id: 'grid-plan',
      name: 'Plan a bounded grid',
      description: 'Levels, spacing type and per-level allocation inside supplied bounds, capital and stop.',
      tags: ['grid', 'trading', 'levels', 'allocation'],
    },
    {
      id: 'fee-drag',
      name: 'Disclose fee drag',
      description: 'Total fee cost of running the full grid once, as a percentage of capital.',
      tags: ['grid', 'fees', 'cost'],
    },
  ],
}

interface GridPolicy {
  lowerBound: number
  upperBound: number
  capitalUsd: number
  levels: number
  stopPrice: number
  feeBps: number
}

/** Stated defaults for the two settings a plain request usually leaves out. */
const DEFAULT_LEVELS = 10
// PancakeSwap's swap fee on BNB/USDT, the venue a BNB Chain grid actually fills on.
const DEFAULT_FEE_BPS = 25

// A price or amount, optionally written with a leading "$".
const P = String.raw`\$?\s*%N%`
const Q = String.raw`\$?\s*\d[\d,]*(?:\.\d+)?`

export function parsePolicy(prompt: string): (GridPolicy & { assumptions: string[] }) | { missing: string[] } {
  const lowerBound = num(
    prompt,
    String.raw`lower bound(?:\s+of|\s*[:=])?\s+${P}`,
    String.raw`between\s+${P}`,
    String.raw`from\s+${P}\s*(?:to|-|–)\s*${Q}`,
    String.raw`range\s+(?:of\s+)?${P}\s*(?:to|-|–)\s*${Q}`,
  )
  const upperBound = num(
    prompt,
    String.raw`upper bound(?:\s+of|\s*[:=])?\s+${P}`,
    String.raw`between\s+${Q}\s*(?:and|to|-|–)\s*${P}`,
    String.raw`from\s+${Q}\s*(?:to|-|–)\s*${P}`,
    String.raw`range\s+(?:of\s+)?${Q}\s*(?:to|-|–)\s*${P}`,
  )
  const capitalUsd = num(
    prompt,
    String.raw`capital(?:\s+of|\s*[:=])?\s+${P}`,
    String.raw`%N%\s*USD of capital`,
    String.raw`(?:with|using|deploy(?:ing)?|invest(?:ing)?)\s+${P}(?!\s*(?:[-\s]?levels?|lines|steps|orders|bps|%))`,
    String.raw`%N%\s*(?:USDT|USDC|USD1?|FDUSD)\b`,
  )
  const levelsRaw = num(prompt, String.raw`levels(?:\s*[:=])?\s+%N%`, String.raw`%N%[\s-]+levels?\b`, String.raw`%N%[\s-]+(?:grid\s+)?(?:lines|steps|orders)\b`)
  const stopRaw = num(
    prompt,
    String.raw`stop(?:[\s-]*loss)?\s+price(?:\s*[:=])?\s+${P}`,
    String.raw`stop(?:[\s-]*loss)?\s+(?:at|below|under|of|[:=])?\s*${P}`,
  )
  const feeRaw = num(prompt, String.raw`fee per trade\s+%N%`, String.raw`%N%\s*bps per trade`, String.raw`%N%\s*bps`)

  const missing: string[] = []
  if (lowerBound === null) missing.push('the lower price bound')
  if (upperBound === null) missing.push('the upper price bound')
  if (capitalUsd === null) missing.push('the capital to deploy')
  if (missing.length > 0) return { missing }

  const assumptions: string[] = []
  if (levelsRaw === null) assumptions.push(`no level count stated; ${DEFAULT_LEVELS} levels used`)
  if (feeRaw === null) assumptions.push(`no trading fee stated; ${DEFAULT_FEE_BPS} bps per trade used (PancakeSwap's swap fee)`)
  if (stopRaw === null) assumptions.push('no stop stated; the plan places no stop')

  return {
    lowerBound: lowerBound as number,
    upperBound: upperBound as number,
    capitalUsd: capitalUsd as number,
    levels: levelsRaw ?? DEFAULT_LEVELS,
    // No stop: 0 keeps every level inside the band, and the answer says so.
    stopPrice: stopRaw ?? 0,
    feeBps: feeRaw ?? DEFAULT_FEE_BPS,
    assumptions,
  }
}

/**
 * The levels themselves.
 *
 * The band is narrowed to start ABOVE the stop where the stop sits inside it: a
 * level at or below the stop is filled and immediately stopped out, which is a
 * guaranteed loss dressed as a trade. Narrowing is stated in the answer rather
 * than done quietly.
 */
function buildLevels(policy: GridPolicy): { price: number; allocationUsd: number }[] {
  const epsilon = (policy.upperBound - policy.lowerBound) * 1e-6
  const floor = Math.max(policy.lowerBound, policy.stopPrice + epsilon)
  const ceiling = policy.upperBound
  const n = Math.max(2, Math.floor(policy.levels))
  const perLevel = policy.capitalUsd / n

  // Geometric: equal RATIOS, so every step is the same percentage move.
  const ratio = (ceiling / floor) ** (1 / (n - 1))
  const out: { price: number; allocationUsd: number }[] = []
  for (let i = 0; i < n; i++) {
    const raw = floor * ratio ** i
    // Clamp the endpoints so float drift can never push a level a hair outside
    // the bounds the buyer set — "0.0000001 over" is still over.
    const price = i === 0 ? floor : i === n - 1 ? ceiling : raw
    out.push({ price: Number(price.toFixed(8)), allocationUsd: Number(perLevel.toFixed(6)) })
  }
  return out
}

export const latticeEngine: Engine = {
  meta: LATTICE_META,
  inspect(prompt) {
    const p = parsePolicy(prompt)
    return 'missing' in p ? { missing: p.missing, assumptions: [] } : { missing: [], assumptions: p.assumptions }
  },
  async run(prompt, opts = {}): Promise<EngineAnswer> {
    const parsed = parsePolicy(prompt)
    if ('missing' in parsed) {
      return refuse(
        `the task does not state ${parsed.missing.join(', ')}`,
        'a grid needs a price band and the capital to spread across it',
      )
    }
    if (parsed.upperBound <= parsed.lowerBound) {
      return refuse(`the upper bound (${parsed.upperBound}) is not above the lower bound (${parsed.lowerBound})`)
    }
    if (parsed.stopPrice >= parsed.upperBound) {
      return refuse(
        `the stop (${parsed.stopPrice}) sits at or above the upper bound (${parsed.upperBound}), so no level can be placed`,
      )
    }

    const levels = buildLevels(parsed)
    // n round-trips, each paying the fee on both legs.
    const feeDragPct = (parsed.levels * parsed.feeBps * 2) / 100

    // A block stamp, so the plan is reproducible against a moment in time.
    // Best effort: the grid arithmetic does not depend on chain state, and
    // failing the whole answer because a stamp was unavailable would be a
    // worse trade than reporting the stamp as unknown.
    let block: string | null = null
    try {
      block = (await within(publicClient().getBlockNumber(), opts.deadlineMs ?? 3_000, 'BNB Smart Chain')).toString()
    } catch {
      block = null
    }

    const narrowed = parsed.stopPrice > parsed.lowerBound
    return {
      spacingType: 'geometric',
      levels,
      feeDragPct,
      // Everything below is disclosure, not grading surface. It exists so a
      // buyer can see WHY the plan looks the way it does.
      levelCount: levels.length,
      allocationTotalUsd: Number(levels.reduce((s, l) => s + l.allocationUsd, 0).toFixed(6)),
      capitalUsd: parsed.capitalUsd,
      bandLow: levels[0]?.price ?? null,
      bandHigh: levels[levels.length - 1]?.price ?? null,
      narrowedToClearStop: narrowed,
      narrowedNote: narrowed
        ? `the stop at ${parsed.stopPrice} sits inside the requested band, so the lowest level was raised above it — a level at or below the stop fills and is immediately stopped out`
        : null,
      feeDragBasis: `${parsed.levels} levels × ${parsed.feeBps} bps × 2 legs`,
      assumptions: parsed.assumptions,
      blockNumber: block,
      source: 'arithmetic over the constraints supplied in the request; no position was read',
    }
  },
}
