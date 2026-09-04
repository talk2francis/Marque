import { safeFetch } from '@marque/probe'
import type { ConformanceAdapter, TestCase } from './types.js'

/**
 * Adapters for real agents.
 *
 * A2A is a two-step protocol and getting this wrong produces false failures.
 * The `.well-known/agent-card.json` URL is a DESCRIPTOR fetched with GET; the
 * JSON-RPC endpoint you actually send work to is named inside it, in `url`.
 * POSTing `message/send` at the card itself returns 404, which looks exactly
 * like a broken agent and is in fact a broken client.
 *
 * Publishing failures is the most credible thing this marketplace does, which
 * only works if every published failure is the agent's and not ours.
 */

export type AdapterError =
  /** We could not reach the endpoint at all. */
  | 'unreachable'
  /** Reachable, but exposes no interface we know how to send a task to. */
  | 'no_compatible_interface'
  /** Answered, but not with anything resembling a structured answer. */
  | 'unusable_response'

/** Pull the callable JSON-RPC endpoint out of an A2A agent card. */
export function endpointFromCard(card: unknown, cardUrl: string): string | null {
  if (!card || typeof card !== 'object') return null
  const rec = card as Record<string, unknown>
  const nested = rec['card'] && typeof rec['card'] === 'object' ? (rec['card'] as Record<string, unknown>) : {}

  for (const key of ['url', 'endpoint', 'serviceEndpoint', 'rpcUrl']) {
    const v = rec[key] ?? nested[key]
    if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v
  }

  // Some publishers list interfaces separately.
  const interfaces = rec['additionalInterfaces'] ?? nested['additionalInterfaces']
  if (Array.isArray(interfaces)) {
    for (const i of interfaces) {
      if (i && typeof i === 'object') {
        const u = (i as Record<string, unknown>)['url']
        if (typeof u === 'string' && /^https?:\/\//i.test(u)) return u
      }
    }
  }

  // Last resort: a card served at /.well-known/... usually sits alongside the
  // service root. Only used when the card names nothing at all.
  try {
    const u = new URL(cardUrl)
    if (u.pathname.includes('/.well-known/')) {
      return `${u.origin}${u.pathname.split('/.well-known/')[0] || ''}`
    }
  } catch { /* fall through */ }
  return null
}

/** Extract a JSON object from a response that may wrap or stringify it. */
export function extractJsonPayload(body: unknown): unknown {
  if (body === null || body === undefined) return null
  if (typeof body === 'object') {
    const rec = body as Record<string, unknown>
    // JSON-RPC envelope.
    const result = rec['result']
    if (result !== undefined) return extractJsonPayload(result)
    // A2A task shape: artifacts/parts carrying text.
    for (const key of ['artifacts', 'parts', 'messages']) {
      const arr = rec[key]
      if (Array.isArray(arr)) {
        for (const item of arr) {
          const found = extractJsonPayload(item)
          if (found && typeof found === 'object') return found
        }
      }
    }
    const text = rec['text']
    if (typeof text === 'string') return extractJsonPayload(text)
    return rec
  }
  if (typeof body === 'string') {
    // Agents commonly wrap JSON in prose or a fenced code block.
    const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/)
    const candidate = fenced?.[1] ?? body
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try { return JSON.parse(candidate.slice(start, end + 1)) } catch { return null }
    }
  }
  return null
}

/**
 * An A2A agent, addressed correctly.
 *
 * Resolves the card, finds the callable endpoint, then sends the task there.
 * Every request goes through safeFetch, so a hostile card cannot turn the
 * conformance runner into an SSRF proxy.
 */
