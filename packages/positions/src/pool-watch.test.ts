import { describe, expect, it } from 'vitest'
import { measureOutOfRange } from './pool-watch.js'

/**
 * "Hours out of range" is the number an LP acts on, and there is no public
 * source for it (docs/FINDINGS.md F-06). It rests entirely on observations we
 * made, so the cases that matter most are the ones where we have NOT observed
 * enough to answer — those must produce null or a stated floor, never a
 * confident figure.
 */

const now = new Date('2026-09-05T12:00:00Z')
const at = (hoursAgo: number, tick: number) => ({
  tick, observedAt: new Date(now.getTime() - hoursAgo * 3_600_000),
})

// A position spanning ticks 100..200.
const LOWER = 100
const UPPER = 200

describe('measureOutOfRange', () => {
  it('returns null rather than zero when we have never watched the pool', () => {
    const m = measureOutOfRange([], LOWER, UPPER, now)
    expect(m.hoursOutOfRange).toBeNull()
    expect(m.inRangeNow).toBeNull()
    expect(m.observations).toBe(0)
  })

  it('reports zero and in-range when the newest observation is inside', () => {
    const m = measureOutOfRange([at(0.1, 150), at(2, 150)], LOWER, UPPER, now)
    expect(m.inRangeNow).toBe(true)
    expect(m.hoursOutOfRange).toBe(0)
    expect(m.atLeast).toBe(false)
  })

  it('measures from the last in-range observation, not from the oldest', () => {
    // Out for the last 3h; was in range 3h ago.
    const m = measureOutOfRange([at(0.1, 400), at(1, 400), at(3, 150), at(9, 150)], LOWER, UPPER, now)
    expect(m.inRangeNow).toBe(false)
    expect(m.hoursOutOfRange).toBeCloseTo(3, 5)
    expect(m.atLeast).toBe(false)
  })

  // The important one. Every point we hold is out of range, so the position
  // may have drifted long before we started watching. A precise number here
  // would be an invention.
  it('reports a FLOOR when no observation was ever in range', () => {
    const m = measureOutOfRange([at(0.1, 400), at(4, 400), at(8, 400)], LOWER, UPPER, now)
    expect(m.atLeast).toBe(true)
    expect(m.hoursOutOfRange).toBeCloseTo(8, 5)
    expect(m.watchingSince).toBe(new Date(now.getTime() - 8 * 3_600_000).toISOString())
  })

  it('treats the upper tick as exclusive, matching V3 range semantics', () => {
    expect(measureOutOfRange([at(0.1, UPPER)], LOWER, UPPER, now).inRangeNow).toBe(false)
    expect(measureOutOfRange([at(0.1, UPPER - 1)], LOWER, UPPER, now).inRangeNow).toBe(true)
  })

  it('treats the lower tick as inclusive', () => {
    expect(measureOutOfRange([at(0.1, LOWER)], LOWER, UPPER, now).inRangeNow).toBe(true)
    expect(measureOutOfRange([at(0.1, LOWER - 1)], LOWER, UPPER, now).inRangeNow).toBe(false)
  })

  it('reports how many observations the answer rests on, so a sparse series shows as sparse', () => {
    const m = measureOutOfRange([at(0.1, 400), at(11, 150)], LOWER, UPPER, now)
    expect(m.observations).toBe(2)
    expect(m.hoursOutOfRange).toBeCloseTo(11, 5)
  })
})
