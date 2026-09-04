import type { PublicClient } from 'viem'
import { spotReader } from '@marque/positions'
import { GRID } from '../tolerances.js'
import { diffAssert, num, str, type FieldDiff, type TestCase } from '../types.js'

/**
 * MCS-GRID-1 — Grid Trading.
 *
 * Every check is arithmetic against constraints the case supplies: bounds,
 * capital, level count and a stop. Nothing here grades whether the grid was a
 * good idea.
 *
 * DELIBERATELY NOT CHECKED: expected number of fills at a stated volatility.
 * That is a model output wearing the clothes of a fact — two honest agents can
 * differ and both be right — and grading it would make the standard quietly
 * non-deterministic. It moves to the Ledger.
 */

export interface GridPolicy {
  pair: string
  lowerBound: number
  upperBound: number
  capitalUsd: number
  levels: number
  /** Levels at or below this price are not permitted. */
  stopPrice: number
  /** Fee charged per trade, in basis points, for the fee-drag disclosure. */
  feeBps: number
  statement: string
}

export interface GridGroundTruth {
  pair: string
  lowerBound: number
  upperBound: number
  capitalUsd: number
  levels: number
  stopPrice: number
  feeBps: number
  /** Spot price at the pinned block, when we could read one. */
  spotPriceUsd: number | null
  /** Minimum honest fee drag: n levels means n round-trips. */
  minFeeDragPct: number
}

export async function gridGroundTruth(
  testCase: TestCase<GridPolicy>,
  opts: { client?: PublicClient } = {},
): Promise<GridGroundTruth> {
  const p = testCase.policy
  let spotPriceUsd: number | null = null

  // The spot price is contextual for the prompt, not a graded field: the grid
  // checks are all against the supplied bounds.
  const address = testCase.subject['address']
  if (address) {
    const read = await spotReader(address as `0x${string}`, {
      ...(opts.client ? { client: opts.client } : {}),
      blockNumber: testCase.blockNumber,
    })
    if (read.ok) {
      const base = p.pair.split('/')[0]
      spotPriceUsd = read.data.balances.find((b) => b.symbol === base)?.priceUsd?.value ?? null
    }
  }

  return {
    pair: p.pair,
    lowerBound: p.lowerBound,
    upperBound: p.upperBound,
    capitalUsd: p.capitalUsd,
    levels: p.levels,
    stopPrice: p.stopPrice,
    feeBps: p.feeBps,
    spotPriceUsd,
    // n levels implies n round-trips, each costing the fee twice.
    minFeeDragPct: (p.levels * p.feeBps * 2) / 100,
  }
}

export function gridPrompt(testCase: TestCase<GridPolicy>, gt: GridGroundTruth): string {
  return [
    `Plan a grid for ${gt.pair} on BNB Smart Chain (chain 56).`,
    ``,
    `Block: ${testCase.blockNumber.toString()}`,
    `POLICY YOU MUST FOLLOW: ${testCase.policy.statement}`,
    ``,
    `Constraints:`,
    `  lower bound      ${gt.lowerBound}`,
    `  upper bound      ${gt.upperBound}`,
    `  capital          ${gt.capitalUsd} USD`,
    `  levels           ${gt.levels}`,
    `  stop price       ${gt.stopPrice}  (no level may sit at or below this)`,
    `  fee per trade    ${gt.feeBps} bps`,
    ``,
    `Return strict JSON with exactly these fields:`,
    `{`,
    `  "spacingType": "arithmetic" | "geometric",`,
    `  "levels": [ { "price": <number>, "allocationUsd": <number> }, ... ],`,
    `  "feeDragPct": <number, total fee drag across the full grid as a percent of capital>`,
    `}`,
    ``,
    `No prose. JSON only.`,
  ].join('\n')
}

interface Level { price: number; allocationUsd: number }

function parseLevels(raw: unknown): Level[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: Level[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const price = num(rec['price'])
    const alloc = num(rec['allocationUsd']) ?? num(rec['allocation']) ?? 0
    if (price === undefined) continue
    out.push({ price, allocationUsd: alloc })
  }
  return out.length > 0 ? out : undefined
}

