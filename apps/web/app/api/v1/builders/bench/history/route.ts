import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { cachedProjection, db, firstPartyAgentsAllLanes } from '@marque/db'
import { checkWindow, clientKey } from '../../../../../../lib/limits'
export const dynamic = 'force-dynamic'
const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? r) as Array<Record<string, unknown>>
const TEST = { health_factor: 'MCS-HF-1', rebalancing: 'MCS-REB-1', grid: 'MCS-GRID-1', yield: 'MCS-YIELD-1' }
export async function GET(request: Request) {
  const agentId = new URL(request.url).searchParams.get('agentId') ?? ''
  if (!/^(56|97):0x[0-9a-fA-F]{40}:\d{1,12}$/.test(agentId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  if (!checkWindow('bench-history', clientKey(request.headers), 60, 60_000, 'Wait before refreshing the Bench history.').ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  try {
    const p = await cachedProjection(`bench-history:v1:${agentId}`, () => db().transaction(async tx => {
      await tx.execute(sql`set transaction read only`); await tx.execute(sql`set local statement_timeout = '2000ms'`)
      const [agent] = rowsOf(await tx.execute(sql`select a.chain_id,a.token_id, (select category from agent_category where agent_id = a.id order by confidence desc limit 1) as category from agent a where a.id = ${agentId} limit 1`))
      if (!agent) return null
      const refs = firstPartyAgentsAllLanes().find(a => a.chainId === Number(agent.chain_id) && String(a.tokenId) === String(agent.token_id))
      const standard = refs && refs.standard !== undefined ? refs.standard : TEST[String(agent.category) as keyof typeof TEST] ?? null
      const tests = rowsOf(await tx.execute(sql`select r.id,r.test_id,r.case_id,r.pass,r.ran_at,r.block_number,r.failed_fields
        from conformance_result r where r.agent_id = ${agentId} or r.agent_id in (select alias from agent_alias where chain_id = ${Number(agent.chain_id)} and token_id = ${String(agent.token_id)})
        order by r.ran_at desc,r.id desc limit 20`))
      const misses = rowsOf(await tx.execute(sql`select l.chain_id,l.job_id::text,l.block,l.checks from lens_result l
        join commerce_job j on j.chain_id = l.chain_id and j.job_id = l.job_id
        join hire_intent i on i.id = j.intent_id and i.chain_id = j.chain_id and i.job_id = j.job_id
        where i.agent_id = ${agentId} and j.funded_raw ~ '^[0-9]+$' and j.funded_raw::numeric > 0
        and lower(j.client) = lower(i.wallet) and lower(j.provider) = lower(i.provider) and lower(j.token) = lower(i.token) and j.funded_raw = i.price_raw
        and exists (select 1 from jsonb_array_elements(l.checks) c where c->>'how' = 'chain' and c->>'state' = 'differs')
        order by l.computed_at desc limit 20`))
      return { agentId, standard, observedAt: new Date().toISOString(), tests: tests.map(r => ({ id: Number(r.id), testId: String(r.test_id), caseId: r.case_id == null ? null : String(r.case_id), pass: r.pass === true, at: r.ran_at ? new Date(String(r.ran_at)).toISOString() : null, block: r.block_number == null ? null : String(r.block_number), failedFields: r.failed_fields })),
        misses: misses.map(r => ({ chainId: Number(r.chain_id), jobId: String(r.job_id), block: r.block == null ? null : String(r.block), checks: r.checks })) }
    }), { freshMs: 60_000, timeoutMs: 3000 })
    return p.value ? NextResponse.json(p.value, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'not_found' }, { status: 404 })
  } catch { return NextResponse.json({ error: 'unavailable' }, { status: 503 }) }
}
