import { describe, expect, it } from 'vitest'
import { canReuseInitialMarket } from './initial-freshness'

describe('server-seeded catalog freshness', () => {
  const now = Date.parse('2026-10-18T10:00:00.000Z')
  const at = (age: number) => new Date(now - age).toISOString()

  it('reuses a current measurement within the page revalidation window', () => {
    expect(canReuseInitialMarket(at(0), now)).toBe(true)
    expect(canReuseInitialMarket(at(29_999), now)).toBe(true)
  })
  it('refreshes at the revalidation boundary and after it', () => {
    expect(canReuseInitialMarket(at(30_000), now)).toBe(false)
    expect(canReuseInitialMarket(at(300_000), now)).toBe(false)
  })
  it('refreshes missing or malformed measurement times instead of trusting a zero count', () => {
    for (const time of [null, undefined, '', 'not-a-time']) expect(canReuseInitialMarket(time, now)).toBe(false)
  })
  it('does not treat a future measurement as fresh after a clock change', () => {
    expect(canReuseInitialMarket(at(-1), now)).toBe(false)
  })
  it('does not reuse data when the local clock is unavailable', () => {
    expect(canReuseInitialMarket(at(0), NaN)).toBe(false)
    expect(canReuseInitialMarket(at(0), Infinity)).toBe(false)
  })
})