export function a2aAdapter(agentId: string, name: string, cardUrl: string): ConformanceAdapter {
  return {
    agentId,
    name,
    async ask(_testCase: TestCase, prompt: string) {
      const started = Date.now()

      const cardRes = await safeFetch(cardUrl, { timeoutMs: 15_000 })
      if (!cardRes.ok) {
        return { response: null, latencyMs: Date.now() - started, error: `unreachable: ${cardRes.failure} — ${cardRes.detail}` }
      }
      if (cardRes.status >= 400) {
        return { response: null, latencyMs: Date.now() - started, error: `unreachable: agent card returned http ${cardRes.status}` }
      }

      let card: unknown
      try { card = JSON.parse(cardRes.body) } catch {
        return { response: null, latencyMs: Date.now() - started, error: 'no_compatible_interface: agent card was not JSON' }
      }

      const endpoint = endpointFromCard(card, cardUrl)
      if (!endpoint) {
        return {
          response: null, latencyMs: Date.now() - started,
          error: 'no_compatible_interface: the agent card names no callable endpoint (no `url` field)',
        }
      }

      const res = await safeFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'message/send',
          params: {
            message: {
              role: 'user',
              messageId: `marque-mcs-${Date.now()}`,
              parts: [{ kind: 'text', text: prompt }],
            },
          },
        }),
        timeoutMs: 45_000,
      })
      const latencyMs = Date.now() - started

      if (!res.ok) return { response: null, latencyMs, error: `unreachable: ${res.failure} — ${res.detail}` }
      if (res.status === 402) return { response: null, latencyMs, error: 'payment required: agent charges for this call (x402)' }
      if (res.status >= 400) return { response: null, latencyMs, error: `http ${res.status} from ${endpoint}` }

      let parsed: unknown
      try { parsed = JSON.parse(res.body) } catch { parsed = res.body }

      const payload = extractJsonPayload(parsed)
      if (!payload || typeof payload !== 'object') {
        return {
          response: parsed, latencyMs,
          error: 'unusable_response: the reply contained no structured JSON answer',
        }
      }
      return { response: payload, latencyMs, costUsd: null }
    },
  }
}

/**
 * An MCP server.
 *
 * MCP exposes named tools rather than a free-form task endpoint, so a
 * conformance question can only be asked if the server happens to expose a tool
 * that answers it. We look for one and, finding none, report exactly that —
 * rather than grading the agent's arithmetic as wrong when it was never asked.
 */
export function mcpAdapter(agentId: string, name: string, endpoint: string): ConformanceAdapter {
  return {
    agentId,
    name,
    async ask(_testCase: TestCase, prompt: string) {
      const started = Date.now()
      const rpc = (id: number, method: string, params: unknown) =>
        JSON.stringify({ jsonrpc: '2.0', id, method, params })

      const list = await safeFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: rpc(1, 'tools/list', {}),
        timeoutMs: 20_000,
      })
      if (!list.ok) return { response: null, latencyMs: Date.now() - started, error: `unreachable: ${list.failure}` }

      let tools: Array<{ name?: string; description?: string }> = []
      try {
        const payload = list.body.includes('data:')
          ? (list.body.split('\n').find((l) => l.startsWith('data:'))?.slice(5).trim() ?? list.body)
          : list.body
        const d = JSON.parse(payload) as { result?: { tools?: Array<{ name?: string; description?: string }> } }
        tools = d.result?.tools ?? []
      } catch { /* handled below */ }

      if (tools.length === 0) {
        return { response: null, latencyMs: Date.now() - started, error: 'no_compatible_interface: MCP server exposes no tools' }
      }

      // Only a tool that plausibly answers a DeFi position question is worth
      // calling. Guessing at an unrelated tool would produce a meaningless
      // failure attributed to the agent.
      const wanted = /position|liquid|health|factor|yield|apr|apy|grid|rebalanc|venus|pancake/i
      const tool = tools.find((t) => wanted.test(`${t.name ?? ''} ${t.description ?? ''}`))
      if (!tool?.name) {
        return {
          response: { availableTools: tools.map((t) => t.name).filter(Boolean) },
          latencyMs: Date.now() - started,
          error: `no_compatible_interface: none of the ${tools.length} exposed MCP tools answer a position question`,
        }
      }

      const call = await safeFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: rpc(2, 'tools/call', { name: tool.name, arguments: { query: prompt } }),
        timeoutMs: 45_000,
      })
      const latencyMs = Date.now() - started
      if (!call.ok) return { response: null, latencyMs, error: `unreachable: ${call.failure}` }
      if (call.status === 402) return { response: null, latencyMs, error: 'payment required: tool charges per call (x402)' }
      if (call.status >= 400) return { response: null, latencyMs, error: `http ${call.status}` }

      let parsed: unknown
      try { parsed = JSON.parse(call.body) } catch { parsed = call.body }
      const payload = extractJsonPayload(parsed)
      if (!payload || typeof payload !== 'object') {
        return { response: parsed, latencyMs, error: 'unusable_response: tool returned no structured JSON answer' }
      }
      return { response: payload, latencyMs, costUsd: null }
    },
  }
}

/** Pick the right adapter for a service kind. */
export function adapterFor(kind: string, agentId: string, name: string, endpoint: string): ConformanceAdapter | null {
  if (kind === 'a2a' || kind === 'termix') return a2aAdapter(agentId, name, endpoint)
  if (kind === 'mcp') return mcpAdapter(agentId, name, endpoint)
  // REST and web endpoints expose no task interface we can address generically.
  return null
}
