import { describe, expect, it } from 'vitest'
import { keelEngine, readTarget } from './keel.js'
import { latticeEngine, parsePolicy } from './lattice.js'
import { sluicegateEngine, parseAsk } from './sluicegate.js'
import { boundEngine, readRangePct } from './bound.js'

/**
 * Plain-English tasks, as a paying buyer types them.
 *
 * Testnet job 1337 paid Keel and got back "no target health factor found in
 * the task" because the text said "restores it to 2.5" and the parser knew
 * only "restore it to". The graded prompts below are the frozen MCS cases:
 * they state every value, so they must parse exactly as before and carry no
 * assumptions.
 */

const GRADED = {
  grid: "Plan a grid for BNB/USDT on BNB Smart Chain (chain 56).\n\nBlock: 124010796\nPOLICY YOU MUST FOLLOW: build a 12-level grid for BNB/USDT between 600 and 850 using 2,000 USD of capital, with a stop at 580, and disclose the fee drag at 25 bps per trade\n\nConstraints:\n  lower bound      600\n  upper bound      850\n  capital          2000 USD\n  levels           12\n  stop price       580  (no level may sit at or below this)\n  fee per trade    25 bps\n\nReturn strict JSON with exactly these fields:\n{\n  \"spacingType\": \"arithmetic\" | \"geometric\",\n  \"levels\": [ { \"price\": <number>, \"allocationUsd\": <number> }, ... ],\n  \"feeDragPct\": <number, total fee drag across the full grid as a percent of capital>\n}\n\nNo prose. JSON only.",
  hf: "You are given a Venus Core lending account on BNB Smart Chain (chain 56).\n\nAccount: 0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf\nBlock: 124010796 \u2014 answer for this block only.\n\nPOLICY YOU MUST FOLLOW: report the account\u2019s current health factor and the exact USD of debt that must be repaid to restore a health factor of 2.5\n\nReturn strict JSON with exactly these fields:\n{\n  \"healthFactor\": <number to 3 decimal places>,\n  \"primaryCollateralSymbol\": <string, the underlying symbol of the largest collateral market>,\n  \"primaryCollateralFactor\": <number 0..1, that market's collateral factor>,\n  \"primaryLiquidationPriceUsd\": <number, price at which this account reaches HF 1.0>,\n  \"repayUsdToReachTarget\": <number, USD of debt to repay to reach HF 2.5>\n}\n\nNo prose. JSON only.",
  reb: "You are given a PancakeSwap V3 position on BNB Smart Chain (chain 56).\n\nPosition NFT id: 7395979\nPool: 0x19CeABe800596eC01164c3680a66e8216D47D517  (BTCB/USDC, fee tier 2500)\nBlock: 124010787  \u2014 answer for this block only.\n\nPOLICY YOU MUST FOLLOW: re-centre the position symmetrically at \u00b16% around the current spot price, on the 0.25% fee tier, keeping the same liquidity\n\nReturn strict JSON with exactly these fields:\n{\n  \"currentTick\": <integer, the pool's tick at this block>,\n  \"inRange\": <boolean>,\n  \"pctToNearestBound\": <number, percent in price terms to the nearer bound>,\n  \"proposedTickLower\": <integer, must be a multiple of the pool's tickSpacing>,\n  \"proposedTickUpper\": <integer, must be a multiple of the pool's tickSpacing>,\n  \"amount0\": <number, BTCB required to mint the proposed range>,\n  \"amount1\": <number, USDC required to mint the proposed range>,\n  \"maxSlippageBps\": <number, your stated slippage bound in basis points>\n}\n\nNo prose. JSON only.",
  yield: "Find the best net-of-cost yield route on BNB Smart Chain (chain 56).\n\nBlock: 124010797 \u2014 answer for this block only.\nPOLICY YOU MUST FOLLOW: find the best net-of-cost route for 1,000 USD of USDT across the allowed protocols, only recommending a move that beats the current 0% by at least 50 bps, and excluding leveraged strategies\n\nConstraints:\n  asset                 USDT\n  size                  1000 USD\n  allowed protocols     venus\n  currently earning     0% APR\n  minimum improvement   50 bps (recommend nothing that does not clear this)\n  leverage              NOT allowed \u2014 flag any leveraged strategy\n\nReturn strict JSON with exactly these fields:\n{\n  \"recommend\": <boolean, false if nothing clears the threshold>,\n  \"venue\": <string or null>,\n  \"netAprPct\": <number, net of all costs at the stated size>,\n  \"aprSources\": [ { \"value\": <number>, \"source\": <string>, \"timestamp\": <ISO 8601 string> }, ... ],\n  \"switchingCost\": { \"gasUsd\": <number>, \"swapUsd\": <number>, \"exitUsd\": <number> },\n  \"usesLeverage\": <boolean>\n}\n\nNo prose. JSON only.",
}

const ACCOUNT = '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'

