import { describe, expect, it } from 'vitest'
import { jobSettled, QUIET_SECONDS } from './job-settled'

const now = 1_800_000_000
const base = { rated: false, lastEventAt: now - 60, fundingDeadline: null, now }

describe('jobSettled', () => {
  it('keeps every job that can still move live', () => {
    for (const state of ['FUNDED', 'SUBMITTED', 'DISPUTED', 'COMPLETED', 'REJECTED', 'EXPIRED']) {
      expect(jobSettled({ ...base, state, rated: true, lastEventAt: now - 10 * QUIET_SECONDS })).toBe(false)
    }
  })
  it('settles an ended job once it is rated, or after a quiet week', () => {
    expect(jobSettled({ ...base, state: 'PAID' })).toBe(false)
    expect(jobSettled({ ...base, state: 'PAID', rated: true })).toBe(true)
    expect(jobSettled({ ...base, state: 'REFUNDED', lastEventAt: now - QUIET_SECONDS })).toBe(true)
    expect(jobSettled({ ...base, state: 'CANCELLED', lastEventAt: now - QUIET_SECONDS + 1 })).toBe(false)
    expect(jobSettled({ ...base, state: 'PAID', lastEventAt: null })).toBe(false)
  })
  it('settles an unpaid job only a week after its payment window closed', () => {
    expect(jobSettled({ ...base, state: 'OPEN' })).toBe(false)
    expect(jobSettled({ ...base, state: 'OPEN', fundingDeadline: now + 600 })).toBe(false)
    expect(jobSettled({ ...base, state: 'OPEN', fundingDeadline: now - 3600 })).toBe(false)
    expect(jobSettled({ ...base, state: 'OPEN', fundingDeadline: now - QUIET_SECONDS })).toBe(true)
  })
})
