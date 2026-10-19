export interface QuoteProbeObservation {
  at: number
  ok: boolean
  expiresAt?: number
}

/** Maximum healthy cadence and unchanged failure backoff, in minutes. */
export function quoteIntervalMinutes(firstParty: boolean, lastOk: boolean | null): number {
  if (firstParty) return lastOk === false ? 1 : 10
  return lastOk ? 30 : 360
}

/** Poll before the provider's terms expire; never modify those terms. */
export function nextQuoteProbeAt(firstParty: boolean, last: QuoteProbeObservation): number {
  const interval = quoteIntervalMinutes(firstParty, last.ok)
  const ordinary = last.at + interval * 60_000
  if (!last.ok || !Number.isFinite(last.expiresAt)) return ordinary
  const lifetime = last.expiresAt! - last.at
  const lead = Math.min(120_000, Math.max(30_000, lifetime / 4))
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
