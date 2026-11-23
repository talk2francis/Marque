/** The task a buyer sends and the report the Standard grades. Do not rename fields. */

export interface Task {
  /** The position's owner, when the task names one. Not needed: the position is read by its NFT id. */
  owner?: `0x${string}`
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
/**
 * Read a task in plain words. Handles both forms Marque sends:
 *  - the Standard's live test: "Position NFT id: 7826522 ... Block: 135209063 ... re-centre ... at ±6% ..." (no owner);
 *  - a buyer's job: "My PancakeSwap V3 position #7823778, owned by 0x1eCb...6CFf ... Re-centre it at ±5% ...".
 * The position is read by its NFT id, so the owner is optional. Never take another address (the pool's) as the owner.
 */
export function parseTask(text: string): { ok: true; task: Task } | { ok: false; reason: string } {
  const tokenId = text.match(/(?:position\s+nft\s+id|nft\s+id|token\s*id|position\s+(?:nft\s+)?(?:id|number|#)?|nft)\s*[:#]?\s*#?\s*([0-9]{3,12})\b/i)?.[1]
    ?? text.match(/#\s*([0-9]{3,12})\b/)?.[1]
  if (!tokenId) return { ok: false, reason: 'Send the PancakeSwap V3 position NFT number, for example "position #7823778".' }
  const owner = text.match(/(?:owned by|owner(?:\s+address)?\s*[:=]?)\s*(0x[0-9a-fA-F]{40})/i)?.[1]
  const pct = Number(text.match(/(?:±|\+\/-|plus or minus)\s*([0-9]+(?:\.[0-9]+)?)\s*%/i)?.[1] ?? text.match(/\bat\s+([0-9]+(?:\.[0-9]+)?)\s*%/i)?.[1] ?? 10)
  const fee = text.match(/fee tier\s*([0-9]{2,6})\b/i)?.[1]
  const block = text.match(/\bblock\s*[:#]?\s*([0-9]{6,12})\b/i)?.[1]
  if (!(pct > 0 && pct < 100)) return { ok: false, reason: 'Send the range as a percent around the price, for example ±5%.' }
  return { ok: true, task: { ...(owner ? { owner: owner as `0x${string}` } : {}), tokenId, rangePct: pct, ...(fee ? { feeTier: Number(fee) } : {}), ...(block ? { blockNumber: BigInt(block) } : {}) } }
}
