/** The task a buyer sends and the report the Standard grades. Do not rename fields. */

export interface Task {
  asset: 'USDT' | 'USDC' | 'FDUSD' | 'U'
  sizeUsd: number
  /** What the buyer earns now, in percent. */
  currentAprPct: number
  /** Only recommend a move that beats the current yield by at least this. */
  minImprovementBps: number
  allowedProtocols: string[]
  leverageAllowed: boolean
  blockNumber?: bigint
}

export interface Report {
  recommend: boolean                   // must be stated, true or false
  venue: string | null                 // where to move, or null when you decline
  netAprPct: number                    // net of fees at the stated size; within 15 bps of Marque's read
  aprSources: Array<{ source: string; timestamp: string; value: number }>
  switchingCost: { gasUsd: number; swapUsd: number; exitUsd: number }
  usesLeverage: boolean
  blockNumber: string
  assumptions: string[]
}

/** A published Standard case, as /api/v1/conformance/cases returns it. */
export interface PublishedCase { caseId: string; testId: string; blockNumber: string; subject: Record<string, string>; policy: Record<string, unknown>; prompt: string }

export function fromCase(c: PublishedCase): Task {
  return { asset: c.policy.asset as Task['asset'], sizeUsd: Number(c.policy.sizeUsd), currentAprPct: Number(c.policy.currentAprPct ?? 0), minImprovementBps: Number(c.policy.minImprovementBps ?? 0), allowedProtocols: (c.policy.allowedProtocols as string[]) ?? ['venus'], leverageAllowed: Boolean(c.policy.leverageAllowed), blockNumber: BigInt(c.blockNumber) }
}

/** Read a buyer's plain-words task. Refuse, with a reason, what you cannot answer. */
export function parseTask(text: string): { ok: true; task: Task } | { ok: false; reason: string } {
  const asset = (text.match(/\b(USDT|USDC|FDUSD|U)\b/)?.[1] ?? 'USDT') as Task['asset']
  const size = Number(text.replace(/,/g, '').match(/([0-9]+(?:\.[0-9]+)?)\s*(?:usd|\$|usdt|usdc|u\b)/i)?.[1] ?? NaN)
  if (!Number.isFinite(size)) return { ok: false, reason: 'Send an amount, for example 1000 USDT.' }
  return { ok: true, task: { asset, sizeUsd: size, currentAprPct: 0, minImprovementBps: 50, allowedProtocols: ['venus'], leverageAllowed: false } }
}
