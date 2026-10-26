import { describe, expect, it } from 'vitest'
import { criteriaFor, decodeReason, encodeReason, rejectReason } from '@marque/conformance/criteria'
import { termsOf, type LensCheck } from './lens'

const hf = criteriaFor('health_factor').map((c) => c.text)
const signed = JSON.stringify({ version: 1, task: 'Check 0x60AA… (via marque.trade)', terms: { deliverables: 'x', quality_standards: 'y', success_criteria: hf }, provider_sig: '0xabc', negotiation_hash: '0xdef' })
const buyer = JSON.stringify({ version: 1, task: 't', terms: { deliverables: 'x', quality_standards: '', success_criteria: hf, criteria_set_by: 'buyer' } })
// A deliberately failing answer: the agent's repay leaves the account short of its target.
const failing: LensCheck[] = [
  { key: 'hf', label: 'Health factor', state: 'match', agent: '1.173', marque: '1.173', how: 'chain', detail: null },
  { key: 'repay', label: 'Repay to reach 1.5', state: 'differs', agent: '$1,200.00', marque: 'HF 1.402 after it', how: 'chain', detail: null },
  { key: 'liq', label: 'BNB liquidation price', state: 'match', agent: '$512.40', marque: '$512.40', how: 'chain', detail: null },
]

describe('terms in the Result Lens', () => {
  it('reads criteria the agent signed from the job description, and finds the one not met', () => {
    const t = termsOf(signed, 'health_factor', failing)!
    expect(t.source).toBe('signed')
    expect(`${t.met} of ${t.of}`).toBe('2 of 3')
    expect(t.rows.find((r) => r.state === 'not_met')?.text).toBe(hf[1])
  })
  it('says when the buyer set them and the agent did not sign', () => {
    expect(termsOf(buyer, 'health_factor', failing)!.source).toBe('buyer')
  })
  it('a job without written terms is measured against the Standard, labelled as such', () => {
    expect(termsOf('Check my loan', 'health_factor', failing)!.source).toBe('standard')
  })
  it('the failing fixture prefills a reject reason that survives the trip through the dispute transaction', () => {
    const t = termsOf(signed, 'health_factor', failing)!
    const reason = rejectReason('97:1234', t.rows.filter((r) => r.state === 'not_met'), '129491555')
    expect(reason).toBe(`Job 97:1234 at block 129491555. Not met: ${hf[1]}: agent $1,200.00, chain HF 1.402 after it.`)
    const calldata = `0x${'7a'.repeat(4)}${'00'.repeat(30)}04d2${encodeReason(reason).slice(2)}`
    expect(decodeReason(calldata)).toBe(reason)
  })
})