export function gradeGrid(gt: GridGroundTruth, raw: unknown): FieldDiff[] {
  const r = (raw ?? {}) as Record<string, unknown>
  const diffs: FieldDiff[] = []

  const levels = parseLevels(r['levels'])
  const spacingType = str(r['spacingType'])?.toLowerCase()

  if (!levels) {
    diffs.push({
      field: GRID.SPACING_PCT.id, pass: false, expected: `${gt.levels} levels`,
      actual: '(not provided)', tolerance: `±${GRID.SPACING_PCT.value}%`, missing: true,
      detail: 'The response contained no usable level list.',
    })
    return diffs
  }

  const sorted = [...levels].sort((a, b) => a.price - b.price)

  // Spacing must match the type the agent itself declared. Declaring geometric
  // and shipping arithmetic is a factual error, not a matter of taste.
  if (spacingType !== 'arithmetic' && spacingType !== 'geometric') {
    diffs.push({
      field: GRID.SPACING_PCT.id, pass: false, expected: '"arithmetic" or "geometric"',
      actual: spacingType ?? '(not provided)', tolerance: 'must be declared', missing: spacingType === undefined,
      detail: 'The spacing type was not declared, so the level spacing cannot be verified against it.',
    })
  } else if (sorted.length >= 3) {
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1] as Level
      const cur = sorted[i] as Level
      gaps.push(spacingType === 'arithmetic' ? cur.price - prev.price : cur.price / prev.price)
    }
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length
    const worst = Math.max(...gaps.map((g) => (mean === 0 ? 0 : Math.abs((g - mean) / mean) * 100)))
    diffs.push(diffAssert(
      GRID.SPACING_PCT.id, worst <= (GRID.SPACING_PCT.value as number),
      `levels evenly spaced (${spacingType}) within ${GRID.SPACING_PCT.value}%`,
      `worst deviation ${worst.toFixed(3)}%`,
      `Levels are declared ${spacingType} but the spacing varies by ${worst.toFixed(3)}%, above the ${GRID.SPACING_PCT.value}% tolerance.`,
    ))
  }

  const total = levels.reduce((s, l) => s + l.allocationUsd, 0)
  const overBy = ((total - gt.capitalUsd) / gt.capitalUsd) * 100
  diffs.push(diffAssert(
    GRID.ALLOCATION_OVER_CAPITAL.id, overBy <= (GRID.ALLOCATION_OVER_CAPITAL.value as number),
    `allocations sum to at most ${gt.capitalUsd} USD`,
    `${total.toFixed(2)} USD`,
    `Allocations sum to ${total.toFixed(2)} USD against ${gt.capitalUsd} USD of capital — ${overBy.toFixed(2)}% over. The plan cannot be funded.`,
  ))

  const outside = sorted.filter((l) => l.price < gt.lowerBound || l.price > gt.upperBound)
  diffs.push(diffAssert(
    GRID.LEVELS_IN_BOUNDS.id, outside.length === 0,
    `all levels within [${gt.lowerBound}, ${gt.upperBound}]`,
    outside.length === 0 ? 'all within bounds' : `${outside.length} outside: ${outside.slice(0, 3).map((l) => l.price).join(', ')}`,
    `${outside.length} level(s) fall outside the bounds supplied by the test case.`,
  ))

  const belowStop = sorted.filter((l) => l.price <= gt.stopPrice)
  diffs.push(diffAssert(
    GRID.NONE_BELOW_STOP.id, belowStop.length === 0,
    `no level at or below the stop (${gt.stopPrice})`,
    belowStop.length === 0 ? 'none' : `${belowStop.length} at or below: ${belowStop.slice(0, 3).map((l) => l.price).join(', ')}`,
    `${belowStop.length} level(s) sit at or below the stop of ${gt.stopPrice} and would be filled and then immediately stopped out.`,
  ));

  /**
   * Fee drag must be disclosed. An honest grid plan states that n levels means
   * n round-trips of fees; omitting it overstates the plan's return in a way
   * the buyer cannot see. We check disclosure and plausibility, never whether
   * the drag is acceptable — that is the buyer's call.
   */
  {
    const drag = num(r['feeDragPct'])
    const disclosed = drag !== undefined && drag > 0
    const plausible = disclosed && drag >= gt.minFeeDragPct * 0.5
    diffs.push(diffAssert(
      GRID.FEE_DRAG_DISCLOSED.id, disclosed && plausible,
      `fee drag disclosed, at least ~${gt.minFeeDragPct.toFixed(3)}% for ${gt.levels} levels at ${gt.feeBps}bps`,
      drag === undefined ? '(not disclosed)' : `${drag}%`,
      !disclosed
        ? `Fee drag was not disclosed. ${gt.levels} levels implies ${gt.levels} round-trips at ${gt.feeBps}bps each way, which is not free and must be stated.`
        : `Disclosed fee drag of ${drag}% is implausibly low: ${gt.levels} round-trips at ${gt.feeBps}bps costs at least ~${gt.minFeeDragPct.toFixed(3)}% of capital.`,
    ))
  }

  return diffs
}
