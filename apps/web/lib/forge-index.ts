import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import type { ChainId } from '@marque/commerce'
import { classifyByKeyword } from '@marque/registry'
import { readIdentity } from './builder'

/**
 * Index one identity straight from the registry (SPEC-BUILDERS 4.6, acceptance 3): a Forge registration
 * shows in My Marque and the quest build track at once, not at the next sweep. Derived state only
 * (rebuildable from chain): owner, name, description and declared services, read from the token itself.
 */
export async function indexIdentity(chainId: ChainId, tokenId: string): Promise<{ ok: boolean; agentKey: string; detail: string }> {
  const id = await readIdentity(chainId, tokenId)
  if (id.readFailed) return { ok: false, agentKey: id.agentKey, detail: 'The identity registry did not answer. Try again in a minute.' }
  if (!id.owner) return { ok: false, agentKey: id.agentKey, detail: `No identity #${tokenId} exists on this network.` }
  await db().execute(sql`
    insert into agent (id, chain_id, token_id, contract_address, owner_address, name, description, first_seen, last_seen)
    values (${id.agentKey}, ${chainId}, ${tokenId}, ${id.registry.toLowerCase()}, ${id.owner}, ${id.name}, ${id.description}, now(), now())
    on conflict (id) do update set owner_address = excluded.owner_address, name = coalesce(excluded.name, agent.name),
      description = coalesce(excluded.description, agent.description), last_seen = now()`)
  for (const s of id.services) {
    if (s.kind === 'other') continue
    await db().execute(sql`
      insert into agent_service (agent_id, kind, endpoint, source, currently_declared, declaration_checked_at)
      values (${id.agentKey}, ${s.kind}, ${s.endpoint}, 'offchain_array', true, now())
      on conflict (agent_id, kind, endpoint) do update set currently_declared = true, declaration_checked_at = now(), last_seen = now()`)
  }
  // A keyword category, the same first pass the classifier sweep runs; the sweep may refine it later.
  const cls = classifyByKeyword({ name: id.name, description: id.description })
  if (cls.category !== 'unclassified') {
    await db().execute(sql`
      insert into agent_category (agent_id, category, confidence, method, rationale)
      select ${id.agentKey}, ${cls.category}, ${cls.confidence}, 'keyword', ${cls.rationale}
      where not exists (select 1 from agent_category where agent_id = ${id.agentKey})`).catch(() => undefined)
  }
  return { ok: true, agentKey: id.agentKey, detail: `Indexed ${id.name ?? `#${tokenId}`} for ${id.owner.slice(0, 8)}…` }
}
