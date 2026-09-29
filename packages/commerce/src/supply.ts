import { sql } from 'drizzle-orm'
import { db, commerceQuote, firstPartyAgents, canonicalAgentId, type FirstPartyAgent } from '@marque/db'
import { requestQuote, probeTask, type QuoteResult } from './quote.js'

/**
 * The commercial axis (SPEC-COMMERCE 4.1), separate from MCS quality.
 *
 *   unavailable   no fresh evidence the agent answers at all
 *   preview_only  callable (fresh probe), but exposes no ERC-8183 negotiation
 *   quoteable     answered negotiate with a well-formed, signed quote in the last 2 h,
 *                 but the quote fails a hire check (wrong signer, chain, contract, token)
 *   hireable      quoteable and every check passes: supported chain, canonical escrow,
 *                 catalog token, positive price, signer = the agent's registered wallet
 *   settleable    hireable, and at least one indexed job for this provider was delivered and settled (JobCompleted or PaymentReleased)
 *                 (JobSubmitted) and settled (JobCompleted / PaymentReleased)
 */
export type CommercialState = 'unavailable' | 'preview_only' | 'quoteable' | 'hireable' | 'settleable'

export const QUOTE_FRESH_MS = 2 * 3600_000
export const QUEST_CATEGORIES = ['yield', 'grid', 'rebalancing', 'health_factor'] as const
export type QuestCategory = (typeof QUEST_CATEGORIES)[number]
export const HIREABLE_CATEGORIES = [...QUEST_CATEGORIES, 'security'] as const

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>

export interface SellerCandidate {
  serviceId: number
  agentId: string
  chainId: number
  tokenId: string
  name: string
  category: string | null
  endpoint: string
  agentWallet: string | null
  owner: string | null
  firstParty: FirstPartyAgent | null
  /** The card advertises an ERC-8183 skill (negotiate / notify_funded) or names ERC-8183. */
  advertisesCommerce: boolean
  /**
   * The work skill's own example task, when the card gives one as a JSON object. Sellers that
   * work from numbers (chainhelix) refuse plain-English tasks, so the price check re-asks with
   * the seller's example and the hire sheet composes that shape.
   */
  taskExample: string | null
}

/**
 * Services that look like ERC-8183 sellers: the latest probe's A2A card lists the
 * `negotiate` or `notify_funded` skill or names ERC-8183, plus every first-party agent.
 * The negotiate endpoint is the card's own `url`, the address the agent publishes.
 */
export async function sellerCandidates(): Promise<SellerCandidate[]> {
  const fp = firstPartyAgents()
  const fpIds = fp.map((a) => canonicalAgentId(a))
  const rows = rowsOf(await db().execute(sql`
    with lp as (
      select ps.service_id, ps.agent_id, p.manifest, p.executable_endpoint
      from probe_schedule ps join probe p on p.id = ps.last_probe_id
    ),
    cat as (
      select distinct on (agent_id) agent_id, category
      from agent_category
      order by agent_id, (category <> 'unclassified') desc, confidence desc, assigned_at desc
    )
    select lp.service_id, a.id as agent_id, a.chain_id, a.token_id, a.name, a.agent_wallet, a.owner_address,
           coalesce(lp.manifest->>'url', lp.executable_endpoint, s.resolved_endpoint, s.endpoint) as endpoint,
           case when cat.category = 'unclassified' then null else cat.category end as category,
           exists (
             select 1 from jsonb_array_elements(case when jsonb_typeof(lp.manifest->'skills') = 'array' then lp.manifest->'skills' else '[]'::jsonb end) x
             where x->>'id' in ('negotiate', 'notify_funded') or (x->>'id') ilike '%8183%' or (x->>'name') ilike '%erc-8183%'
           ) or coalesce(lp.manifest->>'description', '') ilike '%8183%' as advertises,
           (select x->'examples'->>0
              from jsonb_array_elements(case when jsonb_typeof(lp.manifest->'skills') = 'array' then lp.manifest->'skills' else '[]'::jsonb end) x
             where coalesce(x->>'id', '') not in ('negotiate', 'notify_funded') and jsonb_typeof(x->'examples') = 'array'
             limit 1) as task_example
    from lp
    join agent a on a.id = lp.agent_id
    join agent_service s on s.id = lp.service_id
    left join cat on cat.agent_id = a.id
    where s.kind = 'a2a' and (
      a.id in (${sql.join(fpIds.map((id) => sql`${id}`), sql`, `)})
      -- Any answering A2A agent classified into a hireable category gets a harmless price
      -- check: some production sellers (plain quotes) do not list a negotiate skill.
      or (cat.category in ('yield', 'grid', 'rebalancing', 'health_factor', 'security')
          and exists (select 1 from probe_schedule ps2 join probe p2 on p2.id = ps2.last_probe_id
                      where ps2.service_id = lp.service_id and p2.liveness in ('live', 'unbound', 'bad_schema')))
      or exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(lp.manifest->'skills') = 'array' then lp.manifest->'skills' else '[]'::jsonb end) x
        where x->>'id' in ('negotiate', 'notify_funded') or (x->>'id') ilike '%8183%' or (x->>'name') ilike '%erc-8183%'
      )
    )`))
  return rows.map((r) => {
    const tokenId = String(r['token_id'])
    const chainId = Number(r['chain_id'])
    const first = fp.find((a) => a.chainId === chainId && String(a.tokenId) === tokenId) ?? null
    return {
      serviceId: Number(r['service_id']),
      agentId: String(r['agent_id']),
      chainId,
      tokenId,
      name: String(r['name'] ?? 'Unnamed agent'),
      category: first?.category ?? (r['category'] ? String(r['category']) : null),
      endpoint: String(r['endpoint']),
      agentWallet: r['agent_wallet'] ? String(r['agent_wallet']) : null,
      owner: r['owner_address'] ? String(r['owner_address']) : null,
      firstParty: first,
      advertisesCommerce: r['advertises'] === true,
      taskExample: jsonTaskExample(r['task_example']),
    }
  })
}

