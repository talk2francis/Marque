import { describe, expect, it } from 'vitest'
import { declaredServices } from './declarations'
describe('current ERC-8004 declarations', () => {
  it('normalizes all recognized kinds while preserving exact endpoints', () => {
    expect(declaredServices({ services: [
      { name: 'A2A', endpoint: 'https://agent.example//.well-known/agent-card.json' },
      { name: 'MCP', endpoint: 'https://agent.example/mcp' },
      { name: 'x402', endpoint: 'https://agent.example/paid' },
      { name: 'web', endpoint: 'https://agent.example/defi' },
    ] }).map(s => s.kind)).toEqual(['a2a', 'mcp', 'x402', 'web'])
    expect(declaredServices({ services: [{ name: 'A2A', endpoint: 'https://agent.example//.well-known/agent-card.json' }] })[0]?.endpoint).toContain('//.well-known')
  })
  it('merges endpoint declarations and rejects unsafe or malformed values without inventing URLs', () => {
    expect(declaredServices({ services: [{ name: 'a2a', endpoint: 'http://agent.example/runtime' }, { name: 'web', endpoint: 'https://agent.example/bad\npath' }, null], endpoints: [{ type: 'website', endpoint: 'https://agent.example/' }, { name: 'web', endpoint: 'https://agent.example/' }] })).toEqual([{ kind: 'web', endpoint: 'https://agent.example/' }])
  })
})
