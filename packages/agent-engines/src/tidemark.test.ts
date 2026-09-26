import { describe, expect, it } from 'vitest'
import { parseTidemark, tidemarkEngine } from './tidemark.js'

describe('tidemark parse', () => {
  it('the hire-sheet yield preset', () => {
    expect(parseTidemark('Where should 1000 USDT earn the most on BNB Chain right now, after switching costs?'))
      .toMatchObject({ asset: 'USDT', amount: 1000, days: 7 })
  })
  it('BNB over a stated window', () => {
    expect(parseTidemark('Where have 5 BNB earned the most over the last 30 days?')).toMatchObject({ asset: 'BNB', amount: 5, days: 30, assumptions: [] })
  })
  it('reads "the past month"', () => {
    expect(parseTidemark('Best home for $2,000 of USDC over the past month')).toMatchObject({ asset: 'USDC', amount: 2000, days: 30 })
  })
  it('needs an amount before a quote', () => {
    expect(tidemarkEngine.inspect('Where should my USDT go?').missing).toEqual(['the amount to deploy'])
  })
  it('refuses a window past 90 days', () => {
    expect('missing' in parseTidemark('1000 USDT over the last 400 days')).toBe(true)
  })
})
