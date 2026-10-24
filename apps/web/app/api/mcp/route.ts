import { NextResponse } from 'next/server'
import { TOOLS, ToolError, type Ctx } from '../../../lib/mcp/tools'
import { checkWindow, clientKey } from '../../../lib/limits'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Marque's hosted MCP server (SPEC-ACCESS 3, invariant 40): Streamable HTTP, stateless, JSON responses. Read and plan
 * only: this process signs nothing and its tools call Marque's public APIs. 60 tool calls a minute per client.
 */
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
const INFO = { name: 'marque', title: 'Marque', version: '4.0.0', websiteUrl: 'https://marque.trade' }
const INSTRUCTIONS = 'Marque is a marketplace for BNB Chain agents. Use search_agents or tender to find and price agents for a task, read_position to read any address, and plan_hire to give the human a link to review and sign a hire. Marque never signs; the human signs every transaction. Every result names its network (BSC mainnet 56 or BSC testnet 97, never mixed), its source and when it was read.'
const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, mcp-protocol-version, mcp-session-id, authorization', 'Access-Control-Expose-Headers': 'mcp-protocol-version', 'Cache-Control': 'no-store' }

type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }
const ok = (id: Msg['id'], result: unknown) => ({ jsonrpc: '2.0', id, result })
const err = (id: Msg['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

function ctxOf(req: Request): Ctx {
  const h = req.headers
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'marque.trade'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('127.') || host.startsWith('localhost') ? 'http' : 'https')
  return { origin: `${proto}://${host}`, self: `http://127.0.0.1:${process.env['PORT'] ?? 3000}`, clientIp: (h.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || 'mcp' }
}

async function handle(m: Msg, req: Request): Promise<unknown | null> {
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return err(m?.id, -32600, 'Invalid request')
  const notification = m.id === undefined
  switch (m.method) {
    case 'initialize': {
      const asked = String(m.params?.['protocolVersion'] ?? '')
      return ok(m.id, { protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: INFO, instructions: INSTRUCTIONS })
    }
    case 'notifications/initialized': case 'notifications/cancelled': return null
    case 'ping': return ok(m.id, {})
    case 'tools/list': return ok(m.id, { tools: TOOLS.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema, annotations: { readOnlyHint: true, openWorldHint: true } })) })
    case 'tools/call': {
      const rate = checkWindow('mcp-tool', clientKey(req.headers), 60, 60_000, 'Marque allows 60 tool calls a minute per client.')
      if (!rate.ok) return ok(m.id, { content: [{ type: 'text', text: rate.detail ?? 'Rate limited.' }], isError: true })
      const tool = TOOLS.find((t) => t.name === m.params?.['name'])
      if (!tool) return err(m.id, -32602, `Unknown tool: ${String(m.params?.['name'])}`)
      const args = (m.params?.['arguments'] ?? {}) as Record<string, unknown>
      const missing = ((tool.inputSchema['required'] as string[] | undefined) ?? []).filter((k) => args[k] === undefined || args[k] === '')
      if (missing.length) return ok(m.id, { content: [{ type: 'text', text: `Missing ${missing.join(', ')}.` }], isError: true })
      try {
        const result = await tool.run(args, ctxOf(req))
        return ok(m.id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result, isError: false })
      } catch (e) {
        const text = e instanceof ToolError ? e.message : 'The tool could not run just now. Nothing was changed.'
        if (!(e instanceof ToolError)) console.error('[api/mcp]', tool.name, e instanceof Error ? e.message.slice(0, 200) : e)
        return ok(m.id, { content: [{ type: 'text', text }], isError: true })
      }
    }
    default: return notification ? null : err(m.id, -32601, `Method not found: ${m.method}`)
  }
}

/**
 * The web process holds a testnet key for Phase 1 anchoring, so it never runs the tools itself: with
 * MARQUE_MCP_UPSTREAM set it forwards the exact request to the key-less MCP process (invariant 40).
 */
async function forward(req: Request, upstream: string): Promise<Response> {
  const h = req.headers
  const r = await fetch(upstream, {
    method: 'POST', body: await req.text(), signal: AbortSignal.timeout(115_000),
    headers: {
      'content-type': 'application/json', accept: h.get('accept') ?? 'application/json',
      'x-forwarded-for': h.get('x-forwarded-for') ?? '', 'x-forwarded-host': h.get('x-forwarded-host') ?? h.get('host') ?? '',
      'x-forwarded-proto': h.get('x-forwarded-proto') ?? 'https', ...(h.get('mcp-protocol-version') ? { 'mcp-protocol-version': h.get('mcp-protocol-version')! } : {}),
    },
  })
  return new Response(r.status === 202 ? null : await r.text(), { status: r.status, headers: { ...H, 'content-type': r.headers.get('content-type') ?? 'application/json', 'mcp-protocol-version': r.headers.get('mcp-protocol-version') ?? VERSIONS[0]! } })
}

export async function POST(req: Request) {
  const upstream = process.env['MARQUE_MCP_UPSTREAM']
  if (upstream) {
    try { return await forward(req, upstream) } catch { return NextResponse.json(err(null, -32603, 'The Marque MCP server is not answering just now.'), { status: 503, headers: H }) }
  }
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json(err(null, -32700, 'Parse error'), { status: 400, headers: H }) }
  const batch = Array.isArray(body)
  const msgs: Msg[] = batch ? (body as Msg[]) : [body as Msg]
  const out = (await Promise.all(msgs.map((m) => handle(m, req)))).filter((x) => x !== null)
  if (!out.length) return new Response(null, { status: 202, headers: H })
  return NextResponse.json(batch ? out : out[0], { headers: { ...H, 'mcp-protocol-version': VERSIONS[0]! } })
}

export function GET() {
  return new Response(JSON.stringify({ name: 'Marque MCP server', transport: 'Streamable HTTP (POST JSON-RPC to this URL)', docs: 'https://marque.trade/docs/mcp' }), { status: 405, headers: { ...H, Allow: 'POST, OPTIONS', 'content-type': 'application/json' } })
}
export function OPTIONS() { return new Response(null, { status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' } }) }
