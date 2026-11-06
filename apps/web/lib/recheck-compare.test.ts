import { describe, expect, it } from 'vitest'
import type { Lens } from '@marque/commerce'
import type { LensCheck } from '@marque/conformance'
import { compareRecheck, gridAssetForRecheck, validRecheckBlocks } from './recheck-compare'
import { RecheckResult } from './recheck-schema'

const meta = { block: '1000000', readAt: '2026-11-05T10:00:00Z', source: null, method: null, assumptions: [], limitations: [], note: null }
const check = (key: string, state: LensCheck['state'] = 'match'): LensCheck => ({ key, state, label: key, agent: null, marque: null, how: 'chain', detail: null })
const hf: Lens = { kind: 'health_factor', account: '0x0000000000000000000000000000000000000001', healthFactor: 2, target: 2.5, repayUsd: 20, hasPosition: true, collateralSymbol: 'BNB', collateralFactor: .8, liquidationPriceUsd: 100, markets: [], meta, error: null }
describe('current comparisons use the original category math', () => {
  it('compares HF, applies the original repay to the current debt and reads the matching collateral price', () => {
    const rows = compareRecheck(hf, [check('hf'), check('repay'), check('liq')], { kind: 'health_factor', healthFactor: 1.5, weightedCollateralUsd: 150, totalBorrowedUsd: 100, liquidation: { BNB: 110 } }, '1000000', '1000010')
    expect(rows.map(r => r.stillHolds)).toEqual([false, false, false])
    expect(rows[1]!.now.value).toBe(40)
    expect(rows[0]!.atAnswer.block).toBe('1000000'); expect(rows[0]!.now.block).toBe('1000010')
  })
  it('keeps an unavailable/no-debt HF unavailable and never upgrades an original failure', () => {
    const rows = compareRecheck(hf, [check('hf', 'differs')], { kind: 'health_factor', healthFactor: 2, weightedCollateralUsd: 200, totalBorrowedUsd: 100, liquidation: {} }, '1000000', '1000010')
    expect(rows[0]!.stillHolds).toBeNull(); expect(rows[0]!.atAnswer.agreed).toBe(false)
  })
  it('uses the same NFT and reports tick, range and price distance without substituting a missing position', () => {
    const lens: Lens = { kind: 'rebalancing', owner: hf.kind === 'health_factor' ? hf.account : null, positions: [{ id: '7', pair: 'BNB/USDT', feeTier: 2500, tickSpacing: 50, current: 100, range: [50, 150], inRange: true, proposed: null, amount0: null, amount1: null, slippageBps: null, note: null, closed: false }], meta, error: null }
    const rows = compareRecheck(lens, [check('tick'), check('inrange-7')], { kind: 'rebalancing', positions: [{ id: '7', current: 2600, lower: 50, upper: 150, inRange: false }] }, '1000000', '1000010')
    expect(rows[0]!.now.value).toBe(2600); expect(rows[1]!.now.value).toBe(false); expect(rows[2]!.now.value).toBeGreaterThan(20); expect(rows.map(r => r.stillHolds)).toEqual([false, false, false])
    const missing = compareRecheck(lens, [check('tick')], { kind: 'rebalancing', positions: [{ id: '8', current: 100, lower: 50, upper: 150, inRange: true }] }, '1000000', '1000010')
    expect(missing.every(r => r.now.value === null && r.stillHolds === null)).toBe(true)
  })
  it('compares gross APR with the existing basis-point tolerance and never invents a net APR', () => {
    const lens: Lens = { kind: 'yield', recommend: true, venue: 'Venus', asset: 'USDT', netAprPct: 3, grossAprPct: 4, sizeUsd: 1000, sources: [], switching: { gasUsd: null, swapUsd: null, exitUsd: null }, breakEvenUsd: null, improvementBps: null, declineReason: null, alternatives: [], excluded: [], meta, error: null }
    const rows = compareRecheck(lens, [check('apr')], { kind: 'yield', venues: [{ name: 'Venus USDT', asset: 'USDT', grossAprPct: 4.05, netAprPct: null }] }, '1000000', '1000010')
    expect(rows[0]!.stillHolds).toBe(true); expect(rows[1]!.now.value).toBeNull(); expect(rows[1]!.stillHolds).toBeNull()
  })
  it('checks the current grid price against its original band, not unchanged spacing arithmetic', () => {
    const lens: Lens = { kind: 'grid', pair: 'BNB/USDT', price: 600, spacing: 'arithmetic', levels: [], lower: 550, upper: 650, stop: null, capitalUsd: 1000, feeDragPct: null, signal: null, record: null, meta, error: null }
    const rows = compareRecheck(lens, [check('spacing', 'holds')], { kind: 'grid', priceUsd: 700 }, '1000000', '1000010')
    expect(rows).toHaveLength(1); expect(rows[0]!.field).toBe('grid-price'); expect(rows[0]!.stillHolds).toBe(false); expect(rows[0]!.atAnswer.provenance).toBe('CLAIMED')
  })
})
describe('recheck evidence boundaries', () => {
  it('rejects missing, future, stale and mismatched block bindings', () => {
    expect(validRecheckBlocks('100', '100', '101')).toBe(true)
    expect(validRecheckBlocks(null, null, '101')).toBe(false)
    expect(validRecheckBlocks('102', '102', '101')).toBe(false)
    expect(validRecheckBlocks('100', '99', '101')).toBe(false)
    expect(validRecheckBlocks('0', null, '101')).toBe(false)
  })
  it('represents nothing to recheck explicitly with no successful comparison count', () => {
    const r = RecheckResult.parse({ version: 1, chainId: 97, jobId: '1700', observationChainId: 56, observedAt: '2026-11-06T06:00:00Z', category: null, state: 'nothing_to_recheck', reason: 'No checks pinned to a block.', answerBlock: null, currentBlock: null, answerAt: null, rows: [], askAgain: null })
    expect(r.rows).toHaveLength(0); expect(r.chainId).not.toBe(r.observationChainId)
  })
})
it('keeps each alternative yield rate explicit and leaves an unidentifiable protocol unavailable', () => {
 const lens: Lens = {kind:'yield',recommend:true,venue:'Venus USDT',asset:'USDT',netAprPct:3,grossAprPct:4,sizeUsd:1000,sources:[],switching:{gasUsd:null,swapUsd:null,exitUsd:null},breakEvenUsd:null,improvementBps:null,declineReason:null,alternatives:[{venue:'Venus USDC',netAprPct:2},{venue:'Unknown farm',netAprPct:6}],excluded:[],meta,error:null}
 const rows=compareRecheck(lens,[check('apr')],{kind:'yield',venues:[{name:'Venus USDT',asset:'USDT',grossAprPct:4,netAprPct:3},{name:'Venus USDC',asset:'USDC',grossAprPct:2.1,netAprPct:2}]},'1000000','1000010')
 expect(rows.find(r=>r.field==='venue-0')?.now.value).toBe(2);expect(rows.find(r=>r.field==='venue-1')?.now.value).toBeNull();expect(rows.find(r=>r.field==='ranking')?.stillHolds).toBeNull()
})

it('uses only an explicit USDT answer or a validated original grid task, refusing a contradictory quote currency', () => {
 expect(gridAssetForRecheck('BNB/USDT',null)).toBe('BNB')
 expect(gridAssetForRecheck(null,'BNB')).toBe('BNB')
 expect(gridAssetForRecheck('BNB','BNB')).toBe('BNB')
 expect(gridAssetForRecheck('ETH/USDC','BNB')).toBeNull()
 expect(gridAssetForRecheck(null,null)).toBeNull()
})
