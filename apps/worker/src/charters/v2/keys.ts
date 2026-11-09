import { sql } from 'drizzle-orm'
import { keccak256, parseAbi, parseEther, type Address, type Hex, type PublicClient } from 'viem'
import { deserializeSession, serializeSession, signerFromPrivateKey, type Session } from '@altananetwork/sdk'
import { chartersDb as db } from '@marque/db'
import { EXECUTORS, KIND_BY_CODE, OPEN_KINDS, AGENT_FOR_KIND, type CharterChainId, type CharterKind, type ReferenceAgent } from '@marque/charters'
import { deriveSessionKeyV2 } from '@marque/charters/session-key'
import { networkOf, type AltanaClient } from '../sessions.js'

/**
 * v2 Altana sessions (AGENTS.md C9): for every final, armed charter of a kind that uses Altana, one session key
 * per charter, owned by that kind's reference agent, whose only permission is act() on that charter, expiring with
 * it, registered on KeyStore, revoked when it ends or expires and verified both times. A named kind (grid, range)
 * gets a session only when the owner named the agent's executor: otherwise the key could never act.
 * Runs only in the short-lived charters-keys process, the one place agent admin keys are loaded.
 */
const keyStoreAbi = parseAbi(['function isValidKey(address user, bytes32 keyId) view returns (bool)'])
const RETRY_MS = 5 * 60_000
const FEE_CAP_PER_DAY = parseEther(process.env['CHARTERS_SESSION_FEE_CAP_BNB'] ?? '0.005')
const rowsOf = <T = Record<string, unknown>>(r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as T[]

export interface AgentAdmin { agent: ReferenceAgent; key: Hex; address: Address }

export function sessionForV2(master: Hex, chainId: CharterChainId, kind: CharterKind, charter: string, stored: unknown): Session {
  return deserializeSession(stored as Parameters<typeof deserializeSession>[0], signerFromPrivateKey(deriveSessionKeyV2(master, chainId, kind, charter)))
}

/** Whether a charter of this kind should carry an Altana session for its agent. */
export function wantsSession(kind: CharterKind, executors: string[], altanaKinds: ReadonlySet<CharterKind>): boolean {
  if (!altanaKinds.has(kind)) return false
  if (OPEN_KINDS.has(kind)) return true
  return executors.map((e) => e.toLowerCase()).includes(EXECUTORS[AGENT_FOR_KIND[kind]].toLowerCase())
}

export interface KeysPass { granted: number; revoked: number; skipped: number; failed: Array<{ charter: string; step: string; error: string }> }

export async function keysOnceV2(x: {
  client: PublicClient; altana: AltanaClient; chainId: CharterChainId; master: Hex
  admins: Map<ReferenceAgent, AgentAdmin>; altanaKinds: ReadonlySet<CharterKind>; dryRun: boolean
  log: (e: string, d: Record<string, unknown>) => void
}): Promise<KeysPass> {
  const out: KeysPass = { granted: 0, revoked: 0, skipped: 0, failed: [] }
  const valid = (wallet: Address, keyId: Hex) => x.client.readContract({ address: networkOf(x.chainId).keyStore, abi: keyStoreAbi, functionName: 'isValidKey', args: [wallet, keyId] })

  const toGrant = rowsOf<{ address: string; kind: number; executors: string[]; expires_at: string }>(await db().execute(sql`
    select c.address, c.kind, c.executors, c.expires_at from charter_v2 c
    left join charter_watch_key k on k.chain_id = c.chain_id and k.guard = c.address
    where c.chain_id = ${x.chainId} and c.final and c.ended_at is null and c.expires_at > now() + interval '10 minutes'
      and (k.guard is null or (k.status = 'failed' and k.updated_at < now() - make_interval(secs => ${RETRY_MS / 1000})))
    order by c.created_block limit 10`))
  for (const c of toGrant) {
    const kind = KIND_BY_CODE[c.kind]!
    const admin = x.admins.get(AGENT_FOR_KIND[kind])
    if (!wantsSession(kind, c.executors, x.altanaKinds) || !admin) {
      // Recorded once, so the charter does not crowd the grant queue: its agent acts directly or not at all.
      out.skipped += 1
      if (!x.dryRun) await db().execute(sql`insert into charter_watch_key (chain_id, guard, wallet_address, expiry, status, kind, agent, version, error, updated_at)
        values (${x.chainId}, ${c.address}, ${EXECUTORS[AGENT_FOR_KIND[kind]].toLowerCase()}, ${c.expires_at}, 'none', ${c.kind}, ${AGENT_FOR_KIND[kind]}, 2,
          ${admin ? 'no session for this charter: direct sends only' : 'agent admin key not loaded'}, now())
        on conflict (chain_id, guard) do nothing`)
      continue
    }
    if (x.dryRun) { x.log('v2_session_would_grant', { chainId: x.chainId, charter: c.address, kind }); continue }
    const expiry = Math.floor(new Date(c.expires_at).getTime() / 1000)
    await db().execute(sql`insert into charter_watch_key (chain_id, guard, wallet_address, expiry, status, kind, agent, version, updated_at)
      values (${x.chainId}, ${c.address}, ${admin.address.toLowerCase()}, ${new Date(expiry * 1000).toISOString()}, 'granting', ${c.kind}, ${admin.agent}, 2, now())
      on conflict (chain_id, guard) do update set status = 'granting', error = null, updated_at = now()`)
    try {
      const signer = signerFromPrivateKey(admin.key)
      const wallet = { address: admin.address }
      const granted = await x.altana.grantSession({
        wallet, signer, chainId: x.chainId,
        permissions: { calls: [{ to: c.address as Address, signature: 'act()' }], spend: [{ limit: FEE_CAP_PER_DAY, period: 'day' }] },
        expiry, sessionSigner: signerFromPrivateKey(deriveSessionKeyV2(x.master, x.chainId, kind, c.address)), register: true,
      })
      const keyId = keccak256(granted.publicKey)
      let ok = await valid(admin.address, keyId)
      if (!ok) {
        await x.altana.registerSessionKey({ wallet, signer, session: granted, chainId: x.chainId }).catch(() => null)
        ok = await valid(admin.address, keyId)
      }
      await db().execute(sql`update charter_watch_key set session_public_key = ${granted.publicKey}, key_id = ${keyId},
          session = ${JSON.stringify(serializeSession(granted))}::jsonb, grant_tx = ${granted.transactionHash ?? null}, registered = ${ok},
          status = ${ok ? 'registered' : 'failed'}, error = ${ok ? null : 'granted, but KeyStore does not show the key yet'}, updated_at = now(), last_checked_at = now()
        where chain_id = ${x.chainId} and guard = ${c.address}`)
      if (ok) out.granted += 1
      else out.failed.push({ charter: c.address, step: 'register', error: 'KeyStore does not show the key' })
      x.log('v2_session_granted', { chainId: x.chainId, charter: c.address, kind, agent: admin.agent, tx: granted.transactionHash ?? null, keyId, registered: ok })
    } catch (e) {
      const error = e instanceof Error ? e.message.slice(0, 300) : String(e)
      await db().execute(sql`update charter_watch_key set status = 'failed', error = ${error}, updated_at = now() where chain_id = ${x.chainId} and guard = ${c.address}`)
      out.failed.push({ charter: c.address, step: 'grant', error })
      x.log('v2_session_grant_failed', { chainId: x.chainId, charter: c.address, error })
    }
  }

  const toRevoke = rowsOf<{ guard: string; kind: number; agent: ReferenceAgent; session: unknown; key_id: string }>(await db().execute(sql`
    select k.guard, k.kind, k.agent, k.session, k.key_id from charter_watch_key k join charter_v2 c on c.chain_id = k.chain_id and c.address = k.guard
    where k.chain_id = ${x.chainId} and k.version = 2 and k.status in ('registered', 'revoking') and (c.ended_at is not null or c.expires_at <= now())
    limit 10`))
  for (const k of toRevoke) {
    const admin = x.admins.get(k.agent)
    if (!admin) continue
    if (x.dryRun) { x.log('v2_session_would_revoke', { chainId: x.chainId, charter: k.guard }); continue }
    await db().execute(sql`update charter_watch_key set status = 'revoking', updated_at = now() where chain_id = ${x.chainId} and guard = ${k.guard}`)
    try {
      let tx: string | null = null
      if (await valid(admin.address, k.key_id as Hex)) {
        const r = await x.altana.revokeSession({ wallet: { address: admin.address }, signer: signerFromPrivateKey(admin.key), session: sessionForV2(x.master, x.chainId, KIND_BY_CODE[k.kind]!, k.guard, k.session), chainId: x.chainId })
        tx = r.transactionHash ?? null
      }
      const after = await valid(admin.address, k.key_id as Hex)
      await db().execute(sql`update charter_watch_key set status = ${after ? 'revoking' : 'revoked'}, revoke_tx = coalesce(${tx}, revoke_tx),
          error = ${after ? 'revocation sent, KeyStore still shows the key' : null}, updated_at = now(), last_checked_at = now()
        where chain_id = ${x.chainId} and guard = ${k.guard}`)
      if (!after) out.revoked += 1
      x.log('v2_session_revoked', { chainId: x.chainId, charter: k.guard, tx, confirmed: !after })
    } catch (e) {
      const error = e instanceof Error ? e.message.slice(0, 300) : String(e)
      await db().execute(sql`update charter_watch_key set error = ${error}, updated_at = now() where chain_id = ${x.chainId} and guard = ${k.guard}`)
      out.failed.push({ charter: k.guard, step: 'revoke', error })
    }
  }
  return out
}
