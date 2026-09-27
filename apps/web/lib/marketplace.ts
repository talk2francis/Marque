import 'server-only'
import { sql } from 'drizzle-orm'
import { db, firstPartyIds, canonicalAgentIdSql } from '@marque/db'
import { commercialStates, formatAmount, type CommercialState } from '@marque/commerce'
import { agentState, TASK_FOR_CATEGORY } from './agent-state'
import { agentTracks, EMPTY_TRACK, type AgentTrack } from './agent-track'

/**
 * The Marketplace view of the Register (P10.5B).
 *
 * The default view is the agents a buyer could actually act on: live and
 * callable, plus anything that has a conformance result (pass OR a named
 * failure), plus Marque's reference agents. That set is ~2k rows, so it can be
 * deduplicated by operator and sorted by qualification on every request. The
 * graveyard (unbound, dead) is a separate paged view with its real counts.
 *
 * Qualification order — the single biggest fix in the build:
 *   0 warranted        passed an MCS test; most recent warrant first
 *   1 tested, failed   callable, ran the test, failed — with the field named
 *   2 callable         live, not yet tested
 *   3 unbound          answers but nothing is callable
 *   4 dead             does not answer
 */

export type Qual = 'warranted' | 'failed' | 'callable' | 'unbound' | 'dead'
const QUAL_RANK: Record<Qual, number> = { warranted: 0, failed: 1, callable: 2, unbound: 3, dead: 4 }

export interface MarketRow {
  agentId: string
  tokenId: string | null
  name: string
  category: string | null
  isReference: boolean
  /** How many ERC-8004 identities this one operator+endpoint has registered. */
  identityCount: number
  owner: string | null
  ownerLabel: string | null
  host: string | null
  /** Registry-supplied identity (CLAIMED). Null where the registry has nothing. */
  identity: {
    imageUrl: string | null
    description: string | null
    contractAddress: string | null
    /** The agent's own website, when it published one distinct from its endpoint. */
    website: string | null
    x402: boolean
    registeredAt: string | null
  }
  liveness: string | null
  /** measured p95-ish: we store one latency per probe; this is the last one. */
  latencyMs: number | null
  interfaces: string[]
  protocols: string[]
  price: string | null
  /** MEASURED: from a live quote this agent returned. CLAIMED: declared in its registry metadata. */
  priceProvenance: 'MEASURED' | 'CLAIMED' | null
  /**
   * The commercial axis (SPEC-COMMERCE 4.1), independent of the warrant: can a buyer's
   * wallet hire this exact service through ERC-8183 escrow right now, and at what price.
   */
  commerce: {
    state: CommercialState
    serviceId: number | null
    chainId: number | null
    provider: string | null
    priceRaw: string | null
    token: { address: string; symbol: string; decimals: number } | null
    signedQuote: boolean | null
    quotedAt: string | null
    deliveredJobs: number
    failure: string | null
  }
  warrant: { status: 'warranted' | 'failed' | 'untested'; testId: string | null; date: string | null; failedField: string | null }
  qual: Qual
  /** Whether a free read-only preview is possible (adapter + read method). */
  previewable: boolean
  /** Null when Hire is wired; otherwise the reason it is not. */
  hireBlockedReason: string | null
  /**
   * Its record as a seller on BSC mainnet, from the chain index: verified-buyer rating
   * (kept apart from all feedback), jobs by outcome, measured delivery time.
   */
  track: AgentTrack
}

export interface MarketQuery {
  category?: string | null
  search?: string | null
  liveNow?: boolean
  warranted?: boolean
  thirdPartyOnly?: boolean
  /** Only agents a buyer's wallet can hire through ERC-8183 right now. */
  hireableOnly?: boolean
  /** The default view never shows Unclassified agents (Phase 2 requirement 4.3). */
  includeUnclassified?: boolean
  hasPrice?: boolean
  iface?: string | null
  /**
   * The marketplace tab (DESIGN-SYSTEM.md 8.3). ready: hireable now. free: answers a free
   * task at its own endpoint. tested: has a conformance result, pass or fail.
   */
  tab?: 'ready' | 'free' | 'tested' | 'all' | null
  /** Only Marque reference agents. `thirdPartyOnly` is the opposite toggle. */
  firstPartyOnly?: boolean
  /** The network its live quote is on (56 or 97). */
  network?: number | null
  /** The token its live quote is in, by symbol. */
  token?: string | null
  /** Live quote at or under this amount, in the quote token's units. */
  maxPrice?: number | null
  /** Verified-buyer average at or over this many stars. */
  minRating?: number | null
  sort?: 'best' | 'proven' | 'price' | 'fast' | 'recent' | 'rated'
  limit?: number
  offset?: number
}

