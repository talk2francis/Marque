/**
 * Negotiate once with every service that looks like an ERC-8183 seller and report what
 * came back. READ ONLY: a quote creates nothing on chain. Used by P2-01 and supply:audit.
 */
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { requestQuote, probeTask } from '../src/quote.js'

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>
const rows = rowsOf(await db().execute(sql`
  with lp as (select ps.service_id, ps.agent_id, p.liveness, p.manifest from probe_schedule ps join probe p on p.id = ps.last_probe_id)
  select lp.service_id, a.id as agent_id, a.token_id, a.name, a.owner_address, a.agent_wallet,
         lp.manifest->>'url' as rpc_url, s.endpoint,
         (select string_agg(category, ',') from agent_category c where c.agent_id = a.id and c.category <> 'unclassified') as cats
  from lp join agent a on a.id = lp.agent_id join agent_service s on s.id = lp.service_id
  where exists (select 1 from jsonb_array_elements(case when jsonb_typeof(lp.manifest->'skills') = 'array' then lp.manifest->'skills' else '[]'::jsonb end) x
                where x->>'id' in ('negotiate', 'notify_funded') or (x->>'name') ilike '%8183%' or (x->>'id') ilike '%8183%')
     or a.chain_id = 56 and a.token_id in ('341553','341554','341555','341556','341557')
  order by cats nulls last, a.name`))

const out = []
for (const r of rows) {
  const slug = ['341553','341554','341555','341556','341557'].includes(String(r['token_id']))
    ? { '341553': 'bound', '341554': 'lattice', '341555': 'sluicegate', '341556': 'keel', '341557': 'redcell' }[String(r['token_id'])] : null
  const endpoint = slug ? `https://marque.trade/agents/${slug}/` : String(r['rpc_url'] ?? r['endpoint'])
  const cat = String(r['cats'] ?? 'unclassified').split(',')[0]!
  const q = await requestQuote(endpoint, probeTask(cat), { agentWallet: r['agent_wallet'] as string | null, agentOwner: r['owner_address'] as string | null })
  out.push({
    tokenId: r['token_id'], name: r['name'], category: r['cats'] ?? 'unclassified', endpoint, owner: r['owner_address'], agentWallet: r['agent_wallet'],
    ok: q.ok, reason: q.ok ? null : q.reason, detail: q.ok ? null : q.detail, latencyMs: q.latencyMs,
    chainId: q.ok ? q.chainId : (q.chainId ?? q.negotiation?.chain_id ?? null),
    price: q.ok ? q.price.toString() : (q.negotiation?.response.terms?.price ?? null),
    token: q.ok ? q.token.symbol : (q.negotiation?.response.terms?.currency ?? null),
    provider: q.ok ? q.provider : (q.provider ?? null),
  })
  console.error(`${q.ok ? 'OK ' : 'NO '} ${String(r['token_id']).padEnd(7)} ${String(r['name']).slice(0, 30).padEnd(30)} ${String(r['cats'] ?? '-').padEnd(14)} ${q.ok ? `${q.chainId} ${q.price} ${q.token.symbol}` : `${q.reason}: ${q.detail}`.slice(0, 90)}`)
}
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), results: out }, null, 2))
await closeDb()
