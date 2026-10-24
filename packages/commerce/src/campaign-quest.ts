import { sql } from 'drizzle-orm'
import { getAddress, parseAbi } from 'viem'
import { db } from '@marque/db'
import { safeFetch } from '@marque/probe'
import { network, type ChainId } from './config.js'
import { chainClient } from './chain.js'
import { teamWallets } from './quest.js'
import { CAMPAIGN, campaignStartMs, campaignEndMs, FUNDED_STATUSES, marketplaceName, pgArray, SHORTLIST, type Attribution } from './campaign.js'
import { addressTransactions, hasNodeReal, type AddressTx } from './nodereal.js'

/**
 * GET /api/v1/quest/{address} (SPEC-ADOPTION 2.3 to 2.5). The organizer's two tracks for any
 * address, from chain data only. Every check is in exactly one of the five states of
 * invariant 33; only `observed` is ever shown green, and `declared` never is.
 */

export type CheckState = 'observed' | 'not_yet' | 'declared' | 'not_observable' | 'excluded'
export interface Check { state: CheckState; reason: string; next?: { label: string; href: string } | null; [k: string]: unknown }

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>
const str = (v: unknown): string | null => (v == null ? null : String(v))
const iso = (v: unknown): string | null => (v == null ? null : new Date(v as string).toISOString())
/** Agent ids are chain:registry:token; only those characters pass. */
const pgArrayIds = (list: string[]) => `{${list.map((v) => v.replace(/[^0-9a-zA-Zx:]/g, '')).join(',')}}`
const startSec = Math.floor(campaignStartMs / 1000)
const endSec = Math.floor(campaignEndMs / 1000)

export interface QuestHireRow {
  chainId: number
  jobId: string
  fundedTx: string | null
  fundedAt: string | null
  createdAt: string | null
  provider: string
  agent: { chainId: number; tokenId: string | null; name: string | null; key: string; shared: number; category: string | null }
  marketplace: string | null
  marketplaceName: string | null
  attribution: Attribution | null
  status: string
  counts: boolean
  reason: string | null
}

interface AgentRef { chainId: number; tokenId: string; name: string | null; wallet: string | null; owner: string | null }

/** Agents whose registered wallet (preferred) or owner is one of the providers, per chain. Ingest stores both lowercase. */
async function agentsForProviders(pairs: Array<{ chainId: number; provider: string }>): Promise<Map<string, AgentRef[]>> {
  const out = new Map<string, AgentRef[]>()
  if (!pairs.length) return out
  const chains = pairs.map((p) => p.chainId)
  const providers = pairs.map((p) => p.provider)
  const rows = rowsOf(await db().execute(sql`
    with wanted as (select distinct * from unnest(${pgArray(chains)}::int[], ${pgArray(providers)}::text[]) as w(chain_id, provider))
    select w.chain_id, w.provider, a.token_id, a.name, a.agent_wallet as wallet, a.owner_address as owner, true as by_wallet
    from wanted w join agent a on a.agent_wallet = w.provider and a.chain_id = w.chain_id
    union all
    select w.chain_id, w.provider, a.token_id, a.name, a.agent_wallet as wallet, a.owner_address as owner, false as by_wallet
    from wanted w join agent a on a.owner_address = w.provider and a.chain_id = w.chain_id`))
  for (const r of rows) {
    const k = `${r['chain_id']}:${r['provider']}`
    const list = out.get(k) ?? []
    list.push({ chainId: Number(r['chain_id']), tokenId: String(r['token_id']), name: str(r['name']), wallet: str(r['wallet']), owner: str(r['owner']), ...(r['by_wallet'] ? { byWallet: true } : {}) } as AgentRef)
    out.set(k, list)
  }
  // A wallet match beats an owner match for the same provider.
  for (const [k, list] of out) {
    const wallet = list.filter((a) => (a as AgentRef & { byWallet?: boolean }).byWallet)
    if (wallet.length) out.set(k, wallet)
  }
  return out
}

/** The identity a description names itself (Pokter's envelope carries chainId and tokenId). */
function identityInDescription(description: string, chainId: number): string | null {
  try {
    const j = JSON.parse(description) as Record<string, unknown>
    const id = j['identity'] as Record<string, unknown> | undefined
    if (id && Number(id['chainId']) === chainId && id['tokenId'] != null && /^\d+$/.test(String(id['tokenId']))) return String(id['tokenId'])
  } catch { /* not JSON */ }
  return null
}

