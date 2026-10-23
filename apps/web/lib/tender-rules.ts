import type { MarketRow } from '../app/register/market-model'

/** Tender candidate rules (SPEC-SUPPLY 5), pure so they are tested directly. */
export const TENDER_MAX = 8

/** Best evidence first: Warranted, then more delivered jobs, then tested (pass or fail), then rating. */
export function evidenceRank(a: Pick<MarketRow, 'warrant' | 'track'>): number {
  const w = a.warrant.status === 'warranted' ? 3 : a.warrant.status === 'failed' ? 1 : 0
  return w * 1_000_000 + Math.min(a.track.jobs.delivered, 9_999) * 100 + Math.round((a.track.verified.averageStars ?? 0) * 10)
}

/** At most one per operator, at most two reference agents, TENDER_MAX in all. */
export function pickCandidates<T extends Pick<MarketRow, 'isReference' | 'owner' | 'warrant' | 'track'>>(rows: readonly T[]): T[] {
  const out: T[] = []
  const operators = new Set<string>()
  let reference = 0
  for (const r of [...rows].sort((x, y) => evidenceRank(y) - evidenceRank(x))) {
    if (out.length >= TENDER_MAX) break
    const op = (r.owner ?? '').toLowerCase()
    if (op && operators.has(op)) continue
    if (r.isReference && reference >= 2) continue
    if (op) operators.add(op)
    if (r.isReference) reference++
    out.push(r)
  }
  return out
}

/** The task's shape for unmet-demand counts: field names and plain values, never an address. */
export function taskShape(category: string, fields: Record<string, unknown>): Record<string, unknown> {
  const shape: Record<string, unknown> = { category }
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)) shape[k] = 'address'
    else if (k === 'positionId') shape[k] = 'set'
    else if (k === 'amount' || k === 'capitalUsd') shape[k] = Number(v) >= 25_000 ? '25k+' : Number(v) >= 1_000 ? '1k-25k' : 'under 1k'
    else shape[k] = v
  }
  return shape
}

