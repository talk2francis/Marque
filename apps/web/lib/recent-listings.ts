import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { agentPortraits } from './agent-portraits'
import { registryImageUrl } from './avatar-source'

/**
 * Agents builders listed on Marque recently (23 Nov 2026), newest first, on either network, whether or not they answer
 * right now: a newcomer is shown with its honest current state, never hidden for being new or down. Published and not
 * withdrawn; listings older than the window and Marque's own test fixtures are left out.
 */
export const RECENT_LISTING_DAYS = 30
export interface RecentListing {
  agentId: string; chainId: 56 | 97; tokenId: string; name: string; category: string | null
  listedAt: string; answering: boolean; image: string | null; href: string
}

const rows = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? r) as Array<Record<string, unknown>>

export async function recentListings(limit = 8): Promise<RecentListing[]> {
  const list = rows(await db().execute(sql`
    select distinct on (l.agent_id) l.agent_id, l.chain_id, l.token_id, l.category, l.published_at,
      coalesce(nullif(a.name, ''), 'Agent #' || l.token_id) as name, a.image_url, a.raw_metadata #>> '{offchain_content,image}' as meta_image,
      exists (select 1 from probe_schedule s where s.agent_id = l.agent_id and s.last_liveness = 'live') as answering
    from builder_listing l left join agent a on a.id = l.agent_id
    where l.status = 'published' and l.withdrawn_at is null and l.published_at > now() - make_interval(days => ${RECENT_LISTING_DAYS})
      and coalesce(a.name, '') !~* '(marque team|builder check fixture|kit test)'
    order by l.agent_id, l.published_at desc`))
    .sort((x, y) => Date.parse(String(y['published_at'])) - Date.parse(String(x['published_at'])))
    .slice(0, limit)
  const portraits = await agentPortraits(list.map((r) => String(r['agent_id'])))
  return list.map((r) => {
    const agentId = String(r['agent_id'])
    const chainId = Number(r['chain_id']) === 97 ? 97 : 56
    const tokenId = String(r['token_id'])
    return {
      agentId, chainId, tokenId, name: String(r['name']).slice(0, 80), category: r['category'] ? String(r['category']) : null,
      listedAt: new Date(String(r['published_at'])).toISOString(), answering: r['answering'] === true,
      image: portraits.get(agentId) ?? registryImageUrl(r['image_url']) ?? registryImageUrl(r['meta_image']),
      href: `/agents/${chainId}/${tokenId}`,
    }
  })
}
