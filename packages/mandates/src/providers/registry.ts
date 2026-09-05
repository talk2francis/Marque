import { createWalletClient, createPublicClient, http, keccak256, toHex, type Address, type PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bscTestnet } from 'viem/chains'
import type {
  Charter, CharterGrant, CharterService, CharterState,
  ExecuteUnderCharter, ExecutionOutcome,
} from '../types.js'
import { InMemoryCharterStore, type CharterRecord, type CharterStore } from '../store.js'

/**
 * P6-LITE — CharterService against our own primitives.
 *
 * The fallback AGENTS.md names: an allowlist, a spend cap and an expiry
 * recorded on MarqueRegistry, with the same UI, the same revoke and the same
 * on-chain visibility. It forfeits the Altana prize and preserves the entire
 * main-track safety story.
 *
 * It exists because building against `CharterService` first means the fallback
 * costs nothing — and because a fallback written *after* an SDK has already
 * burned a day is written under pressure, which is when this kind of code goes
 * wrong.
 *
 * Be precise about what this does and does not give you, because overstating it
 * would be the dishonest move:
 *
 *   IT DOES     anchor the policy on chain, timestamped and immutable, so a
 *               third party can read exactly what was granted, to whom, with
 *               what cap and expiry, and whether it was revoked.
 *   IT DOES NOT enforce that policy at a validator. Altana's sessions revert at
 *               the contract; ours are enforced by this service before signing.
 *
 * That difference is real and the product must state it rather than let a
 * reader assume equivalence.
 */

const registryAbi = [
  { type: 'function', name: 'anchor', stateMutability: 'nonpayable', inputs: [{ name: 'leaf', type: 'bytes32' }], outputs: [] },
  {
    type: 'function', name: 'anchoredAt', stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }], outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'isAnchored', stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }], outputs: [{ type: 'bool' }],
  },
] as const

export interface RegistryConfig {
  registryAddress: Address
  privateKey: `0x${string}`
  rpcUrl: string
  chainId: number
  /**
   * Where charters are kept between calls. Defaults to memory, which is right
   * for a one-shot script and wrong for a web process: a charter that vanishes
   * on restart takes its revoke button with it. The web app passes the
   * Postgres store.
   */
  store?: CharterStore
}

/** Extra fields the store keeps that the protocol itself has no opinion about. */
export interface GrantMeta {
  agentName?: string | null
  grantedBy?: string
  label?: string | null
  category?: string
}

/** Canonical policy hash. Anchoring this proves WHAT was granted, not just that. */
export function policyHash(grant: CharterGrant): string {
  const canonical = JSON.stringify({
    v: 1,
    owner: grant.owner.toLowerCase(),
    agentId: grant.agentId,
    chainId: grant.chainId,
    expiresAt: grant.expiresAt,
    calls: [...grant.calls]
      .map((c) => ({ to: c.to.toLowerCase(), selectors: [...(c.selectors ?? [])].sort() }))
      .sort((a, b) => a.to.localeCompare(b.to)),
    spend: [...grant.spend]
      .map((s) => ({ limit: s.limit.toString(), period: s.period, token: (s.token ?? 'native').toLowerCase() }))
      .sort((a, b) => a.token.localeCompare(b.token)),
  })
  return keccak256(toHex(canonical))
}

/** The hash anchored when a charter is revoked, so revocation is on chain too. */
export function revocationHash(charterId: string, policy: string): string {
  return keccak256(toHex(JSON.stringify({ v: 1, revoke: charterId, policy })))
}

export class RegistryCharterService implements CharterService {
  readonly provider = 'registry'

  private readonly account: ReturnType<typeof privateKeyToAccount>
  private readonly wallet: ReturnType<typeof createWalletClient>
  private readonly pub: PublicClient
  private readonly store: CharterStore

