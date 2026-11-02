import 'server-only'
import { marketplaceAgentsCached } from './market-cache'
import type { MarketRow } from './marketplace'
import { isChecked, isHireable, isPulled, isWarrantedNow, hasDelivered } from './standing'

/**
 * One count of the supply for every surface (V4.4, 2 Nov): the home hero and record, the category tiles, the marketplace
 * network chips, the coverage and funnel APIs, the lane switch, /why, llms.txt and the home JSON-LD all read this, so no
 * two pages can disagree.
 *
 * Over the agents listed on one network with a live price now (the marketplace's Ready view, pulled agents included):
 * - priced: a live signed price now, payable into the ERC-8183 escrow to the agent's own wallet
 * - hireable: priced and not pulled. Only safety takes an agent out of this count.
 * - pulled: priced, but a recent wrong answer or a paid job left undelivered (standing.ts)
 * - checked: hireable, and an answer agreed with the chain in the last 30 days
 * - warranted: hireable, and passed its category's published test (the Standard) in the last 14 days
 * - delivered: hireable, and has delivered at least one paid job
 * Networks are never added together.
 */
export interface SupplyCount { priced: number; hireable: number; pulled: number; checked: number; warranted: number; delivered: number }
export interface SupplyNow extends SupplyCount {
  chainId: 56 | 97
  /** Per category, by the agent's current category; agents with none count under 'unclassified'. */
  byCategory: Record<string, SupplyCount & { operators: number }>
  measuredAt: string
}

export const SUPPLY_DEFINITIONS = {
  priced: 'listed with a live signed price now, payable into BNB Chain\'s ERC-8183 escrow to the agent\'s own wallet',
  hireable: 'priced and not pulled: a buyer\'s wallet can hire it through escrow right now',
  pulled: 'priced, but taken out of the count for safety: a paid job left undelivered, or a chain fact stated wrongly, in the last 14 days',
  checked: 'hireable, and an answer it gave agreed with BNB Chain in the last 30 days (a paid job or Marque\'s daily check call)',
  warranted: 'hireable, and passed its category\'s published Marque test in the last 14 days',
  delivered: 'hireable, and has delivered at least one paid job',
} as const

const empty = (): SupplyCount & { operators: number } => ({ priced: 0, hireable: 0, pulled: 0, checked: 0, warranted: 0, delivered: 0, operators: 0 })

/** Pure count over Ready rows (with their standing), so a test can assert that every surface derives from it. */
export function countSupply(rows: readonly MarketRow[], chainId: 56 | 97, measuredAt: string): SupplyNow {
  const priced = rows.filter((r) => r.commerce.state === 'hireable' || r.commerce.state === 'settleable')
  const out: SupplyNow = { chainId, priced: 0, hireable: 0, pulled: 0, checked: 0, warranted: 0, delivered: 0, byCategory: {}, measuredAt }
  const operators = new Map<string, Set<string>>()
  for (const r of priced) {
    const cat = r.category ?? 'unclassified'
    const c = (out.byCategory[cat] ??= empty())
    const bump = (k: keyof SupplyCount) => { out[k]++; c[k]++ }
    bump('priced')
    if (isPulled(r)) { bump('pulled'); continue }
    if (!isHireable(r)) continue
    bump('hireable')
    if (isChecked(r)) bump('checked')
    if (isWarrantedNow(r)) bump('warranted')
    if (hasDelivered(r)) bump('delivered')
    const set = operators.get(cat) ?? new Set<string>()
    set.add((r.owner ?? r.agentId).toLowerCase())
    operators.set(cat, set)
  }
  for (const [cat, set] of operators) out.byCategory[cat]!.operators = set.size
  return out
}

export async function supplyNow(chainId: 56 | 97): Promise<SupplyNow> {
  const r = await marketplaceAgentsCached({ tab: 'ready', lane: chainId === 97 ? 'practice' : 'mainnet', limit: 300 })
  return countSupply(r.rows, chainId, r.quoteObservedAt ?? r.generatedAt)
}
