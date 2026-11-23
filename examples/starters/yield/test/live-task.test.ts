import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTask } from '../src/task.js'

/**
 * The exact task text Marque sends (copied from the live Standard test on 23 Nov 2026) and the way buyers word jobs.
 * pnpm test:mcs grades the strategy on the structured case; this checks the agent can READ the live task at all.
 * An agent that passes test:mcs but fails here answers every live test and paid job with an error.
 */
const LIVE = "Find the best net-of-cost yield route on BNB Smart Chain (chain 56).\n\nBlock: 135209070 \u2014 answer for this block only.\nPOLICY YOU MUST FOLLOW: find the best net-of-cost route for 1,000 USD of USDT across the allowed protocols, only recommending a move that beats the current 0% by at least 50 bps, and excluding leveraged strategies\n\nConstraints:\n  asset                 USDT\n  size                  1000 USD\n  allowed protocols     venus\n  currently earning     0% APR\n  minimum improvement   50 bps (recommend nothing that does not clear this)\n  leverage              NOT allowed \u2014 flag any leveraged strategy\n\nReturn strict JSON with exactly these fields:\n{\n  \"recommend\": <boolean, false if nothing clears the threshold>,\n  \"venue\": <string or null>,\n  \"netAprPct\": <number, net of all costs at the stated size>,\n  \"aprSources\": [ { \"value\": <number>, \"source\": <string>, \"timestamp\": <ISO 8601 string> }, ... ],\n  \"switchingCost\": { \"gasUsd\": <number>, \"swapUsd\": <number>, \"exitUsd\": <number> },\n  \"usesLeverage\": <boolean>\n}\n\nNo prose. JSON only."

test('reads the live Standard task: asset, size and block', () => {
  const p = parseTask(LIVE)
  assert.ok(p.ok, p.ok ? '' : p.reason)
  if (!p.ok) return
  assert.equal(p.task.asset, 'USDT')
  assert.equal(p.task.sizeUsd, 1000)
  assert.equal(p.task.blockNumber, 135209070n)
})
