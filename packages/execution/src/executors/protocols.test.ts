import { describe, expect, it, vi } from 'vitest'
import type { SafeFetchOptions, SafeFetchResult } from '@marque/probe'
import { A2AExecutor } from './a2a'
import { McpExecutor, argumentsForTool } from './mcp'
import type { StructuredTask } from '../tasks'

const task: StructuredTask = {
  kind: 'yield', chainId: 56, blockNumber: '123',
  subject: '0x0000000000000000000000000000000000000001', maxSpendUsd: 1,
  policy: {
    asset: 'USDT', sizeUsd: 100, allowedProtocols: ['Venus'],
    minImprovementBps: 10, leverageAllowed: false, currentAprPct: 2,
  },
}

function response(body: unknown, headers: Record<string, string> = {}): SafeFetchResult {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return { ok: true, status: 200, headers, body: text, bytes: text.length, latencyMs: 1, finalUrl: 'https://agent.example', redirects: 0 }
}

describe('A2AExecutor', () => {
  it('fetches the card URL and sends the task only to the declared task endpoint', async () => {
    const fetcher = vi.fn(async (url: string, _options?: SafeFetchOptions) => {
      if (url.endsWith('agent-card.json')) return response({ name: 'External', url: 'https://agent.example/tasks', skills: [{ id: 'yield' }] })
      if (url.endsWith('/tasks')) return response({ result: { artifacts: [{ parts: [{ text: '{"recommend":false}' }] }] } })
      throw new Error(`unexpected URL ${url}`)
    })
    const executor = new A2AExecutor('56:registry:1', 'https://agent.example/.well-known/agent-card.json', null, fetcher)
    const result = await executor.execute(task, { buyer: task.subject, maxSpendUsd: 1 })
    expect(result.ok).toBe(true)
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      'https://agent.example/.well-known/agent-card.json',
      'https://agent.example/tasks',
    ])
    expect(fetcher.mock.calls[1]?.[1]?.body).toContain('message/send')
  })
})

describe('McpExecutor', () => {
  it('initializes, announces readiness, lists tools, and calls with schema-derived arguments', async () => {
    const fetcher = vi.fn(async (_url: string, options?: SafeFetchOptions) => {
      const body = JSON.parse(options?.body ?? '{}') as { method?: string }
      switch (body.method) {
        case 'initialize': return response({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05', capabilities: {} } }, { 'mcp-session-id': 'session-1' })
        case 'notifications/initialized': return response('')
        case 'tools/list': return response({ jsonrpc: '2.0', id: 2, result: { tools: [{
          name: 'find_yield', description: 'Find yield',
          inputSchema: { type: 'object', properties: { address: { type: 'string' }, policy: { type: 'object' } }, required: ['address', 'policy'], additionalProperties: false },
        }] } })
        case 'tools/call': return response({ jsonrpc: '2.0', id: 2, result: { content: [{ text: '{"recommend":false}' }] } })
        default: throw new Error(`unexpected method ${body.method}`)
      }
    })
    const executor = new McpExecutor('56:registry:2', 'https://mcp.example/mcp', null, fetcher)
    const result = await executor.execute(task, { buyer: task.subject, maxSpendUsd: 1 })
    expect(result.ok).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(4)
    const call = JSON.parse(fetcher.mock.calls[3]?.[1]?.body ?? '{}') as { params: { arguments: Record<string, unknown> } }
    expect(call.params.arguments).toEqual({ address: task.subject, policy: task.policy })
    expect(fetcher.mock.calls[2]?.[1]?.headers?.['mcp-session-id']).toBe('session-1')
  })

  it('rejects a plausible tool when its required schema cannot be satisfied', () => {
    expect(argumentsForTool({
      name: 'explain_strategy', description: 'LP strategy',
      inputSchema: { type: 'object', properties: { agent: { type: 'string', enum: ['one', 'two'] } }, required: ['agent'], additionalProperties: false },
    }, task)).toBeNull()
  })

  it('rejects tools without an input schema instead of inventing arguments', () => {
    expect(argumentsForTool({ name: 'find_yield', description: 'Find yield' }, task)).toBeNull()
  })
})