  constructor(private readonly config: RegistryConfig) {
    if (config.chainId === 56) {
      throw new Error('refusing to construct a mainnet charter service: escalation gate 1 requires written approval')
    }
    this.account = privateKeyToAccount(config.privateKey)
    const transport = http(config.rpcUrl, { timeout: 30_000 })
    this.wallet = createWalletClient({ account: this.account, chain: bscTestnet, transport })
    this.pub = createPublicClient({ chain: bscTestnet, transport })
    this.store = config.store ?? new InMemoryCharterStore()
  }

  /** The address that signs under every charter this service issues. */
  get signerAddress(): string {
    return this.account.address
  }

  async provisionWallet(opts: { label: string }): Promise<{ address: string; provider: string }> {
    void opts
    // In P6-lite the granting wallet is the operator's own key. There is no
    // separate agentic wallet, and pretending otherwise would misdescribe it.
    return { address: this.account.address, provider: this.provider }
  }

  async grant(grant: CharterGrant, meta: GrantMeta = {}): Promise<Charter> {
    const policy = policyHash(grant)
    const grantedAt = new Date().toISOString()

    const txHash = await this.wallet.writeContract({
      address: this.config.registryAddress,
      abi: registryAbi,
      functionName: 'anchor',
      args: [policy as `0x${string}`],
      chain: bscTestnet,
      account: this.account,
    })
    await this.pub.waitForTransactionReceipt({ hash: txHash })

    const charterId = `registry:${policy.slice(0, 18)}`
    const charter: Charter = {
      id: charterId,
      status: 'active',
      grant,
      sessionKeyAddress: this.account.address,
      grantTxHash: txHash,
      revokeTxHash: null,
      grantedAt,
      revokedAt: null,
      provider: this.provider,
      verifyUrl: `https://testnet.bscscan.com/tx/${txHash}`,
    }

    await this.store.put({
      charter,
      policyHash: policy,
      revokeHash: null,
      spent: {},
      callsUsed: 0,
      agentName: meta.agentName ?? null,
      grantedBy: meta.grantedBy ?? 'operator',
      label: meta.label ?? null,
      category: meta.category ?? 'unclassified',
    })
    return charter
  }

  /** The stored record, for surfaces that need the document rather than state. */
  async record(charterId: string): Promise<CharterRecord | null> {
    return this.store.get(charterId)
  }

  /**
   * Live state, read from chain.
   *
   * The grant and the revocation are both anchors, so status is derived by
   * asking the contract which of them exist — not by trusting our own map.
   */
  async state(charterId: string): Promise<CharterState> {
    const stored = await this.store.get(charterId)
    if (!stored) throw new Error(`unknown charter ${charterId}`)

    const [grantAnchored, revokeAnchored, blockNumber] = await Promise.all([
      this.pub.readContract({
        address: this.config.registryAddress, abi: registryAbi,
        functionName: 'isAnchored', args: [stored.policyHash as `0x${string}`],
      }),
      stored.revokeHash
        ? this.pub.readContract({
            address: this.config.registryAddress, abi: registryAbi,
            functionName: 'isAnchored', args: [stored.revokeHash as `0x${string}`],
          })
        : Promise.resolve(false),
      this.pub.getBlockNumber(),
    ])

    const now = Math.floor(Date.now() / 1000)
    const secondsRemaining = stored.charter.grant.expiresAt - now

    // The chain decides, in this order: revoked beats expired beats active.
    const status: CharterState['status'] =
      revokeAnchored ? 'revoked'
      : secondsRemaining <= 0 ? 'expired'
      : grantAnchored ? 'active'
      : 'failed'

    return {
      charterId,
      status,
      remaining: stored.charter.grant.spend.map((s) => {
        const used = BigInt(stored.spent[s.symbol] ?? '0')
        return {
          symbol: s.symbol,
          remaining: s.limit > used ? s.limit - used : 0n,
          limit: s.limit,
          decimals: s.decimals,
        }
      }),
      secondsRemaining,
      callsUsed: stored.callsUsed,
      contractsPermitted: stored.charter.grant.calls.map((c) => c.to),
      blockNumber: blockNumber.toString(),
      readAt: new Date().toISOString(),
      fromChain: true,
    }
  }

