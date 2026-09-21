import { z } from 'zod'
import type { FailureClass, ServiceKind } from '@marque/db'
import { safeFetch, type SafeFetchFailure } from './safe-fetch.js'

/**
 * Kind-specific liveness.
 *
 * The central lesson of docs/FINDINGS.md F-01: **HTTP 200 is not liveness.**
 * On BSC, 98% of declared agent endpoints answer 200 with valid JSON, and the
 * overwhelming majority of those describe an agent that was never bound to a
 * runtime — `status: UNBOUND`, `endpoint: null`, `skills: []`. A probe that
 * grades the status code reports 98% healthy and is completely wrong.
 *
 * So every check below grades the response BODY and answers a harder question:
 * could a buyer actually hire this thing right now?
 */

/** Liveness verdict, finer-grained than a boolean. */
export type Liveness =
  /** Answers, is bound, and exposes something callable. Real supply. */
  | 'live'
  /** Answers with a well-formed descriptor, but nothing is callable yet. */
  | 'unbound'
  /** Answered, but the payload is not what the protocol requires. */
  | 'bad_schema'
  /** Did not answer. */
  | 'dead'

export interface ProbeOutcome {
  ok: boolean
  liveness: Liveness
  latencyMs: number
  statusCode: number | null
  failureClass: FailureClass | null
  detail: string
  /** Capabilities the endpoint advertises, when it advertises any. */
  skills: string[]
  /** The executable endpoint the descriptor points at, when it has one. */
  executableEndpoint: string | null
  /** Agent name as the endpoint itself reports it. */
  reportedName: string | null
  /** Protocol negotiation evidence used for task compatibility, never liveness. */
  protocolVersion?: string | null
  taskKinds?: string[]
  manifest?: Record<string, unknown> | null
}

export function taskKindsFromText(values: readonly string[]): string[] {
  const text = values.join(' ')
  const kinds: string[] = []
  if (/rebalanc|liquidity\s*range|position\s*range|pancake|clmm|\blp\b/i.test(text)) kinds.push('rebalance')
  if (/\bgrid\b|ladder|price\s*levels?|\bdca\b/i.test(text)) kinds.push('grid')
  if (/\byield\b|\bapr\b|\bapy\b|lend|supply|venus|vault|earn/i.test(text)) kinds.push('yield')
  if (/health\s*factor|liquidat|collateral|borrow|\bltv\b/i.test(text)) kinds.push('health_factor')
  return kinds
}

type TaskKind = 'rebalance' | 'grid' | 'yield' | 'health_factor'
interface McpToolDescriptor { name?: unknown; description?: unknown; inputSchema?: unknown }

const MCP_INPUTS: Record<TaskKind, ReadonlySet<string>> = {
  rebalance: new Set(['query', 'prompt', 'message', 'task', 'input', 'address', 'subject', 'wallet', 'account', 'blockNumber', 'block_number', 'block', 'chainId', 'chain_id', 'maxSpendUsd', 'max_spend_usd', 'policy', 'positionTokenId', 'tokenId', 'position_id']),
  grid: new Set(['query', 'prompt', 'message', 'task', 'input', 'address', 'subject', 'wallet', 'account', 'blockNumber', 'block_number', 'block', 'chainId', 'chain_id', 'maxSpendUsd', 'max_spend_usd', 'policy', 'pair']),
  yield: new Set(['query', 'prompt', 'message', 'task', 'input', 'address', 'subject', 'wallet', 'account', 'blockNumber', 'block_number', 'block', 'chainId', 'chain_id', 'maxSpendUsd', 'max_spend_usd', 'policy']),
  health_factor: new Set(['query', 'prompt', 'message', 'task', 'input', 'address', 'subject', 'wallet', 'account', 'blockNumber', 'block_number', 'block', 'chainId', 'chain_id', 'maxSpendUsd', 'max_spend_usd', 'policy']),
}

/**
 * Categories an MCP tool can be addressed for without inventing arguments.
 * This is discovery compatibility, not a claim that execution will succeed.
 */
