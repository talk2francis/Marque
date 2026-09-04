import { safeFetch } from '@marque/probe'
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

interface McpTool { name?: string; description?: string; inputSchema?: unknown }

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

export class McpExecutor implements AgentExecutor {
  readonly kind = 'mcp' as const
  private tools: McpTool[] | null = null

  constructor(
    readonly agentId: string,
    private readonly endpoint: string,
    private readonly name: string | null = null,
  ) {}

  private async listTools(): Promise<McpTool[] | { ok: false; reason: FailureReason; detail: string }> {
    if (this.tools) return this.tools

    const res = await safeFetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: rpc(1, 'tools/list', {}),
      timeoutMs: 20_000,
    })

    if (!res.ok) {
      // Some deployments serve a plain descriptor on GET instead of JSON-RPC.
      const info = await safeFetch(this.endpoint, { timeoutMs: 15_000 })
      if (info.ok && info.status === 200) {
        const d = extractJson(info.body) as Record<string, unknown> | null
        const tools = Array.isArray(d?.['tools']) ? (d['tools'] as McpTool[]) : []
        if (tools.length > 0) { this.tools = tools; return tools }
      }
      return { ok: false, reason: res.failure === 'timeout' ? 'timeout' : 'unreachable', detail: `${res.failure}: ${res.detail}` }
    }
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

  private pickTool(tools: McpTool[], kind: StructuredTask['kind']): McpTool | null {
    const hint = TOOL_HINTS[kind]
    return tools.find((t) => hint.test(`${t.name ?? ''} ${t.description ?? ''}`)) ?? null
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
    const tool = this.pickTool(tools, task.kind)
    if (!tool) {
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
      detail: `would call tool "${tool.name}"`,
    }
  }

  private async callTool(task: StructuredTask, timeoutMs: number): Promise<
    { ok: true; payload: unknown; latencyMs: number; tool: string } | { ok: false; reason: FailureReason; detail: string; latencyMs: number }
  > {
    const started = Date.now()
    const tools = await this.listTools()
    if ('ok' in tools) return { ...tools, latencyMs: Date.now() - started }

    const tool = this.pickTool(tools, task.kind)
    if (!tool?.name) {
      return {
        ok: false, reason: 'no_compatible_interface',
        detail: `none of the ${tools.length} exposed tools answer a ${task.kind} task`,
        latencyMs: Date.now() - started,
      }
    }

    const res = await safeFetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: rpc(2, 'tools/call', {
        name: tool.name,
        arguments: { query: renderTaskPrompt(task), address: task.subject, blockNumber: task.blockNumber },
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
    return { ok: true, payload, latencyMs, tool: tool.name }
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
