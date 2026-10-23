/** The task a buyer sends and the report the Standard grades. Do not rename fields. */

export interface Task {
  pair: string                         // e.g. 'BNB/USDT'
  lowerBound: number
  upperBound: number
  levels: number
  capitalUsd: number
  stopPrice?: number
  feeBps: number                       // per trade, for the fee drag disclosure
  blockNumber?: bigint
}

export interface Report {
  levels: Array<{ price: number; allocationUsd: number }>  // inside the bounds, none below the stop
  spacingType: 'arithmetic' | 'geometric'                // declared, and the levels must follow it
  stopPrice: number | null
  feeDragPct: number                   // disclosed
  blockNumber: string
  assumptions: string[]
}

/** A published Standard case, as /api/v1/conformance/cases returns it. */
export interface PublishedCase { caseId: string; testId: string; blockNumber: string; subject: Record<string, string>; policy: Record<string, unknown>; prompt: string }

export function fromCase(c: PublishedCase): Task {
  return { pair: String(c.policy.pair), lowerBound: Number(c.policy.lowerBound), upperBound: Number(c.policy.upperBound), levels: Number(c.policy.levels), capitalUsd: Number(c.policy.capitalUsd), stopPrice: c.policy.stopPrice === undefined ? undefined : Number(c.policy.stopPrice), feeBps: Number(c.policy.feeBps ?? 25), blockNumber: BigInt(c.blockNumber) }
}

/** Read a buyer's plain-words task. Refuse, with a reason, what you cannot answer. */
export function parseTask(text: string): { ok: true; task: Task } | { ok: false; reason: string } {
  const nums = text.replace(/,/g, '').match(/[0-9]+(?:\.[0-9]+)?/g)?.map(Number) ?? []
  const pair = text.match(/\b(BNB|BTCB|ETH|CAKE)\b/)?.[1] ?? 'BNB'
  if (nums.length < 3) return { ok: false, reason: 'Send a lower and upper price and the capital, for example 600 to 850 with 2000 USDT.' }
  const [lower, upper, capital] = nums as [number, number, number]
  return { ok: true, task: { pair: `${pair}/USDT`, lowerBound: lower, upperBound: upper, levels: 10, capitalUsd: capital, feeBps: 25 } }
}
