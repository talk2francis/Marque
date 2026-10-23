import { describe, expect, it } from 'vitest'
import { pickReady } from './ready-picks'

const row = (id: string, category: string | null, isReference = false) => ({ id, category, isReference })

describe('pickReady', () => {
  it('shows at most two reference agents and leads with outside agents', () => {
    const rows = [
      row('r1', 'yield', true), row('r2', 'grid', true), row('r3', 'rebalancing', true), row('r4', 'health_factor', true),
      row('o1', 'yield'), row('o2', 'grid'), row('o3', 'security'), row('o4', 'rebalancing'),
    ]
    const picks = pickReady(rows)
    expect(picks).toHaveLength(6)
    expect(picks.filter((p) => p.isReference)).toHaveLength(2)
    expect(picks.slice(0, 4).every((p) => !p.isReference)).toBe(true)
  })
  it('keeps unclassified agents off the shelf when classified supply exists', () => {
    const rows = [row('x1', null), row('x2', 'unclassified'), row('o1', 'yield'), row('o2', 'grid'), row('o3', 'security')]
    expect(pickReady(rows).map((p) => p.id)).toEqual(['o1', 'o2', 'o3'])
  })
  it('falls back to unclassified agents only when classified supply is thin', () => {
    expect(pickReady([row('x1', null), row('o1', 'yield')]).map((p) => p.id)).toEqual(['o1', 'x1'])
  })
  it('fills with reference agents only up to the cap when outside supply is thin', () => {
    const rows = [row('r1', 'yield', true), row('r2', 'grid', true), row('r3', 'rebalancing', true), row('o1', 'yield')]
    const picks = pickReady(rows)
    expect(picks.map((p) => p.id)).toEqual(['o1', 'r2', 'r3'])
  })
  it('prefers a reference agent in a category no outside agent covers', () => {
    const rows = [row('r1', 'yield', true), row('r2', 'health_factor', true), row('o1', 'yield'), row('o2', 'yield'), row('o3', 'grid')]
    expect(pickReady(rows).map((p) => p.id)).toEqual(['o1', 'o3', 'o2', 'r2', 'r1'])
  })
  it('never invents rows', () => {
    expect(pickReady([])).toEqual([])
  })
})
