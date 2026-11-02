import 'server-only'
import { sql } from 'drizzle-orm'
import { cachedProjection, db, isFirstParty } from '@marque/db'
import { CAMPAIGN, teamWallets } from '@marque/commerce'

/**
 * "Built during Set and Earn" (2 Nov): outside agents registered since the campaign was announced, newest first, on both
 * networks. Live: a live price in the last 24 hours. Not pricing now: Marque asked it for a price in the last 3 days and
 * it answered without one (no quote, a 400, or its host down with a 5xx), or its owner published a listing on Marque;
 * the reason is shown. Identities that reject every call (401) are left out, as are agents whose latest test stated a
 * wrong value. Each carries the build checklist's hire count: completed escrow hires from wallets other than
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
  /** A live price in the last 24 hours; otherwise `reason` says why Marque could not price it. */
  live: boolean
  reason: string | null
}

const rowsOf = (r: unknown) => (((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>)

async function build(): Promise<{ agents: ShelfAgent[]; measuredAt: string; since: string; required: number }> {
  const required = CAMPAIGN.build.hires
  const rows = rowsOf(await db().execute(sql`
    with asked as (
      select agent_id, bool_or(ok and created_at > now() - interval '24 hours') as live,
             (array_agg(case when ok then null else coalesce(failure, '') || '|' || coalesce(detail, '') end order by created_at desc))[1] as last_fail
      from commerce_quote where created_at > now() - interval '72 hours' group by agent_id
    ),
    published as (select distinct agent_id from builder_listing where status = 'published'),
    candidates as (
      select a.agent_id, a.live, a.last_fail from asked a
      where a.live or a.last_fail ~ '^no_quote' or a.last_fail ~ 'http (400|5[0-9][0-9])'
      union all
      select p.agent_id, false, null from published p
    ),
    -- One row per agent: a live price, else the latest reason Marque has, else the owner's listing alone.
    listed as (
      select distinct on (agent_id) agent_id, live, last_fail from candidates
      order by agent_id, live desc, (last_fail is not null) desc
    ),
    latest as (
      select distinct on (agent_id) agent_id, pass,
             (not pass and exists (select 1 from jsonb_array_elements(diffs) d
                where d->>'pass' = 'false' and coalesce(d->>'actual', '') <> '' and coalesce(d->>'actual', '') !~ '^\\((not |no )')) as stated_wrong
      from conformance_result order by agent_id, ran_at desc
    ),
    cat as (
      select distinct on (agent_id) agent_id, category from agent_category
      order by agent_id, (category <> 'unclassified') desc, confidence desc, assigned_at desc
    )
    select a.id, a.chain_id, a.token_id, a.name, c.category, l2.pass, l.live, l.last_fail, lower(a.owner_address) as owner, lower(a.agent_wallet) as wallet,
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
      and l2.stated_wrong is distinct from true
    order by l.live desc, coalesce(a.registry_created_at, a.first_seen) desc
    limit 60`))
  // Marque's own agents and agents owned by a published team wallet (test fixtures) are not outside builds.
  const team = new Set(teamWallets().map((w) => w.toLowerCase()))
  const agents = rows
    .filter((r) => !isFirstParty(Number(r['chain_id']), String(r['token_id'])) && !team.has(String(r['owner'])) && !team.has(String(r['wallet'])))
    .map((r): ShelfAgent => {
      const hirers = Number(r['hirers'] ?? 0)
      return {
        chainId: Number(r['chain_id']) as 56 | 97, tokenId: String(r['token_id']), agentId: String(r['id']),
        name: String(r['name'] ?? `Agent #${r['token_id']}`), category: r['category'] ? String(r['category']) : null,
        registeredAt: new Date(String(r['registered_at'])).toISOString(), hirers, needs: Math.max(0, required - hirers),
        passed: r['pass'] === true,
        live: r['live'] === true,
        reason: r['live'] === true ? null : notPricing(r['last_fail'] ? String(r['last_fail']) : null),
      }
    })
  return { agents, measuredAt: new Date().toISOString(), since: SHELF_SINCE, required }
}

/** Why Marque could not price it, in the builder's words. */
function notPricing(fail: string | null): string {
  if (!fail) return 'Listed by its owner; Marque has not had a price from it yet'
  if (/^no_quote/.test(fail)) return 'Answers, but returned no price when Marque asked'
  if (/http 5\d\d/.test(fail)) return 'Its server was down when Marque last asked for a price'
  if (/http 400/.test(fail)) return 'Refused Marque\'s price request (400)'
  return 'No price when Marque last asked'
}

export async function setAndEarnShelf() {
  return (await cachedProjection('shelf:set-and-earn:v3', build, { freshMs: 5 * 60_000, timeoutMs: 20_000, staleWhileRevalidate: true })).value
}
