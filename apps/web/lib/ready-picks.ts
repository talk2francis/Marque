import type { MarketRow } from '../app/register/market-model'

const ORDER = ['yield', 'grid', 'rebalancing', 'health_factor', 'security', 'other']
const cat = (r: Pick<MarketRow, 'category'>) => (r.category && r.category !== 'unclassified' ? r.category : 'other')

/**
 * Home "Ready to hire now" (SPEC-ADOPTION 1.1, D1): six hireable agents, outside agents
 * first, at most two Marque reference agents, categories mixed. Pure, so the server render
 * and the browser re-read choose identically. Input order is the marketplace's best-first.
 */
export function pickReady<T extends Pick<MarketRow, 'isReference' | 'category'>>(rows: readonly T[], size = 6, maxReference = 2): T[] {
  // The home shelf shows the four jobs (and security). Unclassified agents appear only when
  // fewer than three classified agents are hireable.
  const classified = rows.filter((r) => cat(r) !== 'other')
  const pool = classified.length >= 3 ? classified : rows
  const outside = pool.filter((r) => !r.isReference)
  const reference = pool.filter((r) => r.isReference)
  const picks: T[] = []
  const take = (r: T | undefined) => { if (r && !picks.includes(r) && picks.length < size) picks.push(r) }
  const outsideSlots = size - Math.min(maxReference, reference.length)
  // One outside agent per category, best first, up to the outside slots.
  for (const c of ORDER) if (picks.length < outsideSlots) take(outside.find((r) => cat(r) === c))
  for (const r of outside) if (picks.length < outsideSlots) take(r)
  // Reference agents next, categories not yet shown first, at most maxReference.
  const refs = [...reference.filter((x) => !picks.some((p) => cat(p) === cat(x))), ...reference]
  for (const r of refs) if (picks.filter((p) => p.isReference).length < maxReference) take(r)
  // Any slot left goes to the next outside agent.
  for (const r of outside) take(r)
  return picks
}

/** Marque's six reference agents in their canonical order (rebalancing, grid, yield, health factor, security, realised yield). */
const SHOWCASE = ['bound', 'lattice', 'sluicegate', 'keel', 'redcell', 'tidemark']

/**
 * Home "Ready to hire now" since 25 Oct (owner direction): Marque's own six reference agents, each with its live price.
 * A reference agent without a current quote this minute gives its slot to the best outside agent, so the shelf never
 * shows a lapsed price as current. Every card carries the Marque reference mark (invariant 17).
 */
export function pickShowcase<T extends Pick<MarketRow, 'isReference' | 'category' | 'name'>>(rows: readonly T[], size = 6): T[] {
  const ref = (slug: string) => rows.find((r) => r.isReference && r.name.toLowerCase() === slug)
  const picks = SHOWCASE.map(ref).filter((r): r is T => Boolean(r))
  for (const r of pickReady(rows.filter((x) => !x.isReference), size)) if (picks.length < size) picks.push(r)
  return picks.slice(0, size)
}
