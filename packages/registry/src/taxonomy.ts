import type { Category } from '@marque/db'

/**
 * The deterministic classification map.
 *
 * This file exists to be *reviewed*. Classification decides which agents a user
 * is shown for their money, so the rules must be readable by a human and
 * auditable after the fact — not buried in a model's judgement. Pass 1 uses
 * only what is in this file; the LLM (pass 2) runs solely on what is left over
 * AND has a live endpoint, because classifying a dead agent is wasted spend.
 *
 * Scoring: each matched term contributes its weight. A category wins if it
 * scores highest AND clears MIN_SCORE. Confidence is the winner's share of the
 * total score, so a term matching three categories produces low confidence
 * rather than a coin-flip label.
 *
 * NEGATIVE terms subtract. They exist because generic "trading bot" copy
 * otherwise drags half the registry into Grid.
 */

export interface CategoryRules {
  /** Terms that strongly imply this category. */
  strong: ReadonlyArray<readonly [term: string, weight: number]>
  /** Terms that weakly imply it — meaningful only alongside a strong one. */
  weak: ReadonlyArray<readonly [term: string, weight: number]>
  /** Terms that argue against it. */
  negative: ReadonlyArray<readonly [term: string, weight: number]>
}

/** A category must reach this score before it is assigned at all. */
export const MIN_SCORE = 3

/**
 * A category must ALSO match at least one `strong` term.
 *
 * Weak terms alone are not evidence. "CoinAnk.agent", a market-data service,
 * scored into Health Factor on the single weak term "liquidation" — it reports
 * liquidation *volumes*, it does not monitor anyone's loan. A false positive
 * here puts the wrong agent in front of someone's money, which is worse than
 * leaving it unclassified.
 */
export const REQUIRE_STRONG_TERM = true

/** Below this confidence we record the guess but treat it as unclassified. */
export const MIN_CONFIDENCE = 0.4

export const TAXONOMY: Readonly<Record<Exclude<Category, 'unclassified'>, CategoryRules>> = {
  rebalancing: {
    strong: [
      ['rebalanc', 5], ['liquidity position', 5], ['concentrated liquidity', 5],
      ['range order', 5], ['tick range', 5], ['out of range', 5], ['in-range', 4],
      ['lp position', 4], ['uniswap v3', 4], ['pancakeswap v3', 5], ['pancake v3', 5],
      ['clmm', 5], ['re-center', 5], ['recenter', 5], ['position manager', 4],
    ],
    weak: [
      ['liquidity', 1], ['pool', 1], ['lp', 1], ['pancakeswap', 2], ['amm', 1],
      ['impermanent loss', 2], ['fee tier', 2], ['uncollected fees', 2],
    ],
    negative: [['lending', 2], ['borrow', 2]],
  },

  grid: {
    strong: [
      ['grid trading', 6], ['grid bot', 6], ['grid strategy', 6], ['grid level', 5],
      ['dca bot', 4], ['martingale', 4], ['spot grid', 6], ['futures grid', 5],
      ['buy low sell high', 3], ['ladder order', 4],
    ],
    weak: [
      ['grid', 2], ['bot', 1], ['spot trading', 2], ['limit order', 2],
      ['range bound', 2], ['volatility', 1], ['arbitrage', 1],
    ],
    // "grid" collides with power grids, grid computing and design grids.
    negative: [['power grid', 5], ['grid computing', 5], ['data grid', 4], ['css grid', 5]],
  },

  yield: {
    strong: [
      ['yield optimi', 6], ['yield aggregat', 6], ['yield farming', 5], ['apy optimi', 6],
      ['auto-compound', 5], ['autocompound', 5], ['best yield', 5], ['vault strategy', 4],
      ['lending rate', 4], ['venus protocol', 4], ['staking reward', 3], ['lista dao', 4],
    ],
    weak: [
      ['yield', 2], ['apy', 2], ['apr', 2], ['farming', 2], ['staking', 2],
      ['vault', 2], ['deposit', 1], ['venus', 2], ['lista', 2], ['compound', 1],
    ],
    negative: [['grid', 1]],
  },

  health_factor: {
    strong: [
      ['health factor', 7], ['liquidation risk', 6], ['liquidation price', 6],
      ['collateral ratio', 5], ['avoid liquidation', 6], ['loan-to-value', 5],
      ['ltv monitor', 6], ['margin call', 5], ['position monitor', 4], ['debt position', 4],
    ],
    weak: [
      ['liquidation', 3], ['collateral', 2], ['borrow', 2], ['lending', 2],
      ['repay', 2], ['debt', 2], ['venus', 1], ['aave', 1], ['monitor', 1], ['alert', 1],
    ],
    negative: [],
  },

  security: {
    strong: [
      ['smart contract audit', 6], ['security review', 6], ['contract review', 5],
      ['vulnerability', 5], ['exploit detect', 5], ['rug pull', 5], ['honeypot', 5],
      ['static analysis', 4], ['slither', 5], ['approval risk', 5], ['token safety', 4],
    ],
    weak: [
      ['security', 2], ['audit', 2], ['risk', 1], ['scam', 2], ['verify', 1],
      ['code review', 2], ['testing / qa', 1],
    ],
    negative: [],
  },
}

