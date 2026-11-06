import { describe, expect, it } from 'vitest'
import { OUTSIDE_PATHS, summarizeOutside } from './uptime-log'
const now = Date.parse('2026-11-06T06:00:00Z')
const row = (at: string, bad = false) => ({ version: 1, at, checks: OUTSIDE_PATHS.map((path, i) => ({ path, status: bad && i === 2 ? 503 : 200, ttfbMs: 15, totalMs: 25 + i, error: null })) })
describe('outside observations', () => {
  it('reports an empty log without an uptime percentage', () => { expect(summarizeOutside([''], now)).toMatchObject({ checks: 0, share200: null, slowest: null, lastFailure: null }) })
  it('keeps only seven days, excludes future reads and deduplicates runs', () => {
    const one = JSON.stringify(row('2026-11-06T05:00:00Z'))
    const text = [one, one, JSON.stringify(row('2026-10-01T00:00:00Z')), JSON.stringify(row('2026-11-07T00:00:00Z'))].join('\n')
    expect(summarizeOutside([text], now)).toMatchObject({ runs: 1, checks: 6, share200: 1 })
  })
  it('counts failures as observations and identifies the last one', () => {
    const s = summarizeOutside([JSON.stringify(row('2026-11-06T05:00:00Z', true))], now)
    expect(s.answered200).toBe(5); expect(s.share200).toBe(5 / 6); expect(s.lastFailure?.path).toBe('/proof')
    expect(s.slowest).toEqual({ path: '/api/v1/proof', p95Ms: 30 })
  })
  it('rejects broken or duplicate-route records rather than reporting perfect uptime', () => {
    expect(() => summarizeOutside(['bad json'], now)).toThrow()
    const bad = row('2026-11-06T05:00:00Z'); bad.checks[1]!.path = '/'
    expect(() => summarizeOutside([JSON.stringify(bad)], now)).toThrow()
  })
})
