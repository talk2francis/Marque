import { describe, expect, it } from 'vitest'
import { orderPicks } from './practice'

const row = (agentId: string, outside: boolean, listed = false) => ({ agentId, outside, listed })

describe('practice picker order', () => {
  it('puts listed outside builds first, then other outside agents, then Marque reference agents', () => {
    const out = orderPicks([row('97:a', false), row('97:b', true), row('97:c', true, true), row('97:d', false)], 0)
    expect(out.map((r) => r.agentId).slice(0, 2)).toEqual(['97:c', '97:b'])
    expect(out.slice(2).every((r) => !r.outside)).toBe(true)
  })
  it('rotates inside a group every ten minutes, so no outside agent is always first', () => {
    const rows = Array.from({ length: 6 }, (_, i) => row(`97:${i}`, true))
    const firsts = new Set(Array.from({ length: 24 }, (_, slot) => orderPicks(rows, slot * 600_000)[0]!.agentId))
    expect(firsts.size).toBeGreaterThan(2)
    expect(orderPicks(rows, 1000)).toEqual(orderPicks(rows, 2000))
  })
})
