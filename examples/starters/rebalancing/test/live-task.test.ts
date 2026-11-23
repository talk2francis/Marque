import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTask } from '../src/task.js'

/**
 * The exact task text Marque sends (copied from the live Standard test on 23 Nov 2026) and the way buyers word jobs.
 * pnpm test:mcs grades the strategy on the structured case; this checks the agent can READ the live task at all.
 * An agent that passes test:mcs but fails here answers every live test and paid job with an error.
 */
const LIVE = "You are given a PancakeSwap V3 position on BNB Smart Chain (chain 56).\n\nPosition NFT id: 7826522\nPool: 0xB0f5E5400E8F0F7C242F2b7740C004f020579c41  (USDT/TSLAB, fee tier 2500)\nBlock: 135209063  \u2014 answer for this block only.\n\nPOLICY YOU MUST FOLLOW: re-centre the position symmetrically at \u00b16% around the current spot price, on the 0.25% fee tier, keeping the same liquidity\n\nReturn strict JSON with exactly these fields:\n{\n  \"currentTick\": <integer, the pool's tick at this block>,\n  \"inRange\": <boolean>,\n  \"pctToNearestBound\": <number, percent in price terms to the nearer bound>,\n  \"proposedTickLower\": <integer, must be a multiple of the pool's tickSpacing>,\n  \"proposedTickUpper\": <integer, must be a multiple of the pool's tickSpacing>,\n  \"amount0\": <number, USDT required to mint the proposed range>,\n  \"amount1\": <number, TSLAB required to mint the proposed range>,\n  \"maxSlippageBps\": <number, your stated slippage bound in basis points>\n}\n\nNo prose. JSON only."

test('reads the live Standard task: position id, range, fee tier and block, and never takes the pool as owner', () => {
  const p = parseTask(LIVE)
  assert.ok(p.ok, p.ok ? '' : p.reason)
  if (!p.ok) return
  assert.equal(p.task.tokenId, '7826522')
  assert.equal(p.task.rangePct, 6)
  assert.equal(p.task.feeTier, 2500)
  assert.equal(p.task.blockNumber, 135209063n)
  assert.equal(p.task.owner, undefined)
})

test('reads a buyer job: position number, owner and range', () => {
  const p = parseTask('My PancakeSwap V3 position #7823778, owned by 0x1eCbC285F34390516FB69797949D9d4Ca3F86CFf, may have drifted. Re-centre it at ±5% around the current price. (via marque.trade)')
  assert.ok(p.ok)
  if (!p.ok) return
  assert.equal(p.task.tokenId, '7823778')
  assert.equal(p.task.owner, '0x1eCbC285F34390516FB69797949D9d4Ca3F86CFf')
  assert.equal(p.task.rangePct, 5)
})

test('refuses a task with no position, with a reason', () => {
  const p = parseTask('Rebalance my liquidity please')
  assert.equal(p.ok, false)
})
