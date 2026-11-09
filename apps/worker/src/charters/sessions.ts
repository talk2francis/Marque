import { sql } from 'drizzle-orm'
import { keccak256, parseAbi, parseEther, type Address, type Hex, type PublicClient } from 'viem'
import { BNB, BNB_TESTNET, createClient, deserializeSession, serializeSession, signerFromPrivateKey, type Session } from '@altananetwork/sdk'
import { chartersDb as db } from '@marque/db'
import type { CharterChainId } from '@marque/charters'
import { deriveSessionKey } from '@marque/charters/session-key'

/**
 * Keel's Altana sessions (AGENTS.md C7): for every final, armed guard, one session key whose only permission is
 * act() on that guard, expiring with the guard, registered on KeyStore. Revoked when the guard ends or expires.
 * Every state is checked on chain before it is recorded; the database holds only the session's public half.
 * A failure never blocks watching: the backup path and the owner cover the guard meanwhile.
 */
const keyStoreAbi = parseAbi(['function isValidKey(address user, bytes32 keyId) view returns (bool)'])
const RETRY_MS = 5 * 60_000
/** Native relay-fee allowance per session per day: a few actions at the measured testnet fee (0.00045 tBNB). */
const FEE_CAP_PER_DAY = parseEther(process.env['CHARTERS_SESSION_FEE_CAP_BNB'] ?? '0.005')