/** Hire track (SPEC-ADOPTION 2.3). */
export async function hireTrack(address: string, chains: ChainId[]) {
  const wallet = address.toLowerCase()
  const rows = rowsOf(await db().execute(sql`
    select j.*, i.agent_id as intent_agent
    from campaign_job j
    left join hire_intent i on i.chain_id = j.chain_id and i.job_id = j.job_id
    where j.client = ${wallet} and j.chain_id = any(${pgArray(chains)}::int[])
    order by j.funded_at nulls last, j.created_at nulls last, j.job_id::numeric`))
  const refs = await agentsForProviders(rows.map((r) => ({ chainId: Number(r['chain_id']), provider: String(r['provider']) })))
  const hires: QuestHireRow[] = []
  const counted = new Map<string, QuestHireRow>()
  for (const r of rows) {
    const chainId = Number(r['chain_id'])
    const provider = String(r['provider'])
    const status = Number(r['status'])
    const fundedAt = iso(r['funded_at'])
    const candidates = refs.get(`${chainId}:${provider}`) ?? []
    const named = str(r['intent_agent'])?.split(':').pop() ?? identityInDescription(String(r['description']), chainId)
    const pick = (named ? candidates.find((a) => a.tokenId === named) : null) ?? (candidates.length === 1 ? candidates[0]! : null)
    const tokenId = pick?.tokenId ?? named ?? null
    const key = tokenId ? `${chainId}:${tokenId}` : `${chainId}:wallet:${provider}`
    const fundedInWindow = fundedAt !== null && Date.parse(fundedAt) <= campaignEndMs
    const funded = FUNDED_STATUSES.has(status) || r['funded_tx'] != null
    let reason: string | null = null
    if (!funded) reason = status === 0 ? 'Recorded, not funded. It does not count.' : 'Closed without a deposit. It does not count.'
    else if (!fundedInWindow && fundedAt) reason = 'Funded after Set and Earn closed.'
    else if (provider === wallet) reason = 'This wallet hired itself.'
    const row: QuestHireRow = {
      chainId, jobId: String(r['job_id']), fundedTx: str(r['funded_tx']), fundedAt, createdAt: iso(r['created_at']), provider,
      agent: { chainId, tokenId, name: pick?.name ?? (candidates.length > 1 ? `${candidates.length} agents share this wallet` : null), key, shared: candidates.length, category: null },
      marketplace: str(r['marketplace']), marketplaceName: marketplaceName(str(r['marketplace'])),
      attribution: (str(r['attribution']) as Attribution | null), status: String(r['status_name']),
      counts: false, reason,
    }
    if (!row.reason && !counted.has(key)) { row.counts = true; counted.set(key, row) }
    else if (!row.reason) row.reason = 'Same agent as an earlier hire.'
    hires.push(row)
  }
  // Categories for the optional "Try all four" list (one query for every identified agent).
  const ids = [...new Set(hires.filter((h) => h.agent.tokenId).map((h) => `${h.chainId}:${network(h.chainId).identityRegistry.toLowerCase()}:${h.agent.tokenId}`))]
  if (ids.length) {
    const cats = rowsOf(await db().execute(sql`select distinct on (agent_id) agent_id, category from agent_category where agent_id = any(${pgArrayIds(ids)}::text[]) order by agent_id, confidence desc`))
    const byId = new Map(cats.map((c) => [String(c['agent_id']), String(c['category'])]))
    for (const h of hires) if (h.agent.tokenId) h.agent.category = byId.get(`${h.chainId}:${network(h.chainId).identityRegistry.toLowerCase()}:${h.agent.tokenId}`) ?? null
  }
  const countedRows = [...counted.values()]
  const named = [...new Set(countedRows.map((h) => h.marketplace).filter((m): m is string => Boolean(m)))]
  const notRecorded = countedRows.filter((h) => !h.marketplace).length
  const distinctAgents = countedRows.length
  const status = distinctAgents >= CAMPAIGN.required.agents && named.length >= CAMPAIGN.required.marketplaces ? 'met'
    : distinctAgents >= CAMPAIGN.required.agents && named.length === 1 && notRecorded >= 1 ? 'likely'
      : 'not_met'
  return {
    status, distinctAgents, required: CAMPAIGN.required,
    marketplaces: { named, notRecorded },
    hires,
    hiredAgentKeys: countedRows.map((h) => h.agent.key),
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Build track (SPEC-ADOPTION 2.4)                                                            */

const identityAbi = parseAbi(['function ownerOf(uint256) view returns (address)', 'function getAgentWallet(uint256) view returns (address)', 'function tokenURI(uint256) view returns (string)'])
const comptrollerAbi = parseAbi(['function getAllMarkets() view returns (address[])'])

const PANCAKE: Record<ChainId, { npm: string; routers: string[]; masterChef: string | null }> = {
  56: {
    npm: '0x46a15b0b27311cedf172ab29e4f4766fbe7f4364',
    routers: ['0x13f4ea83d0bd40e75c8222255bc855a974568dd4', '0x1b81d678ffb9c0263b24a97847620c99d213eb14', '0x10ed43c718714eb63d5aa57b78b54704e256024e', '0x1a0a18ac4becddbd6389559687d1a73d8927e416'],
    masterChef: '0x556b9306565093c855aea9ae92a594704c2cd59e',
  },
  97: {
    npm: '0x427bf5b37357632377ecbec9de3626c71a5396c1',
    routers: ['0x9a489505a00ce272eaa5e07dba6491314cae3796', '0x1b81d678ffb9c0263b24a97847620c99d213eb14', '0xd99d1c33f9fc3444f8101754abc46c52416550d1'],
    masterChef: null,
  },
}
const VENUS_COMPTROLLER: Record<ChainId, `0x${string}`> = { 56: '0xfD36E2c2a6789Db23113685031d7F16329158384', 97: '0x94d1820b2D1c7c7452A163983Dc888CEC546b77D' }

const venusCache = new Map<ChainId, { at: number; markets: string[] }>()
async function venusContracts(chainId: ChainId): Promise<string[]> {
  const c = venusCache.get(chainId)
  if (c && Date.now() - c.at < 6 * 3600_000) return c.markets
  const markets = await chainClient(chainId).readContract({ address: VENUS_COMPTROLLER[chainId], abi: comptrollerAbi, functionName: 'getAllMarkets' }) as string[]
  const list = [VENUS_COMPTROLLER[chainId].toLowerCase(), ...markets.map((m) => m.toLowerCase())]
  venusCache.set(chainId, { at: Date.now(), markets: list })
  return list
}

/** The contracts an action of each category goes to (SPEC-ACT 2 allowlist, plus PancakeSwap routers for grid). */
export async function categoryContracts(chainId: ChainId, category: string | null): Promise<Set<string> | null> {
  const p = PANCAKE[chainId]
  switch (category) {
    case 'health_factor': return new Set(await venusContracts(chainId))
    case 'yield': return new Set([...(await venusContracts(chainId)), ...(p.masterChef ? [p.masterChef] : [])])
    case 'rebalancing': return new Set([p.npm, ...(p.masterChef ? [p.masterChef] : [])])
    case 'grid': return new Set(p.routers)
    default: return null
  }
}

/** Free tunnels and app hosts: a card there is not at "its registered domain". */
const PLATFORM_HOSTS = ['sslip.io', 'nip.io', 'xip.io', 'vercel.app', 'netlify.app', 'onrender.com', 'herokuapp.com', 'railway.app', 'fly.dev', 'ngrok-free.app', 'ngrok.io', 'ngrok.app', 'trycloudflare.com', 'pages.dev', 'workers.dev', 'github.io', 'replit.app', 'repl.co', 'glitch.me', 'loca.lt', 'localtunnel.me']

/** Strict enough to say why a card fails; loose enough for both shapes seen in the wild. */
export function cardVerdict(url: string, body: string): { ok: boolean; reason: string; name: string | null; description: string | null } {
  let host = ''
  try { host = new URL(url).hostname.toLowerCase() } catch { return { ok: false, reason: 'The card address is not a valid URL.', name: null, description: null } }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return { ok: false, reason: `The card is served from a raw IP address (${host}), not a domain.`, name: null, description: null }
  const platform = PLATFORM_HOSTS.find((p) => host === p || host.endsWith(`.${p}`))
  if (platform) return { ok: false, reason: /^(sslip|nip|xip)\.io$/.test(platform) ? `The card is served from ${platform}, which turns an IP address into a name. It is not the agent's own domain.` : `The card is on a shared ${platform} address, not the agent's own domain.`, name: null, description: null }
  let j: Record<string, unknown>
  try {
    const v = JSON.parse(body) as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, reason: 'The card address returned JSON that is not an object.', name: null, description: null }
    j = v as Record<string, unknown>
  } catch { return { ok: false, reason: 'The card address did not return JSON.', name: null, description: null } }
  const inner = j['card'] && typeof j['card'] === 'object' ? (j['card'] as Record<string, unknown>) : null
  const card = inner ?? j
  const status = typeof j['status'] === 'string' ? (j['status'] as string) : null
  const presence = typeof j['presence'] === 'string' ? (j['presence'] as string) : null
  const name = typeof card['name'] === 'string' && (card['name'] as string).trim() ? (card['name'] as string).trim() : null
  const description = typeof card['description'] === 'string' && (card['description'] as string).trim() ? (card['description'] as string).trim() : null
  const endpoint = typeof card['url'] === 'string' ? card['url'] as string : typeof card['endpoint'] === 'string' ? card['endpoint'] as string : null
  const skills = Array.isArray(card['skills']) ? (card['skills'] as unknown[]) : []
  const missing: string[] = []
  if (status && /unbound|inactive|draft/i.test(status)) missing.push(`it says status ${status}`)
  if (presence && /offline/i.test(presence)) missing.push('it says it is offline')
  if (!name) missing.push('it has no name')
  if (!description) missing.push('it does not say what the agent does')
  if (!endpoint) missing.push('it names no endpoint to call')
  if (skills.length === 0) missing.push('it lists no skills')
  if (missing.length) return { ok: false, reason: `Returned JSON, but not a valid A2A card: ${missing.join(', ')}.`, name, description }
  return { ok: true, reason: 'A valid A2A card that names the agent and what it does.', name, description }
}

const cardCache = new Map<string, { at: number; v: { ok: boolean; reason: string; url: string | null; name: string | null; description: string | null } }>()
async function readCard(agentId: string): Promise<{ ok: boolean; reason: string; url: string | null; name: string | null; description: string | null }> {
  const hit = cardCache.get(agentId)
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.v
  const [svc] = rowsOf(await db().execute(sql`
    select coalesce(resolved_endpoint, endpoint) as url from agent_service
    where agent_id = ${agentId} and lower(kind) = 'a2a' and coalesce(currently_declared, true) and (not coalesce(is_template, false) or resolved_endpoint is not null)
    order by last_seen desc nulls last limit 1`))
  const url = str(svc?.['url'])
  let v: { ok: boolean; reason: string; url: string | null; name: string | null; description: string | null }
  if (!url) v = { ok: false, reason: 'The registration names no A2A agent card.', url: null, name: null, description: null }
  else {
    const res = await safeFetch(url, { timeoutMs: 6_000, maxBytes: 256 * 1024 })
    if (!res.ok) v = { ok: false, reason: `The card could not be fetched (${res.failure === 'dns' ? 'the domain does not resolve' : res.failure === 'timeout' ? 'it did not answer in 6 s' : res.failure === 'tls' ? 'its TLS certificate failed' : 'connection failed'}).`, url, name: null, description: null }
    else if (res.status !== 200) v = { ok: false, reason: `The card address answered HTTP ${res.status}.`, url, name: null, description: null }
    else v = { ...cardVerdict(res.finalUrl ?? url, res.body), url }
  }
  cardCache.set(agentId, { at: Date.now(), v })
  return v
}

interface OwnedAgent { chainId: ChainId; tokenId: string; id: string; name: string | null; wallet: string | null; owner: string; registeredAt: string | null }

/** ERC-8004 identities this address owns on the given chains, confirmed with ownerOf now. */
async function ownedAgents(address: string, chains: ChainId[]): Promise<OwnedAgent[]> {
  const wallet = address.toLowerCase()
  const rows = rowsOf(await db().execute(sql`
    select id, chain_id, token_id, name, agent_wallet as wallet, registry_created_at
    from agent where owner_address = ${wallet} and chain_id = any(${pgArray(chains)}::int[])
    order by chain_id, token_id::numeric limit 12`))
  const out: OwnedAgent[] = []
  for (const r of rows) {
    const chainId = Number(r['chain_id']) as ChainId
    const tokenId = String(r['token_id'])
    let owner = wallet
    let agentWallet = str(r['wallet'])
    try {
      const c = chainClient(chainId)
      const reg = network(chainId).identityRegistry as `0x${string}`
      const [o, w] = await Promise.all([
        c.readContract({ address: reg, abi: identityAbi, functionName: 'ownerOf', args: [BigInt(tokenId)] }),
        c.readContract({ address: reg, abi: identityAbi, functionName: 'getAgentWallet', args: [BigInt(tokenId)] }).catch(() => null),
      ])
      owner = String(o).toLowerCase()
      if (w && !/^0x0{40}$/i.test(String(w))) agentWallet = String(w).toLowerCase()
    } catch { /* keep the indexed owner; the check below says it was not re-read */ }
    if (owner !== wallet) continue
    out.push({ chainId, tokenId, id: String(r['id']), name: str(r['name']), wallet: agentWallet, owner, registeredAt: iso(r['registry_created_at']) })
  }
  return out
}

/** The six build criteria for one identity, read now (MCP check_agent, SPEC-ACCESS 3.2). Null when the token does not exist. */
export async function checkAgent(chainId: ChainId, tokenId: string) {
  const c = chainClient(chainId)
  const reg = network(chainId).identityRegistry as `0x${string}`
  let owner: string
  try { owner = String(await c.readContract({ address: reg, abi: identityAbi, functionName: 'ownerOf', args: [BigInt(tokenId)] })).toLowerCase() } catch { return null }
  const w = await c.readContract({ address: reg, abi: identityAbi, functionName: 'getAgentWallet', args: [BigInt(tokenId)] }).catch(() => null)
  const [r] = rowsOf(await db().execute(sql`select id, name, agent_wallet, registry_created_at from agent where chain_id = ${chainId} and token_id = ${tokenId} limit 1`))
  return buildChecks({
    chainId, tokenId, id: r ? String(r['id']) : `${chainId}:${reg.toLowerCase()}:${tokenId}`, name: r ? str(r['name']) : null,
    wallet: w && !/^0x0{40}$/i.test(String(w)) ? String(w).toLowerCase() : r ? str(r['agent_wallet']) : null, owner, registeredAt: r ? iso(r['registry_created_at']) : null,
  })
}

/** When this exact token reached its owner: the registry's ERC-721 transfer (mint) for the token id. */
async function registrationTime(a: OwnedAgent): Promise<string | null> {
  if (a.registeredAt) return a.registeredAt
  if (!hasNodeReal()) return null
  try {
    const { txs } = await addressTransactions(a.chainId, a.owner, { category: '721', direction: 'to', sinceSec: 0, maxPages: 5 })
    const reg = network(a.chainId).identityRegistry.toLowerCase()
    const hit = txs.filter((t) => t.contractAddress === reg && t.tokenId === a.tokenId).sort((x, y) => x.blockTimeStamp - y.blockTimeStamp)[0]
    return hit ? new Date(hit.blockTimeStamp * 1000).toISOString() : null
  } catch { return null }
}

const dayOf = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10)

