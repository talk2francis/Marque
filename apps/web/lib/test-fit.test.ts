import { describe, expect, it } from 'vitest'
import { testFits } from './test-fit'

describe('testFits (V4.4 P2)', () => {
  it('runs the range test only on agents that describe range work', () => {
    expect(testFits('MCS-REB-1', 'Keeper of Plinth capital-protected bStock savings vaults')).toBe(false)
    expect(testFits('MCS-REB-1', 'Re-centres PancakeSwap V3 LP ranges when the tick leaves them')).toBe(true)
    expect(testFits('MCS-HF-1', 'Reads a Venus account health factor')).toBe(true)
    expect(testFits('MCS-REB-1', null)).toBe(true)
    expect(testFits(null, 'anything')).toBe(true)
  })
})
