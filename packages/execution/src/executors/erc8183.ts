import type { Address, PublicClient } from 'viem'
import { publicClient } from '@marque/chain'
import { renderTaskPrompt, type StructuredTask } from '../tasks.js'
import type {
  AgentExecutor, CapabilityManifest, ExecutionContext, FailureReason,
  Quote, RunResult,
} from '../types.js'

/**
 * ERC-8183 commerce executor.
 *
 * The lifecycle is: buyer creates a job → buyer funds it → provider fulfils →
 * **buyer settles**. That last step is the buyer's, always. We can create, we
 * can fund under an explicit cap, we can watch for fulfilment and grade it —
 * but releasing money to a provider is a decision we never make on someone
 * else's behalf, even when we could.
 *
 * The settlement asset is RESOLVED FROM THE DEPLOYED KERNEL at runtime, never
 * assumed. AGENTS.md gotcha 13 exists because guessing USDT and being wrong
 * costs a swap and half a morning; the kernel reports `token_symbol()`,
 * `token_decimals()` and `token_balance()` and we fund exactly what it names.
 *
 * STATUS: read paths are live. Every WRITE path (create, fund, settle) is
 * gated behind an explicit approval flag and is testnet-only in this phase.
 * Nothing here can touch mainnet without written approval — escalation gate 1.
 */

/** Minimal kernel surface. Trimmed to what we actually call. */
export const erc8183KernelAbi = [
  { type: 'function', name: 'token_symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'token_decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  {
    type: 'function', name: 'token_balance', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }],
  },
  { type: 'function', name: 'token_address', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const

export interface SettlementAsset {
  symbol: string
  decimals: number
  address: string | null
  /** Balance of the account we would fund from, in whole units. */
  balance: number | null
}

/**
 * Ask the kernel what it settles in.
 *
 * Returns null rather than a default when the kernel cannot be read: an
 * assumed settlement asset is exactly the failure this function exists to stop.
 */
export async function resolveSettlementAsset(
  kernel: Address,
  account: Address | null,
  client: PublicClient = publicClient(),
): Promise<SettlementAsset | null> {
  try {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: kernel, abi: erc8183KernelAbi, functionName: 'token_symbol' }),
      client.readContract({ address: kernel, abi: erc8183KernelAbi, functionName: 'token_decimals' }),
    ])
    const address = await client
      .readContract({ address: kernel, abi: erc8183KernelAbi, functionName: 'token_address' })
      .catch(() => null)
    const balance = account
      ? await client
          .readContract({ address: kernel, abi: erc8183KernelAbi, functionName: 'token_balance', args: [account] })
          .then((b) => Number(b) / 10 ** Number(decimals))
          .catch(() => null)
      : null

    return { symbol: String(symbol), decimals: Number(decimals), address: address ? String(address) : null, balance }
  } catch {
    return null
  }
}

export interface Erc8183Config {
  /** The deployed commerce kernel. */
  kernel: Address
  /** Which chain this kernel lives on. 97 is testnet, 56 is mainnet. */
  chainId: number
  /**
   * Write paths are refused unless this is explicitly true AND the chain is
   * testnet. Mainnet writes require written approval per escalation gate 1,
   * and a boolean in code is not that approval.
   */
  allowWrites?: boolean
}

export class Erc8183Executor implements AgentExecutor {
  readonly kind = 'erc8183' as const

  constructor(
    readonly agentId: string,
    private readonly config: Erc8183Config,
    private readonly name: string | null = null,
    private readonly client: PublicClient = publicClient(),
  ) {}

  /** True only on testnet with writes explicitly enabled. */
  private get writesPermitted(): boolean {
    return this.config.allowWrites === true && this.config.chainId === 97
  }

  async inspect(): Promise<CapabilityManifest | { ok: false; reason: FailureReason; detail: string }> {
    const started = Date.now()
    const asset = await resolveSettlementAsset(this.config.kernel, null, this.client)
    if (!asset) {
      return {
        ok: false, reason: 'unreachable',
        detail: `ERC-8183 kernel at ${this.config.kernel} did not answer token_symbol/token_decimals`,
      }
    }
    return {
      kind: this.kind,
      agentId: this.agentId,
      name: this.name,
      endpoint: this.config.kernel,
      skills: [],
      supportsFreePreflight: false,
      declaredPrice: null,
      reachedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
    }
  }

  async quote(_task: StructuredTask): Promise<Quote> {
    const started = Date.now()
    const asset = await resolveSettlementAsset(this.config.kernel, null, this.client)
    if (!asset) {
      return {
        ok: false, agentId: this.agentId, kind: this.kind, feeUsd: null,
        declaredPrice: null, settlementAsset: null, latencyMs: Date.now() - started,
        reason: 'unreachable', detail: 'could not read the settlement asset from the kernel',
      }
    }
    return {
      ok: true, agentId: this.agentId, kind: this.kind,
      // The kernel names the asset; it does not name this job's price. Quoting
      // a number here would be inventing one.
      feeUsd: null,
      declaredPrice: null,
      settlementAsset: asset.symbol,
      latencyMs: Date.now() - started,
      detail: `settles in ${asset.symbol} (${asset.decimals} decimals), resolved from the kernel`,
    }
  }

  async execute(task: StructuredTask, ctx: ExecutionContext): Promise<RunResult> {
    const startedAt = new Date().toISOString()
    const started = Date.now()

    if (!this.writesPermitted) {
      const finishedAt = new Date().toISOString()
      return {
        ok: false, agentId: this.agentId, kind: this.kind, result: null, txHashes: [],
        feeUsd: null, latencyMs: Date.now() - started, startedAt, finishedAt,
        reason: 'blocked',
        detail: this.config.chainId === 56
          ? 'refused: ERC-8183 job creation on mainnet is an escalation gate and requires written approval'
          : 'refused: writes are not enabled for this executor',
      }
    }

    const asset = await resolveSettlementAsset(this.config.kernel, ctx.buyer as Address, this.client)
    const finishedAt = new Date().toISOString()

    if (!asset) {
      return {
        ok: false, agentId: this.agentId, kind: this.kind, result: null, txHashes: [],
        feeUsd: null, latencyMs: Date.now() - started, startedAt, finishedAt,
        reason: 'unreachable', detail: 'could not resolve the settlement asset before funding',
      }
    }

    // Funding requires a signer, which this phase does not hold. The job shape
    // is returned so the caller can see exactly what would be created and in
    // which asset, without anything having been submitted.
    return {
      ok: false, agentId: this.agentId, kind: this.kind,
      result: {
        wouldCreate: {
          kernel: this.config.kernel,
          chainId: this.config.chainId,
          buyer: ctx.buyer,
          settlementAsset: asset.symbol,
          settlementDecimals: asset.decimals,
          buyerBalance: asset.balance,
          maxSpendUsd: ctx.maxSpendUsd,
          task: renderTaskPrompt(task),
        },
      },
      txHashes: [],
      feeUsd: null,
      latencyMs: Date.now() - started, startedAt, finishedAt,
      reason: 'blocked',
      detail: 'no signer is configured for ERC-8183 writes in this phase; the job was described, not created',
    }
  }
}
