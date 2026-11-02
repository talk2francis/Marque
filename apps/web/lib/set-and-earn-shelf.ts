import 'server-only'
import { sql } from 'drizzle-orm'
import { cachedProjection, db, isFirstParty } from '@marque/db'
import { CAMPAIGN } from '@marque/commerce'

/**
 * "Built during Set and Earn" (2 Nov): outside agents registered since the campaign was announced, listed on Marque
 * with a live price in the last 24 hours, newest first, on both networks. Agents that failed their latest test are
 * left out, as in Ready. Each carries the build checklist's hire count: completed escrow hires from wallets other than
 * the builder's own (owner and agent wallet). The checklist itself also excludes wallets the builder funded; this
 * shelf does not read transaction history, so it says so. Marque funds nothing on either side.
 */
export const SHELF_SINCE = `${CAMPAIGN.announced}T00:00:00Z`

export interface ShelfAgent {
  chainId: 56 | 97
  tokenId: string
  agentId: string
  name: string
  category: string | null
  registeredAt: string
  hirers: number
  needs: number
  passed: boolean
}

const rowsOf = (r: unknown) => (((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>)

async function build(): Promise<{ agents: ShelfAgent[]; measuredAt: string; since: string; required: number }> {
  const required = CAMPAIGN.build.hires
  const rows = rowsOf(await db().execute(sql`
    with listed as (select distinct agent_id from commerce_quote where ok and created_at > now() - interval '24 hours'),
    latest as (select distinct on (agent_id) agent_id, pass from conformance_result order by agent_id, ran_at desc),
    cat as (
      select distinct on (agent_id) agent_id, category from agent_category
      order by agent_id, (category <> 'unclassified') desc, confidence desc, assigned_at desc
    )
    select a.id, a.chain_id, a.token_id, a.name, c.category, l2.pass,
      coalesce(a.registry_created_at, a.first_seen) as registered_at,
      (select count(distinct j.client)::int from campaign_job j
        where j.chain_id = a.chain_id and j.status = 3
          and j.provider = any(array[lower(a.owner_address), lower(coalesce(a.agent_wallet, a.owner_address))])
          and j.client <> all(array[lower(a.owner_address), lower(coalesce(a.agent_wallet, a.owner_address))])) as hirers
    from agent a
    join listed l on l.agent_id = a.id
    left join latest l2 on l2.agent_id = a.id
    left join cat c on c.agent_id = a.id
    where coalesce(a.registry_created_at, a.first_seen) >= ${SHELF_SINCE}::timestamptz
      and a.chain_id in (56, 97)
      and l2.pass is distinct from false
    order by coalesce(a.registry_created_at, a.first_seen) desc
    limit 60`))
  const agents = rows
    .filter((r) => !isFirstParty(Number(r['chain_id']), String(r['token_id'])))
    .map((r): ShelfAgent => {
      const hirers = Number(r['hirers'] ?? 0)
      return {
        chainId: Number(r['chain_id']) as 56 | 97, tokenId: String(r['token_id']), agentId: String(r['id']),
        name: String(r['name'] ?? `Agent #${r['token_id']}`), category: r['category'] ? String(r['category']) : null,
        registeredAt: new Date(String(r['registered_at'])).toISOString(), hirers, needs: Math.max(0, required - hirers),
        passed: r['pass'] === true,
      }
    })
  return { agents, measuredAt: new Date().toISOString(), since: SHELF_SINCE, required }
}

export async function setAndEarnShelf() {
  return (await cachedProjection('shelf:set-and-earn:v1', build, { freshMs: 5 * 60_000, timeoutMs: 20_000, staleWhileRevalidate: true })).value
}
