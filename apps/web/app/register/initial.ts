import { marketplaceAgents } from '../../lib/marketplace'
import { DEFAULT_STATE, apiQuery } from './market-url'
import type { MarketRow } from './market-model'

/** The first page of the default view, rendered on the server so cards are in the first paint. */
export interface InitialMarket { key: string; agents: MarketRow[]; total: number | null; hasMore: boolean; generatedAt: string | null }

export async function initialMarket(category?: string): Promise<InitialMarket | null> {
  const state = { ...DEFAULT_STATE, category: category ?? null }
  try {
    const r = await marketplaceAgents({
      category: state.category, search: null, liveNow: false, warranted: false, thirdPartyOnly: false,
      hireableOnly: false, includeUnclassified: false, hasPrice: false, iface: null, tab: 'ready',
      firstPartyOnly: false, network: null, token: null, maxPrice: null, minRating: null, sort: 'best',
      limit: state.pageSize, offset: 0,
    })
    return {
      key: `${apiQuery(state)}|0|${state.pageSize}`,
      agents: r.rows as unknown as MarketRow[],
      total: r.total ?? null,
      hasMore: r.hasMore === true,
      generatedAt: r.generatedAt ?? null,
    }
  } catch { return null }
}
