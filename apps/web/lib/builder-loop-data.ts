import 'server-only'
import { sql } from 'drizzle-orm'
import { cachedProjection, db } from '@marque/db'
import { teamWallets } from '@marque/commerce'
import { buyerFeedbackBinding } from '../../../packages/commerce/src/feedback-proof'
import { marketplaceAgentsCached } from './market-cache'
import { quoteRemedy } from './seller'
import { BuilderLoop, currentLoopNodes, loopNodes, type LoopEvidence } from './builder-loop'

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? r) as Array<Record<string, unknown>>
const iso = (s: unknown) => s ? new Date(String(s)).toISOString() : null

export function builderLoop(agentId: string) {
  return cachedProjection(`builder-loop:v1:${agentId}`, async () => {
    const [agent] = rowsOf(await db().execute(sql`select id,chain_id,token_id,agent_wallet,owner_address from agent where id = ${agentId} limit 1`))
    if (!agent || ![56, 97].includes(Number(agent.chain_id))) return null
    const chainId = Number(agent.chain_id) as 56 | 97, tokenId = String(agent.token_id)
    const profile = `/agents/${chainId}/${tokenId}`, fix = `/builders/check/${chainId}/${tokenId}`
    const market = marketplaceAgentsCached({ agentIds: [agentId], lane: chainId === 56 ? 'mainnet' : 'practice', tab: 'all', includeUnclassified: true, limit: 1 }).catch(() => null)
    const data = await db().transaction(async tx => {
      await tx.execute(sql`set transaction read only`)
      await tx.execute(sql`set local statement_timeout = '2000ms'`)
      // Read one observation per service through the existing ordered index. Sorting the full probe
      // history here loaded thousands of rows just to find one newest observation on older agents.
      const [probe] = rowsOf(await tx.execute(sql`select p.checked_at,p.liveness,p.failure_class from agent_service s
        cross join lateral (select p.checked_at,p.liveness,p.failure_class from probe p
          where p.service_id = s.id and p.agent_id = ${agentId} order by p.checked_at desc nulls last limit 1) p
        where s.agent_id = ${agentId} and s.kind in ('a2a','mcp') order by p.checked_at desc nulls last limit 1`))
      const [quote] = rowsOf(await tx.execute(sql`select q.ok,q.signed,q.failure,q.provider,q.created_at,q.quote_expires_at from commerce_quote q
        where q.agent_id = ${agentId} and q.source = 'probe' and q.chain_id = ${chainId} order by q.created_at desc limit 1`))
      const events = rowsOf(await tx.execute(sql`select distinct on (e.name) e.name,e.block_time,j.job_id
        from commerce_job j join hire_intent i on i.id = j.intent_id and i.chain_id = j.chain_id and i.job_id = j.job_id
        join commerce_event e on e.chain_id = j.chain_id and e.job_id = j.job_id
        where i.agent_id = ${agentId} and j.chain_id = ${chainId} and j.funded_raw ~ '^[0-9]+$' and j.funded_raw::numeric > 0
        and lower(j.client) = lower(i.wallet) and lower(j.provider) = lower(i.provider) and lower(j.token) = lower(i.token) and j.funded_raw = i.price_raw
        and e.name in ('JobFunded','PaymentReleased') order by e.name,e.block_number desc,e.log_index desc`))
      const teams = teamWallets()
      const [rating] = rowsOf(await tx.execute(sql`select r.block_time,r.tx_hash from rating r
        join rating_comment p on lower(p.feedback_hash) = lower(r.feedback_hash) and p.chain_id = r.chain_id and p.agent_token_id = r.agent_token_id and lower(p.client) = lower(r.client)
        join commerce_job rated_job on rated_job.chain_id = p.chain_id and rated_job.job_id = p.job_id
        where r.chain_id = ${chainId} and r.agent_token_id = ${tokenId}
        and ${buyerFeedbackBinding(sql`rated_job.provider`, sql`${agentId}`)}
        ${teams.length ? sql`and lower(r.client) not in (${sql.join(teams.map(t => sql`${t.toLowerCase()}`), sql`, `)})` : sql``}
        order by r.block_number desc limit 1`))
      return { probe, quote, events, rating }
    })
    const found = (await market)?.rows.find(r => r.agentId === agentId)
    const checked = found?.standing?.checked
    const quoteIdentity = data.quote && typeof agent.agent_wallet === 'string' && agent.agent_wallet.toLowerCase() === String(data.quote.provider).toLowerCase()
    const evidence: LoopEvidence = {
      answering: data.probe ? { at: iso(data.probe.checked_at), href: `${profile}/technical`, detail: data.probe.liveness === 'live' ? 'The latest recorded task-interface probe answered. An observation older than 24 hours needs a fresh read.' : `Latest observation: ${String(data.probe.liveness ?? 'unknown')}. Open the endpoint report before changing anything.`, unavailable: data.probe.liveness !== 'live' || Date.now() - Date.parse(String(data.probe.checked_at)) > 86_400_000 } : null,
      priced: data.quote ? { at: iso(data.quote.created_at), expiresAt: iso(data.quote.quote_expires_at), href: fix, detail: data.quote.ok === true && data.quote.signed === true && quoteIdentity ? 'Latest signed scheduled price sample. The buyer still asks for a fresh exact-task price.' : quoteRemedy(String(data.quote.failure ?? (!quoteIdentity ? 'provider_mismatch' : 'no_signed_quote'))), unavailable: data.quote.ok !== true || data.quote.signed !== true || !quoteIdentity || !data.quote.quote_expires_at } : null,
      checked: checked ? { at: iso(checked.at), href: `${profile}/evidence`, detail: 'The current Checked standing, using the existing marketplace definition and recorded evidence.' } : found ? null : { at: null, href: `${profile}/evidence`, unavailable: true, detail: 'The current standing could not be resolved from the marketplace read. No passing check is assumed.' },
      hired: null, paid: null,
      rated: data.rating ? { at: iso(data.rating.block_time), href: `https://${chainId === 56 ? '' : 'testnet.'}bscscan.com/tx/${String(data.rating.tx_hash)}`, detail: 'A buyer-linked rating outside the published team list, bound through the existing feedback proof.' } : null,
    }
    for (const [step, name] of [['hired', 'JobFunded'], ['paid', 'PaymentReleased']] as const) {
      const e = data.events.find(e => e.name === name)
      if (e) evidence[step] = { at: iso(e.block_time), href: `/jobs/${chainId}/${String(e.job_id)}`, detail: name === 'JobFunded' ? 'A funded job bound to this exact identity, provider, token and quoted amount.' : 'The indexed PaymentReleased event for a matching job. A submitted answer alone does not light this step.' }
    }
    const observedAt = new Date().toISOString()
    return BuilderLoop.parse({ agentId, chainId, observedAt, nodes: loopNodes(evidence, fix, Date.parse(observedAt)) })
  }, { freshMs: 30_000, timeoutMs: 5000 }).then(p => p.value ? { ...p, value: BuilderLoop.parse({ ...p.value, nodes: currentLoopNodes(p.value.nodes, Date.now(), p.stale) }) } : p)
}
