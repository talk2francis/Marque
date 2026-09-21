import { describe, expect, it } from 'vitest'
import { compatibleMcpTaskKinds } from './liveness'

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
})
