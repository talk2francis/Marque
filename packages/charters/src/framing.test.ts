import { describe, expect, it } from 'vitest'
import { dropToHealth, priceAtHealth, priceToUsd, repayAtTrigger, smartDefaults, storm, type FramingInput } from './framing'
import { WAD } from './health'

const h = (n: number) => BigInt(Math.round(n * 1e4)) * 10n ** 14n

// 5 BNB at $600 with a 0.8 liquidation threshold: $2,400 weighted. 1,000 USDT borrowed. Health 2.40.
const BNB_PRICE = 600n * WAD // 18-decimal token: Venus price is dollars * 1e18
const loan: FramingInput = {
  collateralUsd: 2400n * WAD,
  debtUsd: 1000n * WAD,
  main: { supplied: 5n * WAD, liquidationThreshold: 8n * 10n ** 17n, price: BNB_PRICE, decimals: 18 },
}

describe('price framing', () => {
  it('turns a health value into the collateral price that gives it', () => {
    // Health 1.30 needs $1,300 weighted: 1300 / (5 * 0.8) = $325.
    expect(priceToUsd(priceAtHealth(loan, h(1.3))!, 18)).toBe(325)
    // Liquidation at 1.00: 1000 / 4 = $250.
    expect(priceToUsd(priceAtHealth(loan, WAD)!, 18)).toBe(250)
    // 600 to 325 is a 45.833% fall.
    expect(dropToHealth(loan, h(1.3))).toBeCloseTo(45.833, 3)
  })
  it('says nothing when other collateral already covers the line', () => {
    const covered: FramingInput = { ...loan, collateralUsd: 3800n * WAD } // $1,400 elsewhere
    expect(priceAtHealth(covered, h(1.3))).toBeNull()
    expect(priceAtHealth({ ...loan, debtUsd: 0n }, h(1.3))).toBeNull()
  })
  it('reads 6-decimal prices as dollars per token', () => {
    expect(priceToUsd(10n ** 30n, 6)).toBe(1)
    expect(priceToUsd(BNB_PRICE, 18)).toBe(600)
  })
  it('estimates the repayment at the moment the trigger is crossed', () => {
    // At 1.30 collateral is $1,300; reaching 1.80 needs debt 722.22: repay 277.78 USDT.
    expect(repayAtTrigger(loan, h(1.3), h(1.8), WAD)).toBe(277_777_777_777_777_777_779n)
  })
})

describe('starting points', () => {
  it('sets the trigger where the collateral would have fallen 20%, within 1.15 to 1.60', () => {
    // 20% off $2,400 weighted is $1,920: health 1.92, clamped to 1.60. Target 2.10.
    expect(smartDefaults(loan, h(2.4))).toEqual({ trigger: h(1.6), target: h(2.1), warn: false })
    // A weaker loan: $1,500 weighted, 20% off is 1.20.
    const weak = { ...loan, collateralUsd: 1500n * WAD, main: { ...loan.main, supplied: 3125n * 10n ** 15n } }
    expect(smartDefaults(weak, h(1.5))).toEqual({ trigger: h(1.2), target: h(1.7), warn: false })
  })
  it('warns and starts just under today when health is already below that line', () => {
    // Health 1.12 is under the 1.15 floor: start at 1.12 - 0.10 = 1.02, held at 1.10, with a warning.
    const thin = { ...loan, collateralUsd: 1120n * WAD, main: { ...loan.main, supplied: 2333333333333333333n } }
    const d = smartDefaults(thin, h(1.12))
    expect(d.warn).toBe(true)
    expect(d.trigger).toBe(h(1.1))
    expect(d.target).toBe(h(1.6))
    // At 1.18 the 1.15 floor is still under today's health: no warning.
    expect(smartDefaults({ ...thin, collateralUsd: 1180n * WAD }, h(1.18)).warn).toBe(false)
  })
})

describe('storm test', () => {
  const guard = { trigger: h(1.3), target: h(1.8), budgetLeft: 500n * WAD, allowance: 500n * WAD, balance: 2000n * WAD, debtInMarket: 1000n * WAD, debtPrice: WAD }
  it('with no fall, nothing happens', () => {
    const r = storm(loan, guard, 0)
    expect(r.actions).toBe(0)
    expect(r.with.health).toBe(h(2.4))
    expect(r.without.liquidated).toBe(false)
  })
  it('a 60% fall liquidates the loan without a guard and not with one that has budget', () => {
    const r = storm(loan, guard, 60)
    // Without: $960 weighted against $1,000 debt.
    expect(r.without.liquidated).toBe(true)
    expect(r.with.liquidated).toBe(false)
    expect(r.actions).toBeGreaterThan(0)
    expect(r.used).toBeLessThanOrEqual(500n * WAD)
  })
  it('says when the budget runs out', () => {
    const small = { ...guard, budgetLeft: 50n * WAD, allowance: 50n * WAD }
    // 50 USDT lifts the debt to 950; a 62% fall leaves $912 weighted, under it.
    const r = storm(loan, small, 62)
    expect(r.ranOut).toBe(true)
    expect(r.used).toBe(50n * WAD)
    expect(r.with.liquidated).toBe(true)
    // At 60% the same 50 USDT is just enough: $960 against $950.
    expect(storm(loan, small, 60).with.liquidated).toBe(false)
  })
})