async function buildChecks(a: OwnedAgent) {
  const forgeHref = `/builders?agent=${a.chainId}:${a.tokenId}`
  const checks: Record<string, Check> = {}
  const builder = new Set([a.owner, ...(a.wallet ? [a.wallet] : [])])
  const actor = a.wallet ?? a.owner
  // The slow reads (card fetch, transaction history) start together.
  const cardP = readCard(a.id)
  const registeredP = registrationTime(a)
  const actionsP: Promise<AddressTx[] | null> = hasNodeReal()
    ? addressTransactions(a.chainId, actor, { category: 'external', direction: 'from', sinceSec: startSec, untilSec: endSec, maxPages: 3 }).then((r) => r.txs.filter((t) => t.ok)).catch(() => null)
    : Promise.resolve(null)
  const fundedP: Promise<Set<string> | null> = hasNodeReal()
    ? Promise.all([...builder].flatMap((b) => (['external', '20'] as const).map((category) => addressTransactions(a.chainId, b, { category, direction: 'from', sinceSec: startSec - 30 * 86_400, untilSec: endSec, maxPages: 3 }))))
      .then((rs) => new Set(rs.flatMap((r) => r.txs.filter((t) => t.ok && BigInt(t.value || '0x0') > 0n).map((t) => t.to)))).catch(() => null)
    : Promise.resolve(null)

  // 1. Registered, owned and listed.
  checks['registered'] = { state: 'observed', reason: `ERC-8004 #${a.tokenId} on ${a.chainId === 56 ? 'BSC mainnet' : 'BSC testnet'}, owned by this wallet (ownerOf read now).` }
  const [listed] = rowsOf(await db().execute(sql`
    select (select max(created_at) from commerce_quote q where q.agent_id = ${a.id} and q.ok and q.chain_id = ${a.chainId} and q.created_at > now() - interval '2 hours') as quoted,
           (select max(published_at) from builder_listing b where b.agent_id = ${a.id} and b.status = 'published' and b.withdrawn_at is null) as published`))
  checks['listed'] = listed?.['quoted'] || listed?.['published']
    ? { state: 'observed', reason: listed?.['quoted'] ? 'Listed and hireable on Marque now (a live quote in the last 2 hours).' : 'Published on Marque after passing its listing checks.' }
    : { state: 'not_observable', reason: 'Not hireable on Marque yet. A listing on another marketplace is not visible here.', next: { label: 'List it on Marque', href: forgeHref } }

  // 2. Discoverable domain agent card naming role and category.
  const card = await cardP
  const [cat] = rowsOf(await db().execute(sql`select category from agent_category where agent_id = ${a.id} order by confidence desc limit 1`))
  const category = str(cat?.['category'])
  checks['card'] = !card.ok
    ? { state: 'not_yet', reason: card.reason, url: card.url, next: { label: 'Fix the agent card in the Forge', href: forgeHref } }
    : !category
      ? { state: 'not_yet', reason: 'The card is valid, but Marque could not tell its category from what it says.', url: card.url, next: { label: 'Name the category in the card', href: forgeHref } }
      : { state: 'observed', reason: `${card.reason} Category: ${category.replace('_', ' ')}.`, url: card.url, category }

  // 3. Answers random probes (Marque's probe history, last 24 h).
  const [pr] = rowsOf(await db().execute(sql`
    select count(*)::int as total, count(*) filter (where liveness = 'live')::int as live
    from probe where agent_id = ${a.id} and checked_at > now() - interval '24 hours'`))
  const total = Number(pr?.['total'] ?? 0), live = Number(pr?.['live'] ?? 0)
  checks['probes'] = total === 0
    ? { state: 'not_yet', reason: 'Marque has not probed it in the last 24 hours.', answered: 0, total }
    : live / total >= 0.8
      ? { state: 'observed', reason: `Answered ${live} of ${total} probes in the last 24 hours.`, answered: live, total }
      : { state: 'not_yet', reason: `Answered ${live} of ${total} probes in the last 24 hours.`, answered: live, total, next: { label: 'Check why it does not answer', href: forgeHref } }

  // 4. Completed hires from 3 distinct independent wallets.
  const providers = [...builder]
  const jobs = rowsOf(await db().execute(sql`
    select job_id, client from campaign_job where chain_id = ${a.chainId} and provider = any(${pgArray(providers)}::text[]) and status = 3 order by completed_at nulls last`))
  const clients = [...new Set(jobs.map((j) => String(j['client'])).filter((c) => !builder.has(c)))]
  const fundedSet = await fundedP
  const funded = fundedSet ?? new Set<string>()
  const method = fundedSet ? 'token_and_bnb_transfers_checked' : 'transfers_not_checked'
  const independent = clients.filter((c) => !funded.has(c))
  const excludedFunded = clients.length - independent.length
  checks['hires'] = independent.length >= CAMPAIGN.build.hires
    ? { state: 'observed', reason: `${independent.length} completed hires from different wallets that this wallet did not fund.`, independent: independent.length, required: CAMPAIGN.build.hires, method }
    : { state: 'not_yet', reason: `${independent.length} of ${CAMPAIGN.build.hires} independent hirers${excludedFunded ? ` (${excludedFunded} more hired it, but received tokens or BNB from this wallet)` : ''}.`, independent: independent.length, required: CAMPAIGN.build.hires, method, next: { label: 'Share your listing', href: `/agents/${a.chainId === 56 ? '' : '97/'}${a.tokenId}` } }

  // 5 and 6. Onchain actions, and whether they match the category.
  const txs = await actionsP
  if (!txs) {
    checks['actions'] = { state: 'not_observable', reason: 'Transaction history is unavailable right now.', count: null, days: null, required: { count: CAMPAIGN.build.actions, days: CAMPAIGN.build.days } }
    checks['category'] = { state: 'not_observable', reason: 'Needs the transaction history above.' }
  } else {
    const days = new Set(txs.map((t) => dayOf(t.blockTimeStamp)))
    checks['actions'] = txs.length >= CAMPAIGN.build.actions && days.size >= CAMPAIGN.build.days
      ? { state: 'observed', reason: `${txs.length} transactions from ${actor === a.owner ? 'the owner wallet' : 'the agent wallet'} on ${days.size} separate days since 1 Oct.`, count: txs.length, days: days.size, required: { count: CAMPAIGN.build.actions, days: CAMPAIGN.build.days } }
      : { state: 'not_yet', reason: txs.length ? `${txs.length} transactions on ${days.size} day${days.size === 1 ? '' : 's'} since 1 Oct; needs ${CAMPAIGN.build.actions} on ${CAMPAIGN.build.days} days.` : 'No transactions from the agent wallet since 1 Oct.', count: txs.length, days: days.size, required: { count: CAMPAIGN.build.actions, days: CAMPAIGN.build.days } }
    const contracts = await categoryContracts(a.chainId, category).catch(() => null)
    if (!contracts) {
      checks['category'] = { state: 'not_observable', reason: category ? `Marque has no contract list for ${category.replace('_', ' ')} actions.` : 'Needs a category from the agent card first.' }
    } else {
      const match = txs.filter((t) => contracts.has(t.to))
      const mdays = new Set(match.map((t) => dayOf(t.blockTimeStamp)))
      checks['category'] = match.length >= CAMPAIGN.build.actions && mdays.size >= CAMPAIGN.build.days
        ? { state: 'observed', reason: `${match.length} of those went to ${category!.replace('_', ' ')} contracts, on ${mdays.size} days.`, count: match.length, days: mdays.size }
        : { state: 'not_yet', reason: `${match.length} transaction${match.length === 1 ? '' : 's'} to ${category!.replace('_', ' ')} contracts (${[...contracts].length} known) on ${mdays.size} day${mdays.size === 1 ? '' : 's'}.`, count: match.length, days: mdays.size }
    }
  }

  // Originality: registration time against the announcement. The repo cannot be checked here.
  const registered = await registeredP
  const after = registered ? registered.slice(0, 10) >= CAMPAIGN.announced : null
  checks['timing'] = after === true
    ? { state: 'observed', reason: `Registered ${registered!.slice(0, 10)}, after the 1 Oct announcement. Public repository: declared.`, registeredAt: registered }
    : after === false
      ? { state: 'declared', reason: `Registered ${registered!.slice(0, 10)}, before the 1 Oct announcement. BNB counts it only if it was listed after; Marque cannot see listing dates elsewhere.`, registeredAt: registered }
      : { state: 'not_observable', reason: 'Registration time not found.', registeredAt: null }

  const criteria = [
    checks['registered']!.state === 'observed' && checks['listed']!.state === 'observed',
    checks['card']!.state === 'observed', checks['probes']!.state === 'observed', checks['hires']!.state === 'observed',
    checks['actions']!.state === 'observed', checks['category']!.state === 'observed',
  ]
  return { chainId: a.chainId, tokenId: a.tokenId, name: a.name, agentWallet: a.wallet, checks, observed: criteria.filter(Boolean).length, of: 6 }
}