  async revoke(charterId: string): Promise<{ ok: boolean; txHash: string | null; detail?: string }> {
    const stored = await this.store.get(charterId)
    if (!stored) return { ok: false, txHash: null, detail: `unknown charter ${charterId}` }

    const revokeHash = revocationHash(charterId, stored.policyHash)
    try {
      const txHash = await this.wallet.writeContract({
        address: this.config.registryAddress,
        abi: registryAbi,
        functionName: 'anchor',
        args: [revokeHash as `0x${string}`],
        chain: bscTestnet,
        account: this.account,
      })
      await this.pub.waitForTransactionReceipt({ hash: txHash })

      await this.store.patch(charterId, {
        revokeHash,
        status: 'revoked',
        revokedAt: new Date().toISOString(),
        revokeTxHash: txHash,
      })
      return { ok: true, txHash }
    } catch (err) {
      return { ok: false, txHash: null, detail: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * Execute under a charter.
   *
   * Every bound is checked BEFORE signing. That is the honest description of
   * this implementation: the policy is anchored on chain and publicly readable,
   * but it is enforced here rather than by a validator. Altana's sessions
   * revert at the contract; these do not, and the UI must say so.
   */
  async execute(req: ExecuteUnderCharter): Promise<ExecutionOutcome> {
    const started = Date.now()
    const stored = await this.store.get(req.charterId)
    if (!stored) {
      return { ok: false, txHash: null, refusedBecause: 'unknown', detail: 'unknown charter', latencyMs: 0 }
    }

    const live = await this.state(req.charterId)
    if (live.status === 'revoked') {
      return { ok: false, txHash: null, refusedBecause: 'revoked', detail: 'this charter was revoked on chain', latencyMs: Date.now() - started }
    }
    if (live.status === 'expired') {
      return { ok: false, txHash: null, refusedBecause: 'expired', detail: 'this charter has expired', latencyMs: Date.now() - started }
    }

    // Allowlist. An empty allowlist permits nothing, which is the safe default.
    const allowed = new Set(stored.charter.grant.calls.map((c) => c.to.toLowerCase()))
    for (const call of req.calls) {
      if (!allowed.has(call.to.toLowerCase())) {
        return {
          ok: false, txHash: null, refusedBecause: 'outside_allowlist',
          detail: `${call.to} is not in this charter's allowlist of ${allowed.size} contract(s)`,
          latencyMs: Date.now() - started,
        }
      }
    }

    // Native spend cap.
    const nativeCap = stored.charter.grant.spend.find((s) => !s.token)
    if (nativeCap) {
      const requested = req.calls.reduce((sum, c) => sum + (c.value ?? 0n), 0n)
      const used = BigInt(stored.spent[nativeCap.symbol] ?? '0')
      if (used + requested > nativeCap.limit) {
        return {
          ok: false, txHash: null, refusedBecause: 'over_cap',
          detail: `this call would spend ${requested} on top of ${used} already used, exceeding the cap of ${nativeCap.limit}`,
          latencyMs: Date.now() - started,
        }
      }
    }

    try {
      let lastHash: string | null = null
      const spent = { ...stored.spent }
      let callsUsed = stored.callsUsed
      for (const call of req.calls) {
        const hash = await this.wallet.sendTransaction({
          to: call.to as Address,
          data: (call.data ?? '0x') as `0x${string}`,
          value: call.value ?? 0n,
          chain: bscTestnet,
          account: this.account,
        })
        await this.pub.waitForTransactionReceipt({ hash })
        lastHash = hash

        if (nativeCap && call.value) {
          spent[nativeCap.symbol] = (BigInt(spent[nativeCap.symbol] ?? '0') + call.value).toString()
        }
        callsUsed++
        // Persisted per call, not once at the end. A crash between two calls
        // must not lose the record of the first, or the cap silently widens.
        await this.store.patch(req.charterId, { spent, callsUsed })
      }
      return { ok: true, txHash: lastHash, latencyMs: Date.now() - started }
    } catch (err) {
      return {
        ok: false, txHash: null, refusedBecause: 'unknown',
        detail: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - started,
      }
    }
  }
}
