import { describe, expect, it } from 'vitest'
import type { MarketRow } from './marketplace'
import { dedupePulled, isHireable, withStanding } from './standing'

const now = Date.parse('2026-11-02T08:00:00.000Z')
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString()
function row(agentId: string, over: Partial<MarketRow> = {}): MarketRow {
  return {
    agentId, name: agentId, owner: '0xaaa', host: 'https://agent.example', category: 'health_factor',
    warrant: { status: 'untested', testId: null, date: null, failedField: null },
    commerce: { state: 'hireable' }, track: { jobs: { delivered: 0 } },
    ...over,
  } as unknown as MarketRow
}

describe('withStanding (V4.4)', () => {
  it('only safety pulls: an undelivered paid job or a recent wrong answer; a format miss never does', () => {
    const [undelivered, wrong, format, old] = withStanding([
      row('56:r:1'), row('56:r:2'),
      row('56:r:3', { warrant: { status: 'untested', testId: 'MCS-HF-1', date: daysAgo(3), failedField: null, format: true } }),
      row('56:r:4'),
    ], {
      '56:r:1': { checked: null, wrong: null, undelivered: { at: daysAgo(2), jobId: '56/9', state: 'REFUNDED' } },
      '56:r:2': { checked: null, wrong: { at: daysAgo(1), via: 'check', ref: '7', detail: 'Health factor' }, undelivered: null },
    }, [], now)
    expect(undelivered!.standing!.pulled).toMatchObject({ reason: 'undelivered' })
    expect(wrong!.standing!.pulled).toMatchObject({ reason: 'wrong_answer' })
    expect(wrong!.standing!.pulled!.text).toContain('health factor outside tolerance')
    expect(isHireable(format!)).toBe(true)
    expect(isHireable(old!)).toBe(true)
  })

  it('a Warrant counts for 14 days; a stated wrong value in the test pulls unless a later check agreed', () => {
    const [fresh, lapsed, failed, corrected] = withStanding([
      row('56:w:1', { warrant: { status: 'warranted', testId: 'MCS-HF-1', date: daysAgo(10), failedField: null } }),
      row('56:w:2', { warrant: { status: 'warranted', testId: 'MCS-HF-1', date: daysAgo(15), failedField: null } }),
      row('56:w:3', { warrant: { status: 'failed', testId: 'MCS-HF-1', date: daysAgo(5), failedField: 'healthFactor' } }),
      row('56:w:4', { warrant: { status: 'failed', testId: 'MCS-HF-1', date: daysAgo(5), failedField: 'healthFactor' } }),
    ], { '56:w:4': { checked: { at: daysAgo(1), via: 'check', ref: '8' }, wrong: null, undelivered: null } }, [], now)
    expect(fresh!.standing!.warranted).toMatchObject({ testId: 'MCS-HF-1' })
    expect(lapsed!.standing!.warranted).toBeNull()
    expect(failed!.standing!.pulled!.text).toContain('wrong health factor in MCS-HF-1')
    expect(corrected!.standing!.pulled).toBeNull()
    expect(corrected!.standing!.checked).toMatchObject({ via: 'check' })
  })

  it('a testnet twin (same owner and endpoint host) carries its mainnet checked and Warrant, marked as earned on mainnet', () => {
    const main = row('56:t:1', { warrant: { status: 'warranted', testId: 'MCS-HF-1', date: daysAgo(2), failedField: null } })
    const [twin, stranger] = withStanding([row('97:t:1'), row('97:t:2', { owner: '0xbbb' })], {
      '56:t:1': { checked: { at: daysAgo(1), via: 'job', ref: '56/5' }, wrong: null, undelivered: null },
    }, [main], now)
    expect(twin!.standing).toMatchObject({ warranted: { onMainnet: true }, checked: { onMainnet: true, ref: '56/5' } })
    expect(stranger!.standing).toMatchObject({ warranted: null, checked: null })
  })

  it('the pulled list is one row per operator and endpoint host', () => {
    const out = dedupePulled([row('56:d:1'), row('56:d:2'), row('56:d:3', { host: 'https://other.example' })])
    expect(out.map((r) => [r.agentId, r.identities])).toEqual([['56:d:1', 2], ['56:d:3', 1]])
  })
})
