/** The task a buyer sends and the report the Standard grades. Do not rename fields. */

export interface Task {
  /** The Venus Core Pool borrower to read. */
  address: `0x${string}`
  /** The health factor the buyer wants to reach. */
  targetHf: number
  /** Read chain state at this block when given (tests always give one). */
  blockNumber?: bigint
}

export interface Report {
  healthFactor: number                 // to 3 dp; tolerance 0.005
  primaryCollateralSymbol: string      // the UNDERLYING symbol of the largest collateral market (BTCB, not vBTC)
  primaryCollateralFactor: number      // that market's collateral factor, e.g. 0.8
  primaryLiquidationPriceUsd: number   // price of that asset at which HF reaches 1
  repayUsdToReachTarget: number        // USD of debt to repay so HF reaches targetHealthFactor (0 if already above)
  targetHealthFactor: number
  blockNumber: string                  // the block you read
  source: string                       // where the numbers came from
  assumptions: string[]                // say what you assumed; never invent a number
}

/** A published Standard case, as /api/v1/conformance/cases returns it. */
export interface PublishedCase { caseId: string; testId: string; blockNumber: string; subject: Record<string, string>; policy: Record<string, unknown>; prompt: string }

export function fromCase(c: PublishedCase): Task {
  return { address: c.subject.address as `0x${string}`, targetHf: Number(c.policy.targetHealthFactor), blockNumber: BigInt(c.blockNumber) }
}

/** Read a buyer's plain-words task. Refuse, with a reason, what you cannot answer. */
export function parseTask(text: string): { ok: true; task: Task } | { ok: false; reason: string } {
  const address = text.match(/0x[0-9a-fA-F]{40}/)?.[0]
  if (!address) return { ok: false, reason: 'Send the Venus borrower address (0x...).' }
  const target = Number(text.match(/(?:health factor|hf)[^0-9]{0,24}([0-9]+(?:\.[0-9]+)?)/i)?.[1] ?? 1.5)
  return { ok: true, task: { address: address as `0x${string}`, targetHf: target > 1 ? target : 1.5 } }
}
