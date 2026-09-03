import type { NewAgentService, ServiceKind, ServiceSource } from '@marque/db'
import type { ScanAgentDetail } from './scan-client.js'

/**
 * Service extraction.
 *
 * The two sources disagree and the array is often richer (AGENTS.md gotcha 8),
 * so we parse BOTH and keep whichever produced each row, recorded in `source`.
 * Endpoints containing {placeholders} are flagged and resolved where the
 * agent's own metadata makes that possible (gotcha 9) — without this,
 * TermiX's entire roster is unreachable.
 */

const KIND_ALIASES: Record<string, ServiceKind> = {
  a2a: 'a2a', 'a2a-endpoint': 'a2a', agent2agent: 'a2a',
  mcp: 'mcp', 'mcp-server': 'mcp', 'model-context-protocol': 'mcp',
  x402: 'x402', b402: 'x402',
  erc8183: 'erc8183', '8183': 'erc8183', commerce: 'erc8183',
  termix: 'termix', 'aacp-platform': 'termix',
  rest: 'rest', http: 'rest', api: 'rest', openapi: 'rest',
  web: 'web', website: 'web', url: 'web',
}

export function normalizeKind(raw: string | null | undefined): ServiceKind | null {
  if (!raw) return null
  const key = raw.trim().toLowerCase()
  return KIND_ALIASES[key] ?? null
}

const TEMPLATE_RE = /\{([a-zA-Z0-9_]+)\}/g

export function isTemplate(endpoint: string): boolean {
  TEMPLATE_RE.lastIndex = 0
  return TEMPLATE_RE.test(endpoint)
}

/**
 * Resolve {agentId}-style placeholders from the agent's own record.
 * Returns null when a placeholder has no known value — better an honest
 * `template_unresolved` probe failure than a request to a literal "{agentId}".
 */
