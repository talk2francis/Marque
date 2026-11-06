import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { DemandReport, demandOutcome } from './builder-demand'
import { quoteRemedy } from './seller'

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? r) as Array<Record<string, unknown>>
const iso = (v: unknown) => v ? new Date(String(v)).toISOString() : null
const job = (value: unknown) => value && typeof value === 'object' ? { ...value, quoteAt: iso((value as Record<string, unknown>).quoteAt) } : null

/** Internal only: the caller must first validate a fresh owner claim through sellerProjection. No raw task or wallet is selected. */
export async function builderDemand(agentId: string, cursor = 0) {
  const observedAt = new Date().toISOString(), since = new Date(Date.parse(observedAt) - 30 * 86_400_000).toISOString()
  return db().transaction(async tx => {
    await tx.execute(sql`set transaction read only`)
    await tx.execute(sql`set local statement_timeout = '2000ms'`)
    const [count] = rowsOf(await tx.execute(sql`select count(*)::int as total from tender_quote tq join tender t on t.id = tq.tender_id where tq.agent_id = ${agentId} and tq.created_at >= ${since}::timestamptz`))
    const rows = rowsOf(await tx.execute(sql`select tq.id,tq.ok,tq.outcome,tq.latency_ms,tq.created_at,tq.price_raw,tq.token_symbol,q.token_decimals,q.failure,t.chain_id,t.category,
      own_job.job as own_job, selected_job.job as selected_job
      from tender_quote tq join tender t on t.id = tq.tender_id
      left join commerce_quote q on q.id = tq.quote_id and q.agent_id = tq.agent_id and q.chain_id = t.chain_id
      left join lateral (
        select jsonb_build_object('chainId',j.chain_id,'jobId',j.job_id::text,'agentId',i.agent_id,'name',a.name,
          'priceRaw',cq.price_raw,'tokenSymbol',cq.token_symbol,'tokenDecimals',cq.token_decimals,'quoteAt',cq.created_at) as job
        from hire_intent i join commerce_job j on j.intent_id = i.id and j.chain_id = i.chain_id and j.job_id = i.job_id
        join commerce_quote cq on cq.id = i.quote_id and cq.agent_id = i.agent_id and cq.chain_id = i.chain_id
        left join agent a on a.id = i.agent_id
        where i.quote_id = tq.quote_id and i.agent_id = tq.agent_id and i.service_id is not distinct from tq.service_id and i.chain_id = t.chain_id
          and j.funded_raw ~ '^[0-9]+$' and j.funded_raw::numeric > 0 and j.funded_raw = i.price_raw
          and lower(j.client) = lower(i.wallet) and lower(j.provider) = lower(i.provider) and lower(j.token) = lower(i.token)
          and cq.ok and cq.service_id is not distinct from i.service_id and cq.price_raw = i.price_raw and lower(cq.provider) = lower(i.provider) and lower(cq.token) = lower(i.token)
        order by j.created_at desc,j.job_id::numeric desc limit 1
      ) own_job on true
      left join lateral (
        select jsonb_build_object('chainId',j.chain_id,'jobId',j.job_id::text,'agentId',i.agent_id,'name',a.name,
          'priceRaw',cq.price_raw,'tokenSymbol',cq.token_symbol,'tokenDecimals',cq.token_decimals,'quoteAt',cq.created_at) as job
        from tender_quote sibling join hire_intent i on i.quote_id = sibling.quote_id and i.agent_id = sibling.agent_id
          and i.service_id is not distinct from sibling.service_id
        join commerce_job j on j.intent_id = i.id and j.chain_id = i.chain_id and j.job_id = i.job_id
        join commerce_quote cq on cq.id = i.quote_id and cq.agent_id = i.agent_id and cq.chain_id = i.chain_id
        left join agent a on a.id = i.agent_id
        where sibling.tender_id = tq.tender_id and sibling.agent_id <> tq.agent_id and j.chain_id = t.chain_id
          and j.funded_raw ~ '^[0-9]+$' and j.funded_raw::numeric > 0 and j.funded_raw = i.price_raw
          and lower(j.client) = lower(i.wallet) and lower(j.provider) = lower(i.provider) and lower(j.token) = lower(i.token)
          and cq.ok and cq.service_id is not distinct from i.service_id and cq.price_raw = i.price_raw and lower(cq.provider) = lower(i.provider) and lower(cq.token) = lower(i.token)
        order by j.created_at desc,j.job_id::numeric desc limit 1
      ) selected_job on true
      where tq.agent_id = ${agentId} and tq.created_at >= ${since}::timestamptz
      order by tq.created_at desc,tq.id desc limit 20 offset ${cursor}`))
    const total = Number(count?.total ?? 0)
    return DemandReport.parse({ agentId, observedAt, since, total, nextCursor: cursor + rows.length < total ? String(cursor + rows.length) : null,
      rows: rows.map(r => ({ id: Number(r.id), at: iso(r.created_at), chainId: Number(r.chain_id), category: String(r.category),
        outcome: demandOutcome(r.ok === true && r.outcome === 'priced', Boolean(r.own_job), Boolean(r.selected_job)),
        detail: r.ok === true && r.outcome === 'priced' ? r.own_job ? 'This exact quote was matched to a funded job.' : r.selected_job ? 'Another quote in the same recorded comparison was funded; this quote has no matching funded job.' : 'A price was returned. No matching funded job is recorded for this comparison.' : quoteRemedy(String(r.failure ?? r.outcome)),
        latencyMs: r.latency_ms == null ? null : Number(r.latency_ms), priceRaw: r.price_raw == null ? null : String(r.price_raw), tokenSymbol: r.token_symbol == null ? null : String(r.token_symbol), tokenDecimals: r.token_decimals == null ? null : Number(r.token_decimals),
        ownJob: job(r.own_job), selectedJob: job(r.selected_job), badgesAtQuote: null,
      })) })
  })
}
