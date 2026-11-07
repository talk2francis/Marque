import { describe, expect, it } from 'vitest'
import { argumentsForCase, endpointFromCard, extractJsonPayload, isJsonRpcError } from './adapters'
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

describe('A2A JSON-RPC reply classification', () => {
  const answer = { currentTick: -74609, inRange: true, proposedTickLower: -75250, proposedTickUpper: -74050 }
  it('extracts a structured DataPart without grading its wrapper', () => {
    expect(extractJsonPayload({ kind: 'data', data: answer })).toEqual(answer)
    expect(extractJsonPayload({ jsonrpc: '2.0', id: 1, result: { kind: 'message', parts: [{ kind: 'data', data: answer }] } })).toEqual(answer)
    expect(extractJsonPayload({ result: { kind: 'task', artifacts: [{ parts: [{ kind: 'data', data: answer }] }] } })).toEqual(answer)
  })
  it('preserves application keys and leaves an untagged business data object intact', () => {
    const payload = { result: { value: 1 }, parts: [{ value: 2 }], text: 'application data' }
    const wrapper = { kind: 'data', data: payload }, before = JSON.stringify(wrapper)
    expect(extractJsonPayload(wrapper)).toEqual(payload)
    expect(JSON.stringify(wrapper)).toBe(before)
    expect(extractJsonPayload({ data: answer })).toEqual({ data: answer })
  })
  it.each([null, [], 'not a structured object', 3])('rejects an invalid DataPart payload: %j', data => {
    expect(extractJsonPayload({ kind: 'data', data })).toBeNull()
  })
  it('treats an error envelope as no answer, never as a gradeable object', () => {
    expect(isJsonRpcError({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'private detail' } })).toBe(true)
    expect(isJsonRpcError({ jsonrpc: '2.0', id: 1, result: { recommend: 'stay' } })).toBe(false)
    expect(isJsonRpcError(extractJsonPayload({ jsonrpc: '2.0', id: 1, result: { error: 'private detail' } }))).toBe(true)
    expect(isJsonRpcError({ recommend: 'stay', error: 'nonfatal warning' })).toBe(false)
    expect(isJsonRpcError(null)).toBe(false)
  })
})