export function compatibleMcpTaskKinds(tool: McpToolDescriptor): TaskKind[] {
  const schema = tool.inputSchema && typeof tool.inputSchema === 'object'
    ? tool.inputSchema as { type?: unknown; properties?: unknown; required?: unknown }
    : null
  if (schema?.type !== 'object' || !schema.properties || typeof schema.properties !== 'object') return []
  const required = Array.isArray(schema.required)
    ? schema.required.filter((key): key is string => typeof key === 'string')
    : []
  const hinted = taskKindsFromText([
    typeof tool.name === 'string' ? tool.name : '',
    typeof tool.description === 'string' ? tool.description : '',
  ]) as TaskKind[]
  const properties = new Set(Object.keys(schema.properties as Record<string, unknown>))
  const acceptsStructuredTask = ['query', 'prompt', 'message', 'task', 'input'].some((key) => properties.has(key))
  const representsTask: Record<TaskKind, boolean> = {
    rebalance: acceptsStructuredTask || (properties.has('policy') && ['positionTokenId', 'tokenId', 'position_id'].some((key) => properties.has(key))),
    grid: acceptsStructuredTask || (properties.has('policy') && properties.has('pair')),
    yield: acceptsStructuredTask || properties.has('policy'),
    health_factor: acceptsStructuredTask || (properties.has('policy') && ['address', 'subject', 'wallet', 'account'].some((key) => properties.has(key))),
  }
  return hinted.filter((kind) => representsTask[kind] && required.every((key) => MCP_INPUTS[kind].has(key)))
}

/** Map a transport failure onto our stored taxonomy. */
function failureFromFetch(f: SafeFetchFailure): FailureClass {
  switch (f) {
    case 'dns': return 'dns'
    case 'tls': return 'tls'
    case 'timeout': return 'timeout'
    case 'refused': return 'refused'
    case 'blocked_ssrf': return 'blocked_ssrf'
    case 'too_large':
    case 'too_many_redirects':
    case 'bad_url':
    case 'unknown':
    default: return 'unknown'
  }
}

function httpFailure(status: number): FailureClass {
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'http_5xx'
  if (status >= 400) return 'http_4xx'
  return 'unknown'
}

function dead(detail: string, failureClass: FailureClass, latencyMs: number, statusCode: number | null = null): ProbeOutcome {
  return {
    ok: false, liveness: 'dead', latencyMs, statusCode, failureClass, detail,
    skills: [], executableEndpoint: null, reportedName: null,
  }
}

/**
 * The A2A agent card, as it appears in the wild.
 *
 * Two shapes exist and both are accepted: the spec's own card, and TermiX's
 * envelope which nests the card under `card` and adds `status`/`presence`.
 * Unknown fields are dropped rather than trusted.
 */
const a2aCard = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  url: z.string().nullish(),
  endpoint: z.string().nullish(),
  version: z.string().optional(),
  status: z.string().nullish(),
  presence: z.string().nullish(),
  skills: z.array(z.object({ id: z.string().optional(), name: z.string().optional(), description: z.string().optional() }).passthrough()).nullish(),
  capabilities: z.unknown().optional(),
  card: z.unknown().optional(),
}).passthrough()

function skillNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const s of raw) {
    if (typeof s === 'string') out.push(s)
    else if (s && typeof s === 'object') {
      const rec = s as Record<string, unknown>
      const n = rec['name'] ?? rec['id']
      if (typeof n === 'string') out.push(n)
    }
  }
  return out
}

/**
 * A2A discovery reads the card only. A2A defines no side-effect-free
 * capability RPC proving that `message/send` accepts work, so discovery must
 * not promote a service to callable or task-compatible.
 */
