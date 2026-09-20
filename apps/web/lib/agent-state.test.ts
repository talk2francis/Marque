import { beforeEach, describe, expect, it, vi } from 'vitest'

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('@marque/db', () => ({ db: () => ({ execute }) }))
import { agentState } from './agent-state'

describe('canonical database-backed agent state', () => {
  beforeEach(() => execute.mockReset())

  it('binds compatibility to the exact service probe', async () => {
    execute
      .mockResolvedValueOnce({ rows: [{ id: '56:registry:9', token_id: '9', name: 'Nine', owner_address: '0xowner', detail_fetched: true, category: 'yield' }] })
      .mockResolvedValueOnce({ rows: [{
        service_id: 4, agent_id: '56:registry:9', kind: 'a2a',
        discovery_endpoint: 'https://nine.example/.well-known/agent-card.json', executable_endpoint: 'https://nine.example/a2a',
        probe_id: 11, checked_at: new Date('2026-09-20T23:00:00Z'), liveness: 'live', failure_class: null,
        task_kinds: ['yield'], manifest: { skills: [{ id: 'yield' }] },
      }] })
      .mockResolvedValueOnce({ rows: [{ test_id: 'MCS-YIELD-1', pass: false, ran_at: new Date('2026-09-20T22:00:00Z') }] })

    const state = await agentState('56:registry:9', 'yield', new Date('2026-09-21T00:00:00Z'))
    expect(state).toMatchObject({
      agentId: '56:registry:9', callable: true, compatible: true,
      qualified: false, hireable: true,
      selectedService: { serviceId: 4, probeId: 11, protocol: 'a2a' },
    })
    expect(state?.reasons).toContain('MCS_FAILED')
  })

  it('fails closed when the live service advertises a different task', async () => {
    execute
      .mockResolvedValueOnce({ rows: [{ id: '56:registry:9', token_id: '9', name: 'Nine', owner_address: null, detail_fetched: true, category: 'yield' }] })
      .mockResolvedValueOnce({ rows: [{
        service_id: 4, agent_id: '56:registry:9', kind: 'a2a', discovery_endpoint: 'https://nine.example/card',
        executable_endpoint: 'https://nine.example/a2a', probe_id: 11, checked_at: new Date('2026-09-20T23:00:00Z'),
        liveness: 'live', failure_class: null, task_kinds: ['grid'], manifest: { skills: [{ id: 'grid' }] },
      }] })
      .mockResolvedValueOnce({ rows: [] })
    const state = await agentState('56:registry:9', 'yield', new Date('2026-09-21T00:00:00Z'))
    expect(state?.callable).toBe(true)
    expect(state?.compatible).toBe(false)
    expect(state?.hireable).toBe(false)
  })
})

