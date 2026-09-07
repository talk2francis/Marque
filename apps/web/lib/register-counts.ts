import 'server-only'
import { sql } from 'drizzle-orm'
import { db, funnelSnapshot } from '@marque/db'

/**
 * Real population counts for the Register's status tabs (P10.5A item 1).
 *
 * The tab labels used to show `agents.length` capped at the query's `limit`, so
 * three tabs each read "(200)" — a page size printed as a total, on a product
 * that competes on data quality. These are `COUNT(*)` over the exact predicate
 * each tab filters by.
 *
 * The count joins the latest probe per agent over ~870k probe rows and takes a
 * couple of seconds, so it is memoised for five minutes and, when computed
 * fresh with no category filter, written to `funnel_snapshot` so the number is
 * durable and dated rather than recomputed on every page load.
 */

export interface RegisterCounts {
  working: number
  unbound: number
  dead: number
  unprobed: number
  all: number
  computedAt: string
  /** True when served from the in-process memo rather than recomputed. */
  cached: boolean
}

const TTL_MS = 5 * 60_000
const memo = new Map<string, { value: Omit<RegisterCounts, 'cached'>; at: number }>()

export async function getRegisterCounts(category?: string | null): Promise<RegisterCounts> {
  const key = category ?? '*'
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return { ...hit.value, cached: true }

  const categoryJoin = category
    ? sql`join agent_category c on c.agent_id = a.id and c.category = ${category}`
    : sql``

  const rows = await db().execute(sql`
    with latest as (
      select distinct on (agent_id) agent_id, liveness
      from probe order by agent_id, checked_at desc
    )
    select
      count(distinct a.id) filter (where p.liveness = 'live')                       as working,
      count(distinct a.id) filter (where p.liveness in ('unbound','bad_schema'))    as unbound,
      count(distinct a.id) filter (where p.liveness = 'dead')                        as dead,
      count(distinct a.id) filter (where p.liveness is null)                         as unprobed,
      count(distinct a.id)                                                           as all
    from agent a
    ${categoryJoin}
    left join latest p on p.agent_id = a.id
    where a.chain_id = 56
  `)
  const r = (((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]))[0] ?? {}) as Record<string, unknown>
  const num = (v: unknown) => Number(v ?? 0)

  const value = {
    working: num(r['working']),
    unbound: num(r['unbound']),
    dead: num(r['dead']),
    unprobed: num(r['unprobed']),
    all: num(r['all']),
    computedAt: new Date().toISOString(),
  }
  memo.set(key, { value, at: Date.now() })

  // Durable, dated copy of the global figures.
  if (!category) {
    try {
      await db().insert(funnelSnapshot).values([
        { chainId: 56, stage: 'register_working', count: value.working, method: "COUNT(*) distinct agent, latest probe liveness = 'live'" },
        { chainId: 56, stage: 'register_unbound', count: value.unbound, method: "COUNT(*) distinct agent, latest probe liveness in ('unbound','bad_schema')" },
        { chainId: 56, stage: 'register_dead', count: value.dead, method: "COUNT(*) distinct agent, latest probe liveness = 'dead'" },
      ])
    } catch { /* the snapshot is a convenience; a write failure must not fail the read */ }
  }

  return { ...value, cached: false }
}