const HIRE_WIRED = new Set(['a2a', 'mcp'])
function ownerLabel(owner: string | null): string | null {
  if (!owner) return null
  return `${owner.slice(0, 6)}…${owner.slice(-4)}`
}

/**
 * A registry image URL we are allowed to render — 8004scan's own image hosts
 * only. An arbitrary third-party image URL is never loaded (CSP, tracking
 * pixels, dead links); those agents get the generated emblem instead.
 */
function httpImage(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!/^https:\/\/[^\s]+$/i.test(s)) return null
  try {
    const h = new URL(s).hostname
    return /(^|\.)8004scan\.(io|app)$/i.test(h) ? s : null
  } catch {
    return null
  }
}
/** The origin of a registry-supplied URL — a hint at the agent's own site. */
function originOf(v: unknown): string | null {
  const s = httpImage(v)
  if (!s) return null
  try {
    const u = new URL(s)
    // A generic CDN or the 8004scan proxy is not "their website".
    if (/(^|\.)8004scan\.io$|(^|\.)ipfs\.|(^|\.)arweave\.|githubusercontent\.com$/i.test(u.hostname)) return null
    return `${u.protocol}//${u.hostname}`
  } catch {
    return null
  }
}

/** The base set (dedup + reference merge) is expensive (~2.4s); memoise it. */
let baseMemo: { at: number; rows: MarketRow[] } | null = null
const BASE_TTL_MS = 3 * 60_000

async function marketplaceBase(): Promise<MarketRow[]> {
  if (baseMemo && Date.now() - baseMemo.at < BASE_TTL_MS) return baseMemo.rows
  const rows = await queryAgents()
  baseMemo = { at: Date.now(), rows }
  return rows
}

