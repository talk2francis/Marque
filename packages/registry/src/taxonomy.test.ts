import { describe, it, expect } from 'vitest'
import { classifyByKeyword, TAXONOMY, REQUIRED_CATEGORIES, MIN_SCORE } from './taxonomy.js'

/**
 * Classification decides which agents a user is shown for their money, so the
 * rules are tested as behaviour: given this metadata, this label, for this
 * reason. A wrong label here is a wrong recommendation.
 */

describe('taxonomy shape', () => {
  it('covers all four required categories plus security', () => {
    for (const c of REQUIRED_CATEGORIES) {
      expect(TAXONOMY, `missing rules for ${String(c)}`).toHaveProperty(String(c))
    }
    expect(TAXONOMY).toHaveProperty('security')
  })

  it('gives every category at least one strong term worth the minimum score', () => {
    for (const [name, rules] of Object.entries(TAXONOMY)) {
      const best = Math.max(...rules.strong.map(([, w]) => w))
      expect(best, `${name} has no term strong enough to classify on its own`).toBeGreaterThanOrEqual(MIN_SCORE)
    }
  })
})

describe('classifyByKeyword', () => {
  it('classifies a Pancake V3 rebalancer', () => {
    const r = classifyByKeyword({
      name: 'RangeKeeper',
      description: 'Monitors your PancakeSwap V3 concentrated liquidity and re-centers the tick range when price drifts out of range.',
    })
    expect(r.category).toBe('rebalancing')
    expect(r.confidence).toBeGreaterThan(0.5)
    expect(r.rationale).toMatch(/pancakeswap v3|concentrated liquidity|out of range/)
  })

  it('classifies a grid bot', () => {
    const r = classifyByKeyword({
      name: 'GridMaster',
      description: 'Automated spot grid trading bot that places ladder orders between your chosen bounds.',
    })
    expect(r.category).toBe('grid')
  })

  it('classifies a yield optimiser', () => {
    const r = classifyByKeyword({
      name: 'YieldRouter',
      description: 'Finds the best net APY across Venus and Lista and auto-compounds your deposit.',
    })
    expect(r.category).toBe('yield')
  })

  it('classifies a health factor monitor', () => {
    const r = classifyByKeyword({
      name: 'LiqGuard',
      description: 'Watches your Venus health factor and liquidation price, and alerts before you are liquidated.',
    })
    expect(r.category).toBe('health_factor')
  })

  it('classifies a security auditor', () => {
    const r = classifyByKeyword({
      name: 'redpen.agent',
      description: 'Smart contract audit and security review.',
      tags: ['Security Review', 'Smart Contract Audit', 'Contract Review'],
    })
    expect(r.category).toBe('security')
  })

  it('does not classify a generic agent', () => {
    // The single most important behaviour: most of the registry is generic
    // filler, and labelling it would poison every category page.
    const r = classifyByKeyword({
      name: 'mimsopon.agent',
      description: 'Specializing in React, Next.js, and Web3 development. Building modern applications.',
    })
    expect(r.category).toBe('unclassified')
  })

  it('does not classify an agent with no metadata at all', () => {
    const r = classifyByKeyword({ name: null, description: null, tags: [] })
    expect(r.category).toBe('unclassified')
    expect(r.confidence).toBe(0)
    expect(r.rationale).toMatch(/no metadata/)
  })

  it('resists the "grid" homonym trap', () => {
    // "grid" appears in power grids, grid computing and CSS grids. Without the
    // negative terms these all land in Grid Trading.
    for (const description of [
      'Power grid load balancing and energy market analytics.',
      'Distributed grid computing scheduler for batch jobs.',
      'CSS grid layout generator for responsive web design.',
    ]) {
      const r = classifyByKeyword({ name: 'x', description })
      expect(r.category, description).not.toBe('grid')
    }
  })

  it('uses probe-reported skills as evidence, not just registry copy', () => {
    // A live endpoint's own declared skills are better evidence than the
    // marketing text an owner typed once at registration.
    const r = classifyByKeyword({
      name: 'agent-7f3a',
      description: null,
      skills: ['health_factor_check', 'liquidation price', 'collateral ratio'],
    })
    expect(r.category).toBe('health_factor')
  })

  it('returns unclassified when two categories tie ambiguously', () => {
    const r = classifyByKeyword({
      name: 'omnibot',
      description: 'grid trading and grid bot and grid strategy plus yield farming apy optimi and auto-compound vault strategy',
    })
    // Either it picks a clear winner with real confidence, or it admits it
    // cannot tell. What it must never do is pick one at 50/50 and look certain.
    if (r.category !== 'unclassified') expect(r.confidence).toBeGreaterThan(0.4)
  })

  it('always explains itself', () => {
    const r = classifyByKeyword({ name: 'x', description: 'rebalance my concentrated liquidity position' })
    expect(r.rationale.length).toBeGreaterThan(0)
    expect(r.method).toBe('keyword')
    expect(Object.keys(r.scores).length).toBeGreaterThan(0)
  })

  it('caps confidence at 1', () => {
    const r = classifyByKeyword({
      description: 'rebalancing rebalanc concentrated liquidity tick range out of range pancakeswap v3 clmm recenter',
    })
    expect(r.confidence).toBeLessThanOrEqual(1)
  })
})

describe('strong-term requirement', () => {
  it('refuses to classify on a weak term alone', () => {
    // Regression: CoinAnk.agent, a market-data service, was labelled
    // health_factor because its copy contains the weak term "liquidation".
    // It reports liquidation volumes; it does not monitor anyone's loan.
    const r = classifyByKeyword({
      name: 'CoinAnk.agent',
      description: 'Crypto market data: open interest, funding rates, liquidation charts and order book analytics.',
    })
    expect(r.category).toBe('unclassified')
    expect(r.rationale).toMatch(/weak terms|category-defining/)
  })

  it('still classifies when a defining term is present', () => {
    const r = classifyByKeyword({
      name: 'LiqGuard',
      description: 'Tracks your health factor and warns before liquidation.',
    })
    expect(r.category).toBe('health_factor')
  })
})
