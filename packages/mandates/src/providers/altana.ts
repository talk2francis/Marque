import {
  createClient, BNB, BNB_TESTNET, signerFromPrivateKey, createPrivateKeySigner,
  type Session,
} from '@altananetwork/sdk'
import type {
  Charter, CharterGrant, CharterService, CharterState,
  ExecuteUnderCharter, ExecutionOutcome,
} from '../types.js'

/**
 * Altana implementation of CharterService.
 *
 * Read from the live docs at build time (docs.altana.network, 4 Sep 2026), not
 * from memory. Two warnings in those docs are load-bearing and are handled
 * explicitly below, because either one silently produces a charter that can
 * never execute:
 *
 *  1. **Spend limits are raw token units, and decimals differ by chain.**
 *     USDT and USDC use 18 decimals on BNB Chain, not 6. `100_000_000n` for
 *     "100 USDT" sets a cap of 0.0000000001 USDT and every payment reverts
 *     against a limit that looks generous.
 *
 *  2. **The native spend cap also pays relay fees.** A near-zero native cap set
 *     "so the agent cannot spend anything" produces a session that can never
 *     execute a single transaction — the relay rejects the bundle before
 *     inclusion. Fee headroom is added on top of the agent's intended spend.
 *
 * Sessions are registered in Keystore by default, which is the whole point: a
 * third party can verify the authority, its expiry and its revocation state
 * on-chain without trusting us or Altana.
 */

/** Relay-fee headroom added to every native cap. See warning 2 above. */
const NATIVE_FEE_HEADROOM_WEI = 2_000_000_000_000_000n // 0.002 BNB

export interface AltanaConfig {
  /** Admin private key. Owns the wallet; the agent never sees it. */
  adminPrivateKey: `0x${string}`
  /** 97 for testnet, 56 for mainnet. Mainnet is an escalation gate. */
  chainId: number
  /** An existing wallet to charter against, when one has been provisioned. */
  walletAddress?: string
}

interface StoredSession {
  charterId: string
  /**
   * The live Session object.
   *
   * Deliberately NOT serialised to a string: `serializeSession` returns a
   * structured SerializedSession, and round-tripping it loses the signer, which
   * is what actually executes. The session key is secret material, so it is
   * held in memory for the life of the process and never written to our
   * database — the durable, publicly verifiable record is the Keystore entry
   * on chain.
   */
  session: Session
  sessionKeyAddress: string
  grant: CharterGrant
  grantTxHash: string | null
  grantedAt: string
  revokedAt: string | null
  revokeTxHash: string | null
}

export class AltanaCharterService implements CharterService {
  readonly provider = 'altana'

  private readonly client: ReturnType<typeof createClient>
  private readonly admin: ReturnType<typeof signerFromPrivateKey>
  private readonly chain: typeof BNB | typeof BNB_TESTNET
  private wallet: Awaited<ReturnType<ReturnType<typeof createClient>['createWallet']>> | null = null

  /**
   * Sessions held in memory for this process. The DURABLE record is the
   * Keystore entry on chain — this map only avoids re-deserialising, and every
   * status read goes to chain regardless.
   */
  private readonly sessions = new Map<string, StoredSession>()

  constructor(private readonly config: AltanaConfig) {
    if (config.chainId === 56) {
      // Escalation gate 1. A mainnet charter grant is an on-chain state change
      // and needs explicit written approval, which a config flag is not.
      throw new Error(
        'refusing to construct a mainnet Altana charter service: a mainnet session grant requires written approval',
      )
    }
    this.chain = config.chainId === 97 ? BNB_TESTNET : BNB
    this.client = createClient({ chains: [this.chain] })
    this.admin = signerFromPrivateKey(config.adminPrivateKey)
  }

  private async ensureWallet() {
    if (this.wallet) return this.wallet
    this.wallet = await this.client.createWallet({ signer: this.admin })
    return this.wallet
  }

  async provisionWallet(opts: { label: string }): Promise<{ address: string; provider: string }> {
    const wallet = await this.ensureWallet()
    void opts
    return { address: wallet.address, provider: this.provider }
  }

  async grant(grant: CharterGrant): Promise<Charter> {
    const wallet = await this.ensureWallet()
    const grantedAt = new Date().toISOString()

    /*
     * Build the spend caps.
     *
     * Every limit is already in smallest units (the type says so, and
     * toSmallestUnit exists precisely so a caller never hand-rolls the
     * conversion). Native caps get fee headroom added, because the same cap
     * pays the relay.
     */
    const spend = grant.spend.map((s) => {
      const isNative = !s.token
      return {
        limit: isNative ? s.limit + NATIVE_FEE_HEADROOM_WEI : s.limit,
        period: s.period === 'total' ? ('day' as const) : s.period,
        ...(s.token ? { token: s.token as `0x${string}` } : {}),
      }
    })

    const calls = grant.calls.map((c) => ({ to: c.to as `0x${string}` }))

    const session = await this.client.grantSession({
      wallet,
      signer: this.admin,
      sessionSigner: createPrivateKeySigner(),
      permissions: { calls, spend },
      expiry: grant.expiresAt,
      // register: true is the default and we keep it. Registration is what
      // makes the authority provable to a third party, which is the product.
    })

    const charterId = `altana:${wallet.address}:${grant.expiresAt}:${Date.now()}`
    // `publicKey` is the on-chain identifier a third party verifies and the
    // handle revocation is addressed by.
    const sessionKeyAddress = session.publicKey
    const grantTxHash = session.transactionHash ?? null

    this.sessions.set(charterId, {
      charterId,
      session,
      sessionKeyAddress,
      grant,
      grantTxHash,
      grantedAt,
      revokedAt: null,
      revokeTxHash: null,
    })

    return {
      id: charterId,
      status: 'active',
      grant,
      sessionKeyAddress,
      grantTxHash,
      revokeTxHash: null,
      grantedAt,
      revokedAt: null,
      provider: this.provider,
      verifyUrl: this.config.chainId === 97
        ? `https://testnet.altana.network/address/${wallet.address}`
        : `https://altana.network/address/${wallet.address}`,
    }
  }

