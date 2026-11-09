import { describe, expect, it } from 'vitest'
import { amount, btFor, centeredRange, feeTicks, fullFromFor, minRangeWidth, minRepayFor, minStepFor, planGrid, priceAt, units, yieldDefaults, yieldNow, yieldProblem, expiryFor } from './charters-builder-v2'

const E = 10n ** 18n
describe('prices and ticks', () => {
  it('round-trips a price through its tick within one tick', () => {
    for (const p of [0.5, 1, 642.17, 69_000]) {
      const t = btFor(p)
      expect(priceAt(t)).toBeLessThanOrEqual(p * 1.0000001)
      expect(priceAt(t + 1)).toBeGreaterThan(p)
    }
  })
  it('counts fee ticks the way the factory does', () => {
    expect(feeTicks(100)).toBe(1)
    expect(feeTicks(500)).toBe(5)
    expect(feeTicks(2500)).toBe(25)
    expect(minStepFor(500)).toBe(72) // GridBandFactory.minStep(pool, 30) on a 0.05% pool
  })
})

describe('grid plan', () => {
  it('splits the band into levels and never spaces them closer than the safe minimum', () => {
    const g = planGrid(560, 720, 8, 72)!
    expect(g.slots).toBe(8)
    expect(g.stepTicks).toBeGreaterThanOrEqual(72)
    expect(g.prices[0]!).toBeCloseTo(560, -1)
    const tight = planGrid(600, 610, 8, 72)!
    expect(tight.clamped).toBe(true)
    expect(tight.stepTicks).toBeGreaterThanOrEqual(72)
    expect(tight.slots).toBeLessThan(8)
    expect(planGrid(700, 600, 4, 72)).toBeNull()
  })
  it('starts the levels above the average price holding base', () => {
    const g = planGrid(560, 720, 8, 72)!
    expect(fullFromFor(g, btFor(642))).toBeGreaterThan(0)
    expect(fullFromFor(g, btFor(900))).toBe(8)
    expect(fullFromFor(g, btFor(100))).toBe(0)
  })
})

describe('yield sweep', () => {
  it('starts from the wallet with a band that has hysteresis and a cap that fits', () => {
    const d = yieldDefaults(1_240n * E, 18)
    expect(d.ceiling - d.floor).toBeGreaterThanOrEqual(2n * d.minAction)
    expect(d.supplyCap).toBeGreaterThanOrEqual(d.minAction)
    expect(yieldProblem({ vToken: '0x0000000000000000000000000000000000000001', ...d, minHealthAfter: 0n }, 0n)).toBeNull()
  })
  it('starts a small wallet with a band around what it holds', () => {
    const d = yieldDefaults(12n * E / 10n, 18) // 1.2 USDC
    expect(d.ceiling).toBeLessThan(12n * E / 10n)
    expect(d.minAction).toBeGreaterThanOrEqual(E / 10n)
    expect(d.ceiling - d.floor).toBeGreaterThanOrEqual(2n * d.minAction)
  })
  it('names each problem the factory would refuse', () => {
    const base = { vToken: '0x0000000000000000000000000000000000000001' as const, floor: 200n * E, ceiling: 300n * E, minAction: 20n * E, supplyCap: 5_000n * E, minHealthAfter: 0n }
    expect(yieldProblem({ ...base, ceiling: 230n * E }, 0n)).toBe('band')
    expect(yieldProblem(base, 20n * E)).toBe('tip')
    expect(yieldProblem({ ...base, minHealthAfter: 105n * 10n ** 16n }, 0n)).toBe('health')
  })
  it('says what it would do now', () => {
    expect(yieldNow(1_240n * E, { floor: 200n * E, ceiling: 300n * E })).toEqual({ action: 'supply', amount: 990n * E, after: 250n * E })
    expect(yieldNow(100n * E, { floor: 200n * E, ceiling: 300n * E }).action).toBe('withdraw')
    expect(yieldNow(250n * E, { floor: 200n * E, ceiling: 300n * E }).action).toBe('none')
  })
})

describe('range keeper', () => {
  it('centres like the contract, including negative ticks', () => {
    expect(centeredRange(-65021, 400, 10)).toEqual({ lower: -65230, upper: -64830 })
    expect(centeredRange(1005, 400, 10)).toEqual({ lower: 800, upper: 1200 })
  })
  it('needs room to rebalance', () => {
    expect(minRangeWidth({ slipTicks: 50, maxDeviation: 20 })).toBe(500)
  })
})

describe('loan guard v2 and amounts', () => {
  it('derives the smallest repayment inside the factory bound', () => {
    expect(minRepayFor(500n * E, 18)).toBe(10n * E)
    expect(minRepayFor(2n * E, 18)).toBe(5n * 10n ** 17n)
    expect(minRepayFor(1_000_000n, 6)).toBe(250_000n)
  })
  it('reads and prints amounts exactly', () => {
    expect(units('1,200.5', 18)).toBe(1_200_500_000_000_000_000_000n)
    expect(units('0.1234567', 6)).toBeNull()
    expect(amount(1_234_567_000n, 6)).toBe('1,234.567')
  })
  it('keeps the end date inside the factory window', () => {
    expect(Number(expiryFor(1, 0))).toBe(86_400 + 3_600)
    expect(Number(expiryFor(500, 0))).toBe(180 * 86_400 - 3_600)
  })
})