/** A card example usable as a task: a JSON object, as text. Prose examples are not. */
export function jsonTaskExample(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2000) return null
  try {
    const j = JSON.parse(v) as unknown
    return j && typeof j === 'object' && !Array.isArray(j) ? v : null
  } catch {
    return null
  }
}

/** Store one quote attempt (first-party observation). */
export async function recordQuote(source: 'probe' | 'user', c: Pick<SellerCandidate, 'agentId' | 'serviceId' | 'endpoint'>, q: QuoteResult, extra?: Record<string, unknown>): Promise<number> {
  const neg = q.negotiation ?? undefined
  const simple = q.simple ?? undefined
  const [row] = await db().insert(commerceQuote).values({
    source,
    agentId: c.agentId,
    serviceId: c.serviceId,
    endpoint: c.endpoint,
    ok: q.ok,
    failure: q.ok ? null : q.reason,
    detail: q.ok ? null : q.detail.slice(0, 500),
    chainId: q.ok ? q.chainId : (q.chainId ?? neg?.chain_id ?? null),
    provider: q.ok ? q.provider : (q.provider ?? null),
    priceRaw: q.ok ? q.price.toString() : (neg?.response.terms?.price ?? simple?.price ?? null),
    token: q.ok ? q.token.address : (neg?.response.terms?.currency ?? simple?.payment_token ?? null),
    tokenSymbol: q.ok ? q.token.symbol : null,
    tokenDecimals: q.ok ? q.token.decimals : null,
    quoteExpiresAt: q.ok ? new Date(q.expiresAt * 1000) : (neg?.response.quote_expires_at ? new Date(neg.response.quote_expires_at * 1000) : null),
    estimatedCompletionSeconds: q.ok ? q.estimatedCompletionSeconds : (neg?.response.estimated_completion_seconds ?? null),
    negotiationHash: neg?.negotiation_hash ?? null,
    providerSig: neg?.provider_sig ?? null,
    quoteHash: q.ok ? q.quoteHash : null,
    latencyMs: q.latencyMs,
    signed: q.ok ? q.signed : Boolean(neg?.provider_sig),
    raw: (neg ?? simple) ? { ...((neg ?? simple) as Record<string, unknown>), ...(extra ?? {}) } : (extra ?? null),
  }).returning({ id: commerceQuote.id })
  return row?.id ?? 0
}

/** Minutes between probe quotes for a seller, by what we last saw. */
export function quoteIntervalMinutes(firstParty: boolean, lastOk: boolean | null): number {
  if (firstParty) return 10
  if (lastOk) return 30
  return 6 * 60
}

