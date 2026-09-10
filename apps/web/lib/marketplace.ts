import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { REFERENCE_AGENTS, type ReferenceAgent } from './reference-agents'

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
  warrant: { status: 'warranted' | 'failed' | 'untested'; testId: string | null; date: string | null; failedField: string | null }
  qual: Qual
  /** Whether a free read-only preview is possible (adapter + read method). */
  previewable: boolean
  /** Null when Hire is wired; otherwise the reason it is not. */
  hireBlockedReason: string | null
}

export interface MarketQuery {
  category?: string | null
  search?: string | null
  liveNow?: boolean
  warranted?: boolean
  thirdPartyOnly?: boolean
  hasPrice?: boolean
  iface?: string | null
  sort?: 'best' | 'proven' | 'price' | 'fast' | 'recent'
  limit?: number
  offset?: number
}

const HIRE_WIRED = new Set(['a2a', 'mcp'])
function ownerLabel(owner: string | null): string | null {
  if (!owner) return null
  return `${owner.slice(0, 6)}…${owner.slice(-4)}`
}

/** An https image URL from the registry metadata, or null. */
function httpImage(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return /^https:\/\/[^\s]+$/i.test(s) ? s : null
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

/** Reference-agent rows, each with its live warrant from conformance_result. */
async function referenceRows(): Promise<MarketRow[]> {
  const warrants = await db().execute(sql`
    select distinct on (agent_id, test_id) agent_id, test_id, pass, failed_fields, ran_at
    from conformance_result
    where agent_id like 'marque:%'
    order by agent_id, test_id, ran_at desc
  `)
  const wl = (((warrants as unknown as { rows?: unknown[] }).rows ?? (warrants as unknown as unknown[])) as Array<Record<string, unknown>>)
  const byAgent = new Map<string, { pass: boolean; testId: string; failedField: string | null; date: string }>()
  for (const w of wl) {
    const id = String(w['agent_id'])
    const pass = w['pass'] === true
    const prev = byAgent.get(id)
    // Prefer a pass; otherwise keep the most recent.
    if (!prev || (pass && !prev.pass)) {
      const ff = Array.isArray(w['failed_fields']) ? (w['failed_fields'] as string[]) : []
      byAgent.set(id, {
        pass, testId: String(w['test_id']),
        failedField: ff[0] ?? null,
        date: w['ran_at'] instanceof Date ? (w['ran_at'] as Date).toISOString() : String(w['ran_at']),
      })
    }
  }

  return REFERENCE_AGENTS.map((a: ReferenceAgent): MarketRow => {
    const w = byAgent.get(a.id)
    const status = w ? (w.pass ? 'warranted' : 'failed') : 'untested'
    return {
      agentId: a.id,
      tokenId: a.slug,
      name: a.name,
      category: a.category,
      isReference: true,
      identityCount: 1,
      owner: null,
      ownerLabel: 'Marque',
      host: `marque.trade/agents/${a.slug}`,
      identity: {
        imageUrl: null,
        description: null,
        contractAddress: null,
        website: 'https://marque.trade',
        x402: false,
        registeredAt: null,
      },
      liveness: 'live',
      latencyMs: null,
      interfaces: ['a2a'],
      protocols: ['A2A'],
      price: a.category === 'security' ? '0.25 U per call' : '0.15 U per call',
      warrant: { status, testId: w?.testId ?? null, date: w?.date ?? null, failedField: w?.failedField ?? null },
      qual: status === 'warranted' ? 'warranted' : status === 'failed' ? 'failed' : 'callable',
      previewable: true,
      hireBlockedReason: null,
    }
  })
}

/** The base set (dedup + reference merge) is expensive (~2.4s); memoise it. */
let baseMemo: { at: number; rows: MarketRow[] } | null = null
const BASE_TTL_MS = 3 * 60_000

async function marketplaceBase(): Promise<MarketRow[]> {
  if (baseMemo && Date.now() - baseMemo.at < BASE_TTL_MS) return baseMemo.rows
  const rows = [...(await referenceRows()), ...(await queryThirdParty())]
  baseMemo = { at: Date.now(), rows }
  return rows
}

async function queryThirdParty(): Promise<MarketRow[]> {
  const rows = await db().execute(sql`
    with latest as (
      select distinct on (agent_id) agent_id, liveness, latency_ms, failure_class, skills, checked_at
      from probe order by agent_id, checked_at desc
    ),
    svc as (
      select agent_id,
             array_agg(distinct kind) as kinds,
             min(declared_price) filter (where declared_price is not null) as price,
             (array_agg(coalesce(resolved_endpoint, endpoint) order by (declared_price is not null) desc))[1] as endpoint
      from agent_service group by agent_id
    ),
    conf as (
      select distinct on (agent_id) agent_id, test_id, pass, failed_fields, ran_at
      from conformance_result where agent_id like '56:%'
      order by agent_id, (pass) desc, ran_at desc
    ),
    qualifying as (
      select a.id, a.token_id, a.name, a.owner_address, a.supported_protocols,
             a.image_url, a.description, a.contract_address, a.x402_supported, a.registry_created_at,
             (a.raw_metadata #>> '{offchain_content,image}') as meta_image,
             p.liveness, p.latency_ms,
             s.kinds, s.price,
             regexp_replace(coalesce(s.endpoint, ''), '^(https?://[^/]+).*', '\\1') as host,
             c.test_id as conf_test, c.pass as conf_pass, c.failed_fields as conf_failed, c.ran_at as conf_at,
             cat.category
      from agent a
      left join latest p on p.agent_id = a.id
      left join svc s on s.agent_id = a.id
      left join conf c on c.agent_id = a.id
      left join agent_category cat on cat.agent_id = a.id
      where a.chain_id = 56
        and (p.liveness = 'live' or c.agent_id is not null)
        and a.id <> 'canary:ssrf'
    )
    select
      (array_agg(id order by (liveness='live') desc, latency_ms asc nulls last))[1] as agent_id,
      (array_agg(token_id order by (liveness='live') desc, latency_ms asc nulls last))[1] as token_id,
      (array_agg(name order by length(coalesce(name,'')) desc))[1] as name,
      owner_address,
      host,
      count(*) as identities,
      bool_or(liveness = 'live') as any_live,
      min(latency_ms) as latency_ms,
      (jsonb_agg(to_jsonb(coalesce(kinds, array[]::text[])) order by (liveness='live') desc) -> 0) as kinds,
      (jsonb_agg(coalesce(supported_protocols, '[]'::jsonb) order by (liveness='live') desc) -> 0) as protocols,
      (array_agg(image_url order by (liveness='live') desc, (image_url is not null) desc))[1] as image_url,
      (array_agg(meta_image order by (liveness='live') desc, (meta_image is not null) desc))[1] as meta_image,
      (array_agg(description order by length(coalesce(description,'')) desc))[1] as description,
      (array_agg(contract_address order by (contract_address is not null) desc))[1] as contract_address,
      bool_or(x402_supported) as x402,
      min(registry_created_at) as registered_at,
      min(price) as price,
      bool_or(conf_pass) as any_pass,
      (array_agg(conf_test order by (conf_pass) desc, conf_at desc))[1] as conf_test,
      (array_agg(conf_failed order by (conf_pass) desc, conf_at desc))[1] as conf_failed,
      max(conf_at) as conf_at,
      (array_agg(category order by (category is not null and category <> 'unclassified') desc))[1] as category
    from qualifying
    group by owner_address, host
    order by identities desc
  `)

  const list = (((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])) as Array<Record<string, unknown>>)

  const thirdParty: MarketRow[] = list.map((r) => {
    const live = r['any_live'] === true
    const confTest = r['conf_test'] ? String(r['conf_test']) : null
    const confPass = r['any_pass'] === true
    const failed = Array.isArray(r['conf_failed']) ? (r['conf_failed'] as string[]) : []
    const warrantStatus: 'warranted' | 'failed' | 'untested' = confTest ? (confPass ? 'warranted' : 'failed') : 'untested'
    const kinds = Array.isArray(r['kinds']) ? (r['kinds'] as string[]).filter(Boolean) : []
    const qual: Qual = confPass ? 'warranted' : confTest ? 'failed' : live ? 'callable' : 'unbound'
    const name = String(r['name'] ?? 'Unnamed agent') || 'Unnamed agent'
    const owner = r['owner_address'] ? String(r['owner_address']) : null
    const hireable = kinds.some((k) => HIRE_WIRED.has(k))
    const host = r['host'] ? String(r['host']) : null
    const website = originOf(r['meta_image']) ?? (host && host !== '' ? null : null)
    return {
      agentId: String(r['agent_id']),
      tokenId: r['token_id'] ? String(r['token_id']) : null,
      name,
      category: r['category'] ? String(r['category']) : null,
      isReference: false,
      identityCount: Number(r['identities'] ?? 1),
      owner,
      ownerLabel: ownerLabel(owner),
      host,
      identity: {
        imageUrl: (r['image_url'] ? String(r['image_url']) : null) ?? httpImage(r['meta_image']),
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
      price: r['price'] ? String(r['price']) : null,
      warrant: {
        status: warrantStatus,
        testId: confTest,
        date: r['conf_at'] instanceof Date ? (r['conf_at'] as Date).toISOString() : (r['conf_at'] ? String(r['conf_at']) : null),
        failedField: failed[0] ?? null,
      },
      qual,
      previewable: hireable,
      hireBlockedReason: hireable ? null : (kinds.length ? `Hire is not wired for a ${kinds.join('/')} interface yet` : 'No callable interface declared'),
    }
  })

  return thirdParty
}

export async function marketplaceAgents(q: MarketQuery = {}): Promise<{ rows: MarketRow[]; generatedAt: string; total: number; offset: number; hasMore: boolean }> {
  // Clone: the base is memoised and the sort below is in place.
  let all = [...(await marketplaceBase())]

  // Filters (TS side — the qualifying set is small).
  if (q.category) all = all.filter((r) => r.category === q.category)
  if (q.liveNow) all = all.filter((r) => r.liveness === 'live')
  if (q.warranted) all = all.filter((r) => r.warrant.status === 'warranted')
  if (q.thirdPartyOnly) all = all.filter((r) => !r.isReference)
  if (q.hasPrice) all = all.filter((r) => !!r.price)
  if (q.iface) all = all.filter((r) => r.interfaces.includes(q.iface as string) || (q.iface === 'erc8183' && r.protocols.some((p) => /8183/.test(p))))
  if (q.search) {
    const s = q.search.toLowerCase()
    all = all.filter((r) =>
      r.name.toLowerCase().includes(s)
      || (r.owner ?? '').toLowerCase().includes(s)
      || (r.ownerLabel ?? '').toLowerCase().includes(s)
      || r.interfaces.some((k) => k.includes(s))
      || r.protocols.some((p) => p.toLowerCase().includes(s))
      || (r.category ?? '').includes(s))
  }

  const byQual = (a: MarketRow, b: MarketRow) => QUAL_RANK[a.qual] - QUAL_RANK[b.qual]
  const byWarrantDate = (a: MarketRow, b: MarketRow) => (b.warrant.date ?? '').localeCompare(a.warrant.date ?? '')
  const priceNum = (r: MarketRow) => {
    const m = r.price?.match(/[\d.]+/)
    return m ? Number(m[0]) : Number.POSITIVE_INFINITY
  }

  all.sort((a, b) => {
    const tie = a.agentId.localeCompare(b.agentId)
    switch (q.sort) {
      case 'proven': return byQual(a, b) || byWarrantDate(a, b) || (a.latencyMs ?? 1e9) - (b.latencyMs ?? 1e9) || tie
      case 'price': return priceNum(a) - priceNum(b) || byQual(a, b) || tie
      case 'fast': return (a.latencyMs ?? 1e9) - (b.latencyMs ?? 1e9) || byQual(a, b) || tie
      case 'recent': return (b.warrant.date ?? '').localeCompare(a.warrant.date ?? '') || byQual(a, b) || tie
      default:
        return byQual(a, b) || byWarrantDate(a, b) || b.identityCount - a.identityCount || (a.latencyMs ?? 1e9) - (b.latencyMs ?? 1e9) || tie
    }
  })

  const limit = Number.isFinite(q.limit) ? Math.max(1, Math.min(Math.floor(q.limit!), 300)) : 120
  const requestedOffset = Number.isFinite(q.offset) ? Math.max(0, Math.floor(q.offset!)) : 0
  const offset = all.length ? Math.min(requestedOffset, Math.floor((all.length - 1) / limit) * limit) : 0
  return { rows: all.slice(offset, offset + limit), total: all.length, offset,
    hasMore: offset + limit < all.length, generatedAt: new Date(baseMemo?.at ?? Date.now()).toISOString() }
}
