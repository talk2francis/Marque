import { describe, expect, it } from 'vitest'
import { answerFromA2A } from './try.js'

describe('answerFromA2A', () => {
  it('reads the reference agents\' task artifact (JSON in a text part)', () => {
    const body = { jsonrpc: '2.0', id: 1, result: { kind: 'task', status: { state: 'completed' }, artifacts: [{ parts: [{ kind: 'text', text: JSON.stringify({ healthFactor: 1.42, repayToTarget: '12.5' }) }] }] } }
    expect(answerFromA2A(body)).toEqual({ content: { healthFactor: 1.42, repayToTarget: '12.5' }, text: null })
  })
  it('reads a data part from a message reply', () => {
    const body = { result: { kind: 'message', role: 'agent', parts: [{ kind: 'data', data: { levels: [1, 2] } }] } }
    expect(answerFromA2A(body)).toEqual({ content: { levels: [1, 2] }, text: null })
  })
  it('keeps plain text as text, trimmed', () => {
    const body = { result: { kind: 'message', parts: [{ kind: 'text', text: '  Hold: APR spread below your threshold.  ' }] } }
    expect(answerFromA2A(body)).toEqual({ content: null, text: 'Hold: APR spread below your threshold.' })
  })
  it('shows a bare result object as the agent\'s text, not as a structured answer', () => {
    const r = answerFromA2A({ result: { agent: 'X', services: [{ id: 'yield_plan' }] } })
    expect(r?.content).toBeNull()
    expect(r?.text).toContain('yield_plan')
  })
  it('returns null when there is no answer at all', () => {
    expect(answerFromA2A({ jsonrpc: '2.0', id: 1 })).toBeNull()
    expect(answerFromA2A(null)).toBeNull()
  })
  it('does not treat a JSON array as structured content', () => {
    expect(answerFromA2A({ result: { parts: [{ kind: 'text', text: '[1,2]' }] } })).toEqual({ content: null, text: '[1,2]' })
  })
})
