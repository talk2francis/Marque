import { describe, expect, it } from 'vitest'
import {
  agentPriceState,
  builderNextStep,
  ownerCursor,
  type BuilderAgent,
} from './builder-workspace'

const now = Date.parse('2026-10-31T12:00:00Z')
function agent(): BuilderAgent {
  return {
    chainId: 56,
    agentId: '123',
    quality: { checks: [] },
    seller: {
      identity: { current: true },
      services: [
        {
          declaredNow: true,
          kind: 'a2a',
          quote: { state: 'CURRENT_PROBE_SAMPLE', expiresAt: '2026-10-31T12:05:00Z' },
        },
      ],
      jobs: { submitted: 0 },
    },
  } as unknown as BuilderAgent
}
describe('builder status keeps listing, current price and paid delivery separate', () => {
  it('uses the current time, rather than treating an old successful sample as hireable forever', () => {
    const a = agent()
    expect(agentPriceState(a, now)).toBe('ready')
    expect(agentPriceState(a, now + 6 * 60_000)).toBe('expired')
  })
  it('does not use an undeclared service or MCP discovery as a payable quote', () => {
    const a = agent()
    a.seller.services[0]!.declaredNow = false
    expect(agentPriceState(a, now)).toBe('missing')
    a.seller.services[0]!.declaredNow = true
    a.seller.services[0]!.kind = 'mcp'
    expect(agentPriceState(a, now)).toBe('missing')
  })
  it('does not infer expiry from an absent timestamp', () => {
    const a = agent()
    a.seller.services[0]!.quote.expiresAt = null
    expect(agentPriceState(a, now)).toBe('missing')
  })
  it('prioritises unavailable registry proof, then a payable quote, then quality checks', () => {
    const a = agent()
    a.seller.identity.current = false
    expect(builderNextStep(a, now).title).toBe('Refresh the identity')
    a.seller.identity.current = true
    a.seller.services = []
    expect(builderNextStep(a, now).title).toBe('Make this agent hireable')
    const b = agent()
    b.quality.checks = [
      {
        id: 'proved',
        label: 'Prove ownership',
        pass: false,
        state: 'pending',
        reason: 'No proof',
        fix: 'Sign the message',
      },
    ]
    expect(builderNextStep(b, now)).toMatchObject({
      title: 'Prove ownership',
      detail: 'Sign the message',
    })
    expect(agentPriceState(b, now)).toBe('ready')
  })
  it('does not claim a funded job was delivered or paid', () => {
    const a = agent()
    expect(builderNextStep(a, now).title).toBe('Deliver the first funded job')
    a.seller.jobs.submitted = 1
    expect(builderNextStep(a, now).title).toBe('Keep the delivery path working')
  })
  it('does not ask an agent with no funded jobs to deliver a nonexistent job', () => {
    const a = agent()
    a.seller.jobs.funded = 0
    expect(builderNextStep(a, now).title).toBe('Get ready for the first buyer')
  })
  it.each([
    [null, 0],
    ['0', 0],
    ['8', 8],
    ['-1', null],
    ['01', null],
    ['2.5', null],
    ['1e2', null],
    ['1000000', null],
  ])('validates the pagination cursor %s', (value, want) => expect(ownerCursor(value)).toBe(want))
})
