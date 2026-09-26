import { erc20Abi, type Abi } from 'viem'
import { agenticCommerceAbi, evaluatorRouterAbi, optimisticPolicyAbi } from './generated.js'
import { network, type ChainId } from './config.js'

/**
 * Every buyer write, as a plain call object with the sentence the UI shows before the
 * wallet opens (AGENTS invariant 31). Pure and browser-safe: the hire sheet, the
 * testnet proof script and the tests all build calls here, so the words a user reads
 * and the transaction they sign can never drift apart.
 *
 * Sequence (SPEC-COMMERCE 5.1): createJob (evaluator = router, hook = router), then
 * registerJob, setBudget, approve (exact, only if the allowance is short), fund.
 */
export type StepId = 'createJob' | 'registerJob' | 'setBudget' | 'approve' | 'fund' | 'cancel' | 'claimRefund' | 'dispute' | 'revokeAllowance' | 'settle'

export interface Call {
  step: StepId
  chainId: ChainId
  to: `0x${string}`
  abi: Abi
  functionName: string
  args: readonly unknown[]
  /** Plain words, shown before the wallet opens. */
  label: string
  /** One more sentence: what this signature does and does not allow. */
  detail: string
}

const ZERO_REASON = `0x${'0'.repeat(64)}` as const

export interface HireTerms {
  chainId: ChainId
  provider: `0x${string}`
  token: { address: `0x${string}`; symbol: string; decimals: number; isDefault: boolean }
  price: bigint
  priceLabel: string
  agentName: string
  expiredAt: bigint
  description: string
}

export function createJobCall(t: HireTerms): Call {
  const n = network(t.chainId)
  const base = { step: 'createJob' as const, chainId: t.chainId, to: n.commerce, abi: agenticCommerceAbi as unknown as Abi,
    label: `Open a job for ${t.agentName}`,
    detail: `Records the job and ${t.agentName}'s signed price on BNB Chain's ERC-8183 escrow contract. No money moves yet.` }
  // The kernel's default token needs no binding; any other catalog token is bound to the job.
  return t.token.isDefault
    ? { ...base, functionName: 'createJob', args: [t.provider, n.router, t.expiredAt, t.description, n.router] }
    : { ...base, functionName: 'createJobWithToken', args: [t.provider, n.router, t.expiredAt, t.description, n.router, t.token.address] }
}

export function registerJobCall(chainId: ChainId, jobId: bigint): Call {
  const n = network(chainId)
  return { step: 'registerJob', chainId, to: n.router, abi: evaluatorRouterAbi as unknown as Abi, functionName: 'registerJob', args: [jobId, n.policy],
    label: 'Turn on buyer protection',
    detail: 'Attaches the escrow\'s dispute policy to this job, so you can report a bad delivery and reclaim your payment if the agent never delivers.' }
}

export function setBudgetCall(chainId: ChainId, jobId: bigint, price: bigint, priceLabel: string): Call {
  const n = network(chainId)
  return { step: 'setBudget', chainId, to: n.commerce, abi: agenticCommerceAbi as unknown as Abi, functionName: 'setBudget', args: [jobId, price, '0x'],
    label: `Lock the price at ${priceLabel}`,
    detail: 'Fixes the amount this job can ever be paid. It cannot be raised later.' }
}

export function approveCall(chainId: ChainId, token: HireTerms['token'], amount: bigint, priceLabel: string): Call {
  // Exact approvals only (AGENTS invariant 23): anything near an unlimited allowance is refused outright.
  if (amount >= 1n << 128n) throw new Error('unlimited approvals are never built')
  const n = network(chainId)
  return { step: 'approve', chainId, to: token.address, abi: erc20Abi as unknown as Abi, functionName: 'approve', args: [n.commerce, amount],
    label: `Allow exactly ${priceLabel}`,
    detail: `Lets the escrow contract take exactly ${priceLabel} for this job, and nothing more.` }
}