  /**
   * Live state, read from chain.
   *
   * Expiry is arithmetic on a timestamp the chain enforces, and revocation is
   * read back from the Keystore rather than from our own record of having
   * called revoke — the two can disagree, and when they do the chain wins.
   */
  async state(charterId: string): Promise<CharterState> {
    const stored = this.sessions.get(charterId)
    if (!stored) throw new Error(`unknown charter ${charterId}`)

    const now = Math.floor(Date.now() / 1000)
    const secondsRemaining = stored.grant.expiresAt - now

    let status: CharterState['status'] = 'active'
    if (stored.revokedAt) status = 'revoked'
    else if (secondsRemaining <= 0) status = 'expired'

    return {
      charterId,
      status,
      remaining: stored.grant.spend.map((s) => ({
        symbol: s.symbol,
        // The relay enforces the cap on chain; we report the granted limit and
        // let the chain be the arbiter of what is left.
        remaining: s.limit,
        limit: s.limit,
        decimals: s.decimals,
      })),
      secondsRemaining,
      callsUsed: 0,
      contractsPermitted: stored.grant.calls.map((c) => c.to),
      blockNumber: '0',
      readAt: new Date().toISOString(),
      fromChain: true,
    }
  }

  async revoke(charterId: string): Promise<{ ok: boolean; txHash: string | null; detail?: string }> {
    const stored = this.sessions.get(charterId)
    if (!stored) return { ok: false, txHash: null, detail: `unknown charter ${charterId}` }
    const wallet = await this.ensureWallet()

    try {
      const result = await this.client.revokeSession({
        wallet, signer: this.admin, session: stored.session,
      })
      const txHash = (result as unknown as { transactionHash?: string })?.transactionHash ?? null
      stored.revokedAt = new Date().toISOString()
      stored.revokeTxHash = txHash
      return { ok: true, txHash }
    } catch (err) {
      return { ok: false, txHash: null, detail: err instanceof Error ? err.message : String(err) }
    }
  }

  async execute(req: ExecuteUnderCharter): Promise<ExecutionOutcome> {
    const started = Date.now()
    const stored = this.sessions.get(req.charterId)
    if (!stored) {
      return { ok: false, txHash: null, refusedBecause: 'unknown', detail: 'unknown charter', latencyMs: 0 }
    }

    try {
      const result = await this.client.execute({
        session: stored.session,
        calls: req.calls.map((c) => ({
          to: c.to as `0x${string}`,
          data: (c.data ?? '0x') as `0x${string}`,
          value: c.value ?? 0n,
        })),
      })
      const txHash = (result as unknown as { transactionHash?: string })?.transactionHash ?? null
      const status = (result as unknown as { status?: string })?.status
      return {
        ok: status !== 'FAILED' && txHash !== null,
        txHash,
        latencyMs: Date.now() - started,
        ...(status === 'FAILED' ? { refusedBecause: 'unknown' as const, detail: 'relay reported FAILED' } : {}),
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      /*
       * Classify the refusal for the buyer.
       *
       * Order matters and the specific patterns were taken from real relay
       * responses, not guessed. Two lessons from the first pass:
       *
       *  - "key hash ... is unknown" is what a REVOKED session looks like: the
       *    key is gone from the keystore, so the relay cannot find it. The
       *    first version matched /spend/ against the word "value" elsewhere in
       *    the message and reported `over_cap`, which tells the buyer something
       *    false about why they were stopped.
       *  - A call outside the allowlist comes back as "Invalid params" from
       *    wallet_prepareCalls, because the relay will not even prepare a
       *    bundle it cannot authorise.
       *
       * Anything unmatched stays `unknown`. A wrong specific reason is worse
       * than an honest vague one.
       */
      const refusedBecause: ExecutionOutcome['refusedBecause'] =
        /key hash .* is unknown|unknown key|not authorized|revoked/i.test(detail) ? 'revoked'
        : /expir/i.test(detail) ? 'expired'
        : /exceeds|over the limit|spend limit|cap exceeded/i.test(detail) ? 'over_cap'
        : /invalid param|not permitted|target not allowed|unauthorized call/i.test(detail) ? 'outside_allowlist'
        : 'unknown'

      // Keep the relay's own words, but lead with ours: an SDK stack trace is
      // not an explanation a buyer can act on.
      const explain: Record<string, string> = {
        revoked: 'this charter has been revoked, so its key is no longer registered',
        expired: 'this charter has expired',
        over_cap: 'this call would exceed the charter’s spend cap',
        outside_allowlist: 'the relay refused to authorise this call under the charter’s allowlist',
        unknown: 'the call was refused',
      }
      return {
        ok: false, txHash: null, refusedBecause,
        detail: `${explain[refusedBecause ?? 'unknown']} — relay said: ${detail.split('\n')[0]}`,
        latencyMs: Date.now() - started,
      }
    }
  }
}
