import { centeredRange, priceAt, type GridPlan } from './charters-builder-v2'
/** A geometric threshold rehearsal, not a fill, fee, return or execution forecast. */
export function gridPath(plan: GridPlan, start: number, progress: number, mode: 'dip' | 'fall' | 'rise') {
  const low = plan.prices[0]!, high = plan.prices[plan.slots]!
  const target = mode === 'rise' ? high : low
  const f = Math.min(1, Math.max(0, progress))
  const price = mode === 'dip' && f > 0.5 ? low + (high - low) * (f - 0.5) * 2 : start + (target - start) * (mode === 'dip' ? f * 2 : f)
  const reached = plan.prices.slice(0, plan.slots).map((buy, i) => ({ level: i + 1, buy, sell: plan.prices[i + 1]!, buyReached: Math.min(start, price, mode === 'dip' && f >= 0.5 ? low : start) <= buy, sellReached: mode === 'dip' && f > 0.5 && price >= plan.prices[i + 1]! }))
  return { price, reached }
}
/** Same boundary and buffer arithmetic as RangeKeeper.preview, assuming spot equals the scenario average. */
export function rangeDrift(tick: number, lower: number, upper: number, buffer: number, spacing: number) {
  const out = tick < lower - buffer || tick >= upper + buffer
  return { out, next: centeredRange(tick, upper - lower, spacing) }
}
export const scenarioPrice = (tick: number, baseIs0: boolean) => priceAt(baseIs0 ? tick : -tick)
