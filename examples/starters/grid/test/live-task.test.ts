import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTask } from '../src/task.js'

/**
 * The exact task text Marque sends (copied from the live Standard test on 23 Nov 2026) and the way buyers word jobs.
 * pnpm test:mcs grades the strategy on the structured case; this checks the agent can READ the live task at all.
 * An agent that passes test:mcs but fails here answers every live test and paid job with an error.
 */
const LIVE = "Plan a grid for BNB/USDT on BNB Smart Chain (chain 56).\n\nBlock: 135209071\nPOLICY YOU MUST FOLLOW: build a 12-level grid for BNB/USDT between 600 and 850 using 2,000 USD of capital, with a stop at 580, and disclose the fee drag at 25 bps per trade\n\nConstraints:\n  lower bound      600\n  upper bound      850\n  capital          2000 USD\n  levels           12\n  stop price       580  (no level may sit at or below this)\n  fee per trade    25 bps\n\nReturn strict JSON with exactly these fields:\n{\n  \"spacingType\": \"arithmetic\" | \"geometric\",\n  \"levels\": [ { \"price\": <number>, \"allocationUsd\": <number> }, ... ],\n  \"feeDragPct\": <number, total fee drag across the full grid as a percent of capital>\n}\n\nNo prose. JSON only."

test('reads the live Standard task from its labelled constraints, not the chain id or the block', () => {
  const p = parseTask(LIVE)
  assert.ok(p.ok, p.ok ? '' : p.reason)
  if (!p.ok) return
  assert.equal(p.task.lowerBound, 600)
  assert.equal(p.task.upperBound, 850)
  assert.equal(p.task.capitalUsd, 2000)
  assert.equal(p.task.levels, 12)
  assert.equal(p.task.stopPrice, 580)
  assert.equal(p.task.feeBps, 25)
  assert.equal(p.task.pair, 'BNB/USDT')
  assert.equal(p.task.blockNumber, 135209071n)
})

test('reads a buyer job in plain words', () => {
  const a = parseTask('Build a grid for BNB between 600 and 850 using 2,000 USD, 8 levels')
  assert.ok(a.ok)
  if (a.ok) { assert.equal(a.task.lowerBound, 600); assert.equal(a.task.upperBound, 850); assert.equal(a.task.capitalUsd, 2000); assert.equal(a.task.levels, 8) }
  const b = parseTask('600 to 850 with 2000 USDT')
  assert.ok(b.ok)
  if (b.ok) { assert.equal(b.task.lowerBound, 600); assert.equal(b.task.upperBound, 850); assert.equal(b.task.capitalUsd, 2000) }
})
