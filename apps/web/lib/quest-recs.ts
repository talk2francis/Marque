import 'server-only'
import { cachedProjection } from '@marque/db'
import { agentRatings, campaignChainId, formatAmount } from '@marque/commerce'
import { marketplaceAgents, type MarketRow } from './marketplace'

/**
 * The agent /quest recommends in each category (DESIGN-SYSTEM.md 8.2): the best
 * agent a wallet can hire right now on the campaign network, ranked by Warranted,
 * then verified-buyer rating, then jobs delivered, then price. Every field comes
 * from the marketplace projection or the ratings table; nothing is set by hand.
 */
export const QUEST_ORDER = ['yield', 'grid', 'rebalancing', 'health_factor'] as const
export type QuestCat = (typeof QUEST_ORDER)[number]

export interface QuestRec {
  agentKey: string
  name: string
  firstParty: boolean
  priceLabel: string | null
  priceRaw: string | null
  token: { address: string; symbol: string; decimals: number } | null
  chainId: number | null
  warranted: { testId: string | null; date: string | null } | null
  rating: { count: number; averageStars: number | null }
  deliveredJobs: number
}

export interface QuestCategoryRecs {
  category: QuestCat
  hireable: number
  best: QuestRec | null
  others: QuestRec[]
}

async function recs(): Promise<QuestCategoryRecs[]> {
  const chain = campaignChainId()
  return Promise.all(QUEST_ORDER.map(async (category) => {
    const { rows } = await marketplaceAgents({ category, hireableOnly: true, limit: 40 })
    const live = rows.filter((r) => r.commerce.state === 'hireable' && r.commerce.chainId === chain && r.commerce.priceRaw && r.commerce.token)
    const rated = await Promise.all(live.map(async (r): Promise<QuestRec> => {
      const rating = r.tokenId && r.commerce.provider
        ? await agentRatings(chain, r.tokenId, r.commerce.provider).then((x) => x.verifiedBuyers).catch(() => ({ count: 0, averageStars: null }))
        : { count: 0, averageStars: null }
      return toRec(r, rating)
    }))
    rated.sort((a, b) =>
      Number(Boolean(b.warranted)) - Number(Boolean(a.warranted))
      || (b.rating.averageStars ?? 0) - (a.rating.averageStars ?? 0)
      || b.deliveredJobs - a.deliveredJobs
      || Number(BigInt(a.priceRaw ?? '0') - BigInt(b.priceRaw ?? '0')))
    return { category, hireable: rated.length, best: rated[0] ?? null, others: rated.slice(1, 4) }
  }))
}

function toRec(r: MarketRow, rating: { count: number; averageStars: number | null }): QuestRec {
  const t = r.commerce.token
  return {
    agentKey: r.agentId,
    name: r.name,
    firstParty: r.isReference,
    priceLabel: t && r.commerce.priceRaw ? `${formatAmount(BigInt(r.commerce.priceRaw), t.decimals)} ${t.symbol}` : r.price,
    priceRaw: r.commerce.priceRaw,
    token: t,
    chainId: r.commerce.chainId,
    warranted: r.warrant.status === 'warranted' ? { testId: r.warrant.testId, date: r.warrant.date } : null,
    rating,
    deliveredJobs: r.commerce.deliveredJobs,
  }
}

/** Cached for a minute: quotes refresh on the probe's schedule, not per page view. */
export async function questRecommendations(): Promise<{ at: string; categories: QuestCategoryRecs[] } | null> {
  try {
    const p = await cachedProjection('quest:recs:v1', async () => ({ at: new Date().toISOString(), categories: await recs() }), { freshMs: 60_000, timeoutMs: 20_000, staleWhileRevalidate: true })
    return p.value
  } catch {
    return null
  }
}