async function queryAgents(): Promise<MarketRow[]> {
  const fp = new Set(firstPartyIds())
  const commerce = await commercialStates().catch(() => new Map())
  const rows = await db().execute(sql`
    with latest as (
      -- Newest probe per service by primary key (probe_schedule), not a scan of history.
      select ps.service_id, ps.agent_id, p.liveness, p.latency_ms,
             p.failure_class, p.skills, p.checked_at, p.task_kinds, p.manifest, p.executable_endpoint
      from probe_schedule ps join probe p on p.id = ps.last_probe_id
    ),
    svc as (
      select s.agent_id,
             array_agg(distinct s.kind) as kinds,
             array_agg(distinct s.kind) filter (
               where p.liveness = 'live' and p.checked_at > now() - interval '24 hours'
                 and s.kind in ('a2a', 'mcp', 'x402', 'erc8183')
             ) as live_kinds,
             coalesce(jsonb_agg(p.task_kinds) filter (
               where p.liveness = 'live' and p.checked_at > now() - interval '24 hours'
                 and s.kind in ('a2a', 'mcp', 'x402', 'erc8183')
             ), '[]'::jsonb) as live_task_kinds,
             bool_or(p.liveness in ('live', 'unbound', 'bad_schema') and p.checked_at > now() - interval '24 hours') as any_reachable,
             bool_or(p.liveness = 'live' and p.checked_at > now() - interval '24 hours'
               and s.kind in ('a2a', 'mcp', 'x402', 'erc8183')) as any_callable,
             min(p.latency_ms) filter (where p.liveness = 'live' and p.checked_at > now() - interval '24 hours') as latency_ms,
             min(s.declared_price) filter (where s.declared_price is not null) as price,
             (array_agg(coalesce(s.resolved_endpoint, s.endpoint) order by (p.liveness='live') desc, s.id))[1] as endpoint
      from agent_service s left join latest p on p.service_id = s.id
      group by s.agent_id
    ),
    conf as (
      -- Legacy marque:<slug> results fold onto the reference agent's registry row.
      -- Canonicalised once in a subquery: the helper binds its ids as parameters, so
      -- writing it in both DISTINCT ON and ORDER BY gives Postgres two different
      -- expressions and the query fails ("must match initial ORDER BY").
      select distinct on (cid) cid as agent_id, test_id, pass, failed_fields, ran_at
      from (
        select ${canonicalAgentIdSql(sql`agent_id`)} as cid, test_id, pass, failed_fields, ran_at
        from conformance_result where agent_id like '56:%' or agent_id like 'marque:%'
      ) cr
      order by cid, (pass) desc, ran_at desc
    ),
    cat as (
      select distinct on (agent_id) agent_id, category, confidence
      from agent_category
      order by agent_id, (category <> 'unclassified') desc, confidence desc, assigned_at desc
    ),
    qualifying as (
      select a.id, a.token_id, a.name, a.owner_address, a.supported_protocols,
             a.image_url, a.description, a.contract_address, a.x402_supported, a.registry_created_at,
             (a.raw_metadata #>> '{offchain_content,image}') as meta_image,
             case when s.any_callable then 'live' when s.any_reachable then 'unbound' else null end as liveness,
             s.latency_ms,
             s.kinds, s.live_kinds, s.live_task_kinds, s.price,
             regexp_replace(coalesce(s.endpoint, ''), '^(https?://[^/]+).*', '\\1') as host,
             c.test_id as conf_test, c.pass as conf_pass, c.failed_fields as conf_failed, c.ran_at as conf_at,
             cat.category
      from agent a
      left join svc s on s.agent_id = a.id
      left join conf c on c.agent_id = a.id
      left join cat on cat.agent_id = a.id
      where a.chain_id = 56
        and (s.any_reachable or c.agent_id is not null)
        and a.id <> 'canary:ssrf'
    )
    select
      id as agent_id,
      token_id,
      name,
      owner_address,
      host,
      count(*) over (partition by owner_address, host) as identities,
      (liveness = 'live') as any_live,
      latency_ms,
      coalesce(kinds, array[]::text[]) as kinds,
      coalesce(live_kinds, array[]::text[]) as live_kinds,
      live_task_kinds,
      supported_protocols as protocols,
      image_url,
      meta_image,
      description,
      contract_address,
      x402_supported as x402,
      registry_created_at as registered_at,
      price,
      coalesce(conf_pass, false) as any_pass,
      conf_test,
      conf_failed,
      conf_at,
      category
    from qualifying
    order by identities desc, agent_id
  `)

  const list = (((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])) as Array<Record<string, unknown>>)

  // Best commercial state per agent across its services.
  const RANK: Record<CommercialState, number> = { settleable: 0, hireable: 1, quoteable: 2, preview_only: 3, unavailable: 4 }
  const bestByAgent = new Map<string, ReturnType<typeof commerce.get>>()
  for (const c of commerce.values()) {
    const prev = bestByAgent.get(c.agentId)
    if (!prev || RANK[c.state as CommercialState] < RANK[prev.state as CommercialState]
      || (c.state === prev.state && c.signed === true && prev.signed !== true)) bestByAgent.set(c.agentId, c)
  }

  const thirdParty: Array<Omit<MarketRow, 'track'>> = list.map((r) => {
    const live = r['any_live'] === true
    const confTest = r['conf_test'] ? String(r['conf_test']) : null
    const confPass = r['any_pass'] === true
    const failed = Array.isArray(r['conf_failed']) ? (r['conf_failed'] as string[]) : []
    const warrantStatus: 'warranted' | 'failed' | 'untested' = confTest ? (confPass ? 'warranted' : 'failed') : 'untested'
    const kinds = Array.isArray(r['kinds']) ? (r['kinds'] as string[]).filter(Boolean) : []
    const liveKinds = Array.isArray(r['live_kinds']) ? (r['live_kinds'] as string[]).filter(Boolean) : []
    const taskKinds = (Array.isArray(r['live_task_kinds']) ? r['live_task_kinds'] as unknown[] : [])
      .flatMap((value) => Array.isArray(value) ? value : [])
      .filter((value): value is string => typeof value === 'string')
    const qual: Qual = confPass ? 'warranted' : confTest ? 'failed' : live ? 'callable' : 'unbound'
    const name = String(r['name'] ?? 'Unnamed agent') || 'Unnamed agent'
    const owner = r['owner_address'] ? String(r['owner_address']) : null
    const taskForCategory: Record<string, string | undefined> = {
      rebalancing: 'rebalance', grid: 'grid', yield: 'yield', health_factor: 'health_factor',
    }
    const requiredTask = taskForCategory[String(r['category'] ?? '')]
    const callable = liveKinds.some((k) => HIRE_WIRED.has(k))
    const hireable = callable && requiredTask !== undefined && taskKinds.includes(requiredTask)
    const host = r['host'] ? String(r['host']) : null
    const website = originOf(r['meta_image']) ?? (host && host !== '' ? null : null)
    return {
      agentId: String(r['agent_id']),
      tokenId: r['token_id'] ? String(r['token_id']) : null,
      name,
      category: r['category'] ? String(r['category']) : null,
      isReference: fp.has(String(r['agent_id'])),
      identityCount: Number(r['identities'] ?? 1),
      owner,
      ownerLabel: ownerLabel(owner),
      host,
      identity: {
        imageUrl: httpImage(r['image_url']) ?? httpImage(r['meta_image']),
        description: r['description'] ? String(r['description']) : null,
        contractAddress: r['contract_address'] ? String(r['contract_address']) : null,
        website,
        x402: r['x402'] === true,
        registeredAt: r['registered_at'] instanceof Date
          ? (r['registered_at'] as Date).toISOString()
          : (r['registered_at'] ? String(r['registered_at']) : null),
      },
      liveness: live ? 'live' : (r['liveness'] ? String(r['liveness']) : null),
      latencyMs: r['latency_ms'] == null ? null : Number(r['latency_ms']),
      interfaces: kinds,
      protocols: Array.isArray(r['protocols']) ? (r['protocols'] as string[]) : [],
      ...priceAndCommerce(bestByAgent.get(String(r['agent_id'])), live, r['price'] ? String(r['price']) : null),
      warrant: {
        status: warrantStatus,
        testId: confTest,
        date: r['conf_at'] instanceof Date ? (r['conf_at'] as Date).toISOString() : (r['conf_at'] ? String(r['conf_at']) : null),
        failedField: failed[0] ?? null,
      },
      qual,
      previewable: false,
      hireBlockedReason: hireable
        ? null
        : !callable
          ? (kinds.length ? `No fresh executable ${kinds.join('/')} service is verified` : 'No callable interface declared')
          : requiredTask === undefined
            ? 'No Charter task exists for this category'
            : `No live service has proved compatibility with ${requiredTask}`,
    }
  })

  const tracks = await agentTracks(56)
  return thirdParty.map((r) => ({ ...r, track: (r.tokenId && tracks[r.tokenId]) || EMPTY_TRACK(56) }))
}

