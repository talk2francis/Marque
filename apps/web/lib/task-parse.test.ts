import { describe, expect, it } from 'vitest'
import { fieldsFromText } from './task-parse'

const A = '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'
describe('fieldsFromText', () => {
  it('reads the address and target of a health factor task, not digits inside the address', () => {
    expect(fieldsFromText('health_factor', `health factor of ${A} and the repay to reach 1.5`)).toEqual({ address: A, targetHf: 1.5 })
    expect(fieldsFromText('health_factor', `What is the HF of ${A}?`)).toEqual({ address: A })
  })
  it('reads a yield amount and asset, with a default holding period', () => {
    expect(fieldsFromText('yield', 'Where should 1,000 USDT earn the most over 60 days? I earn 2% now.')).toEqual({ amount: 1000, asset: 'USDT', holdingDays: 60, currentAprPct: 2 })
  })
  it('reads a grid range, capital, levels and stop', () => {
    expect(fieldsFromText('grid', 'Plan a 12-level grid for BNB between 600 and 850 with 2000 USDT, stop at 580')).toMatchObject({ pair: 'BNB', lower: 600, upper: 850, capitalUsd: 2000, levels: 12, stop: 580 })
  })
  it('reads a position id and owner for rebalancing', () => {
    expect(fieldsFromText('rebalancing', `Re-centre position 7654391 of ${A} at 6%`)).toEqual({ address: A, positionId: '7654391', targetRangePct: 6 })
  })
  it('leaves out what the sentence does not say', () => {
    expect(fieldsFromText('security', 'Is this token safe?')).toEqual({})
  })
})
