import 'server-only'
import { marketplaceAgents, type MarketQuery } from './marketplace'
import { expireMarketQuote } from './quote-expiry'

/**
 * Marketplace reads for pages and the public API, through a short shared memo (28 Oct). One read is 1 to 6 s of
 * catalog work, and visitors ask the same few views again and again: a result is fresh for 15 s and served at once for
 * a minute while one refresh runs, one computation per distinct view at a time. Quote expiry is applied again on every
 * response, so a price never reads as live after its quote lapsed. marketplaceAgents itself stays uncached.
 */
type Result = Awaited<ReturnType<typeof marketplaceAgents>>
const FRESH_MS = 15_000
const KEEP_MS = 60_000
const MAX_KEYS = 300
const memo = new Map<string, { at: number; value: Result }>()
const inflight = new Map<string, Promise<Result>>()

const reexpire = (r: Result): Result => {
  const now = Date.now()
  return { ...r, rows: r.rows.map((row) => expireMarketQuote(row, now)) }
}

export async function marketplaceAgentsCached(q: MarketQuery = {}): Promise<Result> {
  const key = JSON.stringify(q)
  const hit = memo.get(key)
  const age = hit ? Date.now() - hit.at : Infinity
  if (hit && age < FRESH_MS) return reexpire(hit.value)
  let run = inflight.get(key)
  if (!run) {
    run = marketplaceAgents(q).then((value) => {
      if (memo.size >= MAX_KEYS && !memo.has(key)) memo.delete(memo.keys().next().value!)
      memo.set(key, { at: Date.now(), value })
      return value
    }).finally(() => { inflight.delete(key) })
    inflight.set(key, run)
    if (hit) run.catch(() => undefined)
  }
  if (hit && age < KEEP_MS) return reexpire(hit.value)
  return reexpire(await run)
}
