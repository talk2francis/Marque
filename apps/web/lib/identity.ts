import 'server-only'
import { getAddress, isAddress, type Address } from 'viem'
import { publicClient, BSC_MAINNET_ID } from '@marque/chain'
import { ScanClient } from '@marque/registry'
import { safeFetch } from '@marque/probe'

/**
 * Resolve an ERC-8004 identity for the builder claim rail (P10a).
 *
 * The chain is the source of truth: `ownerOf(tokenId)` on the identity
 * contract is what a signature is checked against, so it is read directly.
 * 8004scan is used only for the things a chain read cannot give cheaply — the
 * exact registry contract when there is more than one, and a name/description
 * to pre-fill the form — and it is best-effort: its outages (D8-05: their DB
 * flaps between 200 and 500) must not take the claim rail down with them.
 */

/**
 * Known ERC-8004 identity registries on BSC mainnet. 8004scan's per-token
 * `contract_address` wins when it answers; this is the fallback so a claim
 * still works while 8004scan is down. Configurable — a new registry
 * deployment is added here, never guessed.
 */
const BSC_REGISTRIES: Address[] = (process.env['BSC_ERC8004_REGISTRY'] ?? '0x8004a169fb4a3325136eb29fa0ceb6d2e539a432')
  .split(',').map((s) => s.trim()).filter((s) => isAddress(s)).map((s) => getAddress(s))

/** 8004scan calls are capped hard: a slow index must not stall an interactive flow. */
const SCAN_BUDGET_MS = 6_000
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))])
}

const ERC721_ABI = [
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'tokenURI', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'string' }] },
] as const

export interface ResolvedIdentity {
  chainId: number
  tokenId: string
  /** 8004scan's canonical "chainId:registry:tokenId" — our agent primary key. */
  agentId: string
  /** The ERC-8004 identity contract this token lives in. */
  contract: Address
  /** ownerOf(tokenId), read live from the contract. This is what must sign. */
  owner: Address
  /** Where the owner value came from. Always the chain here; never the indexer. */
  ownerProvenance: 'ONCHAIN'
  /** 8004scan's own owner value, shown only so a lag is visible, never trusted. */
  indexerOwner: string | null
  name: string | null
  description: string | null
  imageUrl: string | null
  /** The agent card URL, if one can be resolved. Used only to pre-fill the form. */
  cardUrl: string | null
  /** Best-effort card body for pre-fill. Fetched through the SSRF guard. */
  card: Record<string, unknown> | null
  /** Protocols the registry says this identity supports. Pre-fill hint only. */
  declaredProtocols: string[]
}

export type IdentityLookup =
  | { status: 'ok'; identity: ResolvedIdentity }
  | { status: 'not_found'; detail: string }
  | { status: 'ambiguous'; detail: string; candidates: Array<{ tokenId: string; name: string | null }> }
  | { status: 'error'; detail: string }

const TOKEN_RE = /^\d{1,78}$/

/** A bare token id, an 8004scan composite "56:0x..:123", or an owner address. */
export async function resolveIdentity(input: string): Promise<IdentityLookup> {
  const raw = input.trim()
  if (!raw) return { status: 'not_found', detail: 'Paste an ERC-8004 token id or the owner address.' }

  if (isAddress(raw)) return resolveByOwner(getAddress(raw))

  // "56:0xregistry:123" -> take the last segment as the token id.
  const tokenId = raw.includes(':') ? (raw.split(':').pop() ?? '').trim() : raw
  if (!TOKEN_RE.test(tokenId)) {
    return { status: 'not_found', detail: 'That is not a token id or an address. A token id is a plain number.' }
  }
  return resolveByToken(tokenId)
}

interface ScanHint {
  contract: Address | null
  agentId: string | null
  indexerOwner: string | null
  name: string | null
  description: string | null
  imageUrl: string | null
  cardUrl: string | null
  protocols: string[]
  hardNotFound: boolean
}

/** Best-effort 8004scan lookup. Returns nulls on any failure — never throws. */
async function scanHint(tokenId: string): Promise<ScanHint> {
  const empty: ScanHint = {
    contract: null, agentId: null, indexerOwner: null, name: null, description: null,
    imageUrl: null, cardUrl: null, protocols: [], hardNotFound: false,
  }
  const scan = new ScanClient(process.env['SCAN_API_KEY'])
  const res = await withTimeout(scan.getAgentResult(BSC_MAINNET_ID, tokenId), SCAN_BUDGET_MS)
  if (!res) return empty
  if (res.status === 'not_found') return { ...empty, hardNotFound: true }
  if (res.status !== 'ok') return empty
  const d = res.detail
  return {
    contract: d.contract_address && isAddress(d.contract_address) ? getAddress(d.contract_address) : null,
    agentId: d.agent_id || null,
    indexerOwner: d.owner_address ?? null,
    name: d.name ?? null,
    description: d.description ?? null,
    imageUrl: d.image_url ?? null,
    cardUrl: pickCardUrl(d),
    protocols: Array.isArray(d.supported_protocols) ? d.supported_protocols.filter((x): x is string => typeof x === 'string') : [],
    hardNotFound: false,
  }
}

