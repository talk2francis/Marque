import { describe, expect, it } from 'vitest'
import { answersFree, hireHref, tryHref, type MarketRow } from './market-model'
const outside = { agentId: 'selected:agent', isReference: false, liveness:'live', interfaces:['a2a'], commerce:{serviceId:42} } as unknown as MarketRow
describe('exact marketplace service links', () => {
  it('carries the selected service into hire and reference-preview links', () => { expect(hireHref(outside)).toBe('?hire=selected%3Aagent&serviceId=42'); expect(tryHref(outside)).toBe('?hire=selected%3Aagent&serviceId=42&try=1') })
  it('retains legacy agent-only links when service is unknown', () => { expect(hireHref({...outside,commerce:{...outside.commerce,serviceId:null}})).toBe('?hire=selected%3Aagent') })
  it('does not infer free execution from external A2A liveness', () => { expect(answersFree(outside)).toBe(false); expect(answersFree({...outside,isReference:true})).toBe(true) })
})
