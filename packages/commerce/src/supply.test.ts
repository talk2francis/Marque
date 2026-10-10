import { describe, expect, it } from 'vitest'
import { quoteIntervalMinutes } from './supply'
describe('quote observation cadence', () => {
  it('rechecks a failed reference seller promptly without increasing healthy polling', () => {
    expect(quoteIntervalMinutes(true, false)).toBe(1)
    expect(quoteIntervalMinutes(true, true)).toBe(10)
    expect(quoteIntervalMinutes(false, true)).toBe(30)
    expect(quoteIntervalMinutes(false, false)).toBe(360)
  })
})
