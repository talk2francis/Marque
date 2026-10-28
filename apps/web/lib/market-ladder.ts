import 'server-only'
import { cachedProjection } from '@marque/db'
import { funnel } from '@marque/registry'
import { chainOf } from '@marque/commerce'
import { marketplaceAgents, type MarketLadder, type MarketQuery } from './marketplace'

/**
 * The evidence ladder, from the shared projection cache (28 Oct). Counting the whole listed set is a full catalog read
 * (seconds), and the counts move on the probe and quote workers' pace, not per visit: a value is fresh for a minute,
 * then served at once while one refresh runs. It lives in Redis, so a freshly started process answers at once.
 */
export type LadderQuery = Pick<MarketQuery, 'lane' | 'category' | 'search' | 'liveNow' | 'warranted' | 'tested' | 'thirdPartyOnly' | 'firstPartyOnly' | 'hasPrice' | 'iface' | 'token' | 'maxPrice' | 'minRating'>
export interface LadderValue extends MarketLadder { registered: number | null; measuredAt: string }

async function compute(q: LadderQuery): Promise<LadderValue> {
  const r = await marketplaceAgents({ ...q, tab: null, limit: 1 })
  const chains = q.lane === 'all' ? [56, 97] as const : [chainOf(q.lane ?? 'mainnet')]
  const counts = await Promise.all(chains.map((c) => funnel(c).then((rows) => rows.find((x) => x.stage === 'registered_bsc')?.count ?? null).catch(() => null)))
  const registered = counts.every((x) => x !== null) ? (counts as number[]).reduce((a, b) => a + b, 0) : null
  if (!r.ladder) throw new Error('ladder unavailable')
  return { ...r.ladder, registered, measuredAt: r.generatedAt }
}

export async function marketLadder(q: LadderQuery): Promise<LadderValue> {
  const p = await cachedProjection(`market:ladder:v1:${JSON.stringify(q)}`, () => compute(q), {
    freshMs: 60_000, timeoutMs: 20_000, keepMs: 60 * 60_000, staleWhileRevalidate: true,
  })
  return p.value
}
