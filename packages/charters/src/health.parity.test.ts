import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STATE_CODES, simulateAct } from './health'

/**
 * Parity with the contracts (C4): every vector was produced by the real LoanGuard and CharterFactory in
 * contracts/test/charters/LoanGuard.vectors.t.sol. health.ts must reproduce every number exactly.
 */
interface Vector {
  decimals: number
  price: string; collateralUsd: string; debtUsd: string; debtInMarket: string
  trigger: string; target: string; budget: string; tip: string; allowance: string; balance: string
  callerIsOwner: boolean
  previewState: number; previewRepay: string; previewTip: string
  repaid: string; tipPaid: string; healthBefore: string; healthAfter: string
}

const vectors = JSON.parse(readFileSync(new URL('../../../contracts/vectors/charters-act.json', import.meta.url), 'utf8')) as Vector[]

describe('health.ts matches the contracts', () => {
  it('has the exported vectors', () => {
    expect(vectors.length).toBe(60)
    expect(vectors.some((v) => v.decimals === 6)).toBe(true)
    expect(new Set(vectors.map((v) => v.previewState))).toEqual(new Set([0, 1, 5]))
  })

  it.each(vectors.map((v, i) => [i, v] as const))('vector %i', (_i, v) => {
    const b = (s: string) => BigInt(s)
    const r = simulateAct({
      health: { collateralUsd: b(v.collateralUsd), debtUsd: b(v.debtUsd) },
      debtInMarket: b(v.debtInMarket), price: b(v.price), trigger: b(v.trigger), target: b(v.target),
      budget: b(v.budget), spent: 0n, allowance: b(v.allowance), balance: b(v.balance), tip: b(v.tip),
      callerIsOwner: v.callerIsOwner,
    })
    expect(r.state).toBe(STATE_CODES[v.previewState])
    expect(r.healthBefore).toBe(b(v.healthBefore))
    expect(r.repaid).toBe(b(v.repaid))
    expect(r.tipPaid).toBe(b(v.tipPaid))
    expect(r.healthAfter).toBe(b(v.healthAfter))
    if (v.previewState === 1) expect(r.repaid).toBe(b(v.previewRepay))
  })
})