export interface ClassificationInput {
  name?: string | null
  description?: string | null
  tags?: readonly string[] | null
  skills?: readonly string[] | null
}

export interface ClassificationResult {
  category: Category
  confidence: number
  method: 'keyword' | 'semantic' | 'owner_declared'
  /** The terms that produced the decision, so a label can be audited. */
  rationale: string
  /** Every category's score, for debugging a surprising label. */
  scores: Record<string, number>
}

/** Everything we know about an agent, lowercased into one haystack. */
function haystack(input: ClassificationInput): string {
  return [
    input.name ?? '',
    input.description ?? '',
    ...(input.tags ?? []),
    ...(input.skills ?? []),
  ].join(' \n ').toLowerCase()
}

/**
 * Deterministic classification. Free, fast, and auditable — every label comes
 * back with the exact terms that produced it.
 */
export function classifyByKeyword(input: ClassificationInput): ClassificationResult {
  const text = haystack(input)
  const scores: Record<string, number> = {}
  const hits: Record<string, string[]> = {}

  const strongHits: Record<string, number> = {}

  for (const [category, rules] of Object.entries(TAXONOMY)) {
    let score = 0
    let strong = 0
    const matched: string[] = []
    for (const [term, weight] of rules.strong) {
      if (text.includes(term)) {
        score += weight
        strong++
        matched.push(term)
      }
    }
    for (const [term, weight] of rules.weak) {
      if (text.includes(term)) {
        score += weight
        matched.push(term)
      }
    }
    strongHits[category] = strong
    for (const [term, weight] of rules.negative) {
      if (text.includes(term)) {
        score -= weight
        matched.push(`-${term}`)
      }
    }
    scores[category] = score
    hits[category] = matched
  }

  // Only categories with a strong term are eligible to win.
  const eligible = Object.entries(scores).filter(([k]) => !REQUIRE_STRONG_TERM || (strongHits[k] ?? 0) > 0)
  const ranked = eligible.sort((a, b) => b[1] - a[1])
  const top = ranked[0]

  if (!top || top[1] < MIN_SCORE) {
    if (!top && Object.values(scores).some((v) => v >= MIN_SCORE)) {
      return {
        category: 'unclassified',
        confidence: 0,
        method: 'keyword',
        rationale: 'only weak terms matched; no category-defining term present',
        scores,
      }
    }
    return {
      category: 'unclassified',
      confidence: 0,
      method: 'keyword',
      rationale: text.trim() === '' ? 'no metadata to classify' : 'no category reached the minimum score',
      scores,
    }
  }

  const positiveTotal = ranked.reduce((sum, [, v]) => sum + Math.max(0, v), 0)
  const confidence = positiveTotal > 0 ? top[1] / positiveTotal : 0

  if (confidence < MIN_CONFIDENCE) {
    return {
      category: 'unclassified',
      confidence,
      method: 'keyword',
      rationale: `ambiguous between ${ranked.filter(([, v]) => v >= MIN_SCORE).map(([k]) => k).join(', ')}`,
      scores,
    }
  }

  return {
    category: top[0] as Category,
    confidence: Math.min(1, confidence),
    method: 'keyword',
    rationale: `matched ${(hits[top[0]] ?? []).join(', ')}`,
    scores,
  }
}

/** The four categories the hackathon requires, in the order the UI shows them. */
export const REQUIRED_CATEGORIES: readonly Category[] = [
  'rebalancing', 'grid', 'yield', 'health_factor',
]