type ServiceCommerceRow = Awaited<ReturnType<typeof commercialStates>> extends Map<number, infer V> ? V : never

/** A live quote wins (MEASURED); a declared price is shown as CLAIMED; never a constant. */
function priceAndCommerce(c: ServiceCommerceRow | undefined, live: boolean, declared: string | null): Pick<MarketRow, 'price' | 'priceProvenance' | 'commerce'> {
  const hire = c && (c.state === 'hireable' || c.state === 'settleable')
  const measured = hire && c.priceRaw && c.token ? `${formatAmount(c.priceRaw, c.token.decimals)} ${c.token.symbol}` : null
  return {
    price: measured ?? declared,
    priceProvenance: measured ? 'MEASURED' : declared ? 'CLAIMED' : null,
    commerce: {
      state: c && c.state !== 'unavailable' ? c.state : live ? 'preview_only' : 'unavailable',
      serviceId: c?.serviceId ?? null,
      chainId: c?.chainId ?? null,
      provider: c?.provider ?? null,
      priceRaw: hire ? c.priceRaw : null,
      token: hire ? c.token : null,
      signedQuote: c?.signed ?? null,
      quotedAt: c?.quotedAt ?? null,
      deliveredJobs: c?.deliveredJobs ?? 0,
      failure: c?.failure ?? null,
    },
  }
}

