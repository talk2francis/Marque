import { describe, expect, it } from 'vitest'
import { demandOutcome } from './builder-demand'
describe('recorded quote outcomes', () => {
  it('won requires an exact funded match, even if another quote was also funded', () => {
    expect(demandOutcome(true, true, false)).toBe('won')
    expect(demandOutcome(true, true, true)).toBe('won')
  })
  it('lost requires another funded match, not merely a cheaper quote', () => {
    expect(demandOutcome(true, false, true)).toBe('lost')
    expect(demandOutcome(true, false, false)).toBe('not_funded')
  })
  it('a failed quote stays did-not-quote rather than a manufactured lost hire', () => {
    expect(demandOutcome(false, false, true)).toBe('did_not_quote')
  })
})
