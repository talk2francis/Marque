import { describe, expect, it } from 'vitest'
import { LOOP_STEPS, currentLoopNodes, loopNodes, type LoopEvidence } from './builder-loop'
const now = Date.parse('2026-11-06T10:00:00Z')
const fact = { at: '2026-11-06T09:55:00Z', href: '/proof', detail: 'Actual fixture observation', expiresAt: '2026-11-06T10:05:00Z' }
describe('builder delivery loop', () => {
  it.each(LOOP_STEPS)('names the first missing %s milestone without claiming later events happened', stopped => {
    const index = LOOP_STEPS.indexOf(stopped)
    const evidence = Object.fromEntries(LOOP_STEPS.map((id, i) => [id, i < index ? fact : null])) as LoopEvidence
    const nodes = loopNodes(evidence, '/docs/sellers', now)
    expect(nodes.find(n => n.state !== 'observed')?.id).toBe(stopped)
    expect(nodes.slice(index).every(n => n.at === null)).toBe(true)
  })
  it('keeps expired prices and unavailable reads separate from missing evidence', () => {
    const evidence: LoopEvidence = { answering: { ...fact, unavailable: true }, priced: { ...fact, expiresAt: '2026-11-06T09:59:00Z' }, checked: null, hired: fact, paid: null, rated: null }
    const nodes = loopNodes(evidence, '/docs/sellers', now)
    expect(nodes[0]!.state).toBe('unavailable'); expect(nodes[1]!.state).toBe('expired'); expect(nodes[3]!.state).toBe('observed'); expect(nodes[4]!.state).toBe('not_recorded')
  })
})

it('expires a visible price without a new request, and cannot present stale live standing as current', () => {
 const evidence: LoopEvidence = {answering:fact,priced:fact,checked:fact,hired:fact,paid:fact,rated:fact}
 const nodes=loopNodes(evidence,'/proof',now)
 expect(currentLoopNodes(nodes,now+11*60000)[1]?.state).toBe('expired')
 expect(currentLoopNodes(nodes,now,true).map(n=>n.state)).toEqual(['unavailable','unavailable','unavailable','observed','observed','observed'])
})