export async function buildTrack(address: string, chains: ChainId[]) {
  const owned = await ownedAgents(address, chains)
  const agents = await Promise.all(owned.slice(0, 6).map((a) => buildChecks(a)))
  agents.sort((x, y) => y.observed - x.observed)
  return { agents, more: Math.max(0, owned.length - 6) }
}

/* ------------------------------------------------------------------------------------------ */

/** The cheapest live agent that would add a new distinct agent, on testnet first (free). */
async function suggestedHire(exclude: string[]) {
  const rows = rowsOf(await db().execute(sql`
    select distinct on (q.agent_id) q.agent_id, q.chain_id, q.price_raw, q.token_symbol, q.token_decimals, a.name, a.token_id
    from commerce_quote q join agent a on a.id = q.agent_id
    where q.ok and q.created_at > now() - interval '2 hours' and q.chain_id = a.chain_id and q.quote_expires_at > now()
    order by q.agent_id, q.created_at desc`))
  const fresh = rows.filter((r) => !exclude.includes(`${r['chain_id']}:${r['token_id']}`))
  const price = (r: Record<string, unknown>) => Number(r['price_raw'] ?? 0) / 10 ** Number(r['token_decimals'] ?? 18)
  const pick = [...fresh].sort((x, y) => (Number(x['chain_id']) === 97 ? 0 : 1) - (Number(y['chain_id']) === 97 ? 0 : 1) || price(x) - price(y))[0]
  if (!pick) return null
  const chainId = Number(pick['chain_id'])
  const p = price(pick)
  return {
    chainId, tokenId: String(pick['token_id']), agentId: String(pick['agent_id']), name: str(pick['name']),
    price: `${p >= 0.01 ? p.toFixed(2) : String(p)} ${chainId === 97 ? 'test ' : ''}${str(pick['token_symbol']) ?? ''}`.trim(),
    free: chainId === 97,
    href: `?hire=${encodeURIComponent(String(pick['agent_id']))}`,
  }
}

