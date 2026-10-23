import 'server-only'
import { sql } from 'drizzle-orm'
import { cachedProjection, db } from '@marque/db'

type Row = Record<string, unknown>
const rowsOf = (r: unknown): Row[] => (Array.isArray(r) ? (r as Row[]) : ((r as { rows?: Row[] }).rows ?? []))

/**
 * Originality (SPEC-BUILDERS 6.4): another agent returned byte-identical answers to the same MCS cases
 * on 3 or more cases. An observation shown on both pages, never a verdict, never a listing block.
 * Empty and all-missing answers are excluded: two agents saying nothing are not copies of each other.
 */
export interface Twin { agentId: string; tokenId: string; chainId: number; name: string | null; cases: number }

export async function originality(agentId: string): Promise<Twin[]> {
  try {
    return (await cachedProjection(`originality:v1:${agentId}`, async () => {
      const rows = rowsOf(await db().execute(sql`
        select r2.agent_id, a.token_id, a.chain_id, a.name, count(distinct r1.case_id)::int as cases
        from conformance_result r1
        join conformance_result r2 on r2.case_id = r1.case_id and r2.response_hash = r1.response_hash and r2.agent_id <> r1.agent_id and r2.error is null
        left join agent a on a.id = r2.agent_id
        where r1.agent_id = ${agentId} and r1.error is null and r1.response is not null
          and exists (select 1 from jsonb_array_elements(r1.diffs) d where coalesce((d->>'missing')::boolean, false) = false)
        group by 1, 2, 3, 4 having count(distinct r1.case_id) >= 3 order by cases desc limit 5`))
      return rows.map((r) => ({ agentId: String(r['agent_id']), tokenId: String(r['token_id'] ?? ''), chainId: Number(r['chain_id'] ?? 56), name: r['name'] ? String(r['name']) : null, cases: Number(r['cases']) }))
    }, { freshMs: 30 * 60_000, timeoutMs: 8_000, staleWhileRevalidate: true })).value
  } catch {
    return []
  }
}

/**
 * Unmet demand (SPEC-SUPPLY 7): tenders in the last 7 days that fewer than 2 agents priced, grouped by
 * category and task shape per lane. Aggregates only: at least 3 requests per row, no addresses, no wallets.
 */
export interface Demand { label: string; chainId: number; requests: number; bestPriced: number; category: string }

const WORDS: Record<string, (s: Record<string, unknown>) => string> = {
  health_factor: (s) => `Health factor checks${s['targetHf'] ? ` to a ${s['targetHf']} target` : ''}`,
  yield: (s) => `Yield routes for ${s['asset'] ?? 'stablecoins'}${s['amount'] ? `, ${s['amount']}` : ''}${s['holdingDays'] ? ` over ${s['holdingDays']} days` : ''}`,
  grid: (s) => `Grid plans for ${s['pair'] ?? 'a pool'}${s['capitalUsd'] ? `, ${s['capitalUsd']} capital` : ''}`,
  rebalancing: (s) => `PancakeSwap V3 range plans${s['targetRangePct'] ? ` at +/-${s['targetRangePct']}%` : ''}`,
  security: () => 'Token contract reviews',
}

export async function unmetDemand(): Promise<Demand[]> {
  try {
    return (await cachedProjection('unmet-demand:v1', async () => {
      const rows = rowsOf(await db().execute(sql`
        select category, chain_id, shape, count(*)::int as requests, max(priced)::int as best
        from tender where created_at > now() - interval '7 days' and priced < 2
        group by 1, 2, 3 having count(*) >= 3 order by count(*) desc limit 12`))
      return rows.map((r) => {
        const shape = (r['shape'] ?? {}) as Record<string, unknown>
        const c = String(r['category'])
        return { category: c, chainId: Number(r['chain_id']), requests: Number(r['requests']), bestPriced: Number(r['best']), label: (WORDS[c] ?? (() => c.replace('_', ' ')))(shape) }
      })
    }, { freshMs: 10 * 60_000, timeoutMs: 8_000, staleWhileRevalidate: true })).value
  } catch {
    return []
  }
}
