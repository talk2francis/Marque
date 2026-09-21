import { describe, expect, it, vi } from 'vitest'

vi.mock('./safe-fetch.js', () => ({
  safeFetch: vi.fn(async () => ({
    ok: true, status: 200, latencyMs: 4, headers: {},
    body: JSON.stringify({ name: 'Card only', url: 'https://agent.example/a2a', version: '1.0', skills: [{ name: 'Yield optimiser' }] }),
  })),
}))

import { compatibleMcpTaskKinds, probeA2A } from './liveness'

describe('MCP task compatibility discovery', () => {
  it('accepts a hinted tool only when its required inputs are known', () => {
    expect(compatibleMcpTaskKinds({
      name: 'venus_yield_adviser',
      inputSchema: {
        type: 'object',
        properties: { address: { type: 'string' }, policy: { type: 'object' } },
        required: ['address', 'policy'],
      },
    })).toEqual(['yield'])
  })

  it('does not convert a tool name into compatibility when the schema is unsupported', () => {
    expect(compatibleMcpTaskKinds({
      name: 'venus_yield_adviser',
      inputSchema: {
        type: 'object', properties: { privateApiKey: { type: 'string' } }, required: ['privateApiKey'],
      },
    })).toEqual([])
  })

  it('requires an object schema with declared properties', () => {
    expect(compatibleMcpTaskKinds({ name: 'health factor monitor' })).toEqual([])
  })

  it('does not mistake a read-only APR listing with no task policy input for a Marque task', () => {
    expect(compatibleMcpTaskKinds({
      name: 'get_yield_opportunities',
      inputSchema: { type: 'object', properties: { asset: { type: 'string' } }, required: [] },
    })).toEqual([])
  })
})

describe('A2A discovery evidence', () => {
  it('does not call a readable card callable or task-compatible', async () => {
    const outcome = await probeA2A('https://agent.example/.well-known/agent-card.json')
    expect(outcome).toMatchObject({
      ok: false, liveness: 'unbound', executableEndpoint: 'https://agent.example/a2a', taskKinds: [],
      manifest: { advertisedTaskKinds: ['yield'], capabilityEvidence: {
        cardReadable: true, endpointDiscovered: true, endpointReachable: null,
        messageSendCallable: null, taskCompatible: [],
      } },
    })
  })
})
