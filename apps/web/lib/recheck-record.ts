import 'server-only'
import { sql } from 'drizzle-orm'
import { db, firstPartyAgentsAllLanes } from '@marque/db'
import { deliverableUrlFromNotify } from '@marque/commerce'
import type { LensCheck } from '@marque/conformance'

/** Only the immutable-answer bindings a comparison needs, never wallet history or ratings. */
export async function recheckRecord(chainId: 56 | 97, jobId: string) {
  const rows = await db().transaction(async tx => {
    await tx.execute(sql`set transaction read only`)
    await tx.execute(sql`set local statement_timeout = '1500ms'`)
    return tx.execute(sql`select l.block, l.checks, i.category, j.job_id, j.provider, j.deliverable, a.token_id,
      (select e.tx_hash from commerce_event e where e.chain_id = l.chain_id and e.job_id = l.job_id
        and e.name = 'JobSubmitted' order by e.block_number, e.log_index limit 1) as submitted_tx
      from lens_result l left join commerce_job j on j.chain_id = l.chain_id and j.job_id = l.job_id
      left join hire_intent i on i.id = j.intent_id and i.chain_id = j.chain_id and i.job_id = j.job_id
      left join lateral (select a.token_id from agent a where a.chain_id = j.chain_id and (
        (i.agent_id is not null and a.id = i.agent_id)
        or (j.intent_id is null and lower(a.agent_wallet) = lower(j.provider) and not exists (
          select 1 from agent sibling where sibling.chain_id = a.chain_id
            and lower(sibling.agent_wallet) = lower(a.agent_wallet) and sibling.id <> a.id)))
        order by (a.id = i.agent_id) desc nulls last limit 1) a on true
      where l.chain_id = ${chainId} and l.job_id = ${jobId} limit 1`)
  })
  const row = Array.from(rows as unknown as Array<{ block: string | null; checks: LensCheck[]; category: string | null; job_id: string | null; provider: string | null; deliverable: string | null; token_id: string | null; submitted_tx: string | null }>)[0]
  if (!row) return null
  const reference = row.token_id ? firstPartyAgentsAllLanes().find(a => a.chainId === chainId && String(a.tokenId) === row.token_id) : null
  const category = row.category ?? reference?.category ?? null
  if (!row.job_id) return { ...row, category, job: null }
  const url = reference ? `https://marque.trade/agents/${reference.slug}${chainId === 97 ? '/testnet' : ''}/erc8183/job/${jobId}/response`
    : await deliverableUrlFromNotify(chainId, jobId)
  return { ...row, category, job: { provider: row.provider, deliverable: { hash: row.deliverable, url }, events: row.submitted_tx ? [{ name: 'JobSubmitted', tx: row.submitted_tx }] : [] } }
}
