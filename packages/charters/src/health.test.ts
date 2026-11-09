import { describe, expect, it } from 'vitest'
import { formatUnitsTrim, healthOf, healthToNumber, NO_DEBT, parseDecimal, repayToTarget, rescues, simulateAct, WAD } from './health'

describe('parseDecimal (budget and health inputs)', () => {
  it('reads plain decimals at the token\'s precision', () => {
    expect(parseDecimal('500', 18)).toBe(500n * WAD)
    expect(parseDecimal('1.30', 18)).toBe(13n * 10n ** 17n)
    expect(parseDecimal('0.000001', 6)).toBe(1n)
    expect(parseDecimal('.5', 6)).toBe(500_000n)
    expect(parseDecimal(' 12.5 ', 6)).toBe(12_500_000n)
    expect(parseDecimal('7.', 6)).toBe(7_000_000n)
  })
  it('rejects exponents, signs, separators, excess places and empty input', () => {
    for (const bad of ['1e3', '-1', '+1', '1,000', '', ' ', '.', '1.0000001', 'abc', '0x10', '1.2.3', 'Infinity', 'NaN']) {
      expect(parseDecimal(bad, 6), bad).toBeNull()
    }
    expect(parseDecimal('1.0000001', 18)).toBe(1_000_000_100_000_000_000n)
  })
})

describe('formatUnitsTrim', () => {
  it('groups thousands and trims zeros, rounding down', () => {
    expect(formatUnitsTrim(1_234_567_890_000n, 6)).toBe('1,234,567.89')
    expect(formatUnitsTrim(500n * WAD, 18)).toBe('500')
    expect(formatUnitsTrim(1n, 6, 2)).toBe('0')
    expect(formatUnitsTrim(1n, 6, 6)).toBe('0.000001')
  })
})

describe('health', () => {
  it('is collateral over debt, and has no value without debt', () => {
    expect(healthOf({ collateralUsd: 1500n * WAD, debtUsd: 1000n * WAD })).toBe(15n * 10n ** 17n)
    expect(healthOf({ collateralUsd: 5n, debtUsd: 0n })).toBe(NO_DEBT)
    expect(healthToNumber(NO_DEBT)).toBeNull()
    expect(healthToNumber(13n * 10n ** 17n)).toBe(1.3)
  })
  it('repays exactly enough to reach the target, plus one unit', () => {
    // 1300 / 1.8 = 722.22...; repay 277.77... USDT at $1 (18 decimals).
    const r = repayToTarget({ collateralUsd: 1300n * WAD, debtUsd: 1000n * WAD }, 18n * 10n ** 17n, WAD)
    expect(r).toBe(277_777_777_777_777_777_779n)
    // A 6-decimal token at $1 has a Venus price of 1e30.
    const r6 = repayToTarget({ collateralUsd: 1300n * WAD, debtUsd: 1000n * WAD }, 18n * 10n ** 17n, 10n ** 30n)
    expect(r6).toBe(277_777_778n)
    expect(repayToTarget({ collateralUsd: 2000n * WAD, debtUsd: 1000n * WAD }, 18n * 10n ** 17n, WAD)).toBe(0n)
  })
})

describe('the rescue rule (LoanGuard._rescues)', () => {
  const h = (c: bigint, d: bigint) => ({ collateralUsd: c * WAD, debtUsd: d * WAD })
  it('always rescues at or above 1.00, and below it only when the repayment covers the deficit', () => {
    expect(rescues(h(1200n, 1000n), 1n, WAD)).toBe(true)
    expect(rescues(h(950n, 1000n), 50n * WAD, WAD)).toBe(true)
    expect(rescues(h(950n, 1000n), 50n * WAD - 1n, WAD)).toBe(false)
    // 6-decimal token: price is scaled to 1e30, so 50 USDC is 50e6 units.
    expect(rescues(h(950n, 1000n), 50_000_000n, 10n ** 30n)).toBe(true)
    expect(rescues(h(950n, 1000n), 49_999_999n, 10n ** 30n)).toBe(false)
  })
  it('makes simulateAct refuse a loan the budget cannot save, moving nothing', () => {
    const r = simulateAct({ health: h(800n, 1000n), debtInMarket: 1000n * WAD, price: WAD, trigger: 14n * 10n ** 17n, target: 18n * 10n ** 17n,
      budget: 100n * WAD, spent: 0n, allowance: 100n * WAD, balance: 100n * WAD, tip: 0n, callerIsOwner: false })
    expect(r.state).toBe('cannot_rescue')
    expect(r.repaid).toBe(0n)
    expect(r.healthAfter).toBe(r.healthBefore)
  })
})
