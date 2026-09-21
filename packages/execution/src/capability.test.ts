import { describe, expect, it } from 'vitest'
import { evaluateAgentState, type ServiceCapabilityEvidence } from './capability'

const NOW = new Date('2026-09-21T00:00:00.000Z')

function service(overrides: Partial<ServiceCapabilityEvidence> = {}): ServiceCapabilityEvidence {
  return {
    serviceId: 7,
    agentId: '56:registry:42',
    protocol: 'a2a',
    discoveryEndpoint: 'https://agent.example/.well-known/agent-card.json',
    executableEndpoint: 'https://agent.example/a2a',
    probeId: 9,
    probedAt: '2026-09-20T23:55:00.000Z',
    liveness: 'live',
    failureClass: null,
    taskKinds: ['yield'],
    manifest: { skills: [{ id: 'yield' }], capabilityEvidence: { messageSendCallable: true } },
    ...overrides,
  }
}

function evaluate(overrides: Partial<Parameters<typeof evaluateAgentState>[0]> = {}) {
  return evaluateAgentState({
    agentId: '56:registry:42', registered: true, metadataReadable: true,
    category: 'yield', requestedTask: 'yield', services: [service()],
    qualification: null, authorizable: true, now: NOW,
    ...overrides,
  })
}

describe('evaluateAgentState', () => {
  it('keeps callable, compatible, qualified and settleable independent', () => {
    const state = evaluate({
      qualification: { testId: 'MCS-YIELD-1', passed: false, measuredAt: NOW.toISOString(), stale: false },
    })
    expect(state.callable).toBe(true)
    expect(state.compatible).toBe(true)
    expect(state.qualified).toBe(false)
    expect(state.hireable).toBe(true)
    expect(state.settleable).toBe(false)
    expect(state.reasons).toContain('MCS_FAILED')
  })

  it('does not let an unrelated live service prove task compatibility', () => {
    const state = evaluate({ services: [service({ taskKinds: ['grid'] })] })
    expect(state.reachable).toBe(true)
    expect(state.callable).toBe(true)
    expect(state.compatible).toBe(false)
    expect(state.hireable).toBe(false)
    expect(state.reasons).toContain('TASK_CAPABILITY_UNVERIFIED')
  })

  it('never mixes task evidence from one service with liveness from another', () => {
    const state = evaluate({ services: [
      service({ serviceId: 1, liveness: 'unbound', taskKinds: ['yield'] }),
      service({ serviceId: 2, protocol: 'mcp', liveness: 'live', taskKinds: ['grid'] }),
    ] })
    expect(state.callable).toBe(true)
    expect(state.compatible).toBe(false)
    expect(state.selectedService).toBeNull()
    expect(state.hireable).toBe(false)
  })

  it('invalidates stale probes without erasing their historical evidence', () => {
    const state = evaluate({ services: [service({ probedAt: '2026-09-19T22:00:00.000Z' })] })
    expect(state.serviceDeclared).toBe(true)
    expect(state.reachable).toBe(false)
    expect(state.hireable).toBe(false)
    expect(state.reasons).toContain('PROBE_STALE')
  })

  it('never uses qualification as a substitute for executability', () => {
    const state = evaluate({
      services: [],
      qualification: { testId: 'MCS-YIELD-1', passed: true, measuredAt: NOW.toISOString(), stale: false },
    })
    expect(state.qualified).toBe(true)
    expect(state.callable).toBe(false)
    expect(state.hireable).toBe(false)
  })

  it('selects a compatible service deterministically', () => {
    const state = evaluate({ services: [
      service({ serviceId: 8, protocol: 'mcp' }),
      service({ serviceId: 7, protocol: 'a2a' }),
    ] })
    expect(state.selectedService?.serviceId).toBe(7)
  })

  it('does not promote a readable A2A card without message/send evidence', () => {
    const state = evaluate({ services: [service({
      manifest: { capabilityEvidence: { cardReadable: true, endpointDiscovered: true, messageSendCallable: null } },
    })] })
    expect(state.reachable).toBe(true)
    expect(state.callable).toBe(false)
    expect(state.hireable).toBe(false)
    expect(state.reasons).toContain('A2A_TASK_ENDPOINT_UNRESOLVED')
  })
})
