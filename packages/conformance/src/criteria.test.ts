import { describe, expect, it } from 'vitest'
import { CRITERIA, criteriaFor, criterionByText, decodeReason, encodeReason, evaluateCriteria, rejectReason } from './criteria.js'
import { HF, YIELD } from './tolerances.js'

describe('acceptance criteria', () => {
  it('cover all four categories, with tolerances taken from the Standard', () => {
    for (const c of ['health_factor', 'yield', 'rebalancing', 'grid']) expect(criteriaFor(c).length).toBeGreaterThanOrEqual(3)
    expect(criteriaFor('health_factor')[0]!.text).toContain(String(HF.HEALTH_FACTOR.value))
    expect(criteriaFor('yield')[2]!.text).toContain(`${YIELD.NET_APR_BPS.value} bps`)
    expect(criteriaFor('security')).toEqual([])
  })
  it('texts are unique across categories, so a stored text names exactly one criterion', () => {
    const all = Object.values(CRITERIA).flat().map((c) => c.text)
    expect(new Set(all).size).toBe(all.length)
    expect(criterionByText(criteriaFor('grid')[3]!.text)?.category).toBe('grid')
  })
  it('met only when every decided check holds; unchecked is never met', () => {
    const r = evaluateCriteria(criteriaFor('health_factor'), [
      { key: 'hf', state: 'match', agent: '1.173', marque: '1.173' },
      { key: 'repay', state: 'differs', agent: '$10', marque: 'HF 1.9 after it' },
      { key: 'liq', state: 'unavailable', agent: '$500', marque: null },
    ])
    expect(r.map((x) => x.state)).toEqual(['met', 'not_met', 'unchecked'])
    const reb = evaluateCriteria(criteriaFor('rebalancing'), [
      { key: 'spacing-1', state: 'holds', agent: null, marque: null }, { key: 'spacing-2', state: 'fails', agent: '5 to 7', marque: 'multiples of 10' },
    ])
    expect(reb.find((x) => x.id === 'spacing')).toMatchObject({ state: 'not_met', agent: '5 to 7', checks: 2 })
  })
  it('the dispute reason round-trips through the calldata suffix', () => {
    const failed = evaluateCriteria(criteriaFor('health_factor'), [{ key: 'repay', state: 'differs', agent: '$10', marque: 'HF 1.9 after it' }]).filter((x) => x.state === 'not_met')
    const reason = rejectReason('97:1234', failed, '129000000')
    expect(reason).toContain('The repay amount')
    const selectorAndId = `0x${'ab'.repeat(4)}${'00'.repeat(31)}01`
    expect(decodeReason(selectorAndId + encodeReason(reason).slice(2))).toBe(reason)
    expect(decodeReason(selectorAndId)).toBeNull()
  })
})
