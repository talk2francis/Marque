import 'server-only'
import { sql } from 'drizzle-orm'
import { cachedProjection, db } from '@marque/db'
import { agentPortraits } from './agent-portraits'
import { registryImageUrl } from './avatar-source'

/**
 * Agents outside builders brought to Marque, newest first, on either network, whether or not they answer right now
 * (23 Nov 2026; every date since 26 Nov). Two ways in, both a builder acting on Marque, never Marque's own indexing:
 *  - listed: a published listing, not withdrawn;
 *  - tested: the owner proved control on Marque and ran the Standard against the agent, without publishing yet.
 * A builder with several agents shows once, as the newest, with how many more it has (a family is the name before
 * " — ", else the owner wallet). Marque's own test fixtures are left out. Each shows its honest current state.
 */
export interface RecentListing {
  agentId: string; chainId: 56 | 97; tokenId: string; name: string; category: string | null
  listedAt: string; how: 'listed' | 'tested'; answering: boolean; image: string | null; href: string; more: number
}

const rows = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? r) as Array<Record<string, unknown>>
const EXCLUDED = '(marque team|builder check fixture|kit test)'

/** One card per builder: the newest agent of each family, with the count of the others. */
export function byBuilder<T extends { name: string; owner: string; at: number }>(list: T[]): Array<T & { more: number }> {
  const family = (x: T) => (/^(.{2,}?)\s+[—–-]\s+/.exec(x.name)?.[1]?.trim().toLowerCase()) || x.owner.toLowerCase()
  const groups = new Map<string, T[]>()
  for (const x of list) groups.set(family(x), [...(groups.get(family(x)) ?? []), x])
  return [...groups.values()]
    .map((g) => { const s = [...g].sort((a, b) => b.at - a.at); return { ...s[0]!, more: s.length - 1 } })
    .sort((a, b) => b.at - a.at)
}

/** Rebuilt at most every five minutes in the background (the claim scan reads conformance results), never on a request path. */
export async function recentListings(limit = 24): Promise<RecentListing[]> {
  const { value } = await cachedProjection('recent-listings:v2', () => buildRecent(limit), { freshMs: 5 * 60_000, timeoutMs: 8_000, staleWhileRevalidate: true })
  return value
}

async function buildRecent(limit: number): Promise<RecentListing[]> {
  const found = rows(await db().execute(sql`
    with listed as (
      select distinct on (l.agent_id) l.agent_id, l.chain_id, l.token_id, l.category, l.published_at as at, l.owner_address as owner, 'listed' as how
      from builder_listing l
      where l.status = 'published' and l.withdrawn_at is null
      order by l.agent_id, l.published_at desc
    ), tested as (
      select c.agent_id, max(c.chain_id) as chain_id, split_part(c.agent_id, ':', 3) as token_id, max(c.category) as category,
        min(c.ran_at) as at, null::text as owner, 'tested' as how
      from conformance_result c
      where c.request #>> '{evidence,selectionSource}' = 'current_owner_claim'
        and not exists (select 1 from builder_listing l where l.agent_id = c.agent_id)
      group by c.agent_id
    ), both_ways as (select * from listed union all select * from tested)
    select b.agent_id, b.chain_id, b.token_id, b.category, b.at, b.how,
      coalesce(b.owner, a.owner_address, '') as owner,
      coalesce(nullif(a.name, ''), 'Agent #' || b.token_id) as name, a.image_url, a.raw_metadata #>> '{offchain_content,image}' as meta_image,
      exists (select 1 from probe_schedule s where s.agent_id = b.agent_id and s.last_liveness = 'live') as answering
    from both_ways b left join agent a on a.id = b.agent_id
    where b.agent_id ~ '^(56|97):' and coalesce(a.name, '') !~* ${EXCLUDED}`))
  const grouped = byBuilder(found.map((r) => ({ r, name: String(r['name']), owner: String(r['owner'] ?? ''), at: Date.parse(String(r['at'])) })))
    .slice(0, limit)
  const portraits = await agentPortraits(grouped.map((g) => String(g.r['agent_id'])))
  return grouped.map(({ r, more }) => {
    const agentId = String(r['agent_id'])
    const chainId = agentId.startsWith('97:') ? 97 : 56
    const tokenId = String(r['token_id'])
    return {
      agentId, chainId, tokenId, name: String(r['name']).slice(0, 80), category: r['category'] ? String(r['category']) : null,
      listedAt: new Date(String(r['at'])).toISOString(), how: r['how'] === 'tested' ? 'tested' : 'listed', answering: r['answering'] === true,
      image: portraits.get(agentId) ?? registryImageUrl(r['image_url']) ?? registryImageUrl(r['meta_image']),
      href: `/agents/${chainId}/${tokenId}`, more,
    }
  })
}
