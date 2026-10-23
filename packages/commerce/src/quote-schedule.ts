export interface QuoteProbeObservation {
  at: number
  ok: boolean
  expiresAt?: number
  /** Consecutive failed observations ending with this one (0 when it succeeded). */
  failStreak?: number
  /** The last successful observation, if any. */
  lastOkAt?: number | null
}

/** Backoff for a seller that was hireable in the last day and then failed (SPEC-SUPPLY 3, cadence). */
export const RECOVERY_BACKOFF_MINUTES = [1, 2, 5, 15, 30] as const
export const RECENTLY_HIREABLE_MS = 24 * 3_600_000

/** Maximum healthy cadence and unchanged failure backoff, in minutes. */
export function quoteIntervalMinutes(firstParty: boolean, lastOk: boolean | null): number {
  if (firstParty) return lastOk === false ? 1 : 10
  return lastOk ? 30 : 360
}

/** Poll before the provider's terms expire; never modify those terms. */
export function nextQuoteProbeAt(firstParty: boolean, last: QuoteProbeObservation): number {
  // A seller that priced within the last day and then failed (a transient error, a lapsed
  // quote) is retried on a short ladder instead of waiting six hours (V4-00: two hireable
  // agents went dark this way).
  if (!last.ok && !firstParty && last.lastOkAt && last.at - last.lastOkAt < RECENTLY_HIREABLE_MS) {
    const step = RECOVERY_BACKOFF_MINUTES[Math.min(Math.max((last.failStreak ?? 1) - 1, 0), RECOVERY_BACKOFF_MINUTES.length - 1)]!
    return last.at + step * 60_000
  }
  const interval = quoteIntervalMinutes(firstParty, last.ok)
  const ordinary = last.at + interval * 60_000
  if (!last.ok || !Number.isFinite(last.expiresAt)) return ordinary
  const lifetime = last.expiresAt! - last.at
  // Refresh at 80% of the quote's life, never closer than 30 s to its expiry.
  const lead = Math.max(30_000, lifetime * 0.2)
  // Very short-lived terms cannot justify an unbounded polling loop.
  return Math.max(last.at + 60_000, Math.min(ordinary, last.expiresAt! - lead))
}

export function dueQuoteProbes<T extends { serviceId: number; firstParty: unknown | null; advertisesCommerce: boolean }>(
  candidates: readonly T[], last: ReadonlyMap<number, QuoteProbeObservation>, now: number, limit: number,
): T[] {
  const at = (c: T) => {
    const observation = last.get(c.serviceId)
    return observation ? nextQuoteProbeAt(c.firstParty !== null, observation) : Number.NEGATIVE_INFINITY
  }
  const priority = (c: T) => c.firstParty !== null ? 0 : last.get(c.serviceId)?.ok ? 1 : c.advertisesCommerce ? 2 : 3
  return candidates.filter(c => at(c) <= now)
    .sort((a, b) => priority(a) - priority(b) || at(a) - at(b) || a.serviceId - b.serviceId)
    .slice(0, limit)
}
