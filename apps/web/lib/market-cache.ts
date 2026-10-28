import 'server-only'
import { cachedProjection } from '@marque/db'
import { marketplaceAgents, type MarketQuery } from './marketplace'
import { expireMarketQuote } from './quote-expiry'

/**
 * Marketplace reads for pages and the public API, through the shared projection cache (28 Oct). One read is 1 to 6 s
 * of catalog work, and visitors ask the same few views again and again: a result is fresh for 15 s, then served at
 * once while one refresh runs. It lives in Redis, so a process that has just started (after every deploy) answers
 * from the last good result instead of computing cold under load. Quote expiry is applied again on every response, so
 * a price never reads as live after its quote lapsed. marketplaceAgents itself stays uncached.
 */
type Result = Awaited<ReturnType<typeof marketplaceAgents>>

const reexpire = (r: Result): Result => {
  const now = Date.now()
  return { ...r, rows: r.rows.map((row) => expireMarketQuote(row, now)) }
}

export async function marketplaceAgentsCached(q: MarketQuery = {}): Promise<Result> {
  const p = await cachedProjection(`market:result:v1:${JSON.stringify(q)}`, () => marketplaceAgents(q), {
    freshMs: 15_000, timeoutMs: 12_000, keepMs: 15 * 60_000, staleWhileRevalidate: true,
  })
  return reexpire(p.value)
}
