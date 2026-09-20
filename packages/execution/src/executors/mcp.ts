import { safeFetch, type SafeFetchOptions, type SafeFetchResult } from '@marque/probe'
import { renderTaskPrompt, type StructuredTask } from '../tasks.js'
import { extractJson, parseFeeUsd } from '../parse.js'
import type {
  AgentExecutor, CapabilityManifest, ExecutionContext, FailureReason,
  PreflightResult, Quote, RunResult,
} from '../types.js'

/**
 * MCP executor — streamable HTTP, tools/list then tools/call.
 *
 * MCP exposes NAMED TOOLS rather than a free-form task endpoint, which means an
 * MCP agent can only answer a task if it happens to expose a tool that does. We
 * match a tool to the task's category and, finding none, say exactly that.
 *
 * That distinction matters because these results are published. Calling an
 * unrelated tool and grading its answer as wrong arithmetic would attribute our
 * own mis-addressing to the agent.
 */

export interface McpTool { name?: string; description?: string; inputSchema?: unknown }

interface JsonSchema {
  type?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean
  enum?: unknown[]
}

/** Terms that suggest a tool can answer a task of this category. */
const TOOL_HINTS: Record<StructuredTask['kind'], RegExp> = {
  rebalance: /rebalanc|liquid|position|range|pool|clmm|pancake|lp\b/i,
  grid: /grid|ladder|level|dca/i,
  yield: /yield|apr|apy|lend|supply|venus|vault|earn/i,
  health_factor: /health|liquidat|collateral|borrow|ltv|risk/i,
}

function rpc(id: number, method: string, params: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, method, params })
}

function notification(method: string, params: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', method, params })
}

function schemaOf(tool: McpTool): JsonSchema | null {
  return tool.inputSchema && typeof tool.inputSchema === 'object'
    ? tool.inputSchema as JsonSchema
    : null
}

/**
 * Build only arguments explicitly named by the MCP tool schema. Unknown
 * required fields make the tool incompatible; Marque never guesses values.
 */
export function argumentsForTool(tool: McpTool, task: StructuredTask): Record<string, unknown> | null {
  const schema = schemaOf(tool)
  if (!schema || schema.type !== 'object' || !schema.properties) return null
  const values: Record<string, unknown> = {
    query: renderTaskPrompt(task), prompt: renderTaskPrompt(task), message: renderTaskPrompt(task),
    task: task, input: task,
    address: task.subject, subject: task.subject, wallet: task.subject, account: task.subject,
    blockNumber: task.blockNumber, block_number: task.blockNumber, block: task.blockNumber,
    chainId: task.chainId, chain_id: task.chainId,
    maxSpendUsd: task.maxSpendUsd, max_spend_usd: task.maxSpendUsd,
    policy: task.policy,
    ...(task.kind === 'rebalance' ? {
      positionTokenId: task.positionTokenId, tokenId: task.positionTokenId,
      position_id: task.positionTokenId,
    } : {}),
    ...(task.kind === 'grid' ? { pair: task.pair } : {}),
  }
  const args: Record<string, unknown> = {}
  for (const key of Object.keys(schema.properties)) {
    if (key in values) args[key] = values[key]
  }
  for (const key of schema.required ?? []) {
    if (!(key in args)) return null
    const allowed = schema.properties[key]?.enum
    if (allowed && !allowed.some((value) => Object.is(value, args[key]))) return null
  }
  return args
}

export class McpExecutor implements AgentExecutor {
  readonly kind = 'mcp' as const
  private tools: McpTool[] | null = null
  private sessionHeaders: Record<string, string> | null = null

  constructor(
    readonly agentId: string,
    private readonly endpoint: string,
    private readonly name: string | null = null,
    private readonly fetcher: (url: string, options?: SafeFetchOptions) => Promise<SafeFetchResult> = safeFetch,
  ) {}

