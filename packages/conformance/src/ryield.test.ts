import { describe, expect, it } from 'vitest'
import { gradeRyield, type RyieldGroundTruth } from './tests/mcs-ryield-1.js'
import { RYIELD } from './tolerances.js'

// Measured on BSC mainnet, 26 Oct 2026: Venus vUSDT between blocks 128545599 and 129889599.
const gt: RyieldGroundTruth = {
  asset: 'USDT', amount: 1000, fromBlock: '128545599', toBlock: '129889599',
  fromTime: '2026-10-19T11:23:31.000Z', toTime: '2026-10-26T11:29:02.000Z',
  venues: [{ symbol: 'vUSDT', market: '0xfD5840Cd36d94D7229439859C0112a4185BC0255', realisedAprPct: 3.3417 }],
}
const good = {
  recommend: true, venue: 'Venus vUSDT', window: { fromBlock: '128545599', toBlock: '129889599' },
  ranking: [{ venue: 'Venus vUSDT', realisedAprPct: 3.3417, netRealisedAprPct: 3.3373, source: 'vToken exchangeRateStored at blocks 128545599 and 129889599' }],
}
const failed = (diffs: ReturnType<typeof gradeRyield>) => diffs.filter((d) => !d.pass).map((d) => d.field)

describe('MCS-RYIELD-1', () => {
  it('passes a correct answer on every assertion', () => {
    expect(failed(gradeRyield(gt, good))).toEqual([])
  })
  it('fails a different window, even with the right numbers for it', () => {
    expect(failed(gradeRyield(gt, { ...good, window: { fromBlock: '128545699', toBlock: '129889699' } }))).toEqual([RYIELD.WINDOW_EXACT.id])
  })
  it('fails the quoted rate passed off as realised (0.18 points high)', () => {
    const r = { ...good, ranking: [{ ...good.ranking[0]!, realisedAprPct: 3.5217, netRealisedAprPct: 3.5 }] }
    expect(failed(gradeRyield(gt, r))).toEqual([RYIELD.REALISED_APR_BPS.id])
  })
  it('fails a net above gross, a missing source and a recommendation its own ranking contradicts', () => {
    const r = {
      ...good, venue: 'Venus vUSDC',
      ranking: [{ ...good.ranking[0]!, netRealisedAprPct: 3.4, source: '' }, { venue: 'Venus vUSDC', realisedAprPct: 1, netRealisedAprPct: 0.9, source: 'x' }],
    }
    expect(failed(gradeRyield(gt, r)).sort()).toEqual([RYIELD.NET_NOT_ABOVE_GROSS.id, RYIELD.SOURCED.id, RYIELD.DECISION_CONSISTENT.id].sort())
  })
  it('an empty answer passes nothing', () => {
    expect(gradeRyield(gt, {}).every((d) => !d.pass)).toBe(true)
  })
})