export async function probeA2A(url: string): Promise<ProbeOutcome> {
  const res = await safeFetch(url, { timeoutMs: 8_000, maxBytes: 512 * 1024 })
  if (!res.ok) return dead(res.detail, failureFromFetch(res.failure), res.latencyMs, res.status ?? null)
  if (res.status !== 200) {
    return dead(`http ${res.status}`, httpFailure(res.status), res.latencyMs, res.status)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(res.body)
  } catch {
    return {
      ok: false, liveness: 'bad_schema', latencyMs: res.latencyMs, statusCode: res.status,
      failureClass: 'bad_schema', detail: 'response was not JSON',
      skills: [], executableEndpoint: null, reportedName: null,
    }
  }

  const card = a2aCard.safeParse(parsed)
  if (!card.success) {
    return {
      ok: false, liveness: 'bad_schema', latencyMs: res.latencyMs, statusCode: res.status,
      failureClass: 'bad_schema', detail: 'not a recognisable A2A agent card',
      skills: [], executableEndpoint: null, reportedName: null,
    }
  }

  const d = card.data
  // The nested card, when present, can carry skills the envelope omits.
  const nested = d.card && typeof d.card === 'object' ? (d.card as Record<string, unknown>) : {}
  const skills = [...skillNames(d.skills), ...skillNames(nested['skills'])]
  const skillDescriptions = [
    ...(d.skills ?? []).flatMap((s) => [s.id, s.name, s.description]),
    ...(Array.isArray(nested['skills']) ? nested['skills'] as Array<Record<string, unknown>> : [])
      .flatMap((s) => [s['id'], s['name'], s['description']]),
  ].filter((v): v is string => typeof v === 'string')
  const executable = d.url ?? d.endpoint ?? (typeof nested['url'] === 'string' ? nested['url'] : null) ?? null
  const name = d.name ?? (typeof nested['name'] === 'string' ? nested['name'] : null) ?? null

  // The load-bearing judgement. An explicit UNBOUND/offline status, or the
  // absence of both an executable endpoint and any declared skill, means a
  // buyer has nothing to call. That is not a broken endpoint and must not be
  // reported as one — it is an agent that does not exist yet.
  const statusUnbound = typeof d.status === 'string' && /unbound|inactive|draft/i.test(d.status)
  const offline = typeof d.presence === 'string' && /offline/i.test(d.presence)
  const nothingCallable = !executable && skills.length === 0

  if (statusUnbound || nothingCallable) {
    const reasons: string[] = []
    if (statusUnbound) reasons.push(`status=${d.status}`)
    if (offline) reasons.push('presence=offline')
    if (!executable) reasons.push('no executable endpoint')
    if (skills.length === 0) reasons.push('no declared skills')
    return {
      ok: false, liveness: 'unbound', latencyMs: res.latencyMs, statusCode: res.status,
      failureClass: 'unbound', detail: reasons.join(', '),
      skills, executableEndpoint: executable, reportedName: name,
    }
  }

  const advertisedTaskKinds = taskKindsFromText(skillDescriptions)
  return {
    ok: false, liveness: 'unbound', latencyMs: res.latencyMs, statusCode: res.status,
    failureClass: 'unbound',
    detail: `card readable; task endpoint discovered; message/send not validated (${skills.length} advertised skill(s))`,
    skills, executableEndpoint: executable, reportedName: name,
    protocolVersion: d.version ?? null,
    taskKinds: [],
    manifest: {
      name, url: executable, skills: d.skills ?? nested['skills'] ?? [], advertisedTaskKinds,
      capabilityEvidence: {
        cardReadable: true,
        endpointDiscovered: executable !== null,
        endpointReachable: null,
        messageSendCallable: null,
        taskCompatible: [],
      },
    },
  }
}

/**
 * MCP: an initialize + tools/list handshake.
 *
 * A server that initializes but exposes zero tools is `unbound` by the same
 * logic as A2A — reachable, well-formed, and unable to do anything.
 */
export async function probeMCP(url: string): Promise<ProbeOutcome> {
  const rpc = (id: number, method: string, params: unknown) =>
    JSON.stringify({ jsonrpc: '2.0', id, method, params })

  const init = await safeFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: rpc(1, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'marque-probe', version: '0.1.0' },
    }),
    timeoutMs: 8_000,
  })

  if (!init.ok || init.status >= 400) {
    if (!init.ok) return dead(init.detail, failureFromFetch(init.failure), init.latencyMs, init.status ?? null)
    return dead(`http ${init.status}`, httpFailure(init.status), init.latencyMs, init.status)
  }

  let protocolVersion: string | null = null
  try {
    const payload = init.body.includes('data:')
      ? (init.body.split('\n').find((l) => l.startsWith('data:'))?.slice(5).trim() ?? init.body)
      : init.body
    const parsed = JSON.parse(payload) as { result?: { protocolVersion?: unknown } }
    protocolVersion = typeof parsed.result?.protocolVersion === 'string' ? parsed.result.protocolVersion : null
  } catch {
    return {
      ok: false, liveness: 'bad_schema', latencyMs: init.latencyMs, statusCode: init.status,
      failureClass: 'bad_schema', detail: 'initialize response was not valid JSON-RPC',
      skills: [], executableEndpoint: null, reportedName: null,
      protocolVersion: null, taskKinds: [], manifest: null,
    }
  }
  const sessionId = init.headers['mcp-session-id']
  const sessionHeaders: Record<string, string> = sessionId ? { 'mcp-session-id': sessionId } : {}
  const ready = await safeFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...sessionHeaders },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
    timeoutMs: 8_000,
  })
  if (!ready.ok || ready.status >= 400) {
    return dead(!ready.ok ? ready.detail : `initialized notification returned http ${ready.status}`, 'bad_schema', ready.latencyMs, ready.ok ? ready.status : ready.status ?? null)
  }

  const list = await safeFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...sessionHeaders },
    body: rpc(2, 'tools/list', {}),
    timeoutMs: 8_000,
  })
  if (!list.ok) return dead(list.detail, failureFromFetch(list.failure), list.latencyMs, list.status ?? null)

  try {
    // Server-sent-event framing is common for MCP over HTTP.
    const payload = list.body.includes('data:')
      ? (list.body.split('\n').find((l) => l.startsWith('data:'))?.slice(5).trim() ?? list.body)
      : list.body
    const d = JSON.parse(payload) as { result?: { tools?: unknown[] } }
    const tools = d.result?.tools ?? []
    const names = skillNames(tools)
    if (names.length === 0) {
      return {
        ok: false, liveness: 'unbound', latencyMs: list.latencyMs, statusCode: list.status,
        failureClass: 'empty_tools', detail: 'initialize succeeded but tools/list is empty',
        skills: [], executableEndpoint: url, reportedName: null,
      }
    }
    return {
      ok: true, liveness: 'live', latencyMs: list.latencyMs, statusCode: list.status,
      failureClass: null, detail: `${names.length} tool(s)`,
      skills: names, executableEndpoint: url, reportedName: null,
      protocolVersion,
      taskKinds: [...new Set((tools as McpToolDescriptor[]).flatMap(compatibleMcpTaskKinds))],
      manifest: { tools },
    }
  } catch {
    return {
      ok: false, liveness: 'bad_schema', latencyMs: list.latencyMs, statusCode: list.status,
      failureClass: 'bad_schema', detail: 'tools/list response was not valid JSON-RPC',
      skills: [], executableEndpoint: null, reportedName: null,
    }
  }
}

