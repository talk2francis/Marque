import { describe, expect, it } from 'vitest'
import { pickCandidates, taskShape, evidenceRank } from './tender-rules'

const row = (o: { id: string; owner?: string; ref?: boolean; warrant?: 'warranted' | 'failed' | 'untested'; delivered?: number; stars?: number | null }) => ({
  id: o.id, isReference: o.ref ?? false, owner: o.owner ?? o.id,
  warrant: { status: o.warrant ?? 'untested', testId: null, date: null, failedField: null },
  track: { jobs: { delivered: o.delivered ?? 0 }, verified: { averageStars: o.stars ?? null } },
}) as never as Parameters<typeof pickCandidates>[0][number] & { id: string }

describe('tender candidates', () => {
  it('ranks Warranted, then checked, then delivered jobs, then rating; an old test result alone ranks nothing', () => {
    const base = row({ id: 'tested', warrant: 'failed' })
    const checked = { ...row({ id: 'checked' }), standing: { pulled: null, checked: { at: '', via: 'job', ref: '56/1', onMainnet: false }, warranted: null } } as never as ReturnType<typeof row>
    const ranked = [base, row({ id: 'busy', delivered: 40 }), row({ id: 'warranted', warrant: 'warranted' }), row({ id: 'rated', stars: 5 }), checked]
      .sort((a, b) => evidenceRank(b) - evidenceRank(a)).map((r) => (r as { id: string }).id)
    expect(ranked).toEqual(['warranted', 'checked', 'busy', 'rated', 'tested'])
  })
  it('one per operator, at most two reference agents, eight in all', () => {
    const rows = [
      row({ id: 'r1', ref: true, owner: 'm1', warrant: 'warranted' }), row({ id: 'r2', ref: true, owner: 'm2', warrant: 'warranted' }), row({ id: 'r3', ref: true, owner: 'm3', warrant: 'warranted' }),
      row({ id: 'a', owner: 'op1', delivered: 9 }), row({ id: 'a2', owner: 'op1', delivered: 8 }),
      ...Array.from({ length: 10 }, (_, i) => row({ id: `x${i}`, delivered: 1 })),
    ]
    const picked = pickCandidates(rows).map((r) => (r as unknown as { id: string }).id)
    expect(picked.length).toBe(8)
    expect(picked.filter((p) => p.startsWith('r')).length).toBe(2)
    expect(picked).toContain('a')
    expect(picked).not.toContain('a2')
  })
  it('the stored task shape never keeps an address and buckets amounts', () => {
    expect(taskShape('health_factor', { address: '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf', targetHf: 1.5 })).toEqual({ category: 'health_factor', address: 'address', targetHf: 1.5 })
    expect(taskShape('yield', { amount: 30000, asset: 'FDUSD', holdingDays: 30 })).toEqual({ category: 'yield', amount: '25k+', asset: 'FDUSD', holdingDays: 30 })
  })
})
