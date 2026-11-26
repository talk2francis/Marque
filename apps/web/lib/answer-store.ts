import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, jobAnswer } from '@marque/db'
import type { Manifest } from './manifest'

/**
 * Marque's own copy of each delivered answer (26 Nov 2026).
 *
 * Sellers often serve answers from temporary hosts (a tunnel, a laptop). Before this, Marque's only copy was a
 * 24-hour cache entry: once nobody opened a job room for a day and the seller's host had gone, the room said the
 * file could not be read although the chain still held its hash. Here the original bytes are kept the first time
 * they verify against the on-chain hash, and the reader (manifestFromStored) re-checks them against the hash on
 * every read, so a row can never show something the chain did not commit to.
 */

/** Answers above this are still shown when their host serves them, but not copied (bounds what a spammer can store). */
export const KEEP_ANSWER_MAX_BYTES = 128 * 1024

export interface StoredAnswer { matches: true; hash: string; raw: string; url: string | null; source: string | null }

export async function readKeptAnswer(chainId: number, jobId: string, hash: string): Promise<StoredAnswer | null> {
  const rows = await db().select({ hash: jobAnswer.hash, raw: jobAnswer.raw, url: jobAnswer.url, source: jobAnswer.source })
    .from(jobAnswer)
    .where(and(eq(jobAnswer.chainId, chainId), eq(jobAnswer.jobId, jobId), eq(jobAnswer.hash, hash.toLowerCase())))
    .limit(1)
  const r = rows[0]
  return r ? { matches: true, hash: r.hash, raw: r.raw, url: r.url, source: r.source } : null
}

/** Whether a read answer is worth keeping: verified against the chain hash, original bytes, within the size bound. */
export function keepable(m: Manifest | null, hash: string | null): m is Manifest {
  return Boolean(m && hash && m.matches === true && !m.withheld && m.raw
    && m.hash.toLowerCase() === hash.toLowerCase()
    && new TextEncoder().encode(m.raw).length <= KEEP_ANSWER_MAX_BYTES)
}

/** Keep the first verified copy; later reads never replace it. */
export async function keepAnswer(chainId: number, jobId: string, m: Manifest): Promise<void> {
  await db().insert(jobAnswer).values({
    chainId, jobId, hash: m.hash.toLowerCase(), raw: m.raw, url: m.url ?? null, source: m.source ?? null,
    hashAlgorithm: m.hashAlgorithm ?? 'keccak256',
  }).onConflictDoNothing()
}