/**
 * x402: a paid endpoint should answer an unpaid request with 402 and a
 * parseable payment challenge. A 200 means it is not actually charging.
 */
export async function probeX402(url: string): Promise<ProbeOutcome> {
  const res = await safeFetch(url, { timeoutMs: 8_000 })
  if (!res.ok) return dead(res.detail, failureFromFetch(res.failure), res.latencyMs, res.status ?? null)

  if (res.status === 402) {
    const header = res.headers['www-authenticate'] ?? res.headers['x-payment'] ?? ''
    let hasChallenge = /payment/i.test(header)
    if (!hasChallenge) {
      try {
        const d = JSON.parse(res.body) as Record<string, unknown>
        hasChallenge = 'accepts' in d || 'x402Version' in d || 'paymentRequirements' in d
      } catch { /* body is not JSON; header check already failed */ }
    }
    if (!hasChallenge) {
      return {
        ok: false, liveness: 'bad_schema', latencyMs: res.latencyMs, statusCode: 402,
        failureClass: 'bad_schema', detail: '402 returned with no parseable payment challenge',
        skills: [], executableEndpoint: url, reportedName: null,
      }
    }
    return {
      ok: true, liveness: 'live', latencyMs: res.latencyMs, statusCode: 402,
      failureClass: null, detail: '402 with a parseable payment challenge',
      skills: [], executableEndpoint: url, reportedName: null,
    }
  }

  if (res.status === 200) {
    return {
      ok: true, liveness: 'live', latencyMs: res.latencyMs, statusCode: 200,
      failureClass: null, detail: 'answers 200 without requiring payment',
      skills: [], executableEndpoint: url, reportedName: null,
    }
  }
  return dead(`http ${res.status}`, httpFailure(res.status), res.latencyMs, res.status)
}

/** REST / web: a plain reachability check. The weakest signal we record. */
export async function probeRest(url: string): Promise<ProbeOutcome> {
  const res = await safeFetch(url, { timeoutMs: 8_000 })
  if (!res.ok) return dead(res.detail, failureFromFetch(res.failure), res.latencyMs, res.status ?? null)
  if (res.status >= 400) return dead(`http ${res.status}`, httpFailure(res.status), res.latencyMs, res.status)
  return {
    ok: true, liveness: 'live', latencyMs: res.latencyMs, statusCode: res.status,
    failureClass: null, detail: `http ${res.status}`,
    skills: [], executableEndpoint: url, reportedName: null,
  }
}

export async function probeService(kind: ServiceKind, url: string): Promise<ProbeOutcome> {
  switch (kind) {
    case 'a2a':
    case 'termix':
      return probeA2A(url)
    case 'mcp':
      return probeMCP(url)
    case 'x402':
      return probeX402(url)
    case 'erc8183':
    case 'rest':
    case 'web':
    default:
      return probeRest(url)
  }
}
