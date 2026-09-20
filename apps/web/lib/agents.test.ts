import { beforeEach, describe, expect, it, vi } from 'vitest'
const { execute, agentState } = vi.hoisted(() => ({ execute: vi.fn(), agentState: vi.fn() }))
vi.mock('@marque/db', () => ({ db: () => ({ execute }) }))
vi.mock('./agent-state', () => ({
  agentState,
  TASK_FOR_CATEGORY: { rebalancing: 'rebalance', grid: 'grid', yield: 'yield', health_factor: 'health_factor' },
}))
import { callableAgentById } from './agents'

describe('explicit charter agent lookup', () => {
  beforeEach(() => { execute.mockReset(); agentState.mockReset(); vi.unstubAllEnvs() })
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
})
