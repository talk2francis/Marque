import 'server-only'
import { funnel } from '@marque/registry'
import { chainOf } from '@marque/commerce'
import { marketplaceAgents, type MarketLadder, type MarketQuery } from './marketplace'

/**
 * The evidence ladder, served from a short shared memo (28 Oct). Counting the whole listed set is a full catalog read
 * (seconds), and the counts move on the probe and quote workers' pace, not per visit: a value is fresh for a minute,
 * served at once for ten while one refresh runs, and computed once per view at a time.
 */
export type LadderQuery = Pick<MarketQuery, 'lane' | 'category' | 'search' | 'liveNow' | 'warranted' | 'tested' | 'thirdPartyOnly' | 'firstPartyOnly' | 'hasPrice' | 'iface' | 'token' | 'maxPrice' | 'minRating'>
export interface LadderValue extends MarketLadder { registered: number | null; measuredAt: string }

const FRESH_MS = 60_000
const KEEP_MS = 10 * 60_000
const MAX_KEYS = 200
const memo = new Map<string, { at: number; value: LadderValue }>()
const inflight = new Map<string, Promise<LadderValue>>()

async function compute(q: LadderQuery): Promise<LadderValue> {
  const r = await marketplaceAgents({ ...q, tab: null, limit: 1 })
  const chains = q.lane === 'all' ? [56, 97] as const : [chainOf(q.lane ?? 'mainnet')]
  const counts = await Promise.all(chains.map((c) => funnel(c).then((rows) => rows.find((x) => x.stage === 'registered_bsc')?.count ?? null).catch(() => null)))
  const registered = counts.every((x) => x !== null) ? (counts as number[]).reduce((a, b) => a + b, 0) : null
  if (!r.ladder) throw new Error('ladder unavailable')
  return { ...r.ladder, registered, measuredAt: r.generatedAt }
}

export async function marketLadder(q: LadderQuery): Promise<LadderValue> {
  const key = JSON.stringify(q)
  const hit = memo.get(key)
  const age = hit ? Date.now() - hit.at : Infinity
  if (hit && age < FRESH_MS) return hit.value
  let run = inflight.get(key)
  if (!run) {
    run = compute(q).then((value) => {
      if (memo.size >= MAX_KEYS && !memo.has(key)) memo.delete(memo.keys().next().value!)
      memo.set(key, { at: Date.now(), value })
      return value
    }).finally(() => { inflight.delete(key) })
    inflight.set(key, run)
    if (hit) run.catch(() => undefined)
  }
  // A recent value answers at once while the refresh runs; only a first read waits.
  return hit && age < KEEP_MS ? hit.value : run
}
