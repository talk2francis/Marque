import { describe, expect, it } from 'vitest'
import { softFailure } from './schedule'

const now = Date.parse('2026-11-16T17:00:00Z')
const at = (hoursAgo: number) => new Date(now - hoursAgo * 3600_000)

describe('softFailure', () => {
  it('keeps the verdict of a service that answered within 24 h when the connection fails', () => {
    for (const fc of ['timeout', 'refused', 'dns', 'tls']) expect(softFailure({ lastLiveness: 'unbound', lastCheckedAt: at(1) }, fc, now)).toBe(true)
    expect(softFailure({ lastLiveness: 'live', lastCheckedAt: at(23.9) }, 'timeout', now)).toBe(true)
  })
  it('records the failure once the last answer is 24 h old', () => {
    expect(softFailure({ lastLiveness: 'live', lastCheckedAt: at(24.1) }, 'timeout', now)).toBe(false)
  })
  it('never softens an answer that says the service is broken, or a service that was not answering', () => {
    expect(softFailure({ lastLiveness: 'live', lastCheckedAt: at(1) }, 'http_5xx', now)).toBe(false)
    expect(softFailure({ lastLiveness: 'live', lastCheckedAt: at(1) }, 'bad_schema', now)).toBe(false)
    expect(softFailure({ lastLiveness: 'dead', lastCheckedAt: at(1) }, 'timeout', now)).toBe(false)
    expect(softFailure({ lastLiveness: null, lastCheckedAt: null }, 'timeout', now)).toBe(false)
    expect(softFailure({ lastLiveness: 'live', lastCheckedAt: null }, 'timeout', now)).toBe(false)
  })
  it('is not a failure at all when there is no failure class', () => {
    expect(softFailure({ lastLiveness: 'live', lastCheckedAt: at(1) }, null, now)).toBe(false)
  })
})
