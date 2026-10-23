import { describe, expect, it } from 'vitest'
import fx from './__fixtures__/deliverables-v4.json'
import { normalizeAnswer, unwrapAnswer } from './lens.js'

const a = fx.answers as Record<string, { category: string; content: unknown }>
const lens = (name: string) => normalizeAnswer(a[name]!.category, a[name]!.content)

describe('Result Lens normaliser on real deliveries', () => {
  it('health factor: Keel (reference engine shape)', () => {
    const l = lens('Keel')
    expect(l).toMatchObject({ kind: 'health_factor', healthFactor: 1.088, target: 2.5, collateralSymbol: 'BTCB' })
    expect(l.kind === 'health_factor' && l.repayUsd).toBeCloseTo(6775.56, 1)
    expect(l.meta.block).toBe('129357711')
  })
  it('health factor: an account with no Venus position says so instead of a number', () => {
    const l = lens('Brain on BNB — Venus Health Factor Monitor')
    expect(l).toMatchObject({ kind: 'health_factor', healthFactor: null, hasPosition: false })
    expect(l.meta.note).toMatch(/entered no Venus markets/)
  })
  it('rebalancing: one position (Bound) and a wallet of positions (Range-1)', () => {
    const b = lens('Bound')
    expect(b.kind === 'rebalancing' && b.positions[0]).toMatchObject({ id: '7637521', current: -57856, inRange: true, proposed: [-59680, -56040], tickSpacing: 10, feeTier: 500 })
    const r = lens('Mandate Range-1')
    expect(r.kind === 'rebalancing' && r.positions.length).toBeGreaterThan(2)
    expect(r.kind === 'rebalancing' && r.positions[0]).toMatchObject({ id: '7367162', range: [-66092, -66062], inRange: false, proposed: [-66280, -66070], feeTier: 100 })
  })
  it('grid: Lattice levels and Grid-1 signal with its track record', () => {
    const l = lens('Lattice')
    expect(l.kind === 'grid' && l.spacing).toBe('geometric')
    expect(l.kind === 'grid' && l.levels.length).toBeGreaterThan(5)
    const g = lens('Mandate Grid-1')
    expect(g).toMatchObject({ kind: 'grid' })
    expect(g.kind === 'grid' && g.signal).toMatch(/sell/)
    expect(g.kind === 'grid' && g.record?.fills).toBe(5)
  })
  it('yield: Sluicegate venue, net APR, sources and switching cost', () => {
    const y = lens('Sluicegate')
    expect(y).toMatchObject({ kind: 'yield', recommend: true, venue: 'venus', sizeUsd: 1000 })
    expect(y.kind === 'yield' && y.sources.length).toBe(2)
    expect(y.kind === 'yield' && y.switching.gasUsd).toBeCloseTo(0.0437, 4)
  })
  it('security: Redcell verdict, counts and limitations', () => {
    const s = lens('Redcell')
    expect(s).toMatchObject({ kind: 'security', symbol: 'WBNB', proxy: false })
    expect(s.meta.limitations.length).toBe(3)
  })
  it('unknown shapes become generic, never guessed', () => {
    expect(normalizeAnswer(null, { hello: 'world' }).kind).toBe('generic')
    expect(normalizeAnswer('health_factor', 'not json').kind).toBe('generic')
    expect(unwrapAnswer({ answer: { x: 1 }, job: { id: 1 } })).toMatchObject({ x: 1, job: { id: 1 } })
  })
})
