import { beforeEach, describe, expect, it, vi } from 'vitest'
const { execute, agentState, agentStates } = vi.hoisted(() => ({ execute: vi.fn(), agentState: vi.fn(), agentStates: vi.fn() }))
vi.mock('@marque/db', () => ({ db: () => ({ execute }) }))
vi.mock('./agent-state', () => ({
  agentState,
  agentStates,
  TASK_FOR_CATEGORY: { rebalancing: 'rebalance', grid: 'grid', yield: 'yield', health_factor: 'health_factor' },
}))
import { callableAgentById, callableAgents } from './agents'

describe('explicit charter agent lookup', () => {
  beforeEach(() => { execute.mockReset(); agentState.mockReset(); agentStates.mockReset(); vi.unstubAllEnvs() })
  it('resolves a third-party identity independently of category and the shortlist', async () => {
    agentState.mockResolvedValue({
      agentId: '56:registry:999', tokenId: '999', name: 'Third party', hireable: true,
      selectedService: { serviceId: 2, protocol: 'mcp', discoveryEndpoint: 'https://example.com/mcp', executableEndpoint: 'https://example.com/mcp', probeId: 4 },
    })
    expect(await callableAgentById('56:registry:999', 'yield')).toMatchObject({ agentId: '56:registry:999', name: 'Third party', serviceId: 2, isReference: false })
    expect(agentState).toHaveBeenCalledWith('56:registry:999', 'yield')
  })
  it('returns no substitute when an identity has no callable service', async () => {
    agentState.mockResolvedValue(null)
    expect(await callableAgentById('missing', 'yield')).toBeNull()
  })
  it('does not invent an endpoint for an unconfigured reference agent', async () => {
    vi.stubEnv('BOUND_PUBLIC_URL', '')
    expect(await callableAgentById('marque:bound', 'rebalancing')).toBeNull()
    expect(execute).not.toHaveBeenCalled()
  })
  it('uses the configured reference endpoint and canonical name', async () => {
    vi.stubEnv('BOUND_PUBLIC_URL', 'https://example.com/bound/')
    expect(await callableAgentById('marque:bound', 'rebalancing')).toMatchObject({ name: 'Bound', endpoint: 'https://example.com/bound/.well-known/agent-card.json', isReference: true })
  })
  it('never substitutes a reference agent when category does not match', async () => {
    vi.stubEnv('BOUND_PUBLIC_URL', 'https://example.com/bound/')
    expect(await callableAgentById('marque:bound', 'yield')).toBeNull()
  })
  it('uses canonical state for generic inventory and excludes an exact-Hire rejection', async () => {
    execute.mockResolvedValue([{ agent_id: '56:registry:2468' }, { agent_id: '56:registry:9' }])
    agentState.mockImplementation(async (id: string) => id.endsWith(':2468') ? {
      agentId: id, tokenId: '2468', name: 'ClawdMint', hireable: false, selectedService: null,
    } : {
      agentId: id, tokenId: '9', name: 'Compatible', hireable: true,
      selectedService: { serviceId: 12, protocol: 'mcp', discoveryEndpoint: 'https://ok.example/mcp', executableEndpoint: 'https://ok.example/mcp', probeId: 8 },
    })
    agentStates.mockResolvedValue(new Map([
      ['56:registry:2468', { agentId: '56:registry:2468', tokenId: '2468', name: 'ClawdMint', hireable: false, selectedService: null }],
      ['56:registry:9', { agentId: '56:registry:9', tokenId: '9', name: 'Compatible', hireable: true, selectedService: { serviceId: 12, protocol: 'mcp', discoveryEndpoint: 'https://ok.example/mcp', executableEndpoint: 'https://ok.example/mcp', probeId: 8 } }],
    ]))
    expect((await callableAgents('yield')).map((a) => a.agentId)).toEqual(['56:registry:9'])
    expect(await callableAgentById('56:registry:2468', 'yield')).toBeNull()
  })
  it('fails unsupported categories closed', async () => {
    expect(await callableAgents('not-a-category')).toEqual([])
    expect(execute).not.toHaveBeenCalled()
  })
  it('generic and exact paths both reject stale evidence from canonical state', async () => {
    execute.mockResolvedValue([{ agent_id: '56:registry:stale' }])
    agentState.mockResolvedValue({
      agentId: '56:registry:stale', tokenId: '10', name: 'Stale', hireable: false,
      selectedService: null, reasons: ['PROBE_STALE'],
    })
    agentStates.mockResolvedValue(new Map([['56:registry:stale', {
      agentId: '56:registry:stale', tokenId: '10', name: 'Stale', hireable: false,
      selectedService: null, reasons: ['PROBE_STALE'],
    }]]))
    expect(await callableAgents('yield')).toEqual([])
    expect(await callableAgentById('56:registry:stale', 'yield')).toBeNull()
  })
})