const TRY_FOUR = ['yield', 'grid', 'rebalancing', 'health_factor'] as const

export async function questFor(address: string, chains: ChainId[] = [56, 97]) {
  const wallet = getAddress(address)
  const lower = wallet.toLowerCase()
  const now = Date.now()
  const team = teamWallets().includes(lower)
  const blocksP = Promise.all(chains.map((c) => chainClient(c).getBlockNumber().then((b) => [c, Number(b)] as const).catch(() => [c, null] as const)))
  const hireP = hireTrack(lower, chains)
  const [hire, build, suggestion] = await Promise.all([
    hireP, buildTrack(lower, chains),
    team ? Promise.resolve(null) : hireP.then((h) => suggestedHire(h.hiredAgentKeys)).catch(() => null),
  ])
  const next: Array<{ action: string; label: string; href: string }> = []
  if (!team) {
    const needAgents = Math.max(0, CAMPAIGN.required.agents - hire.distinctAgents)
    const onMarque = hire.marketplaces.named.includes('marque.trade')
    if (hire.status !== 'met') {
      if (needAgents > 0) next.push({ action: 'hire', label: `Hire ${needAgents} more different agent${needAgents === 1 ? '' : 's'}${onMarque && hire.marketplaces.named.length < 2 ? ', at least one on another marketplace' : ''}`, href: suggestion?.href ?? '/register?lane=practice' })
      else if (hire.marketplaces.named.length < 2) next.push({ action: 'hire', label: onMarque ? 'Hire 1 more agent on another marketplace' : 'Hire 1 more agent on Marque', href: onMarque ? '#marketplaces' : (suggestion?.href ?? '/register?lane=practice') })
    }
    const best = build.agents[0]
    if (!best) next.push({ action: 'build', label: 'Register an agent of your own', href: '/builders' })
    else {
      const first = Object.values(best.checks).find((c) => c.state === 'not_yet' && c.next)
      if (first?.next) next.push({ action: 'build', label: `${first.next.label} (${best.name ?? `#${best.tokenId}`})`, href: first.next.href })
    }
  }
  return {
    address: wallet,
    observedAt: new Date(now).toISOString(),
    window: { start: CAMPAIGN.start, end: CAMPAIGN.end },
    closed: now >= campaignEndMs,
    chains,
    /** The chain head on each network when this was read. */
    blocks: Object.fromEntries(await blocksP) as Record<number, number | null>,
    excluded: { team, reason: team ? 'A published Marque team wallet. Its activity is shown, never counted.' : null },
    hire: { status: team ? 'excluded' : hire.status, distinctAgents: hire.distinctAgents, required: hire.required, marketplaces: hire.marketplaces, hires: hire.hires },
    build: { agents: build.agents, more: build.more },
    registration: { state: 'not_observable', reason: 'BNB keeps the registration form. Marque cannot see it.', formUrl: CAMPAIGN.rulesUrl },
    suggestion,
    next,
    tryAllFour: TRY_FOUR.map((category) => {
      const h = hire.hires.find((x) => x.marketplace === 'marque.trade' && x.agent.category === category && !x.reason?.startsWith('Recorded') && !x.reason?.startsWith('Closed'))
      return { category, done: Boolean(h), job: h ? { chainId: h.chainId, jobId: h.jobId } : null }
    }),
    marketplaces: SHORTLIST.map((m) => ({ name: m.name, domain: m.domain, url: m.url })),
    method: {
      attribution: 'marque_intent > client_ref > via <domain> in the task > known envelope > not recorded (https://marque.trade/docs/attribution)',
      funded: 'A hire counts from its JobFunded event in the window. Created-but-unfunded jobs are listed and never counted.',
      independence: hasNodeReal() ? 'Direct BNB and token transfers from the builder wallets to each hirer are checked. Transfers through other wallets or contracts are not.' : 'Not checked: no transaction history source.',
    },
  }
}
