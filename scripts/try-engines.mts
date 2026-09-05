import { ENGINES } from '@marque/agent-engines'
import { publicClient } from '@marque/chain'

const DEMO = process.env['DEMO_ADDRESS']!
const LP = '0x2e07E0145C0CFdF6D200B0aFAeD36953ef00d0cD'
const block = (await publicClient().getBlockNumber()).toString()

const cases: Array<[string, string]> = [
  ['keel', `Chain: BNB Smart Chain (56). Block: ${block}.\nSubject address: ${DEMO}\n\nTask: report this account's Venus health factor and restore it to 2.5.`],
  ['bound', `Chain: BNB Smart Chain (56). Block: ${block}.\nSubject address: ${LP}\n\nTask: re-centre PancakeSwap V3 position 7321916.\nPOLICY YOU MUST FOLLOW: symmetric ±6% around spot on the 2500 fee tier, with a slippage bound no wider than 40 bps.`],
  ['lattice', `Chain: BNB Smart Chain (56). Block: ${block}.\nSubject address: ${DEMO}\n\nTask: plan a grid for BNB/USDT.\nPOLICY YOU MUST FOLLOW: 10 levels between 500 and 800, 1000 USD of capital, stop at 450, 25 bps per trade.`],
  ['sluicegate', `Chain: BNB Smart Chain (56). Block: ${block}.\nSubject address: ${DEMO}\n\nTask: find the best net-of-cost route for 1000 USD of USDT.\nPOLICY YOU MUST FOLLOW: only venus; only recommend a move beating the current 0% by at least 50 bps; leverage NOT allowed.`],
  ['redcell', `Chain: BNB Smart Chain (56). Block: ${block}.\nTriage contract 0x55d398326f99059fF775485246999027B3197955 for approval and privilege risk.`],
]

for (const [id, prompt] of cases) {
  const engine = ENGINES[id]!
  const t0 = Date.now()
  const out = await engine.run(prompt)
  const ms = Date.now() - t0
  console.log(`\n=== ${id}  (${ms}ms) ===`)
  console.log(JSON.stringify(out, null, 1).slice(0, 1400))
}
process.exit(0)