/** `ownerOf(tokenId)` across candidate registries. Returns the first that answers. */
async function ownerOnChain(tokenId: string, prefer: Address | null): Promise<{ contract: Address; owner: Address } | null> {
  const candidates = prefer ? [prefer, ...BSC_REGISTRIES.filter((r) => r !== prefer)] : BSC_REGISTRIES
  for (const contract of candidates) {
    try {
      const res = await publicClient().readContract({
        address: contract, abi: ERC721_ABI, functionName: 'ownerOf', args: [BigInt(tokenId)],
      })
      return { contract, owner: getAddress(res as string) }
    } catch {
      // "no such token", a revert, or a transport error — try the next registry.
    }
  }
  return null
}

async function resolveByToken(tokenId: string): Promise<IdentityLookup> {
  const hint = await scanHint(tokenId)

  // AUTHORITY: the owner comes from the contract, whether or not 8004scan answered.
  const chain = await ownerOnChain(tokenId, hint.contract)
  if (!chain) {
    if (hint.hardNotFound) {
      return { status: 'not_found', detail: `No ERC-8004 identity #${tokenId} exists on BNB Smart Chain (56).` }
    }
    return {
      status: 'not_found',
      detail: `Token #${tokenId} was not found in a known ERC-8004 registry on chain 56. If it lives in a newer registry, that address has to be added to BSC_ERC8004_REGISTRY.`,
    }
  }
  const { contract, owner } = chain

  let cardUrl = hint.cardUrl
  let card: Record<string, unknown> | null = null
  if (!cardUrl) {
    try {
      const uri = await publicClient().readContract({
        address: contract, abi: ERC721_ABI, functionName: 'tokenURI', args: [BigInt(tokenId)],
      })
      cardUrl = normalizeUri(String(uri))
    } catch { /* tokenURI is optional on some deployments */ }
  }
  if (cardUrl) card = await fetchCard(cardUrl)

  return {
    status: 'ok',
    identity: {
      chainId: BSC_MAINNET_ID,
      tokenId,
      agentId: hint.agentId || `${BSC_MAINNET_ID}:${contract.toLowerCase()}:${tokenId}`,
      contract,
      owner,
      ownerProvenance: 'ONCHAIN',
      indexerOwner: hint.indexerOwner,
      name: hint.name ?? (typeof card?.['name'] === 'string' ? (card['name'] as string) : null),
      description: hint.description ?? (typeof card?.['description'] === 'string' ? (card['description'] as string) : null),
      imageUrl: hint.imageUrl,
      cardUrl,
      card,
      declaredProtocols: hint.protocols,
    },
  }
}

async function resolveByOwner(owner: Address): Promise<IdentityLookup> {
  // There is no cheap chain-only way to list an address's tokens, so this path
  // needs 8004scan. When it is down, say so and point at the token-id path,
  // which works without it.
  const scan = new ScanClient(process.env['SCAN_API_KEY'])
  const page = await withTimeout(
    scan.listAgents({ chainId: BSC_MAINNET_ID, limit: 100, extra: { owner_address: owner } }),
    SCAN_BUDGET_MS,
  )
  if (!page) {
    return { status: 'error', detail: '8004scan is not responding, so looking up by owner address is unavailable right now. Paste the token id instead — that path reads the chain directly.' }
  }
  // Never trust the upstream filter (AGENTS.md gotcha 5).
  const items = page.items.filter((it) => (it.owner_address ?? '').toLowerCase() === owner.toLowerCase())
  if (items.length === 0) {
    return { status: 'not_found', detail: `No ERC-8004 identity on chain 56 is indexed as owned by ${owner}. Paste the token id directly instead.` }
  }
  if (items.length > 1) {
    return {
      status: 'ambiguous',
      detail: `${owner} owns ${items.length} identities. Pick one by its token id.`,
      candidates: items.map((it) => ({ tokenId: it.token_id, name: it.name ?? null })),
    }
  }
  return resolveByToken(items[0]!.token_id)
}

function pickCardUrl(d: { a2a_endpoint?: string | null; agent_url?: string | null; raw_metadata?: unknown }): string | null {
  const direct = d.a2a_endpoint || d.agent_url
  if (direct && /^https?:\/\//i.test(direct)) return direct
  const meta = d.raw_metadata
  if (meta && typeof meta === 'object') {
    const rec = meta as Record<string, unknown>
    for (const k of ['agent_card_url', 'agentCardUrl', 'url', 'endpoint']) {
      const v = rec[k]
      if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v
    }
  }
  return null
}

function normalizeUri(uri: string): string | null {
  if (!uri) return null
  if (uri.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${uri.slice('ipfs://'.length)}`
  if (/^https?:\/\//i.test(uri)) return uri
  return null
}

async function fetchCard(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await safeFetch(url, { timeoutMs: 6_000, maxBytes: 256 * 1024 })
    if (!res.ok) return null
    const parsed: unknown = JSON.parse(res.body)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}
