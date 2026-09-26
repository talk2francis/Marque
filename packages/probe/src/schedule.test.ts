import { describe, it, expect } from 'vitest'
import { tierOf, intervalMinutes, jitteredMinutes, nextStreak, INTERVAL_MINUTES, type ScheduleInput } from './schedule.js'

const base: ScheduleInput = { firstParty: false, classified: false, liveness: 'live', consecutiveDead: 0 }

describe('tierOf', () => {
  it('puts first-party services in T0 whatever their verdict', () => {
    expect(tierOf({ ...base, firstParty: true, liveness: 'dead', consecutiveDead: 9 })).toBe('T0')
    expect(tierOf({ ...base, firstParty: true, classified: true })).toBe('T0')
  })
  it('puts classified services in T1', () => {
    expect(tierOf({ ...base, classified: true })).toBe('T1')
    expect(tierOf({ ...base, classified: true, liveness: null })).toBe('T1')
  })
  it('puts never-probed services in T2', () => {
    expect(tierOf({ ...base, liveness: null })).toBe('T2')
  })
  it('separates answering services (T1b) from dead ones (T3)', () => {
    for (const l of ['live', 'unbound', 'bad_schema'] as const) expect(tierOf({ ...base, liveness: l })).toBe('T1b')
    expect(tierOf({ ...base, liveness: 'dead', consecutiveDead: 1 })).toBe('T3')
  })
})

describe('intervalMinutes', () => {
  it('re-probes T0 every 5 minutes and T1 every 30', () => {
    expect(intervalMinutes({ ...base, firstParty: true })).toBe(5)
    expect(intervalMinutes({ ...base, firstParty: true, liveness: 'dead', consecutiveDead: 7 })).toBe(5)
    expect(intervalMinutes({ ...base, classified: true })).toBe(30)
  })
  it('slows a classified service that has been dead 3+ times, but keeps it inside the 60-minute freshness bar', () => {
    expect(intervalMinutes({ ...base, classified: true, liveness: 'dead', consecutiveDead: 2 })).toBe(30)
    expect(intervalMinutes({ ...base, classified: true, liveness: 'dead', consecutiveDead: 3 })).toBe(INTERVAL_MINUTES.priorityDead)
  })
  it('keeps answering services inside the 24 h reachable window', () => {
    expect(intervalMinutes({ ...base, liveness: 'unbound' })).toBe(720)
    expect(intervalMinutes({ ...base, liveness: 'unbound' }) * 1.1).toBeLessThan(24 * 60)
  })
  it('backs dead services off 1h, 3h, 6h, 24h, then 72h, and never drops them', () => {
    const at = (n: number) => intervalMinutes({ ...base, liveness: 'dead', consecutiveDead: n })
    expect([1, 2, 3, 4, 5, 50].map(at)).toEqual([60, 180, 360, 1440, 4320, 4320])
  })
  it('makes never-probed services due immediately', () => {
    expect(intervalMinutes({ ...base, liveness: null })).toBe(0)
  })
})

describe('jitteredMinutes', () => {
  it('never jitters T0', () => {
    expect(jitteredMinutes({ ...base, firstParty: true }, 12345)).toBe(5)
  })
  it('stays within +-10% and is deterministic per service', () => {
    for (let id = 1; id < 2000; id += 37) {
      const m = jitteredMinutes({ ...base, classified: true }, id)
      expect(m).toBeGreaterThanOrEqual(27)
      expect(m).toBeLessThanOrEqual(33)
      expect(jitteredMinutes({ ...base, classified: true }, id)).toBe(m)
    }
  })
})

describe('nextStreak', () => {
  it('counts dead verdicts in a row and resets on anything else', () => {
    expect(nextStreak(0, 'dead')).toBe(1)
    expect(nextStreak(4, 'dead')).toBe(5)
    expect(nextStreak(4, 'unbound')).toBe(0)
    expect(nextStreak(4, 'live')).toBe(0)
  })
})