export function resolveTemplate(
  endpoint: string,
  vars: Readonly<Record<string, string | undefined>>,
): string | null {
  let unresolved = false
  const out = endpoint.replace(TEMPLATE_RE, (whole, name: string) => {
    const v = vars[name] ?? vars[name.toLowerCase()]
    if (v === undefined || v === '') {
      unresolved = true
      return whole
    }
    return v
  })
  return unresolved ? null : out
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function pick(obj: unknown, path: readonly string[]): unknown {
  let cur: unknown = obj
  for (const key of path) {
    if (!isRecord(cur)) return undefined
    cur = cur[key]
  }
  return cur
}

function offchainContent(detail: ScanAgentDetail): Record<string, unknown> | undefined {
  const c = pick(detail.raw_metadata, ['offchain_content'])
  return isRecord(c) ? c : undefined
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

/**
 * The substitutions we can offer a template, drawn from the agent itself.
 *
 * `agentId` resolves to the ERC-8004 **token id**, not 8004scan's composite
 * "chain:registry:token" string. This was determined empirically against the
 * only publisher that templates its endpoints at scale: TermiX's
 * `/a2a/agents/{agentId}/card` returns 200 for the bare token id and 404 for
 * the composite, the account id, and the agent name. Getting this wrong makes
 * effectively the entire A2A supply on BSC look dead.
 *
 * The composite is still offered as `agentIdFull` for publishers that mean it.
 */
export function templateVars(detail: ScanAgentDetail): Record<string, string | undefined> {
  const termixId = pick(offchainContent(detail), ['termix', 'ownerAccountId'])
  return {
    agentId: detail.token_id,
    agentid: detail.token_id,
    agentIdFull: detail.agent_id,
    tokenId: detail.token_id,
    tokenid: detail.token_id,
    chainId: String(detail.chain_id),
    chainid: String(detail.chain_id),
    id: detail.token_id,
    address: detail.contract_address,
    owner: detail.owner_address ?? undefined,
    accountId: typeof termixId === 'string' ? termixId : undefined,
  }
}

interface Extracted {
  kind: ServiceKind
  endpoint: string
  version?: string
  declaredPrice?: string
  source: ServiceSource
  raw: Record<string, unknown>
}

/** Source A: the top-level `services` object, keyed by kind. */
function fromTopLevel(detail: ScanAgentDetail): Extracted[] {
  const out: Extracted[] = []
  if (!isRecord(detail.services)) return out
  for (const [key, value] of Object.entries(detail.services)) {
    const kind = normalizeKind(key)
    if (!kind || !isRecord(value)) continue
    const endpoint = str(value['endpoint']) ?? str(value['url']) ?? str(value['server'])
    if (!endpoint) continue
    const version = str(value['version'])
    const price = str(value['price'])
    out.push({
      kind,
      endpoint,
      ...(version ? { version } : {}),
      ...(price ? { declaredPrice: price } : {}),
      source: 'top_level',
      raw: value,
    })
  }
  return out
}

/** Source B: raw_metadata.offchain_content.services, an array. Often richer. */
function fromOffchainArray(detail: ScanAgentDetail): Extracted[] {
  const out: Extracted[] = []
  const services = pick(offchainContent(detail), ['services'])
  if (!Array.isArray(services)) return out
  for (const entry of services) {
    if (!isRecord(entry)) continue
    const kind = normalizeKind(str(entry['name']) ?? str(entry['type']) ?? str(entry['protocol']))
    const endpoint = str(entry['endpoint']) ?? str(entry['url']) ?? str(entry['server'])
    if (!kind || !endpoint) continue
    const version = str(entry['version'])
    const price = str(entry['price']) ?? str(pick(entry, ['pricing', 'amount']))
    out.push({
      kind,
      endpoint,
      ...(version ? { version } : {}),
      ...(price ? { declaredPrice: price } : {}),
      source: 'offchain_array',
      raw: entry,
    })
  }
  return out
}

/** Source C: the flat convenience columns 8004scan derives. Lowest priority. */
function fromFlatColumns(detail: ScanAgentDetail): Extracted[] {
  const out: Extracted[] = []
  const a2a = str(detail.a2a_endpoint)
  if (a2a) out.push({ kind: 'a2a', endpoint: a2a, source: 'top_level', raw: { from: 'a2a_endpoint' } })
  const mcp = str(detail.mcp_server)
  if (mcp) out.push({ kind: 'mcp', endpoint: mcp, source: 'top_level', raw: { from: 'mcp_server' } })
  return out
}

/**
 * All services for an agent, deduplicated on (kind, endpoint).
 *
 * Precedence when the same endpoint appears twice: offchain_array wins, because
 * it carries version/price/skills that the top-level object drops.
 */
export function extractServices(detail: ScanAgentDetail): NewAgentService[] {
  const all = [...fromFlatColumns(detail), ...fromTopLevel(detail), ...fromOffchainArray(detail)]
  const byKey = new Map<string, Extracted>()
  for (const s of all) {
    const key = `${s.kind} ${s.endpoint}`
    const existing = byKey.get(key)
    if (!existing || (existing.source !== 'offchain_array' && s.source === 'offchain_array')) {
      byKey.set(key, s)
    }
  }

  const vars = templateVars(detail)
  return [...byKey.values()].map((s) => {
    const templated = isTemplate(s.endpoint)
    const resolved = templated ? resolveTemplate(s.endpoint, vars) : null
    return {
      agentId: detail.agent_id,
      kind: s.kind,
      endpoint: s.endpoint,
      version: s.version ?? null,
      declaredPrice: s.declaredPrice ?? null,
      source: s.source,
      isTemplate: templated,
      resolvedEndpoint: resolved,
      raw: s.raw,
    }
  })
}

/** 8004scan's parse codes (IA002 etc.), used for the honest graveyard view. */
export function parseCodes(detail: ScanAgentDetail): string[] {
  const ps = detail.parse_status
  if (!isRecord(ps)) return []
  const codes: string[] = []
  for (const bucket of ['errors', 'warnings', 'info'] as const) {
    const list = ps[bucket]
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (typeof item === 'string') codes.push(item)
      else if (isRecord(item)) {
        const code = str(item['code']) ?? str(item['id'])
        if (code) codes.push(code)
      }
    }
  }
  return [...new Set(codes)]
}

/** The agent's own tag list, from whichever of the two places carries it. */
export function extractTags(detail: ScanAgentDetail): string[] {
  const direct = Array.isArray(detail.tags) ? detail.tags.filter((t): t is string => typeof t === 'string') : []
  const offchain = pick(offchainContent(detail), ['tags'])
  const fromOffchain = Array.isArray(offchain) ? offchain.filter((t): t is string => typeof t === 'string') : []
  return [...new Set([...direct, ...fromOffchain])]
}
