import { describe, expect, it } from 'vitest'
import { argumentsForCase, endpointFromCard } from './adapters'
import type { TestCase } from './types'

const testCase: TestCase = {
  id: 'case', testId: 'MCS-YIELD-1', category: 'yield', chainId: 56,
  blockNumber: 123n,
  subject: { owner: '0x0000000000000000000000000000000000000001' },
  policy: { asset: 'USDT' }, prompt: 'prompt',
}

describe('conformance protocol addressing', () => {
  it('never guesses an A2A task endpoint from the card URL', () => {
    expect(endpointFromCard({ name: 'No URL' }, 'https://agent.example/.well-known/agent-card.json')).toBeNull()
  })

  it('uses only MCP arguments declared by the tool schema', () => {
    expect(argumentsForCase({
      name: 'yield',
      inputSchema: { type: 'object', properties: { query: {}, address: {} }, required: ['query', 'address'], additionalProperties: false },
    }, testCase, 'exact MCS prompt')).toEqual({
      query: 'exact MCS prompt', address: testCase.subject['owner'],
    })
  })

  it('rejects MCP schemas with unknown required inputs', () => {
    expect(argumentsForCase({
      name: 'yield', inputSchema: { type: 'object', properties: { secretMode: {} }, required: ['secretMode'] },
    }, testCase, 'prompt')).toBeNull()
  })
})