export function fundCall(chainId: ChainId, jobId: bigint, price: bigint, priceLabel: string): Call {
  const n = network(chainId)
  return { step: 'fund', chainId, to: n.commerce, abi: agenticCommerceAbi as unknown as Abi, functionName: 'fund', args: [jobId, price, '0x'],
    label: `Pay ${priceLabel} into escrow`,
    detail: 'Your payment is held by BNB Chain\'s ERC-8183 escrow contract, not by Marque and not by the agent, until the work is delivered.' }
}

/** Cancel before paying: the SDK's cancelOpen is AgenticCommerce.reject while the job is Open. */
export function cancelCall(chainId: ChainId, jobId: bigint): Call {
  const n = network(chainId)
  return { step: 'cancel', chainId, to: n.commerce, abi: agenticCommerceAbi as unknown as Abi, functionName: 'reject', args: [jobId, ZERO_REASON, '0x'],
    label: 'Cancel this job', detail: 'Closes the job before any payment. Nothing is charged.' }
}

export function claimRefundCall(chainId: ChainId, jobId: bigint): Call {
  const n = network(chainId)
  return { step: 'claimRefund', chainId, to: n.commerce, abi: agenticCommerceAbi as unknown as Abi, functionName: 'claimRefund', args: [jobId],
    label: 'Reclaim your payment', detail: 'Returns the escrowed payment to your wallet because the agent did not deliver in time.' }
}

export function disputeCall(chainId: ChainId, jobId: bigint): Call {
  const n = network(chainId)
  return { step: 'dispute', chainId, to: n.policy, abi: optimisticPolicyAbi as unknown as Abi, functionName: 'dispute', args: [jobId],
    label: 'Report a problem with this delivery', detail: 'Opens a dispute inside the review window. Independent voters decide; if they reject the delivery, you are refunded.' }
}

export function revokeAllowanceCall(chainId: ChainId, token: { address: `0x${string}`; symbol: string }): Call {
  const n = network(chainId)
  return { step: 'revokeAllowance', chainId, to: token.address, abi: erc20Abi as unknown as Abi, functionName: 'approve', args: [n.commerce, 0n],
    label: `Set your ${token.symbol} allowance to zero`, detail: 'The escrow contract will not be able to take any of this token until you approve again.' }
}

export function settleCall(chainId: ChainId, jobId: bigint): Call {
  const n = network(chainId)
  return { step: 'settle', chainId, to: n.router, abi: evaluatorRouterAbi as unknown as Abi, functionName: 'settle', args: [jobId, '0x'],
    label: 'Release payment to the agent', detail: 'Anyone may settle once the review window has passed with no dispute.' }
}

/**
 * The job's expiry (SPEC-COMMERCE 5.2): now + dispute window + delivery allowance, where the
 * allowance is 3x the seller's estimate, at least 1 hour and at most 24 hours. The seller
 * must submit before expiredAt - disputeWindow; a refund is claimable after expiredAt.
 */
export function computeExpiredAt(nowSeconds: number, disputeWindowSeconds: number, estimatedCompletionSeconds: number | null, maxExpirySeconds = 365 * 86400): bigint {
  const allowance = Math.min(24 * 3600, Math.max(3600, 3 * (estimatedCompletionSeconds ?? 600)))
  const duration = disputeWindowSeconds + allowance
  if (duration > maxExpirySeconds) throw new Error(`job would last ${duration}s, over the contract maximum ${maxExpirySeconds}s`)
  return BigInt(nowSeconds + duration)
}

/** Only approve when the current allowance cannot cover the price; approve exactly the price. */
export function approvalNeeded(allowance: bigint, price: bigint): bigint | null {
  return allowance >= price ? null : price
}

/** The payment steps after createJob confirms, in order. */
export function paymentCalls(t: HireTerms, jobId: bigint, allowance: bigint): Call[] {
  const calls: Call[] = [registerJobCall(t.chainId, jobId), setBudgetCall(t.chainId, jobId, t.price, t.priceLabel)]
  const approve = approvalNeeded(allowance, t.price)
  if (approve !== null) calls.push(approveCall(t.chainId, t.token, approve, t.priceLabel))
  calls.push(fundCall(t.chainId, jobId, t.price, t.priceLabel))
  return calls
}
