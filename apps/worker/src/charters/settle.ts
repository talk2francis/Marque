/**
 * Terminal states for keeper attempts whose submission was never settled by a receipt or a relay status
 * (security review R-01 / MC-CL-001, R-03 / MC-CX-004, 18 Nov 2026).
 *
 * An attempt row is both a scheduling lease (one open attempt per charter, enforced by a partial unique index) and a
 * record of what was submitted. Before this module, a transaction that was dropped or replaced, or a relay call that
 * never settled, kept its row open for ever: the charter was then never acted on again and nothing said so. Closing
 * such a row is always safe, because every charter re-checks its own condition on chain: if the old submission does
 * land after all, a new one simply reverts (or, for a grid, makes the next trade the rules already allow).
 *
 * Superseded rows are still followed for a day, so a primary that lands after the backup took over is recorded with
 * its real outcome instead of staying "superseded".
 */

/** A sent transaction the node no longer knows (no receipt, no transaction) after this long is treated as dropped. */
export const DROPPED_AFTER_MS = 10 * 60_000
/** A relay call that has not reached a final status after this long is treated as never settling. */
export const RELAY_UNSETTLED_AFTER_MS = 30 * 60_000
/** How long a superseded submission is still followed for a late landing. */
export const LATE_LANDING_WINDOW_MS = 24 * 60 * 60_000

export type StaleOutcome = 'keep' | 'dropped' | 'unsettled'

/**
 * What to do with an open attempt that has no final answer yet.
 * - `tx`: a direct or backup transaction with no receipt. Dropped only when the node no longer knows it.
 * - `relay`: an Altana call whose relay status is still in flight.
 */
export function staleOutcome(x: { kind: 'tx' | 'relay'; sentAt: number | null; now: number; txKnown?: boolean }): StaleOutcome {
  if (x.sentAt === null || !Number.isFinite(x.sentAt)) return 'keep'
  const age = x.now - x.sentAt
  if (x.kind === 'tx') return x.txKnown === false && age >= DROPPED_AFTER_MS ? 'dropped' : 'keep'
  return age >= RELAY_UNSETTLED_AFTER_MS ? 'unsettled' : 'keep'
}

export const STALE_ERROR: Record<Exclude<StaleOutcome, 'keep'>, string> = {
  dropped: 'dropped: no receipt and the node no longer knows the transaction',
  unsettled: 'relay never settled within the window',
}

/** The terminal status a superseded submission takes when it lands late. */
export function lateLanding(outcome: 'success' | 'reverted' | 'confirmed' | 'failed'): { status: 'confirmed' | 'reverted' | 'failed'; error: string } {
  if (outcome === 'success' || outcome === 'confirmed') return { status: 'confirmed', error: 'landed after it was superseded' }
  if (outcome === 'reverted') return { status: 'reverted', error: 'landed after it was superseded, and reverted' }
  return { status: 'failed', error: 'superseded, and the relay reported failure' }
}

/**
 * True when a sent transaction should be closed as dropped: old enough, and the node answers that it does not know
 * the transaction. An RPC failure is never read as "unknown": the attempt then stays open and is checked again.
 */
export async function droppedTx(
  client: { getTransaction: (a: { hash: `0x${string}` }) => Promise<unknown> },
  hash: string,
  sentAt: string | null,
  now: number = Date.now(),
): Promise<boolean> {
  const sent = sentAt ? new Date(sentAt).getTime() : null
  // Cheap first: a young attempt is never dropped, so do not ask the node at all.
  if (staleOutcome({ kind: 'tx', sentAt: sent, now, txKnown: false }) === 'keep') return false
  try {
    const tx = await client.getTransaction({ hash: hash as `0x${string}` })
    return staleOutcome({ kind: 'tx', sentAt: sent, now, txKnown: tx != null }) === 'dropped'
  } catch (e) {
    const name = (e as { name?: string } | null)?.name ?? ''
    return name === 'TransactionNotFoundError' && staleOutcome({ kind: 'tx', sentAt: sent, now, txKnown: false }) === 'dropped'
  }
}
