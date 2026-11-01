import 'server-only'
import { marketplaceAgentsCached } from './market-cache'
import type { MarketRow } from './marketplace'

/**
 * One count of the supply for every surface (2 Nov): the home hero and record, the category tiles, the coverage and
 * funnel APIs, the lane switch, /why and llms.txt all read this, so no two pages can disagree.
 *
 * Over the agents listed on one network with a live price now (the marketplace's Ready view, failed agents included):
 * - priced: a live price now
 * - passed: priced, and the latest test in its category passed. This is what "hireable" means everywhere.
 * - failed: priced, and the latest test in its category failed
 * - notYetTested: priced, with no result yet, or no published test for its category
 * Networks are never added together.
 */
export interface SupplyCount { priced: number; passed: number; failed: number; notYetTested: number }
export interface SupplyNow extends SupplyCount {
  chainId: 56 | 97
  /** Per category, by the agent's current category; agents with none count under 'unclassified'. */
  byCategory: Record<string, SupplyCount & { passedOperators: number }>
  measuredAt: string
}

export const SUPPLY_DEFINITIONS = {
  priced: 'listed with a live price now',
  passed: 'priced, and its latest test in its category passed (what "hireable" means on Marque)',
  failed: 'priced, and its latest test in its category failed',
  notYetTested: 'priced, with no test result yet or no published test for its category',
} as const

const empty = (): SupplyCount & { passedOperators: number } => ({ priced: 0, passed: 0, failed: 0, notYetTested: 0, passedOperators: 0 })

/** Pure count over Ready rows, so a test can assert that every surface derives from it. */
export function countSupply(rows: readonly MarketRow[], chainId: 56 | 97, measuredAt: string): SupplyNow {
  const priced = rows.filter((r) => r.commerce.state === 'hireable' || r.commerce.state === 'settleable')
  const out: SupplyNow = { chainId, priced: 0, passed: 0, failed: 0, notYetTested: 0, byCategory: {}, measuredAt }
  const operators = new Map<string, Set<string>>()
  for (const r of priced) {
    const cat = r.category ?? 'unclassified'
    const c = (out.byCategory[cat] ??= empty())
    const key = r.warrant.status === 'warranted' ? 'passed' : r.warrant.status === 'failed' ? 'failed' : 'notYetTested'
    out.priced++; c.priced++
    out[key]++; c[key]++
    if (key === 'passed') {
      const set = operators.get(cat) ?? new Set<string>()
      set.add((r.owner ?? r.agentId).toLowerCase())
      operators.set(cat, set)
    }
  }
  for (const [cat, set] of operators) out.byCategory[cat]!.passedOperators = set.size
  return out
}

export async function supplyNow(chainId: 56 | 97): Promise<SupplyNow> {
  const r = await marketplaceAgentsCached({ tab: 'ready', lane: chainId === 97 ? 'practice' : 'mainnet', limit: 300 })
  return countSupply(r.rows, chainId, r.quoteObservedAt ?? r.generatedAt)
}
