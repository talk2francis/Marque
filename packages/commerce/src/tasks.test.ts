import { describe, expect, it } from 'vitest'
import { validateTask, exampleSentence, TASK_CATEGORIES, EXAMPLE_ACCOUNT } from './tasks.js'
import { keelEngine, readTarget } from '../../agent-engines/src/keel'
import { parsePolicy } from '../../agent-engines/src/lattice'
import { boundEngine, readRangePct } from '../../agent-engines/src/bound'
import { parseAsk } from '../../agent-engines/src/sluicegate'
import { parseTidemark } from '../../agent-engines/src/tidemark'
import { redcellEngine } from '../../agent-engines/src/redcell'

describe('category task schemas (invariant 42)', () => {
  it('refuses incomplete tasks with plain words, never a schema path', () => {
    expect(validateTask('health_factor', {})).toEqual({ ok: false, missing: ['the wallet address'] })
    expect(validateTask('yield', { amount: 500, asset: 'USDT' })).toEqual({ ok: false, missing: ['how many days you will hold it'] })
    expect(validateTask('yield', { amount: 500, asset: 'DAI', holdingDays: 30 })).toEqual({ ok: false, missing: ['the stablecoin (USDT, USDC, FDUSD or U)'] })
    expect(validateTask('grid', { pair: 'BNB', capitalUsd: 500, lower: 700, upper: 600 })).toEqual({ ok: false, missing: ['an upper price above the lower price'] })
    expect(validateTask('grid', { capitalUsd: 500, lower: 500, upper: 600 })).toEqual({ ok: false, missing: ['a pair or a pool'] })
    expect(validateTask('rebalancing', { positionId: '7367728' })).toEqual({ ok: false, missing: ['the wallet address'] })
    expect(validateTask('rebalancing', { address: EXAMPLE_ACCOUNT })).toEqual({ ok: false, missing: ['a position number or a pool'] })
    expect(validateTask('security', { token: '0x12' })).toEqual({ ok: false, missing: ['the token contract address'] })
    expect(validateTask('lending', {})).toEqual({ ok: false, missing: ['a supported category'] })
    expect(validateTask('health_factor', { address: EXAMPLE_ACCOUNT, secret: 'x' })).toEqual({ ok: false, missing: ['only the fields this category uses'] })
  })
  it('applies the default target health factor', () => {
    const r = validateTask('health_factor', { address: EXAMPLE_ACCOUNT })
    expect(r.ok && r.fields['targetHf']).toBe(1.5)
  })
  it('every example task is complete', () => {
    for (const c of TASK_CATEGORIES) expect(exampleSentence(c)).toBeTruthy()
  })
})

describe('the composed sentences are the ones Marque reference engines accept', () => {
  const s = (c: string, f: Record<string, unknown>) => { const r = validateTask(c, f); if (!r.ok) throw Error(r.missing.join()); return r.sentence }
  it('health factor (Keel)', () => {
    const t = s('health_factor', { address: EXAMPLE_ACCOUNT, targetHf: 1.8 })
    expect(keelEngine.inspect(t).missing).toEqual([])
    expect(readTarget(t).target).toBe(1.8)
  })
  it('grid (Lattice)', () => {
    expect(parsePolicy(s('grid', { pair: 'BNB', lower: 560.5, upper: 690, capitalUsd: 500, stop: 540, levels: 12 }))).toMatchObject({ lowerBound: 560.5, upperBound: 690, capitalUsd: 500, stopPrice: 540, levels: 12 })
  })
  it('rebalancing (Bound)', () => {
    const t = s('rebalancing', { positionId: '7367728', address: EXAMPLE_ACCOUNT, targetRangePct: 5 })
    expect(boundEngine.inspect(t).missing).toEqual([])
    expect(readRangePct(t)).toBe(5)
  })
  it('yield (Sluicegate and Tidemark), with the holding period', () => {
    const t = s('yield', { amount: 1000, asset: 'USDT', holdingDays: 30, currentAprPct: 2, thresholdPp: 1 })
    expect(parseAsk(t)).toMatchObject({ asset: 'USDT', sizeUsd: 1000 })
    expect('missing' in parseTidemark(t)).toBe(false)
  })
  it('security (Redcell)', () => {
    expect(redcellEngine.inspect(s('security', { token: '0x55d398326f99059fF775485246999027B3197955' })).missing).toEqual([])
  })
})
