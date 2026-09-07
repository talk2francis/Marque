import 'server-only'
import { gte, sql } from 'drizzle-orm'
import { db, charter as charterTable } from '@marque/db'

/**
 * Rate limits on the two endpoints that cost money.
 *
 * Granting a charter writes a transaction, and the testnet wallet holds a
 * finite amount of tBNB. An unmetered public grant button is a faucet drain
 * waiting to happen, and the failure mode is the worst one available: the demo
 * stops working during judging.
 *
 * In-process counters are enough here — there is one web process, and a limiter
 * that needs Redis to work is a limiter that silently stops working when Redis
 * does. The daily ceiling is counted in Postgres, which is durable, so a
 * restart cannot reset it.
 */

const PER_IP_WINDOW_MS = 60_000
const PER_IP_MAX = 2
const DAILY_VISITOR_GRANTS = Number(process.env['MARQUE_DAILY_GRANT_CAP'] ?? 40)

/**
 * The free conformance tool is limited too, but for a different reason and at
 * a different rate. It spends chain reads and someone else's endpoint, not
 * tBNB, and it is meant to be USED — a builder iterating on a failing agent
 * will legitimately run it several times a minute. Sharing the charter limiter
 * both throttled it far too hard and told the caller the run had been refused
 * because "granting a charter writes a transaction", which it does not.
 */
const TEST_TOOL_MAX = 6

/**
 * The claim rail (P10a) is a four-step flow — resolve identity, verify a
 * signature, run the Standard, publish — so a single builder legitimately
 * makes several calls in a minute. It spends chain reads and one endpoint
 * call, never tBNB, so it gets its own, looser allowance.
 */
const CLAIM_MAX = 15

const hits = new Map<string, number[]>()
const testHits = new Map<string, number[]>()
const claimHits = new Map<string, number[]>()

export interface LimitVerdict {
  ok: boolean
  /** What to tell the caller, in words they can act on. */
  detail?: string
  retryAfterSeconds?: number
}

export function clientKey(headers: Headers): string {
  // Behind Caddy, so the forwarded header is the real client. It is attacker-
  // controlled, which is fine for a courtesy limit and is why the daily cap
  // below exists as the real ceiling.
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip') || 'unknown'
}

export function checkBurst(key: string): LimitVerdict {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < PER_IP_WINDOW_MS)
  if (recent.length >= PER_IP_MAX) {
    const oldest = recent[0] ?? now
    const retry = Math.ceil((PER_IP_WINDOW_MS - (now - oldest)) / 1000)
    return {
      ok: false,
      retryAfterSeconds: retry,
      detail: `granting a charter writes a transaction, so this is limited to ${PER_IP_MAX} a minute. Try again in ${retry}s.`,
    }
  }
  recent.push(now)
  hits.set(key, recent)
  return { ok: true }
}

/** The free conformance tool's own limit, with its own honest reason. */
export function checkTestBurst(key: string): LimitVerdict {
  const now = Date.now()
  const recent = (testHits.get(key) ?? []).filter((t) => now - t < PER_IP_WINDOW_MS)
  if (recent.length >= TEST_TOOL_MAX) {
    const oldest = recent[0] ?? now
    const retry = Math.ceil((PER_IP_WINDOW_MS - (now - oldest)) / 1000)
    return {
      ok: false,
      retryAfterSeconds: retry,
      detail: `Each run captures fresh chain state, so the free tester is limited to ${TEST_TOOL_MAX} runs a minute. Try again in ${retry}s.`,
    }
  }
  recent.push(now)
  testHits.set(key, recent)
  return { ok: true }
}

/** The claim rail's own limit — looser than the tester, same honest framing. */
export function checkClaimBurst(key: string): LimitVerdict {
  const now = Date.now()
  const recent = (claimHits.get(key) ?? []).filter((t) => now - t < PER_IP_WINDOW_MS)
  if (recent.length >= CLAIM_MAX) {
    const oldest = recent[0] ?? now
    const retry = Math.ceil((PER_IP_WINDOW_MS - (now - oldest)) / 1000)
    return {
      ok: false,
      retryAfterSeconds: retry,
      detail: `The claim flow is limited to ${CLAIM_MAX} steps a minute. Try again in ${retry}s.`,
    }
  }
  recent.push(now)
  claimHits.set(key, recent)
  return { ok: true }
}

export async function checkDailyCeiling(): Promise<LimitVerdict> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(charterTable)
    .where(gte(charterTable.grantedAt, since))
  const used = row?.n ?? 0
  if (used >= DAILY_VISITOR_GRANTS) {
    return {
      ok: false,
      detail: `Marque's testnet wallet funds every demo grant, and it has issued its ${DAILY_VISITOR_GRANTS} charters for today. The charters already granted are all on this page and still revocable.`,
    }
  }
  return { ok: true }
}
