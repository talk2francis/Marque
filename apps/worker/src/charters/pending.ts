import { V2, type CharterChainId } from '@marque/charters'
import { sessionGrantQueue, sessionRevokeQueue } from './sessions.js'
import { v2GrantQueue, v2RevokeQueue } from './v2/keys.js'

export interface PendingKeyWork { chainId: CharterChainId; v1Grants: number; v1Revokes: number; v2Grants: number; v2Revokes: number }

/** The four queues a key pass would work through on one chain. Exported with injectable readers for the tests. */
export interface KeyQueues {
  v1Grants(chainId: CharterChainId): Promise<unknown[]>
  v1Revokes(chainId: CharterChainId): Promise<unknown[]>
  v2Grants(chainId: CharterChainId): Promise<unknown[]>
  v2Revokes(chainId: CharterChainId): Promise<unknown[]>
}
const LIVE: KeyQueues = { v1Grants: sessionGrantQueue, v1Revokes: sessionRevokeQueue, v2Grants: v2GrantQueue, v2Revokes: v2RevokeQueue }

/**
 * What a key pass would find to do, read without any key (S11 stays intact: admin keys are still loaded only by the
 * short-lived charters-keys process, and only when this says there is work).
 *
 * It runs the very queries the pass runs, so it counts every case the pass acts on: a new armed charter, a failed
 * grant old enough to retry, an ended or expired charter whose session is registered, and a revocation not yet
 * confirmed. A v2 charter that needs no session also counts once: the pass records it and it leaves the queue.
 * v2 is read only where v2 is deployed, exactly as the pass does.
 */
export async function pendingKeyWork(chains: readonly CharterChainId[], hasV2: (c: CharterChainId) => boolean = (c) => V2[c].fromBlock !== null, queues: KeyQueues = LIVE): Promise<PendingKeyWork[]> {
  const out: PendingKeyWork[] = []
  for (const chainId of chains) {
    const v2 = hasV2(chainId)
    const [g1, r1, g2, r2] = await Promise.all([
      queues.v1Grants(chainId), queues.v1Revokes(chainId),
      v2 ? queues.v2Grants(chainId) : Promise.resolve([]), v2 ? queues.v2Revokes(chainId) : Promise.resolve([]),
    ])
    out.push({ chainId, v1Grants: g1.length, v1Revokes: r1.length, v2Grants: g2.length, v2Revokes: r2.length })
  }
  return out
}

export const anyKeyWork = (pending: readonly PendingKeyWork[]) => pending.some((p) => p.v1Grants + p.v1Revokes + p.v2Grants + p.v2Revokes > 0)
