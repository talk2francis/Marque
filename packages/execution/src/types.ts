import type { StructuredTask } from './tasks.js'

/**
 * The execution adapter.
 *
 * This interface is what makes heterogeneous supply usable. A2A, MCP, x402 and
 * ERC-8183 are four different protocols with four different failure modes, and
 * the buyer must never have to know which one they are hiring over. They see
 * price → authority → execute → receipt, and nothing else.
 *
 * Every implementation must obey three rules:
 *
 *  1. **Never throw.** A failure is a returned result with a reason. An
 *     exception loses the evidence, and the evidence is the product.
 *  2. **Every outbound call goes through safeFetch.** Agent endpoints are
 *     hostile input; an executor that bypasses the SSRF guard is a hole into
 *     the VPS.
 *  3. **Never settle on the buyer's behalf.** We can fund, we can execute, we
 *     can prove — but releasing money to a provider is the buyer's decision.
 */

export type ExecutorKind = 'erc8183' | 'x402' | 'a2a' | 'mcp'

/** Why an attempt did not produce a usable answer. */
export type FailureReason =
  /** Could not reach the endpoint at all. */
  | 'unreachable'
  /** Reachable, but exposes no interface we can send this task to. */
  | 'no_compatible_interface'
  /** Answered, but not with anything we can parse as an answer. */
  | 'unusable_response'
  /** The agent wants paying and we have no funded path yet. */
  | 'payment_required'
  /** The action would exceed the authority the buyer granted. */
  | 'outside_authority'
  /** We refused to make the call. */
  | 'blocked'
  /** Took too long. */
  | 'timeout'

export interface CapabilityManifest {
  kind: ExecutorKind
  agentId: string
  name: string | null
  /** Where work is actually sent, after any template resolution. */
  endpoint: string
  /** What the agent says it can do, read from its own endpoint. */
  skills: string[]
  /** True when the agent will answer without being paid first. */
  supportsFreePreflight: boolean
  /** Price the agent declares, in its own words. Unverified. */
  declaredPrice: string | null
  reachedAt: string
  latencyMs: number
}

export interface Quote {
  ok: boolean
  agentId: string
  kind: ExecutorKind
  /** Agent fee in USD, when the agent states one we can parse. */
  feeUsd: number | null
  /** Exactly what the agent said about price, unparsed. */
  declaredPrice: string | null
  /** Settlement asset, resolved from the counterparty rather than assumed. */
  settlementAsset: string | null
  latencyMs: number
  reason?: FailureReason
  detail?: string
}

/** One contract call a plan implies, rendered for a human to approve. */
export interface ProposedCall {
  to: string
  /** Human-readable, e.g. "PancakeSwap V3 NonfungiblePositionManager.mint". */
  label: string
  functionName: string
  /** Value in native token, as a decimal string. Almost always "0". */
  value: string
  /** Arguments, stringified for display. Never rendered as raw HTML. */
  args: string[]
}

export interface PreflightResult {
  ok: boolean
  agentId: string
  /** The agent's structured answer, parsed. */
  plan: unknown
  /** What the plan would actually do on-chain. */
  calls: ProposedCall[]
  /** Gas estimate in native token, when we could simulate it. Null, never 0. */
  estimatedGasNative: number | null
  feeUsd: number | null
  maxSlippageBps: number | null
  /**
   * The plan graded against the MCS test for its category, BEFORE any money
   * moves. A plan that fails its own category's test should never reach a
   * signature, and telling the buyer costs nothing at this point.
   */
  conformance: { testId: string; pass: boolean; failedFields: string[] } | null
  latencyMs: number
  /** Always true at this stage, and stated in the UI verbatim. */
  nothingSubmitted: true
  reason?: FailureReason
  detail?: string
}

export interface ExecutionContext {
  /** The buyer. Work is done for this address, never for a connected session. */
  buyer: string
  /** Hard ceiling the buyer set. An executor may never exceed it. */
  maxSpendUsd: number
  /** Charter id, when the run is executing under bounded authority (P6). */
  charterId?: string | null
  /** Contracts the run is permitted to touch. Empty means read-only. */
  allowlist?: string[]
  /** Abort deadline. */
  deadlineMs?: number
}

export interface RunResult {
  ok: boolean
  agentId: string
  kind: ExecutorKind
  /** The agent's answer. */
  result: unknown
  /** Transactions the run produced, if any. */
  txHashes: string[]
  feeUsd: number | null
  latencyMs: number
  startedAt: string
  finishedAt: string
  reason?: FailureReason
  detail?: string
}

export interface AgentExecutor {
  readonly kind: ExecutorKind
  readonly agentId: string

  /** What this agent can do, read from the agent itself. */
  inspect(): Promise<CapabilityManifest | { ok: false; reason: FailureReason; detail: string }>

  /** What it would charge. Never guessed. */
  quote(task: StructuredTask): Promise<Quote>

  /**
   * A dry run. Optional because not every protocol supports one, and an
   * executor that fakes a preflight it cannot do is worse than one that
   * declines.
   */
  preflight?(task: StructuredTask): Promise<PreflightResult>

  /** Do the work. */
  execute(task: StructuredTask, ctx: ExecutionContext): Promise<RunResult>
}
