/**
 * CharterService — Marque's own bounded-authority interface.
 *
 * Built FIRST and deliberately: the UI, the run pipeline and the receipt all
 * speak this interface, never a vendor SDK. That is not architectural
 * fastidiousness, it is the P6-lite escape hatch made real — if Altana stalls,
 * swapping in our own primitives is one implementation of one interface rather
 * than a rewrite of every surface that touched a charter.
 *
 * VOCABULARY (AGENTS.md, naming discipline): the scoped session is a
 * **charter**. Never "a marque". `Marque` is a proper noun and nothing else.
 *
 * The load-bearing rule, from AGENTS.md §5 of this phase:
 *
 *   **The chain is the truth. Our database is a cache.**
 *
 * Every read of live charter state — remaining cap, remaining time, calls used,
 * contracts permitted — resolves against chain state. A charter that looks
 * active in our database and is revoked on chain is revoked, and the product
 * must say so.
 */

export type CharterStatus =
  /** Granted, unexpired, unrevoked, cap not exhausted. */
  | 'active'
  /** Explicitly revoked. Terminal. */
  | 'revoked'
  /** Past its expiry. Terminal, and reached without any transaction. */
  | 'expired'
  /** Spend cap fully consumed. */
  | 'exhausted'
  /** Grant was attempted and did not land. */
  | 'failed'

/** One contract, and optionally the specific functions permitted on it. */
export interface CallPermission {
  /** Contract address the charter may touch. */
  to: string
  /**
   * Function selectors permitted on that contract, e.g. ['0x095ea7b3'].
   * Empty means every function on that contract — which is a wider grant and
   * the UI must say so rather than rendering it as equivalent.
   */
  selectors?: string[]
  /** Human-readable, for the charter document. */
  label?: string
}

export interface SpendPermission {
  /**
   * Cap in the token's SMALLEST unit.
   *
   * Altana's docs carry this warning and it is worth repeating here, because it
   * silently produces a charter that can never execute: USDT and USDC use
   * **18 decimals on BNB Chain**, not 6. Writing 100_000_000n for "100 USDT"
   * sets a cap of 0.0000000001 USDT.
   */
  limit: bigint
  period: 'day' | 'week' | 'total'
  /** Token address. Absent means the native asset. */
  token?: string
  /** Decimals, carried so the UI never has to guess how to render the cap. */
  decimals: number
  symbol: string
}

export interface CharterGrant {
  /** Who is granting. The wallet that owns the assets. */
  owner: string
  /** The agent being chartered. */
  agentId: string
  /** Exactly what it may call. */
  calls: CallPermission[]
  /** Exactly what it may spend. */
  spend: SpendPermission[]
  /** Unix seconds. A charter without an expiry is not a charter. */
  expiresAt: number
  chainId: number
}

/** A granted charter, as our own product understands it. */
export interface Charter {
  id: string
  status: CharterStatus
  grant: CharterGrant
  /** The session key's address, which is what a third party verifies. */
  sessionKeyAddress: string | null
  /** Transaction that created it. */
  grantTxHash: string | null
  /** Transaction that ended it, when one exists. */
  revokeTxHash: string | null
  grantedAt: string
  revokedAt: string | null
  /** Which implementation issued this — 'altana' or 'registry' (P6-lite). */
  provider: string
  /** Where a third party can read the authority for themselves. */
  verifyUrl: string | null
}

/**
 * Live charter state, READ FROM CHAIN.
 *
 * Never served from our database. A cached "active" that contradicts an on-chain
 * revocation is the single most dangerous thing this product could display.
 */
export interface CharterState {
  charterId: string
  status: CharterStatus
  /** Remaining spend, in smallest units, per cap. */
  remaining: Array<{ symbol: string; remaining: bigint; limit: bigint; decimals: number }>
  /** Seconds until expiry. Negative once expired. */
  secondsRemaining: number
  /** Calls made under this charter so far. */
  callsUsed: number
  /** Contracts it may touch, as the chain has them. */
  contractsPermitted: string[]
  /** Block the state was read at, so freshness is visible. */
  blockNumber: string
  readAt: string
  /** True when this came from chain rather than a cache. Always shown. */
  fromChain: boolean
}

export interface ExecuteUnderCharter {
  charterId: string
  calls: Array<{ to: string; data: string; value?: bigint }>
}

export interface ExecutionOutcome {
  ok: boolean
  txHash: string | null
  /** Present when the charter refused the call. */
  refusedBecause?: 'outside_allowlist' | 'over_cap' | 'expired' | 'revoked' | 'unknown'
  detail?: string
  latencyMs: number
}

/**
 * The interface every surface speaks.
 *
 * Two implementations: `AltanaCharterService` (the real one, sessions on
 * Altana's keystore) and `RegistryCharterService` (P6-lite, our own allowlist
 * plus cap plus expiry recorded on MarqueRegistry). Same UI, same revoke, same
 * on-chain visibility.
 */
export interface CharterService {
  readonly provider: string

  /** Provision a wallet an agent can be chartered against. */
  provisionWallet(opts: { label: string }): Promise<{ address: string; provider: string }>

  /** Grant a charter. Writes the policy on chain. */
  grant(grant: CharterGrant): Promise<Charter>

  /** Live state, read from chain. Never from our cache. */
  state(charterId: string): Promise<CharterState>

  /** End a charter. One transaction, immediate. */
  revoke(charterId: string): Promise<{ ok: boolean; txHash: string | null; detail?: string }>

  /** Execute under a charter. Anything outside the policy must fail on chain. */
  execute(req: ExecuteUnderCharter): Promise<ExecutionOutcome>
}

/** Convert a human cap into the smallest unit, without the decimals trap. */
export function toSmallestUnit(amount: number, decimals: number): bigint {
  // Done as a string to avoid float drift on 18-decimal tokens.
  const [whole = '0', frac = ''] = amount.toString().split('.')
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(whole + padded)
}

export function fromSmallestUnit(amount: bigint, decimals: number): number {
  return Number(amount) / 10 ** decimals
}
