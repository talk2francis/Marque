import { describe, expect, it } from 'vitest'
import { eventsBetween, REMINDERS } from './quest-bot.js'

const base = { delivered: ['97:1620'], distinct: 1, hireStatus: 'not_met', build: { '56:377436': { observed: 2, independent: 0 } } }

describe('quest bot events', () => {
  it('announces a newly delivered job, a new distinct agent and a met hire track once each', () => {
    const next = { delivered: ['97:1620', '56:57070'], distinct: 3, hireStatus: 'met', build: base.build }
    const keys = eventsBetween(base, next, false).map((e) => e.key)
    expect(keys).toEqual(['job:56:57070', 'distinct:3', 'hire:met'])
  })
  it('never tells a team wallet its hire track is met', () => {
    const next = { ...base, distinct: 3, hireStatus: 'met' }
    expect(eventsBetween(base, next, true).map((e) => e.key)).toEqual(['distinct:3'])
  })
  it('counts independent hires with ordinals and build criteria as they turn green', () => {
    const next = { ...base, build: { '56:377436': { observed: 3, independent: 2 } } }
    const ev = eventsBetween(base, next, false)
    expect(ev.map((e) => e.text)).toEqual(['Your agent #377436 got its 2nd independent hire.', 'Your agent #377436: 3 of 6 build criteria now observed on chain.'])
  })
  it('reminder marks match the calendar file: 7 days, 2 days, 1 day, 3 hours', () => {
    expect(REMINDERS.map((r) => r.beforeMs / 3_600_000)).toEqual([168, 48, 24, 3])
  })
})