  private async initialize(): Promise<{ ok: true; headers: Record<string, string> } | { ok: false; reason: FailureReason; detail: string }> {
    if (this.sessionHeaders) return { ok: true, headers: this.sessionHeaders }
    const res = await this.fetcher(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: rpc(1, 'initialize', {
        protocolVersion: '2024-11-05', capabilities: {},
        clientInfo: { name: 'marque', version: '0.1.0' },
      }),
      timeoutMs: 20_000,
    })
    if (!res.ok) return { ok: false, reason: res.failure === 'timeout' ? 'timeout' : 'unreachable', detail: `${res.failure}: ${res.detail}` }
    if (res.status === 402) return { ok: false, reason: 'payment_required', detail: 'server requires payment to initialize MCP' }
    if (res.status >= 400) return { ok: false, reason: 'no_compatible_interface', detail: `MCP initialize returned http ${res.status}` }
    const initialized = extractJson(res.body) as Record<string, unknown> | null
    if (!initialized || typeof initialized['protocolVersion'] !== 'string') {
      return { ok: false, reason: 'no_compatible_interface', detail: 'MCP initialize returned no protocol version' }
    }
    const sessionId = res.headers['mcp-session-id']
    this.sessionHeaders = sessionId ? { 'mcp-session-id': sessionId } : {}
    // Streamable HTTP permits a 202/204 notification response. A failure here
    // invalidates the session rather than silently using an uninitialized one.
    const ready = await this.fetcher(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...this.sessionHeaders },
      body: notification('notifications/initialized', {}), timeoutMs: 20_000,
    })
    if (!ready.ok || ready.status >= 400) {
      this.sessionHeaders = null
      return { ok: false, reason: 'no_compatible_interface', detail: !ready.ok ? `MCP initialized notification failed: ${ready.detail}` : `MCP initialized notification returned http ${ready.status}` }
    }
    return { ok: true, headers: this.sessionHeaders }
  }

  private async listTools(): Promise<McpTool[] | { ok: false; reason: FailureReason; detail: string }> {
    if (this.tools) return this.tools

    const initialized = await this.initialize()
    if (!initialized.ok) return initialized

    const res = await this.fetcher(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...initialized.headers },
      body: rpc(1, 'tools/list', {}),
      timeoutMs: 20_000,
    })

    if (!res.ok) return { ok: false, reason: res.failure === 'timeout' ? 'timeout' : 'unreachable', detail: `${res.failure}: ${res.detail}` }
    if (res.status === 402) return { ok: false, reason: 'payment_required', detail: 'server requires payment to list tools' }
    if (res.status >= 400) return { ok: false, reason: 'unreachable', detail: `http ${res.status}` }

    const parsed = extractJson(res.body) as { tools?: McpTool[] } | null
    const tools = Array.isArray(parsed?.tools) ? parsed.tools : []
    if (tools.length === 0) {
      return { ok: false, reason: 'no_compatible_interface', detail: 'MCP server exposes no tools' }
    }
    this.tools = tools
    return tools
  }

  private compatibleTool(tools: McpTool[], task: StructuredTask): { tool: McpTool; args: Record<string, unknown> } | null {
    for (const tool of tools) {
      if (!TOOL_HINTS[task.kind].test(`${tool.name ?? ''} ${tool.description ?? ''}`)) continue
      const args = argumentsForTool(tool, task)
      if (args) return { tool, args }
    }
    return null
  }

  async inspect(): Promise<CapabilityManifest | { ok: false; reason: FailureReason; detail: string }> {
    const started = Date.now()
    const tools = await this.listTools()
    if ('ok' in tools) return tools
    return {
      kind: this.kind,
      agentId: this.agentId,
      name: this.name,
      endpoint: this.endpoint,
      skills: tools.map((t) => t.name).filter((n): n is string => typeof n === 'string'),
      supportsFreePreflight: true,
      declaredPrice: null,
      reachedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
    }
  }

  async quote(task: StructuredTask): Promise<Quote> {
    const started = Date.now()
    const tools = await this.listTools()
    if ('ok' in tools) {
      return {
        ok: false, agentId: this.agentId, kind: this.kind, feeUsd: null,
        declaredPrice: null, settlementAsset: null,
        latencyMs: Date.now() - started, reason: tools.reason, detail: tools.detail,
      }
    }
    const compatible = this.compatibleTool(tools, task)
    if (!compatible) {
      return {
        ok: false, agentId: this.agentId, kind: this.kind, feeUsd: null,
        declaredPrice: null, settlementAsset: null, latencyMs: Date.now() - started,
        reason: 'no_compatible_interface',
        detail: `none of the ${tools.length} exposed tools answer a ${task.kind} task`,
      }
    }
    return {
      ok: true, agentId: this.agentId, kind: this.kind,
      feeUsd: null, declaredPrice: null, settlementAsset: null,
      latencyMs: Date.now() - started,
      detail: `tool "${compatible.tool.name}" accepts this task schema; no price protocol is declared`,
    }
  }

  private async callTool(task: StructuredTask, timeoutMs: number): Promise<
    { ok: true; payload: unknown; latencyMs: number; tool: string } | { ok: false; reason: FailureReason; detail: string; latencyMs: number }
  > {
    const started = Date.now()
    const tools = await this.listTools()
    if ('ok' in tools) return { ...tools, latencyMs: Date.now() - started }

    const compatible = this.compatibleTool(tools, task)
    if (!compatible?.tool.name) {
      return {
        ok: false, reason: 'no_compatible_interface',
        detail: `none of the ${tools.length} exposed tools answer a ${task.kind} task`,
        latencyMs: Date.now() - started,
      }
    }

    const initialized = this.sessionHeaders ?? {}
    const res = await this.fetcher(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...initialized },
      body: rpc(2, 'tools/call', {
        name: compatible.tool.name,
        arguments: compatible.args,
      }),
      timeoutMs,
    })
    const latencyMs = Date.now() - started

    if (!res.ok) {
      return { ok: false, reason: res.failure === 'timeout' ? 'timeout' : 'unreachable', detail: `${res.failure}: ${res.detail}`, latencyMs }
    }
    if (res.status === 402) return { ok: false, reason: 'payment_required', detail: 'tool charges per call', latencyMs }
    if (res.status >= 400) return { ok: false, reason: 'unreachable', detail: `http ${res.status}`, latencyMs }

    const payload = extractJson(res.body)
    if (payload === null) {
      return { ok: false, reason: 'unusable_response', detail: 'tool returned no structured JSON answer', latencyMs }
    }
    return { ok: true, payload, latencyMs, tool: compatible.tool.name }
  }

  async preflight(task: StructuredTask): Promise<PreflightResult> {
    const r = await this.callTool(task, 45_000)
    if (!r.ok) {
      return {
        ok: false, agentId: this.agentId, plan: null, calls: [],
        estimatedGasNative: null, feeUsd: null, maxSlippageBps: null,
        conformance: null, latencyMs: r.latencyMs, nothingSubmitted: true,
        reason: r.reason, detail: r.detail,
      }
    }
    return {
      ok: true, agentId: this.agentId, plan: r.payload, calls: [],
      estimatedGasNative: null, feeUsd: parseFeeUsd(r.payload), maxSlippageBps: null,
      conformance: null, latencyMs: r.latencyMs, nothingSubmitted: true,
    }
  }

  async execute(task: StructuredTask, ctx: ExecutionContext): Promise<RunResult> {
    const startedAt = new Date().toISOString()
    const r = await this.callTool(task, ctx.deadlineMs ?? 60_000)
    const finishedAt = new Date().toISOString()
    if (!r.ok) {
      return {
        ok: false, agentId: this.agentId, kind: this.kind, result: null, txHashes: [],
        feeUsd: null, latencyMs: r.latencyMs, startedAt, finishedAt,
        reason: r.reason, detail: r.detail,
      }
    }
    return {
      ok: true, agentId: this.agentId, kind: this.kind, result: r.payload,
      txHashes: [], feeUsd: parseFeeUsd(r.payload),
      latencyMs: r.latencyMs, startedAt, finishedAt,
    }
  }
}
