import { describe, expect, it } from 'vitest'
import { gridPath, rangeDrift } from './charter-scenarios'
import { planGrid } from './charters-builder-v2'
describe('grid threshold rehearsal', () => {
  it('visits buy thresholds on a fall, then recovery thresholds on the return', () => {
    const plan = planGrid(500,700,4,72)!
    expect(gridPath(plan,720,0,'dip').reached.every(x => !x.buyReached)).toBe(true)
    expect(gridPath(plan,720,0.5,'dip').reached.every(x => x.buyReached && !x.sellReached)).toBe(true)
    expect(gridPath(plan,720,1,'dip').reached.every(x => x.buyReached && x.sellReached)).toBe(true)
    expect(gridPath(plan,720,1,'fall').reached.every(x => !x.sellReached)).toBe(true)
  })
})
describe('range drift contract boundaries', () => {
  it('waits through the lower buffer, and triggers at the upper boundary', () => {
    expect(rangeDrift(-110,-100,100,10,10).out).toBe(false)
    expect(rangeDrift(-111,-100,100,10,10).out).toBe(true)
    expect(rangeDrift(109,-100,100,10,10).out).toBe(false)
    expect(rangeDrift(110,-100,100,10,10).out).toBe(true)
  })
  it('preserves width and rounds negative ranges down to pool spacing', () => {
    const { next } = rangeDrift(-1,-100,100,10,10)
    expect(next).toEqual({ lower:-110, upper:90 })
  })
})