/** One pass of the quote probe: every seller whose next quote is due. Never creates a job. */
export async function runQuoteProbe(opts: { concurrency?: number; limit?: number } = {}): Promise<{ attempted: number; ok: number; failures: Record<string, number> }> {
  const candidates = await sellerCandidates()
  const last = new Map<number, { at: number; ok: boolean }>()
  for (const r of rowsOf(await db().execute(sql`
    select distinct on (service_id) service_id, created_at, ok
    from commerce_quote where source = 'probe' and service_id is not null
    order by service_id, created_at desc`))) {
    last.set(Number(r['service_id']), { at: new Date(r['created_at'] as string).getTime(), ok: r['ok'] === true })
  }
  const now = Date.now()
  const due = candidates
    .filter((c) => {
      const l = last.get(c.serviceId)
      return !l || now - l.at >= quoteIntervalMinutes(c.firstParty !== null, l.ok) * 60_000
    })
    .sort((a, b) => Number(b.firstParty !== null) - Number(a.firstParty !== null))
    .slice(0, opts.limit ?? 60)
  const failures: Record<string, number> = {}
  let ok = 0
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, due.length) }, async () => {
    for (;;) {
      const c = due[cursor++]
      if (!c) return
      const task = probeTask(c.category ?? 'general')
      let q = await requestQuote(c.endpoint, task, { agentWallet: c.agentWallet, agentOwner: c.owner })
      // Declined in plain English: ask once more with the seller's own example task.
      if (!q.ok && q.reason === 'declined' && c.taskExample) {
        q = await requestQuote(c.endpoint, { ...task, task_description: c.taskExample }, { agentWallet: c.agentWallet, agentOwner: c.owner })
      }
      await recordQuote('probe', c, q)
      if (q.ok) ok++
      else failures[q.reason] = (failures[q.reason] ?? 0) + 1
    }
  }))
  return { attempted: due.length, ok, failures }
}

/** First-party agents carry their category from config, as an owner-declared label. */
export async function syncFirstPartyCategories(): Promise<number> {
  let n = 0
  for (const a of firstPartyAgents()) {
    const id = canonicalAgentId(a)
    const r = await db().execute(sql`
      insert into agent_category (agent_id, category, confidence, method, rationale)
      select ${id}, ${a.category}, 1, 'owner_declared', 'Marque reference agent, config/first-party.json'
      where exists (select 1 from agent where id = ${id})
      on conflict (agent_id, category) do nothing
      returning agent_id`)
    n += rowsOf(r).length
  }
  return n
}

export interface ServiceCommerce {
  serviceId: number
  agentId: string
  state: CommercialState
  chainId: number | null
  provider: string | null
  priceRaw: string | null
  token: { address: string; symbol: string; decimals: number } | null
  quotedAt: string | null
  quoteExpiresAt: string | null
  failure: string | null
  failureDetail: string | null
  deliveredJobs: number
  /** Null when no quote succeeded; false for a plain quote bound to the registered wallet. */
  signed: boolean | null
}

/**
 * The commercial state of every seller service, from the newest quote (probe or user)
 * and indexed job history. `callableServiceIds` marks services with a fresh live probe,
 * for the preview_only state.
 */
export async function commercialStates(): Promise<Map<number, ServiceCommerce>> {
  const quotes = rowsOf(await db().execute(sql`
    select distinct on (service_id) service_id, agent_id, ok, failure, detail, chain_id, provider, price_raw, token,
           token_symbol, token_decimals, created_at, quote_expires_at, negotiation_hash, provider_sig, signed
    from commerce_quote where service_id is not null
    order by service_id, created_at desc`))
  const delivered = new Map<string, number>()
  for (const r of rowsOf(await db().execute(sql`
    select chain_id, lower(provider) as provider, count(*)::int as n
    from commerce_job where state in ('COMPLETED', 'PAID') group by 1, 2`).catch(() => []))) {
    delivered.set(`${r['chain_id']}:${r['provider']}`, Number(r['n']))
  }
  const out = new Map<number, ServiceCommerce>()
  const now = Date.now()
  for (const q of quotes) {
    const at = new Date(q['created_at'] as string).getTime()
    const fresh = now - at <= QUOTE_FRESH_MS
    const wellFormed = typeof q['negotiation_hash'] === 'string' && typeof q['provider_sig'] === 'string' && (q['provider_sig'] as string).length > 2
    const chainId = q['chain_id'] == null ? null : Number(q['chain_id'])
    const provider = q['provider'] ? String(q['provider']) : null
    const n = provider && chainId ? delivered.get(`${chainId}:${provider.toLowerCase()}`) ?? 0 : 0
    let state: CommercialState = 'unavailable'
    if (fresh && q['ok'] === true) state = n > 0 ? 'settleable' : 'hireable'
    else if (fresh && wellFormed) state = 'quoteable'
    out.set(Number(q['service_id']), {
      serviceId: Number(q['service_id']),
      agentId: String(q['agent_id']),
      state,
      chainId,
      provider,
      priceRaw: q['price_raw'] ? String(q['price_raw']) : null,
      token: q['ok'] === true && q['token'] ? { address: String(q['token']), symbol: String(q['token_symbol']), decimals: Number(q['token_decimals']) } : null,
      quotedAt: new Date(at).toISOString(),
      quoteExpiresAt: q['quote_expires_at'] ? new Date(q['quote_expires_at'] as string).toISOString() : null,
      failure: q['ok'] === true ? null : (q['failure'] ? String(q['failure']) : null),
      failureDetail: q['ok'] === true ? null : (q['detail'] ? String(q['detail']) : null),
      deliveredJobs: n,
      signed: q['ok'] === true ? q['signed'] !== false : null,
    })
  }
  return out
}