/** A live quote as a number in token units, or null (a declared price never filters as a quote). */
export function quotedPrice(r: Pick<MarketRow, 'commerce'>): number | null {
  const c = r.commerce
  if (!c.priceRaw || !c.token) return null
  return Number(c.priceRaw) / 10 ** c.token.decimals
}

/**
 * Answers a free task at its own endpoint: Marque's reference agents (their free face
 * runs the paid engine), and any agent with a live A2A service measured in the last 24 h.
 */
export function answersFree(r: Pick<MarketRow, 'isReference' | 'liveness' | 'interfaces'>): boolean {
  return r.isReference || (r.liveness === 'live' && r.interfaces.includes('a2a'))
}

export async function marketplaceAgents(q: MarketQuery = {}): Promise<{ rows: MarketRow[]; generatedAt: string; total: number; offset: number; hasMore: boolean }> {
  // Clone: the base is memoised and the sort below is in place.
  let all = [...(await marketplaceBase())]

  // Filters (TS side — the qualifying set is small).
  if (q.category) all = all.filter((r) => r.category === q.category)
  else if (!q.includeUnclassified) all = all.filter((r) => r.category !== null && r.category !== 'unclassified')
  if (q.hireableOnly) all = all.filter((r) => r.commerce.state === 'hireable' || r.commerce.state === 'settleable')
  if (q.liveNow) all = all.filter((r) => r.liveness === 'live')
  if (q.warranted) all = all.filter((r) => r.warrant.status === 'warranted')
  if (q.thirdPartyOnly) all = all.filter((r) => !r.isReference)
  if (q.firstPartyOnly) all = all.filter((r) => r.isReference)
  if (q.tab === 'ready') all = all.filter((r) => r.commerce.state === 'hireable' || r.commerce.state === 'settleable')
  if (q.tab === 'free') all = all.filter(answersFree)
  if (q.tab === 'tested') all = all.filter((r) => r.warrant.status !== 'untested')
  if (q.network) all = all.filter((r) => r.commerce.chainId === q.network)
  if (q.token) all = all.filter((r) => r.commerce.token?.symbol.toLowerCase() === q.token!.toLowerCase())
  if (q.maxPrice != null && Number.isFinite(q.maxPrice)) all = all.filter((r) => { const p = quotedPrice(r); return p !== null && p <= q.maxPrice! })
  if (q.minRating != null && Number.isFinite(q.minRating)) all = all.filter((r) => (r.track.verified.averageStars ?? 0) >= q.minRating!)
  if (q.hasPrice) all = all.filter((r) => !!r.price)
  if (q.iface) all = all.filter((r) => r.interfaces.includes(q.iface as string) || (q.iface === 'erc8183' && r.protocols.some((p) => /8183/.test(p))))
  if (q.search) {
    const s = q.search.toLowerCase()
    all = all.filter((r) =>
      r.name.toLowerCase().includes(s)
      // The registry description the agent publishes about itself. This is a
      // predicate over the already-materialised set, not SQL: the column is
      // read once by the memoised base query, so matching it costs one more
      // String.includes per row and needs no index and no migration.
      || (r.identity.description ?? '').toLowerCase().includes(s)
      || (r.owner ?? '').toLowerCase().includes(s)
      || (r.ownerLabel ?? '').toLowerCase().includes(s)
      || r.interfaces.some((k) => k.includes(s))
      || r.protocols.some((p) => p.toLowerCase().includes(s))
      || (r.category ?? '').includes(s))
  }

  const COMMERCE_RANK: Record<CommercialState, number> = { settleable: 0, hireable: 1, quoteable: 2, preview_only: 3, unavailable: 4 }
  // Hireable first (signed quotes before unsigned), then quality. Two axes, never merged into one badge.
  const byCommerce = (a: MarketRow, b: MarketRow) =>
    COMMERCE_RANK[a.commerce.state] - COMMERCE_RANK[b.commerce.state]
    || Number(b.commerce.signedQuote === true) - Number(a.commerce.signedQuote === true)
  const byQual = (a: MarketRow, b: MarketRow) => QUAL_RANK[a.qual] - QUAL_RANK[b.qual]
  const byWarrantDate = (a: MarketRow, b: MarketRow) => (b.warrant.date ?? '').localeCompare(a.warrant.date ?? '')
  const priceNum = (r: MarketRow) => {
    const m = r.price?.match(/[\d.]+/)
    return m ? Number(m[0]) : Number.POSITIVE_INFINITY
  }

  // Measured delivery (paid to delivered) when the agent has sold on chain, else probe latency.
  const speed = (r: MarketRow) => (r.track.delivery.medianSeconds !== null ? r.track.delivery.medianSeconds * 1000 : r.latencyMs ?? 1e12)
  const byRating = (a: MarketRow, b: MarketRow) =>
    (b.track.verified.averageStars ?? -1) - (a.track.verified.averageStars ?? -1) || b.track.verified.count - a.track.verified.count
  all.sort((a, b) => {
    const tie = a.agentId.localeCompare(b.agentId)
    switch (q.sort) {
      case 'proven': return byQual(a, b) || byWarrantDate(a, b) || (a.latencyMs ?? 1e9) - (b.latencyMs ?? 1e9) || tie
      case 'price': return priceNum(a) - priceNum(b) || byQual(a, b) || tie
      case 'fast': return speed(a) - speed(b) || byQual(a, b) || tie
      case 'recent': return (b.warrant.date ?? '').localeCompare(a.warrant.date ?? '') || byQual(a, b) || tie
      case 'rated': return byRating(a, b) || byCommerce(a, b) || byQual(a, b) || tie
      default:
        // Recommended: hireable first, then quality, then verified rating, then price.
        return byCommerce(a, b) || byQual(a, b) || byRating(a, b) || priceNum(a) - priceNum(b)
          || byWarrantDate(a, b) || b.identityCount - a.identityCount || (a.latencyMs ?? 1e9) - (b.latencyMs ?? 1e9) || tie
    }
  })

  const limit = Number.isFinite(q.limit) ? Math.max(1, Math.min(Math.floor(q.limit!), 300)) : 120
  const requestedOffset = Number.isFinite(q.offset) ? Math.max(0, Math.floor(q.offset!)) : 0
  const offset = all.length ? Math.min(requestedOffset, Math.floor((all.length - 1) / limit) * limit) : 0
  const page = all.slice(offset, offset + limit)
  const rows = await Promise.all(page.map(async (row) => {
    // Reference agents answer their free face directly; their Hire is the ERC-8183 rail.
    if (row.isReference) return { ...row, previewable: true, hireBlockedReason: null } satisfies MarketRow
    const task = TASK_FOR_CATEGORY[row.category ?? '']
    const state = await agentState(row.agentId, task ?? null).catch(() => null)
    const hireBlockedReason = state?.hireable
      ? null
      : !task
        ? 'No Charter task exists for this category'
        : state?.reasons.includes('PROBE_STALE')
          ? 'The latest service evidence is stale'
          : state?.reasons.includes('A2A_TASK_ENDPOINT_UNRESOLVED')
            ? 'The A2A card is readable, but message/send has not been verified'
            : `No live service has proved compatibility with ${task}`
    return {
      ...row,
      liveness: state?.callable ? 'live' : state?.reachable ? 'reachable' : row.liveness,
      qual: row.qual === 'warranted' || row.qual === 'failed' ? row.qual : state?.callable ? 'callable' : 'unbound',
      previewable: state?.previewable === true,
      hireBlockedReason,
    } satisfies MarketRow
  }))
  return { rows, total: all.length, offset,
    hasMore: offset + limit < all.length, generatedAt: new Date(baseMemo?.at ?? Date.now()).toISOString() }
}
