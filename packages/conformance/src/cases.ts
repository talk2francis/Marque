import type { TestId } from './tolerances.js'
import type { RebPolicy } from './tests/mcs-reb-1.js'
import type { HfPolicy } from './tests/mcs-hf-1.js'
import type { GridPolicy } from './tests/mcs-grid-1.js'
import type { YieldPolicy } from './tests/mcs-yield-1.js'

/**
 * The published test cases.
 *
 * Every subject is a REAL BSC mainnet position belonging to a third party,
 * chosen because it exercises the check rather than because it flatters anyone.
 * We never manufacture a position to test against (AGENTS.md, Security: our own
 * Venus position stays above HF 2.5, and risky cases are read from strangers).
 *
 * Each case supplies its own policy. That is what makes compliance checkable:
 * there is no objectively correct V3 range in the abstract, so the case says
 * what range is being asked for, and the test grades against that.
 */

export interface CaseSpec {
  id: string
  testId: TestId
  subject: Record<string, string>
  policy: RebPolicy | HfPolicy | GridPolicy | YieldPolicy
  /** Why this subject was chosen. Published with the standard. */
  why: string
}

/** Public, chain-verified backup NFTs. A withdrawn position is skipped, never fabricated. */
export const REB_FALLBACK_SUBJECTS: readonly Record<string, string>[] = [
  { owner: '0xa9621227DF65696fB2B45b94644b65eA452b9724', tokenId: '7654391', pair: 'BNCB/WBNB' },
  { owner: '0xf5d23924E63718bAaBE4ea4c9f295104DcB02397', tokenId: '7654396', pair: 'BNCB/WBNB' },
]

export const CASES: readonly CaseSpec[] = [
  {
    id: 'REB-1-bncb-wbnb-2500',
    testId: 'MCS-REB-1',
    subject: {
      owner: '0x2cfD930f4Ca936CAD72a13b62df095D8BA17874f',
      tokenId: '7650656',
      pair: 'BNCB/WBNB',
    },
    policy: {
      rangePct: 6,
      feeTier: 2500,
      statement:
        're-centre the position symmetrically at ±6% around the current spot price, on the 0.25% fee tier, keeping the same liquidity',
    } satisfies RebPolicy,
    why:
      'A live third-party BNCB/WBNB position on PancakeSwap V3’s 0.25% tier, minted about 240,000 blocks before its 11 October 2026 selection and still carrying liquidity. The owner held three enumerable positions, below the reader’s 40-position cap. The previous BTCB/USDC (#7395979) and US/WBNB (#7654242) subjects were withdrawn. Two separately chain-verified BNCB/WBNB positions are published as fallback subjects. Every capture still reads current ownership and liquidity at a fresh block; if none survives, the test is skipped rather than inventing a position. This fixture tests V3 arithmetic, not the investment merits of either token.',
  },
  {
    id: 'HF-1-venus-at-risk',
    testId: 'MCS-HF-1',
    subject: { address: '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf' },
    policy: {
      targetHealthFactor: 2.5,
      statement:
        'report the account’s current health factor and the exact USD of debt that must be repaid to restore a health factor of 2.5',
    } satisfies HfPolicy,
    why:
      'A genuinely at-risk third-party Venus account carrying real debt across multiple collateral markets. Chosen precisely because it is not ours: it proves the reader works on arbitrary input, and AGENTS.md forbids manufacturing our own liquidation risk for a demo.',
  },
  {
    id: 'GRID-1-bnb-usdt',
    testId: 'MCS-GRID-1',
    subject: { address: '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf', pair: 'BNB/USDT' },
    policy: {
      pair: 'BNB/USDT',
      lowerBound: 600,
      upperBound: 850,
      capitalUsd: 2_000,
      levels: 12,
      stopPrice: 580,
      feeBps: 25,
      statement:
        'build a 12-level grid for BNB/USDT between 600 and 850 using 2,000 USD of capital, with a stop at 580, and disclose the fee drag at 25 bps per trade',
    } satisfies GridPolicy,
    why:
      'Bounds and a stop that are close enough together that a careless plan places levels below the stop, and a level count that makes fee drag material rather than a rounding error.',
  },
  {
    id: 'YIELD-1-usdt-1000',
    testId: 'MCS-YIELD-1',
    subject: { asset: 'USDT' },
    policy: {
      asset: 'USDT',
      sizeUsd: 1_000,
      allowedProtocols: ['venus'],
      minImprovementBps: 50,
      leverageAllowed: false,
      currentAprPct: 0,
      statement:
        'find the best net-of-cost route for 1,000 USD of USDT across the allowed protocols, only recommending a move that beats the current 0% by at least 50 bps, and excluding leveraged strategies',
    } satisfies YieldPolicy,
    why:
      'Idle stablecoins are the most common real position on BSC. The 50 bps threshold and the 1,000 USD size make the net-of-cost arithmetic decide the answer, which is exactly the thing agents get wrong by quoting gross APR.',
  },
]

export function caseFor(testId: TestId): CaseSpec {
  const found = CASES.find((c) => c.testId === testId)
  if (!found) throw new Error(`no case defined for ${testId}`)
  return found
}