describe('graded MCS prompts parse unchanged', () => {
  it('MCS-HF-1', () => {
    expect(readTarget(GRADED.hf)).toEqual({ target: 2.5, assumptions: [] })
  })
  it('MCS-GRID-1', () => {
    const p = parsePolicy(GRADED.grid)
    expect(p).toMatchObject({ lowerBound: 600, upperBound: 850, capitalUsd: 2000, levels: 12, stopPrice: 580, feeBps: 25, assumptions: [] })
  })
  it('MCS-REB-1', () => {
    expect(readRangePct(GRADED.reb)).toBe(6)
    expect(boundEngine.inspect(GRADED.reb)).toEqual({ missing: [], assumptions: [] })
  })
  it('MCS-YIELD-1', () => {
    expect(parseAsk(GRADED.yield)).toMatchObject({ asset: 'USDT', sizeUsd: 1000, allowedProtocols: ['venus'], minImprovementBps: 50, currentAprPct: 0, leverageAllowed: false, assumptions: [] })
  })
})

describe('keel reads a target however it is phrased', () => {
  const cases: Array<[string, number]> = [
    [`Health factor of Venus account ${ACCOUNT} and the repay that restores it to 2.5.`, 2.5],
    [`What is the health factor of Venus account ${ACCOUNT} and what repay restores it to 2.5?`, 2.5],
    [`How much do I repay on ${ACCOUNT} to bring it back up to 1.8`, 1.8],
    [`${ACCOUNT}: restore the account to a health factor of 3`, 3],
    [`Check ${ACCOUNT}, target HF 2`, 2],
    [`Restoring ${ACCOUNT} to 1.5 needs what repay?`, 1.5],
  ]
  for (const [task, want] of cases) it(task, () => expect(readTarget(task).target).toBe(want))

  it('does not read the leading 0 of an address as a target', () => {
    expect(readTarget(`Health factor of ${ACCOUNT}`).target).toBeNull()
  })
  it('states its default when no target is given', () => {
    const r = keelEngine.inspect(`What is the health factor of ${ACCOUNT}?`)
    expect(r.missing).toEqual([])
    expect(r.assumptions[0]).toMatch(/no target/)
  })
  it('needs an address before a quote', () => {
    expect(keelEngine.inspect('What is the health factor of Venus account 0x... ?').missing.length).toBe(1)
  })
})

describe('lattice plain tasks', () => {
  it('the hire-sheet preset', () => {
    const p = parsePolicy('Plan a grid for BNB/USDT between 550 and 700 with 500 USDT, stop below 520.')
    expect(p).toMatchObject({ lowerBound: 550, upperBound: 700, capitalUsd: 500, stopPrice: 520, levels: 10, feeBps: 25 })
  })
  it('the proof task', () => {
    const p = parsePolicy('Plan a 10-level arithmetic grid for BNB/USDT between 550 and 700 with 500 USDT, stop at 520.')
    expect(p).toMatchObject({ lowerBound: 550, upperBound: 700, capitalUsd: 500, stopPrice: 520, levels: 10 })
  })
  it('does not read "with 8 levels" as capital', () => {
    const p = parsePolicy('Grid with 8 levels from $600 to $750 using 1,200 USDT')
    expect(p).toMatchObject({ lowerBound: 600, upperBound: 750, capitalUsd: 1200, levels: 8 })
  })
  it('needs a band and capital before a quote', () => {
    expect(latticeEngine.inspect('Plan me a BNB grid').missing).toEqual(['the lower price bound', 'the upper price bound', 'the capital to deploy'])
  })
})

describe('sluicegate plain tasks', () => {
  it('the hire-sheet preset', () => {
    const a = parseAsk('Where should 1000 USDT earn the most on BNB Chain right now, after switching costs?')
    expect(a).toMatchObject({ asset: 'USDT', sizeUsd: 1000, allowedProtocols: ['venus'], currentAprPct: 0, minImprovementBps: 0 })
  })
  it('dollar sign and thousands', () => {
    expect(parseAsk('Best place for $2,500 of USDC?')).toMatchObject({ asset: 'USDC', sizeUsd: 2500 })
  })
  it('needs a size before a quote', () => {
    expect(sluicegateEngine.inspect('Where should my USDT earn the most?').missing).toContain('the size in USD')
  })
})

describe('bound plain tasks', () => {
  it('the proof task', () => {
    expect(readRangePct('Re-centre PancakeSwap V3 position 7395979 symmetrically at +-6% on its fee tier.')).toBe(6)
    expect(readRangePct('Re-centre position 7395979 symmetrically at +/-6% on its fee tier.')).toBe(6)
    expect(readRangePct('Re-centre position 7395979, 5% either side of spot')).toBe(5)
  })
  it('keeps the current width when none is given, and says so', () => {
    const r = boundEngine.inspect('My PancakeSwap V3 position 7395979 has drifted out of range. What range and swaps restore it?')
    expect(r.missing).toEqual([])
    expect(r.assumptions[0]).toMatch(/current width/)
  })
  it('needs a position before a quote', () => {
    expect(boundEngine.inspect('My PancakeSwap V3 position has drifted out of range.').missing.length).toBe(1)
  })
})
