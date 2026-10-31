import 'server-only'
import { sql, type SQL } from 'drizzle-orm'
import { boundedCommerceRead } from '@marque/commerce/reads'

/** A provider-only observation cannot distinguish identities sharing one wallet on this network. */
export function exclusiveProviderIdentity(agentId: SQL, wallet: SQL, chainId: SQL): SQL {
  return sql`not exists (
    select 1 from agent sibling
    where sibling.chain_id = ${chainId}
      and lower(sibling.agent_wallet) = lower(${wallet})
      and sibling.id <> ${agentId}
  )`
}

/** Exact Marque intents survive wallet rotation. Outside jobs require a unique indexed provider association. */
export async function agentSampleJobs(agentId: string, chainId: number, wallet: string | null) {
  const result = await boundedCommerceRead(sql`
    select j.job_id, j.deliverable, j.provider, e.block_time, e.tx_hash
    from commerce_job j
    left join hire_intent i on i.id = j.intent_id and i.chain_id = j.chain_id and i.job_id = j.job_id
    left join commerce_event e on e.chain_id = j.chain_id and e.job_id = j.job_id and e.name = 'JobSubmitted'
    where j.chain_id = ${chainId}
      and j.state in ('SUBMITTED', 'DISPUTED', 'COMPLETED', 'PAID') and j.deliverable is not null
      and (i.agent_id = ${agentId} or (
        j.intent_id is null and lower(j.provider) = lower(${wallet})
        and ${exclusiveProviderIdentity(sql`${agentId}`, sql`${wallet}`, sql`${chainId}`)}
      ))
    order by j.updated_block desc nulls last limit 3`)
  return ((result as { rows?: unknown[] }).rows ?? result) as Array<Record<string, unknown>>
}
