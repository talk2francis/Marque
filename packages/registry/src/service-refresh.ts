import { sql } from 'drizzle-orm'
import { db, agentService } from '@marque/db'
import { declaredServices } from './declarations.js'
import { isTemplate, resolveTemplate } from './normalize.js'

/** Derived service bindings only. Never modifies a probe, quote, test or listing. */
export async function syncDeclaredServices(input: {
  agentId: string; tokenId: string; chainId: number; blockNumber: string; metadata: Record<string, unknown>
}): Promise<number> {
  const services = declaredServices(input.metadata).filter(s => s.kind !== 'other')
  return db().transaction(async tx => {
    await tx.execute(sql`set local lock_timeout = '500ms'`)
    await tx.execute(sql`set local statement_timeout = '4000ms'`)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`registry-services:${input.agentId}`}))`)
    const source = `registry:services:${input.agentId}`
    const prior = await tx.execute(sql`select detail->>'blockNumber' as block from ingest_cursor where source = ${source}`)
    const previous = (prior as unknown as Array<{ block: string | null }>)[0]?.block
    if (previous && BigInt(previous) > BigInt(input.blockNumber)) return 0
    // A successful full declaration replaces derived membership, never historical rows.
    await tx.execute(sql`update agent_service set currently_declared = false, declaration_checked_at = now() where agent_id = ${input.agentId}`)
    if (services.length) await tx.insert(agentService).values(services.map(s => ({
      agentId: input.agentId, kind: s.kind as Exclude<typeof s.kind, 'other'>, endpoint: s.endpoint,
      source: 'offchain_array' as const, isTemplate: isTemplate(s.endpoint),
      resolvedEndpoint: isTemplate(s.endpoint) ? resolveTemplate(s.endpoint, { agentId: input.tokenId, tokenId: input.tokenId, id: input.tokenId, chainId: String(input.chainId), agentIdFull: input.agentId }) : null,
      currentlyDeclared: true, declarationCheckedAt: new Date(),
    }))).onConflictDoUpdate({ target: [agentService.agentId, agentService.kind, agentService.endpoint], set: {
      currentlyDeclared: true, declarationCheckedAt: sql`excluded.declaration_checked_at`, lastSeen: sql`now()`,
      isTemplate: sql`excluded.is_template`, resolvedEndpoint: sql`excluded.resolved_endpoint`,
    } })
    await tx.execute(sql`insert into ingest_cursor (source, cursor, detail, updated_at)
      values (${source}, 0, ${JSON.stringify({ blockNumber: input.blockNumber, services: services.length })}::jsonb, now())
      on conflict (source) do update set detail = excluded.detail, updated_at = excluded.updated_at`)
    return services.length
  })
}