export const networkOf = (chainId: CharterChainId) => (chainId === 56 ? BNB : BNB_TESTNET)
const rowsOf = <T = Record<string, unknown>>(r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as T[]

export interface Keel {
  key: Hex
  address: Address
  master: Hex
}

export type AltanaClient = ReturnType<typeof createClient>

/** An Altana client for exactly the chains the worker runs on, with Keel's account set up on each (no transaction). */
export async function altanaFor(chains: CharterChainId[], keel: Keel): Promise<AltanaClient> {
  const client = createClient({ chains: chains.map(networkOf), defaultChainId: chains[0] })
  const w = await client.createWallet({ signer: signerFromPrivateKey(keel.key) })
  if (w.address.toLowerCase() !== keel.address.toLowerCase()) throw new Error('Altana wallet is not the watcher address')
  return client
}

/** The live Session for a guard, rebuilt from its stored public half and the derived key. */
export function sessionFor(keel: Keel, chainId: CharterChainId, guard: string, stored: unknown): Session {
  return deserializeSession(stored as Parameters<typeof deserializeSession>[0], signerFromPrivateKey(deriveSessionKey(keel.master, chainId, guard)))
}

async function keyIsValid(client: PublicClient, chainId: CharterChainId, wallet: Address, keyId: Hex): Promise<boolean> {
  return client.readContract({ address: networkOf(chainId).keyStore, abi: keyStoreAbi, functionName: 'isValidKey', args: [wallet, keyId] })
}

export interface SessionPass { granted: number; revoked: number; failed: Array<{ guard: string; step: string; error: string }> }

export async function sessionsOnce(client: PublicClient, altana: AltanaClient, chainId: CharterChainId, keel: Keel, opts: { dryRun: boolean; log: (e: string, d: Record<string, unknown>) => void }): Promise<SessionPass> {
  const out: SessionPass = { granted: 0, revoked: 0, failed: [] }
  const admin = signerFromPrivateKey(keel.key)
  const wallet = { address: keel.address }

  // Grant: final, not ended, not expired, at least ten minutes left, and no key yet (or a failure old enough to retry).
  const toGrant = rowsOf<{ address: string; expires_at: string }>(await db().execute(sql`
    select g.address, g.expires_at from charter_guard g
    left join charter_watch_key k on k.chain_id = g.chain_id and k.guard = g.address
    where g.chain_id = ${chainId} and g.final and g.ended_at is null and g.expires_at > now() + interval '10 minutes'
      and (k.guard is null or (k.status = 'failed' and k.updated_at < now() - make_interval(secs => ${RETRY_MS / 1000})))
    order by g.created_block limit 10`))
  for (const g of toGrant) {
    const expiry = Math.floor(new Date(g.expires_at).getTime() / 1000)
    if (opts.dryRun) { opts.log('session_would_grant', { chainId, guard: g.address }); continue }
    await db().execute(sql`insert into charter_watch_key (chain_id, guard, wallet_address, expiry, status, updated_at)
      values (${chainId}, ${g.address}, ${keel.address.toLowerCase()}, ${new Date(expiry * 1000).toISOString()}, 'granting', now())
      on conflict (chain_id, guard) do update set status = 'granting', error = null, updated_at = now()`)
    try {
      const granted = await altana.grantSession({
        wallet, signer: admin, chainId,
        permissions: { calls: [{ to: g.address as Address, signature: 'act()' }], spend: [{ limit: FEE_CAP_PER_DAY, period: 'day' }] },
        expiry, sessionSigner: signerFromPrivateKey(deriveSessionKey(keel.master, chainId, g.address)), register: true,
      })
      const keyId = keccak256(granted.publicKey)
      let valid = await keyIsValid(client, chainId, keel.address, keyId)
      if (!valid) {
        await altana.registerSessionKey({ wallet, signer: admin, session: granted, chainId }).catch(() => null)
        valid = await keyIsValid(client, chainId, keel.address, keyId)
      }
      await db().execute(sql`update charter_watch_key set session_public_key = ${granted.publicKey}, key_id = ${keyId},
          session = ${JSON.stringify(serializeSession(granted))}::jsonb, grant_tx = ${granted.transactionHash ?? null}, registered = ${valid},
          status = ${valid ? 'registered' : 'failed'}, error = ${valid ? null : 'granted, but KeyStore does not show the key yet'}, updated_at = now(), last_checked_at = now()
        where chain_id = ${chainId} and guard = ${g.address}`)
      if (valid) out.granted += 1
      else out.failed.push({ guard: g.address, step: 'register', error: 'KeyStore does not show the key' })
      opts.log('session_granted', { chainId, guard: g.address, tx: granted.transactionHash ?? null, keyId, registered: valid })
    } catch (e) {
      const error = e instanceof Error ? e.message.slice(0, 300) : String(e)
      await db().execute(sql`update charter_watch_key set status = 'failed', error = ${error}, updated_at = now() where chain_id = ${chainId} and guard = ${g.address}`)
      out.failed.push({ guard: g.address, step: 'grant', error })
      opts.log('session_grant_failed', { chainId, guard: g.address, error })
    }
  }

  // Revoke: the guard ended or expired and Keel's key may still be live.
  const toRevoke = rowsOf<{ guard: string; session: unknown; key_id: string }>(await db().execute(sql`
    select k.guard, k.session, k.key_id from charter_watch_key k join charter_guard g on g.chain_id = k.chain_id and g.address = k.guard
    where k.chain_id = ${chainId} and k.status in ('registered', 'revoking') and (g.ended_at is not null or g.expires_at <= now())
    limit 10`))
  for (const k of toRevoke) {
    if (opts.dryRun) { opts.log('session_would_revoke', { chainId, guard: k.guard }); continue }
    await db().execute(sql`update charter_watch_key set status = 'revoking', updated_at = now() where chain_id = ${chainId} and guard = ${k.guard}`)
    try {
      // An expired key is already refused by the account; revoking it keeps KeyStore reads honest.
      const stillValid = await keyIsValid(client, chainId, keel.address, k.key_id as Hex)
      let tx: string | null = null
      if (stillValid) {
        const r = await altana.revokeSession({ wallet, signer: admin, session: sessionFor(keel, chainId, k.guard, k.session), chainId })
        tx = r.transactionHash ?? null
      }
      const after = await keyIsValid(client, chainId, keel.address, k.key_id as Hex)
      await db().execute(sql`update charter_watch_key set status = ${after ? 'revoking' : 'revoked'}, revoke_tx = coalesce(${tx}, revoke_tx),
          error = ${after ? 'revocation sent, KeyStore still shows the key' : null}, updated_at = now(), last_checked_at = now()
        where chain_id = ${chainId} and guard = ${k.guard}`)
      if (!after) out.revoked += 1
      opts.log('session_revoked', { chainId, guard: k.guard, tx, confirmed: !after })
    } catch (e) {
      const error = e instanceof Error ? e.message.slice(0, 300) : String(e)
      await db().execute(sql`update charter_watch_key set error = ${error}, updated_at = now() where chain_id = ${chainId} and guard = ${k.guard}`)
      out.failed.push({ guard: k.guard, step: 'revoke', error })
      opts.log('session_revoke_failed', { chainId, guard: k.guard, error })
    }
  }
  return out
}
