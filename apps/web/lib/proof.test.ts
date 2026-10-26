import { describe, expect, it } from 'vitest'
import { statsFrom, type WalletQuest } from '@marque/commerce'
import { rowsFrom, totalsOf } from './proof'

type Hire = WalletQuest['hires'][number]
const hire = (jobId: string, o: Partial<Hire> & { reasons?: string[] }): Hire => ({
  jobKey: `56:${jobId}`, chainId: 56, jobId,
  agent: { agentKey: 'k', agentId: '1', name: 'Keel', owner: null, provider: '0xp', category: 'health_factor', firstParty: true },
  amount: '1', token: { address: null, symbol: 'U', decimals: 18 }, state: 'COMPLETED', marque: true, intentId: 'i',
  tx: { created: '0xc', funded: '0xf', completed: '0xd', submitted: '0xs' }, timestamps: {}, rating: null,
  eligible: (o.reasons ?? []).length === 0, reasons: [], ...o,
} as Hire)
const wallet = (address: string, hires: Hire[], team = false): WalletQuest => ({
  wallet: address, chainId: 56, asOfBlock: {}, hires,
  quest: { categories: {}, ratedAll: false, ownAgentListed: { done: false, agentKey: null }, eligible: !team, reasons: team ? ['team_wallet'] : [] },
  totals: { hires: hires.length, deposits: 0, delivered: 0, settled: 0, ratings: 0 },
} as unknown as WalletQuest)

describe('proof totals', () => {
  const per = [
    wallet('0xa', [hire('1', { rating: { value: 100, stars: 5, tx: '0xr', revoked: false } }), hire('2', { state: 'SUBMITTED', tx: { funded: '0xf', created: '0xc' }, reasons: ['duplicate_category'], eligible: false })]),
    wallet('0xb', [hire('3', { state: 'FUNDED', tx: { funded: '0xf', created: '0xc' } })]),
    wallet('0xt', [hire('4', { reasons: ['team_wallet'], eligible: false })], true),
    wallet('0xo', [hire('5', { reasons: ['self_hire'], eligible: false })]),
  ]
  const rows = rowsFrom(56, per)

  it('counted rows give exactly the stats API figures, computed independently', () => {
    const s = statsFrom(per)
    const counted = rows.filter((r) => r.counted)
    expect(new Set(counted.map((r) => r.client)).size).toBe(s.walletsWithHire)
    expect(counted.filter((r) => r.funded).length).toBe(s.deposits)
    expect(counted.filter((r) => r.delivered).length).toBe(s.delivered)
    expect(counted.filter((r) => r.settled).length).toBe(s.settled)
    expect(counted.filter((r) => r.rated).length).toBe(s.ratings)
  })
  it('team and operator jobs are rows, labelled, and never counted', () => {
    expect(rows.find((r) => r.jobId === '4')).toMatchObject({ funderClass: 'team', counted: false })
    expect(rows.find((r) => r.jobId === '5')).toMatchObject({ funderClass: 'operator', counted: false })
    const t = totalsOf(rows)['56']!
    expect([t.outside.jobs, t.team.jobs, t.operator.jobs]).toEqual([3, 1, 1])
    expect(t.outside.wallets).toBe(2)
  })
})
