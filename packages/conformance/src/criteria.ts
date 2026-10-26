import { GRID, HF, YIELD } from './tolerances.js'

/**
 * Acceptance criteria a buyer proposes with a hire, in words a buyer can read, derived from the Standard's assertions
 * and the Result Lens checks that already exist. Every tolerance comes from tolerances.ts; nothing here is a new number.
 *
 * Each criterion names the Result Lens check that decides it (`check`: a lens check key, or a key prefix ending in
 * "-" for per-position checks). The text goes into the negotiate request's `terms.success_criteria`; a seller on the
 * BNB Agent Studio SDK returns it inside the terms it signs, so it reaches the ERC-8183 job description on chain.
 */
export interface Criterion { id: string; text: string; check: string }

const HF_TOL = HF.HEALTH_FACTOR.value!
const REPAY_TOL = HF.REPAY_AMOUNT.value!
const LIQ_PCT = HF.LIQUIDATION_PRICE_PCT.value!
const APR_BPS = YIELD.NET_APR_BPS.value!
const SPACING_PCT = GRID.SPACING_PCT.value!
const ALLOC_PCT = GRID.ALLOCATION_OVER_CAPITAL.value!

export const CRITERIA: Readonly<Record<string, readonly Criterion[]>> = {
  health_factor: [
    { id: 'hf', check: 'hf', text: `Health factor within ${HF_TOL} of Venus at the answer's block` },
    { id: 'repay', check: 'repay', text: `The repay amount brings the health factor to the target within ${REPAY_TOL}` },
    { id: 'liq', check: 'liq', text: `Liquidation price within ${LIQ_PCT} percent of Venus prices at the answer's block` },
  ],
  yield: [
    { id: 'net', check: 'net', text: 'Net APR is not above gross APR' },
    { id: 'sources', check: 'sources', text: 'Every APR names its source' },
    { id: 'apr', check: 'apr', text: `Venus supply APR within ${APR_BPS} bps of Venus at the answer's block` },
  ],
  rebalancing: [
    { id: 'tick', check: 'tick', text: "Current tick matches the pool exactly at the answer's block" },
    { id: 'spacing', check: 'spacing-', text: "Proposed ticks are multiples of the pool's tick spacing" },
    { id: 'inrange', check: 'inrange-', text: "In-range status matches the pool's current tick" },
    { id: 'covers', check: 'covers-', text: 'The proposed range covers the current price' },
  ],
  grid: [
    { id: 'spacing', check: 'spacing', text: `Level spacing is even within ${SPACING_PCT} percent` },
    { id: 'bounds', check: 'bounds', text: 'Every level sits inside the stated bounds' },
    { id: 'alloc', check: 'alloc', text: `Allocations fit the capital (at most ${ALLOC_PCT} percent over)` },
    { id: 'stop', check: 'stop', text: 'No level at or below the stop' },
  ],
}

export function criteriaFor(category: string | null | undefined): readonly Criterion[] {
  return (category && CRITERIA[category]) || []
}

/** The criterion a stored text names, in any category (texts are unique across categories). */
export function criterionByText(text: string): (Criterion & { category: string }) | null {
  for (const [category, list] of Object.entries(CRITERIA)) {
    const c = list.find((x) => x.text === text)
    if (c) return { ...c, category }
  }
  return null
}

export type CriterionState = 'met' | 'not_met' | 'unchecked'
export interface LensLikeCheck { key: string; state: string; agent: string | null; marque: string | null }
export interface CriterionResult { id: string; text: string; state: CriterionState; agent: string | null; marque: string | null; checks: number }

/**
 * Evaluate criteria against Result Lens checks. A criterion is met when every check it names holds or matches, not met
 * when any of them differs or fails, and unchecked when no decided check exists for it (a read failed, or the answer
 * lacked the input). Unchecked is never counted as met.
 */
export function evaluateCriteria(criteria: readonly Criterion[], checks: readonly LensLikeCheck[]): CriterionResult[] {
  return criteria.map((c) => {
    const mine = checks.filter((k) => (c.check.endsWith('-') ? k.key.startsWith(c.check) : k.key === c.check))
    const decided = mine.filter((k) => ['match', 'holds', 'differs', 'fails'].includes(k.state))
    const failed = decided.find((k) => k.state === 'differs' || k.state === 'fails')
    const shown = failed ?? decided[0] ?? mine[0] ?? null
    return {
      id: c.id, text: c.text,
      state: !decided.length ? 'unchecked' : failed ? 'not_met' : 'met',
      agent: shown?.agent ?? null, marque: shown?.marque ?? null, checks: decided.length,
    }
  })
}

/**
 * The reason a buyer's dispute carries on chain: appended to the dispute call's calldata (the policy reads only the job
 * id; the bytes after it stay in the transaction for anyone to read). Plain UTF-8 after a fixed marker.
 */
export const REASON_MARKER = 'marque-reason:v1:'
export const MAX_REASON_BYTES = 600

export function rejectReason(jobKey: string, failed: readonly CriterionResult[], block: string | null): string {
  const lines = failed.map((r) => `${r.text}: agent ${r.agent ?? 'gave none'}, chain ${r.marque ?? 'not read'}`)
  const text = `Job ${jobKey}${block ? ` at block ${block}` : ''}. Not met: ${lines.join('; ')}.`
  return text.length > MAX_REASON_BYTES - REASON_MARKER.length ? `${text.slice(0, MAX_REASON_BYTES - REASON_MARKER.length - 1)}…` : text
}

export function encodeReason(reason: string): `0x${string}` {
  const bytes = new TextEncoder().encode(`${REASON_MARKER}${reason}`)
  return `0x${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

/** Read the reason back from a dispute transaction's input: selector (4) + job id (32), then the marker. */
export function decodeReason(input: string): string | null {
  const hex = input.startsWith('0x') ? input.slice(2) : input
  if (hex.length <= 72) return null
  const tail = hex.slice(72)
  if (tail.length % 2) return null
  const bytes = new Uint8Array(tail.match(/../g)!.map((h) => parseInt(h, 16)))
  const s = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  return s.startsWith(REASON_MARKER) ? s.slice(REASON_MARKER.length) : null
}
