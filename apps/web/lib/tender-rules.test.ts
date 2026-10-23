import { describe, expect, it } from 'vitest'
import { pickCandidates, taskShape, evidenceRank } from './tender-rules'

const row = (o: { id: string; owner?: string; ref?: boolean; warrant?: 'warranted' | 'failed' | 'untested'; delivered?: number; stars?: number | null }) => ({
  id: o.id, isReference: o.ref ?? false, owner: o.owner ?? o.id,
  warrant: { status: o.warrant ?? 'untested', testId: null, date: null, failedField: null },
  track: { jobs: { delivered: o.delivered ?? 0 }, verified: { averageStars: o.stars ?? null } },
}) as never as Parameters<typeof pickCandidates>[0][number] & { id: string }

describe('tender candidates', () => {
  it('ranks Warranted, then delivered jobs, then tested, then rating', () => {
    const ranked = [row({ id: 'tested', warrant: 'failed' }), row({ id: 'busy', delivered: 40 }), row({ id: 'warranted', warrant: 'warranted' }), row({ id: 'rated', stars: 5 })]
      .sort((a, b) => evidenceRank(b) - evidenceRank(a)).map((r) => (r as { id: string }).id)
    expect(ranked).toEqual(['warranted', 'tested', 'busy', 'rated'])
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
