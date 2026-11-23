import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTask } from '../src/task.js'

/**
 * The exact task text Marque sends (copied from the live Standard test on 23 Nov 2026) and the way buyers word jobs.
 * pnpm test:mcs grades the strategy on the structured case; this checks the agent can READ the live task at all.
 * An agent that passes test:mcs but fails here answers every live test and paid job with an error.
 */
const LIVE = "You are given a Venus Core lending account on BNB Smart Chain (chain 56).\n\nAccount: 0x5fBAbcBE85836609a79429fad2FB06518842cA34\nBlock: 135209070 \u2014 answer for this block only.\n\nPOLICY YOU MUST FOLLOW: report the account\u2019s current health factor and the exact USD of debt that must be repaid to restore a health factor of 2.5\n\nReturn strict JSON with exactly these fields:\n{\n  \"healthFactor\": <number to 3 decimal places>,\n  \"primaryCollateralSymbol\": <string, the underlying symbol of the largest collateral market>,\n  \"primaryCollateralFactor\": <number 0..1, that market's collateral factor>,\n  \"primaryLiquidationPriceUsd\": <number, price at which this account reaches HF 1.0>,\n  \"repayUsdToReachTarget\": <number, USD of debt to repay to reach HF 2.5>\n}\n\nNo prose. JSON only."

test('reads the live Standard task: account, target and block', () => {
  const p = parseTask(LIVE)
  assert.ok(p.ok, p.ok ? '' : p.reason)
  if (!p.ok) return
  assert.equal(p.task.address, '0x5fBAbcBE85836609a79429fad2FB06518842cA34')
  assert.equal(p.task.targetHf, 2.5)
  assert.equal(p.task.blockNumber, 135209070n)
})
