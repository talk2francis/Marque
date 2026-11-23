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
/**
 * Read a task in plain words. The Standard's live test lists labelled constraints ("lower bound 600", "upper bound
 * 850", "capital 2000 USD", "levels 12", "stop price 580", "fee per trade 25 bps", "Block: 135209071"); a buyer may
 * write "between 600 and 850 using 2,000 USD" or "600 to 850 with 2000 USDT". Labels are read first, so numbers such
 * as the chain id or the block are never mistaken for prices.
 */
export function parseTask(text: string): { ok: true; task: Task } | { ok: false; reason: string } {
  const t = text.replace(/(\d),(?=\d{3}\b)/g, '$1')
  const n = (re: RegExp) => { const m = t.match(re)?.[1]; return m === undefined ? undefined : Number(m) }
  const NUM = '([0-9]+(?:\\.[0-9]+)?)'
  const lower = n(new RegExp(`lower bound\\s*[:=]?\\s*${NUM}`, 'i')) ?? n(new RegExp(`between\\s+\\$?${NUM}\\s+and`, 'i')) ?? n(new RegExp(`\\$?${NUM}\\s*(?:to|-)\\s*\\$?[0-9]`, 'i'))
  const upper = n(new RegExp(`upper bound\\s*[:=]?\\s*${NUM}`, 'i')) ?? n(new RegExp(`between\\s+\\$?[0-9.]+\\s+and\\s+\\$?${NUM}`, 'i')) ?? n(new RegExp(`\\$?[0-9.]+\\s*(?:to|-)\\s*\\$?${NUM}`, 'i'))
  const capital = n(new RegExp(`capital\\s*[:=]?\\s*${NUM}`, 'i')) ?? n(new RegExp(`(?:using|with)\\s+\\$?${NUM}\\s*(?:usd|usdt|\\$)`, 'i'))
  const levels = n(/levels\s*[:=]?\s*([0-9]{1,3})\b/i) ?? n(/([0-9]{1,3})-level/i) ?? n(/([0-9]{1,3})\s+levels?\b/i) ?? 10
  const stop = n(new RegExp(`stop(?:\\s+price)?(?:\\s+at)?\\s*[:=]?\\s*${NUM}`, 'i'))
  const fee = n(/fee per trade\s*[:=]?\s*([0-9]+)\s*bps/i) ?? n(/([0-9]+)\s*bps/i) ?? 25
  const pair = t.match(/\b(BNB|BTCB|ETH|CAKE)\s*\/\s*USDT\b/i)?.[1]?.toUpperCase() ?? t.match(/\b(BNB|BTCB|ETH|CAKE)\b/)?.[1] ?? 'BNB'
  const block = t.match(/\bblock\s*[:#]?\s*([0-9]{6,12})\b/i)?.[1]
  if (lower === undefined || upper === undefined || capital === undefined || !(upper > lower) || !(capital > 0)) {
    return { ok: false, reason: 'Send a lower and upper price and the capital, for example "between 600 and 850 using 2,000 USD".' }
  }
  return { ok: true, task: { pair: `${pair}/USDT`, lowerBound: lower, upperBound: upper, levels, capitalUsd: capital, ...(stop !== undefined ? { stopPrice: stop } : {}), feeBps: fee, ...(block ? { blockNumber: BigInt(block) } : {}) } }
}
