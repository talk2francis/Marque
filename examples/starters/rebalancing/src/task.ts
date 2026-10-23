/** The task a buyer sends and the report the Standard grades. Do not rename fields. */

export interface Task {
  owner: `0x${string}`
  tokenId: string                      // the PancakeSwap V3 position NFT
  rangePct: number                     // re-centre at +/- this percent around spot
  feeTier?: number
  blockNumber?: bigint
}

export interface Report {
  currentTick: number                  // exact
  inRange: boolean                     // exact
  pctToNearestBound: number
  proposedTickLower: number            // multiples of the pool's tickSpacing (50 on the 0.25% tier)
  proposedTickUpper: number
  amount0: number                      // V3 liquidity formula, within 0.5%
  amount1: number
  maxSlippageBps: number               // stated
  blockNumber: string
  assumptions: string[]
}

/** A published Standard case, as /api/v1/conformance/cases returns it. */
export interface PublishedCase { caseId: string; testId: string; blockNumber: string; subject: Record<string, string>; policy: Record<string, unknown>; prompt: string }

export function fromCase(c: PublishedCase): Task {
  return { owner: c.subject.owner as `0x${string}`, tokenId: String(c.subject.tokenId), rangePct: Number(c.policy.rangePct), feeTier: Number(c.policy.feeTier), blockNumber: BigInt(c.blockNumber) }
}

/** Read a buyer's plain-words task. Refuse, with a reason, what you cannot answer. */
export function parseTask(text: string): { ok: true; task: Task } | { ok: false; reason: string } {
  const owner = text.match(/0x[0-9a-fA-F]{40}/)?.[0]
  const tokenId = text.match(/(?:position|#|id)\s*#?\s*([0-9]{3,12})/i)?.[1]
  if (!owner || !tokenId) return { ok: false, reason: 'Send the position number and its owner address.' }
  const pct = Number(text.match(/([0-9]+(?:\.[0-9]+)?)\s*%/)?.[1] ?? 10)
  return { ok: true, task: { owner: owner as `0x${string}`, tokenId, rangePct: pct } }
}
