import { describe, expect, it } from 'vitest'
import { EXECUTORS } from '@marque/charters'
import { allowedPaths, choosePathV2 } from './watch.js'
import { fold } from './indexer.js'
import { wantsSession } from './keys.js'
import { nextOffset } from './walk.js'

const ALTANA = new Set(['loan', 'grid', 'range'] as const)

describe('allowedPaths', () => {
  it('lets the backup press open kinds, and named kinds only when the owner named it', () => {
    expect(allowedPaths('loan', [], false)).toEqual({ direct: false, backup: true })
    expect(allowedPaths('yield', [], true)).toEqual({ direct: true, backup: true })
    expect(allowedPaths('grid', [EXECUTORS.lattice], false)).toEqual({ direct: false, backup: false })
    expect(allowedPaths('grid', [EXECUTORS.lattice, EXECUTORS.backup.toLowerCase()], false).backup).toBe(true)
    expect(allowedPaths('range', [], true)).toEqual({ direct: false, backup: false })
  })
})

describe('choosePathV2', () => {
  const base = { altanaReady: false, direct: false, backup: false, now: 100_000, graceMs: 30_000 }
  it('prefers the agent session, then its own account, then the backup', () => {
    expect(choosePathV2({ ...base, open: null, altanaReady: true, direct: true, backup: true })).toEqual({ action: 'send', path: 'altana', supersede: false })
    expect(choosePathV2({ ...base, open: null, direct: true, backup: true })).toEqual({ action: 'send', path: 'direct', supersede: false })
    expect(choosePathV2({ ...base, open: null, backup: true })).toEqual({ action: 'send', path: 'backup', supersede: false })
    expect(choosePathV2({ ...base, open: null })).toEqual({ action: 'none' })
  })
  it('never sends twice while one is in flight, and hands over to the backup only after the grace', () => {
    const open = { path: 'altana' as const, status: 'pending', sentAt: 90_000 }
    expect(choosePathV2({ ...base, open, backup: true })).toEqual({ action: 'wait' })
    expect(choosePathV2({ ...base, open: { ...open, sentAt: 60_000 }, backup: true })).toEqual({ action: 'send', path: 'backup', supersede: true })
    expect(choosePathV2({ ...base, open: { ...open, sentAt: 60_000 }, backup: false })).toEqual({ action: 'wait' })
    expect(choosePathV2({ ...base, open: { path: 'backup', status: 'sent', sentAt: 0 }, backup: true })).toEqual({ action: 'wait' })
  })
})

describe('fold', () => {
  it('folds grid trades into gross caps, tips and executors', () => {
    const f = fold('grid', [
      { event: 'ExecutorSet', data: { executor: EXECUTORS.lattice, allowed: true } },
      { event: 'ExecutorSet', data: { executor: EXECUTORS.backup, allowed: true } },
      { event: 'Traded', data: { buy: true, amountIn: '100', amountOut: '7' } },
      { event: 'TipPaid', data: { amount: '2' } },
      { event: 'Traded', data: { buy: false, amountIn: '7', amountOut: '103' } },
      { event: 'Traded', data: { buy: true, amountIn: '100', amountOut: '8' } },
      { event: 'ExecutorSet', data: { executor: EXECUTORS.backup, allowed: false } },
      { event: 'Ended', data: { by: '0x1' } },
    ])
    expect(f.actions).toBe(3)
    expect(f.totals).toMatchObject({ quoteSpent: '200', baseSold: '7', buys: 2, sells: 1 })
    expect(f.tipsPaid).toBe('2')
    expect(f.executors).toEqual([EXECUTORS.lattice.toLowerCase()])
    expect(f.endedIndex).toBe(7)
  })
  it('follows the range keeper position through successors', () => {
    const f = fold('range', [{ event: 'Rebalanced', data: { newTokenId: '11' } }, { event: 'Rebalanced', data: { newTokenId: '12' } }, { event: 'Returned', data: { tokenId: '12' } }])
    expect(f.totals).toMatchObject({ rebalances: 2, tokenId: '12', returned: true })
  })
  it('keeps the guard spend from its own running total and the sweep gross supply', () => {
    expect(fold('loan', [{ event: 'Repaid', data: { spentTotal: '5' } }, { event: 'Repaid', data: { spentTotal: '9' } }]).totals['spent']).toBe('9')
    const y = fold('yield', [{ event: 'Supplied', data: { amount: '50', grossSupplied: '50' } }, { event: 'Withdrew', data: { amount: '20', heldV: '3' } }, { event: 'Supplied', data: { amount: '10', grossSupplied: '60' } }])
    expect(y.totals).toMatchObject({ grossSupplied: '60', supplied: '60', withdrawn: '20', heldV: '3' })
    expect(y.actions).toBe(3)
  })
})

describe('wantsSession', () => {
  it('gives open kinds a session and named kinds only when the agent is named', () => {
    expect(wantsSession('loan', [], ALTANA)).toBe(true)
    expect(wantsSession('yield', [], ALTANA)).toBe(false)
    expect(wantsSession('grid', [], ALTANA)).toBe(false)
    expect(wantsSession('grid', [EXECUTORS.lattice.toLowerCase()], ALTANA)).toBe(true)
    expect(wantsSession('range', [EXECUTORS.lattice], ALTANA)).toBe(false)
  })
})

describe('fixture market maker walk', () => {
  it('stays inside the span and steps at most the step size', () => {
    let o = 0
    let r = 0.123
    const rand = () => (r = (r * 9301 + 49297) % 233280 / 233280)
    for (let i = 0; i < 2000; i++) {
      const n = nextOffset(o, rand)
      expect(Math.abs(n)).toBeLessThanOrEqual(600)
      expect(Math.abs(n - o)).toBeLessThanOrEqual(180 * 2)
      o = n
    }
  })
})