export interface CoverageAgent {
  agentId: string
  agentKey: string
  tokenId: string
  chainId: number
  name: string
  owner: string | null
  firstParty: boolean
  serviceId: number
  endpoint: string
  state: CommercialState
  advertisesCommerce: boolean
  signed: boolean | null
  quote: { chainId: number | null; priceRaw: string | null; token: string | null; decimals: number | null; quotedAt: string | null; ageSeconds: number | null } | null
  failure: string | null
  failureDetail: string | null
}

export interface CategoryCoverage {
  category: string
  hireable: number
  operators: number
  thirdPartyOperators: number
  firstParty: number
  cheapest: { priceRaw: string; token: string; decimals: number; chainId: number; agentKey: string } | null
  freshestQuoteAgeSeconds: number | null
  agents: CoverageAgent[]
}

/** Per-category commercial supply (SPEC-TRACKING 6.5), from stored quotes only. */
export async function coverage(): Promise<{ measuredAt: string; categories: CategoryCoverage[]; unclassifiedHireable: CoverageAgent[] }> {
  const [candidates, states] = await Promise.all([sellerCandidates(), commercialStates()])
  const now = Date.now()
  const agents: Array<CoverageAgent & { category: string | null }> = candidates.map((c) => {
    const s = states.get(c.serviceId)
    return {
      agentId: c.agentId,
      agentKey: c.agentId,
      tokenId: c.tokenId,
      chainId: c.chainId,
      name: c.name,
      owner: c.owner,
      firstParty: c.firstParty !== null,
      serviceId: c.serviceId,
      endpoint: c.endpoint,
      category: c.category,
      state: s?.state ?? 'unavailable',
      advertisesCommerce: c.advertisesCommerce,
      signed: s?.signed ?? null,
      quote: s ? {
        chainId: s.chainId, priceRaw: s.priceRaw, token: s.token?.symbol ?? null, decimals: s.token?.decimals ?? null,
        quotedAt: s.quotedAt, ageSeconds: s.quotedAt ? Math.round((now - Date.parse(s.quotedAt)) / 1000) : null,
      } : null,
      failure: s?.failure ?? null,
      failureDetail: s?.failureDetail ?? null,
    }
  })
  const isHire = (a: CoverageAgent) => a.state === 'hireable' || a.state === 'settleable'
  const categories = HIREABLE_CATEGORIES.map((category): CategoryCoverage => {
    const inCat = agents.filter((a) => a.category === category)
    const hire = inCat.filter(isHire)
    const owners = new Set(hire.map((a) => (a.owner ?? a.agentId).toLowerCase()))
    const tpOwners = new Set(hire.filter((a) => !a.firstParty).map((a) => (a.owner ?? a.agentId).toLowerCase()))
    const priced = hire.filter((a) => a.quote?.priceRaw && a.quote.token && a.quote.decimals !== null && a.quote.chainId !== null)
    priced.sort((a, b) => Number(BigInt(a.quote!.priceRaw!) - BigInt(b.quote!.priceRaw!)))
    const c = priced[0]
    const ages = hire.map((a) => a.quote?.ageSeconds).filter((x): x is number => typeof x === 'number')
    return {
      category,
      hireable: hire.length,
      operators: owners.size,
      thirdPartyOperators: tpOwners.size,
      firstParty: hire.filter((a) => a.firstParty).length,
      cheapest: c ? { priceRaw: c.quote!.priceRaw!, token: c.quote!.token!, decimals: c.quote!.decimals!, chainId: c.quote!.chainId!, agentKey: c.agentKey } : null,
      freshestQuoteAgeSeconds: ages.length ? Math.min(...ages) : null,
      agents: inCat.sort((a, b) => Number(isHire(b)) - Number(isHire(a)) || a.name.localeCompare(b.name)),
    }
  })
  return {
    measuredAt: new Date().toISOString(),
    categories,
    unclassifiedHireable: agents.filter((a) => a.category === null && isHire(a)),
  }
}
