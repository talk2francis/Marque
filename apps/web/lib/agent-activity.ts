import 'server-only'
import { sql } from 'drizzle-orm'
import { cachedProjection, db } from '@marque/db'
import { teamWallets } from '@marque/commerce'

export interface ActivityJob {
  id: string; client: string; state: string; team: boolean; viaMarque: boolean; funder: 'outside' | 'team' | 'operator'
  createdAt: string | null; fundedAt: string | null; deliveredAt: string | null
  settledAt: string | null; fundedTx: string | null; deliveredTx: string | null
}
export interface AgentActivity {
  measuredAt: string; total: number; paid: number; nonTeamPaid: number; nonTeamWallets: number
  jobs: ActivityJob[]
}
const rowsOf = (v: unknown) => ((v as {rows?: unknown[]}).rows ?? v) as Record<string, unknown>[]
const str = (v: unknown) => v == null ? null : String(v)
const iso = (v: unknown) => v == null ? null : new Date(v as string).toISOString()

/** Only public chain evidence. No task text, IP, contact information or inferred identity. */
export async function agentActivity(agentId: string, provider: string | null, chainId: 56 | 97 = 56): Promise<AgentActivity> {
  const p = await cachedProjection(`agent:activity:v2:${agentId}:${provider ?? ''}`, async () => {
    const team = teamWallets()
    // The agent's own owner and wallet: a job they paid for is the operator's, never outside usage.
    const [own] = rowsOf(await db().execute(sql`select owner_address, agent_wallet from agent where id = ${agentId} limit 1`).catch(() => []))
    const operator = new Set([own?.['owner_address'], own?.['agent_wallet']].filter(Boolean).map((v) => String(v).toLowerCase()))
    const teamSql = team.length ? sql.join(team.map(w => sql`${w.toLowerCase()}`), sql`,`) : sql`''`
    // An intent identifies the exact agent. Without one we can only attribute the provider wallet.
    const scope = sql`j.chain_id = ${chainId} and (i.agent_id = ${agentId}
      or (j.intent_id is null and j.provider = ${provider?.toLowerCase() ?? ''}))`
    const [counts, jobs] = await Promise.all([
      db().execute(sql`select count(*)::int as total,
        count(*) filter(where j.funded_raw is not null and j.funded_raw <> '0')::int as paid,
        count(*) filter(where j.funded_raw is not null and j.funded_raw <> '0' and j.client not in (${teamSql}))::int as non_team_paid,
        count(distinct j.client) filter(where j.funded_raw is not null and j.funded_raw <> '0' and j.client not in (${teamSql}))::int as non_team_wallets
        from commerce_job j left join hire_intent i on i.id=j.intent_id where ${scope}`).then(rowsOf),
      db().execute(sql`select j.job_id,j.client,j.state,j.created_at,j.intent_id,
        e.funded_at,e.delivered_at,e.settled_at,e.funded_tx,e.delivered_tx
        from commerce_job j left join hire_intent i on i.id=j.intent_id
        left join lateral (select
          min(block_time) filter(where name='JobFunded') as funded_at,
          min(block_time) filter(where name='JobSubmitted') as delivered_at,
          min(block_time) filter(where name='JobCompleted') as settled_at,
          min(tx_hash) filter(where name='JobFunded') as funded_tx,
          min(tx_hash) filter(where name='JobSubmitted') as delivered_tx
          from commerce_event where chain_id=j.chain_id and job_id=j.job_id) e on true
        where ${scope} order by j.created_at desc nulls last,j.job_id desc limit 30`).then(rowsOf),
    ])
    const c=counts[0]
    return { measuredAt:new Date().toISOString(), total:Number(c?.total ?? 0), paid:Number(c?.paid ?? 0),
      nonTeamPaid:Number(c?.non_team_paid ?? 0), nonTeamWallets:Number(c?.non_team_wallets ?? 0),
      jobs:jobs.map(j=>({id:String(j.job_id),client:String(j.client),state:String(j.state),team:team.includes(String(j.client).toLowerCase()),funder:team.includes(String(j.client).toLowerCase())?'team' as const:operator.has(String(j.client).toLowerCase())?'operator' as const:'outside' as const,
        viaMarque:j.intent_id != null,createdAt:iso(j.created_at),fundedAt:iso(j.funded_at),deliveredAt:iso(j.delivered_at),settledAt:iso(j.settled_at),
        fundedTx:str(j.funded_tx),deliveredTx:str(j.delivered_tx)})) }
  }, {freshMs:30_000,timeoutMs:6000,staleWhileRevalidate:true})
  return p.value
}
