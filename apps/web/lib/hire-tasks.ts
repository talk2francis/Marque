/**
 * The sentences the hire sheet's task forms compose, one per category. Each is
 * checked against the agent's own parser in hire-tasks.test.ts, so a form can
 * never produce a task the agent would refuse to quote.
 */
export const hfTask = (account: string, target: number) =>
  `What is the health factor of Venus account ${account} and what repay restores it to ${target}?`

export const gridTask = (o: { pair: string; lower: string; upper: string; capital: string; stop?: string | null; levels?: number | null }) =>
  `Plan a ${o.levels ?? 10}-level grid for ${o.pair}/USDT between ${o.lower} and ${o.upper} with ${o.capital} USDT${o.stop ? `, stop below ${o.stop}` : ''}.`

export const rebalanceTask = (tokenId: string, pct: number) =>
  `My PancakeSwap V3 position #${tokenId} may have drifted. Re-centre it at ±${pct}% around the current price.`

export const yieldTask = (amount: string, asset: string) =>
  `Where should ${amount} ${asset} earn the most on BNB Chain right now, after switching costs?`

export const securityTask = (token: string) =>
  `Review token ${token} for risky approvals and privileged functions.`
