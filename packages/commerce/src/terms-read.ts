import { sql } from 'drizzle-orm'
import { boundedCommerceRead } from './read-budget.js'
import { serviceCommerceFromQuote, type CommercialState, type ServiceCommerce } from './supply.js'
import { termsOf, type LastQuote, type Terms } from './terms.js'

/**
 * Server side of current terms: read the newest quote observation of each service of the
 * named agents (indexed by agent and time, so this never scans the catalog), plus each
 * agent's newest successful quote so a lapsed price can be shown dated rather than lost.
 * The profile rail, the terms API and the hire sheet all call this.
 */

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>
const RANK: Record<CommercialState, number> = { settleable: 0, hireable: 1, quoteable: 2, preview_only: 3, unavailable: 4 }

export interface AgentTerms {
  agentId: string
  /** The service the terms belong to, for the hire link. */
  serviceId: number | null
  commerce: (ServiceCommerce & { lastQuote: LastQuote | null }) | null
  terms: Terms
}

export async function currentTermsMany(agentIds: readonly string[], now = Date.now()): Promise<Map<string, AgentTerms>> {
  const ids = [...new Set(agentIds)].slice(0, 48)
  const out = new Map<string, AgentTerms>()
  if (!ids.length) return out
  const list = sql.join(ids.map((id) => sql`${id}`), sql`, `)
  const [latest, lastOk] = await Promise.all([
    boundedCommerceRead(sql`
      select distinct on (q.service_id) q.service_id, q.agent_id, q.ok, q.failure, q.detail, q.chain_id, q.provider, q.price_raw, q.token,
             q.token_symbol, q.token_decimals, q.created_at, q.quote_expires_at, q.negotiation_hash, q.provider_sig, q.signed, q.latency_ms,
             q.raw->'quote_expires_at' as provider_expiry, q.raw#>'{response,quote_expires_at}' as response_expiry
      from commerce_quote q
      where q.agent_id in (${list}) and q.service_id is not null and q.created_at > now() - interval '7 days'
      order by q.service_id, q.created_at desc, q.id desc`, 'exact').then(rowsOf),
    boundedCommerceRead(sql`
      select distinct on (q.agent_id) q.agent_id, q.price_raw, q.token, q.token_symbol, q.token_decimals, q.chain_id, q.created_at, q.signed
      from commerce_quote q
      where q.agent_id in (${list}) and q.ok and q.chain_id::text = split_part(q.agent_id, ':', 1) and q.created_at > now() - interval '7 days'
      order by q.agent_id, q.created_at desc, q.id desc`, 'exact').then(rowsOf),
  ])
  const providers = [...new Set(latest.map((q) => (q['provider'] ? String(q['provider']).toLowerCase() : '')).filter(Boolean))]
  const delivered = new Map<string, number>()
  if (providers.length) {
    const jobs = rowsOf(await boundedCommerceRead(sql`
      select chain_id, lower(provider) as provider, count(*)::int as n from commerce_job
      where state in ('COMPLETED', 'PAID') and lower(provider) in (${sql.join(providers.map((p) => sql`${p}`), sql`, `)})
      group by 1, 2`, 'exact').catch(() => []))
    for (const r of jobs) delivered.set(`${r['chain_id']}:${r['provider']}`, Number(r['n']))
  }
  const last = new Map<string, LastQuote>()
  for (const r of lastOk) {
    if (!r['price_raw'] || !r['token']) continue
    last.set(String(r['agent_id']), {
      priceRaw: String(r['price_raw']),
      token: { address: String(r['token']), symbol: String(r['token_symbol']), decimals: Number(r['token_decimals']) },
      chainId: r['chain_id'] == null ? null : Number(r['chain_id']),
      quotedAt: new Date(String(r['created_at'])).toISOString(),
      signed: typeof r['signed'] === 'boolean' ? (r['signed'] as boolean) : null,
    })
  }
  // Best service per agent, by the same ranking the catalog uses: state, then a signed quote.
  const best = new Map<string, ServiceCommerce>()
  for (const q of latest) {
    const c = serviceCommerceFromQuote(q, delivered, now)
    const prev = best.get(c.agentId)
    if (!prev || RANK[c.state] < RANK[prev.state] || (c.state === prev.state && c.signed === true && prev.signed !== true)) best.set(c.agentId, c)
  }
  for (const id of ids) {
    const c = best.get(id)
    const commerce = c ? { ...c, lastQuote: last.get(id) ?? null } : null
    out.set(id, { agentId: id, serviceId: c?.serviceId ?? null, commerce, terms: termsOf(commerce, now) })
  }
  return out
}

export async function currentTerms(agentId: string, now = Date.now()): Promise<AgentTerms> {
  const m = await currentTermsMany([agentId], now)
  return m.get(agentId) ?? { agentId, serviceId: null, commerce: null, terms: termsOf(null, now) }
}
