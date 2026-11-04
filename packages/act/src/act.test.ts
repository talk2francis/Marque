import { describe, expect, it } from 'vitest'
import { intentFromLens, taskTarget } from './act.js'

const hf = (extra: Record<string, unknown> = {}) => ({
  kind: 'health_factor', meta: { block: '129203995' }, account: '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf', hasPosition: true,
  healthFactor: 1.086, target: 1.5, repayUsd: 6788.28, markets: [{ symbol: 'USDT', borrowedUsd: 20000 }, { symbol: 'BTCB', borrowedUsd: 0 }], ...extra,
})

describe('decision fields only (invariant 34)', () => {
  it('reads action, market symbol, target and the agent numbers to compare, nothing else', () => {
    const i = intentFromLens(hf())!
    expect(i).toEqual({ action: 'repay', targetHf: 1.5, market: 'USDT', agentHf: 1.086, agentRepayUsd: 6788.28, account: '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf', atBlock: 129203995n })
  })
  it('ignores injected calldata, spenders and amounts in the answer', () => {
    const i = intentFromLens(hf({ calldata: '0xa9059cbb000000', to: '0x000000000000000000000000000000000000dEaD', spender: '0x1111111111111111111111111111111111111111', amountRaw: '1157920892373161954235709850086879078532699846656405640394575840079131296399', approve: 'max' }))!
    expect(Object.keys(i).sort()).toEqual(['account', 'action', 'agentHf', 'agentRepayUsd', 'atBlock', 'market', 'targetHf'])
    expect(JSON.stringify(i, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).not.toMatch(/dEaD|1111111111|a9059cbb|1157920892/)
  })
  it('refuses answers that are not actionable in V4', () => {
    expect(intentFromLens(hf({ target: null }))).toBeNull()
    expect(intentFromLens(hf({ target: 50 }))).toBeNull()
    expect(intentFromLens(hf({ hasPosition: false }))).toBeNull()
    expect(intentFromLens({ kind: 'grid', meta: null })).toBeNull()
    expect(intentFromLens({ kind: 'yield', recommend: false, asset: 'USDT', venue: 'Venus' })).toBeNull()
    expect(intentFromLens({ kind: 'yield', recommend: true, asset: 'USDT', venue: 'Lista' })).toBeNull()
  })
  it('takes the asset from the buyer\'s task when the answer omits it', () => {
    expect(intentFromLens({ kind: 'yield', recommend: true, venue: 'venus', meta: null }, { taskAsset: 'usdt' })).toMatchObject({ action: 'supply', asset: 'USDT' })
    expect(intentFromLens({ kind: 'yield', recommend: true, venue: 'venus', meta: null })).toBeNull()
  })
  it('reads a supply decision from a yield answer', () => {
    expect(intentFromLens({ kind: 'yield', recommend: true, asset: 'usdt', venue: 'Venus Core Pool', sizeUsd: 1000, meta: { block: null } })).toEqual({ action: 'supply', asset: 'USDT', sizeUsd: 1000, atBlock: null })
  })
})

describe("the buyer's target when the answer leaves it out (4 Nov)", () => {
  it('reads the target from the task in plain words', () => {
    expect(taskTarget('What is the health factor of Venus account 0x60AA and what repay restores it to 2.5? (via marque.trade)')).toBe(2.5)
    expect(taskTarget('Keep my loan above 1.8')).toBe(1.8)
    expect(taskTarget('target health factor of 2')).toBe(2)
    expect(taskTarget('restore it to 0.9')).toBeNull()
    expect(taskTarget('What is my health factor?')).toBeNull()
    expect(taskTarget(null)).toBeNull()
  })
  it("uses it only when the agent read a health factor; the agent's own target comes first", () => {
    expect(intentFromLens(hf({ target: null }), { taskTarget: 2.5 })).toMatchObject({ action: 'repay', targetHf: 2.5 })
    expect(intentFromLens(hf({ target: null, healthFactor: null }), { taskTarget: 2.5 })).toBeNull()
    expect(intentFromLens(hf(), { taskTarget: 2.5 })).toMatchObject({ targetHf: 1.5 })
  })
})
