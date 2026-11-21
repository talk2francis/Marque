import { describe, expect, it } from 'vitest'
import { agentErrorText, benchEndpoint } from './bench-explain'

const missing = [{ missing: true }, { missing: true }]

describe('bench explanations (21 Nov)', () => {
  it('shows the agent\'s own error when nothing usable came back', () => {
    const t = agentErrorText({ error: 'unknown skill: undefined', skills: ['negotiate', 'notify_funded'] }, missing)
    expect(t).toContain('"unknown skill: undefined"')
    expect(t).toContain('negotiate, notify_funded')
    expect(agentErrorText('rate limited', missing)).toContain('"rate limited"')
    expect(agentErrorText({ error: { message: 'boom' } }, missing)).toContain('"boom"')
  })
  it('stays quiet when the agent answered fields, or said nothing readable', () => {
    expect(agentErrorText({ error: 'x' }, [{ missing: true }, { missing: false }])).toBeNull()
    expect(agentErrorText({ currentTick: 1 }, missing)).toBeNull()
    expect(agentErrorText({ error: 'x' }, [])).toBeNull()
  })
  it('looks up a bare A2A address at the well-known card path, and leaves MCP alone', () => {
    expect(benchEndpoint('a2a', 'https://a.example/')).toBe('https://a.example/.well-known/agent-card.json')
    expect(benchEndpoint('mcp', 'https://a.example/')).toBe('https://a.example/')
    expect(benchEndpoint('a2a', 'https://a.example/card.json')).toBe('https://a.example/card.json')
  })
})
