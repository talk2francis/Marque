import { sql } from 'drizzle-orm'
import { db, firstPartyAgents, canonicalAgentId } from '@marque/db'
import { chainClient, isSupportedChain, network } from '@marque/commerce'
import { readRegistrationMetadata } from '@marque/probe'
import { syncDeclaredServices } from '@marque/registry'

const abi = [{ type: 'function', name: 'tokenURI', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'string' }] }] as const
const rows = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? r) as Array<Record<string, unknown>>

const uriUpdated = { type: 'event', name: 'URIUpdated', inputs: [
  { name: 'agentId', type: 'uint256', indexed: true },
  { name: 'newURI', type: 'string', indexed: false },
  { name: 'updatedBy', type: 'address', indexed: true },
] } as const

export function uriEventRange(cursor: bigint | null, head: bigint): { fromBlock: bigint; toBlock: bigint } | null {
  const safeHead = head > 12n ? head - 12n : 0n
  const fromBlock = cursor === null ? (safeHead > 999n ? safeHead - 999n : 0n) : cursor + 1n
  if (fromBlock > safeHead) return null
  return { fromBlock, toBlock: fromBlock + 999n < safeHead ? fromBlock + 999n : safeHead }
}

async function readWithDeadline<T>(read: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('metadata read deadline')), 8000) })]) }
  finally { clearTimeout(timer) }
}

/** Persist the change queue before advancing the event cursor. No dropped or deleted queue rows. */
async function queueUriUpdates(): Promise<number> {
  const [state] = rows(await db().execute(sql`select cursor from ingest_cursor where source = 'registry:uri-events:56'`))
  const registry = network(56).identityRegistry
  const batch = await readWithDeadline(async () => {
    const c = chainClient(56)
    const range = uriEventRange(state ? BigInt(String(state.cursor)) : null, await c.getBlockNumber({ cacheTime: 0 }))
    return range ? { range, logs: await c.getLogs({ address: registry, event: uriUpdated, ...range, strict: true }) } : null
  })
  if (!batch) return 0
  await db().transaction(async tx => {
    await tx.execute(sql`set local lock_timeout = '500ms'`)
    await tx.execute(sql`set local statement_timeout = '4000ms'`)
    for (const log of batch.logs) {
      const key = `registry:services-pending:56:${registry.toLowerCase()}:${log.args.agentId}`
      await tx.execute(sql`insert into ingest_cursor (source, cursor) values (${key},${String(log.blockNumber)}::bigint)
        on conflict (source) do update set cursor = greatest(ingest_cursor.cursor, excluded.cursor), updated_at = now()`)
    }
    await tx.execute(sql`insert into ingest_cursor (source, cursor) values ('registry:uri-events:56',${String(batch.range.toBlock)}::bigint)
      on conflict (source) do update set cursor = greatest(ingest_cursor.cursor, excluded.cursor), updated_at = now()`)
  })
  return batch.logs.length
}

export function registryRefreshCandidatesQuery(fp: readonly string[]) {
  return sql`
    select a.id, a.chain_id, a.token_id, a.contract_address, 0 as service_id
    from agent a join (
      select agent_id from builder_listing where withdrawn_at is null
      union select unnest(array[${sql.join(fp.map(id => sql`${id}`), sql`, `)}]::text[])
      union select substring(source from length('registry:services-pending:') + 1) from ingest_cursor
        where source like 'registry:services-pending:%' and cursor > 0
    ) listed on listed.agent_id = a.id
    left join ingest_cursor c on c.source = 'registry:services-attempt:' || a.id
    left join ingest_cursor pending on pending.source = 'registry:services-pending:' || a.id
    where c.updated_at is null or c.updated_at < now() - interval '15 minutes' or pending.cursor > 0
    order by c.updated_at nulls first, a.id limit 16`
}

/** Bounded current-registry reconciliation; no runtime POST, payment or chain write. */
export async function refreshRegistryServices(): Promise<{ attempted: number; refreshed: number; failed: number; queuedChanges: number | null }> {
  // Future URI updates have a durable change cursor; priority/rolling reads repair older snapshots
  // and mutable HTTPS documents whose URI never changes. Log failure without starving those reads.
  const queuedChanges = await queueUriUpdates().catch(() => null)
  const fp = firstPartyAgents().map(canonicalAgentId)
  const active = rows(await db().execute(registryRefreshCandidatesQuery(fp)))
  // A second small rotating batch keeps non-listed indexed services refreshable too.
  const [cursor] = rows(await db().execute(sql`select cursor from ingest_cursor where source = 'registry:services-walk'`))
  const rolling = rows(await db().execute(sql`
    select s.id as service_id, a.id, a.chain_id, a.token_id, a.contract_address
    from agent_service s join agent a on a.id = s.agent_id
    where s.id > ${Number(cursor?.cursor ?? 0)} order by s.id limit 8`))
  if (!rolling.length) await db().execute(sql`insert into ingest_cursor (source, cursor) values ('registry:services-walk', 0)
    on conflict (source) do update set cursor = 0, updated_at = now()`)
  const deadline = Date.now() + 30_000
  const result = { attempted: 0, refreshed: 0, failed: 0, queuedChanges }
  const seen = new Set<string>()
  for (const a of [...active, ...rolling]) {
    if (Date.now() >= deadline) break
    const agentId = String(a.id)
    if (!seen.has(agentId) && isSupportedChain(Number(a.chain_id))) {
      seen.add(agentId)
      result.attempted++
      let succeeded = false
      try {
        const read = async () => {
          const c = chainClient(Number(a.chain_id) as 56 | 97)
          const blockNumber = await c.getBlockNumber({ cacheTime: 0 })
          const uri = await c.readContract({ address: String(a.contract_address) as `0x${string}`, abi, functionName: 'tokenURI', args: [BigInt(String(a.token_id))], blockNumber })
          return { blockNumber, metadata: await readRegistrationMetadata(uri) }
        }
        const snapshot = await readWithDeadline(read)
        const { blockNumber, metadata } = snapshot
        if (!metadata) throw new Error('metadata unavailable')
        await syncDeclaredServices({ agentId, tokenId: String(a.token_id), chainId: Number(a.chain_id), blockNumber: String(blockNumber), metadata })
        await db().execute(sql`update ingest_cursor set cursor = 0, updated_at = now()
          where source = ${`registry:services-pending:${agentId}`} and cursor <= ${String(blockNumber)}::bigint`)
        result.refreshed++
        succeeded = true
      } catch { result.failed++ }
      // Attempts rotate on failure as well; a dead host cannot starve other builders.
      await db().execute(sql`insert into ingest_cursor (source, cursor, detail, updated_at)
        values (${`registry:services-attempt:${agentId}`}, 0, ${JSON.stringify({ succeeded })}::jsonb, now())
        on conflict (source) do update set detail = excluded.detail, updated_at = now()`)
    }
    if (Number(a.service_id) > 0) await db().execute(sql`insert into ingest_cursor (source, cursor) values ('registry:services-walk', ${Number(a.service_id)})
      on conflict (source) do update set cursor = excluded.cursor, updated_at = now()`)
  }
  return result
}
