import { WARRANT_DAYS } from './standing'

/** Display the same freshness window as standing; the worker may refresh a test sooner. */
export const WARRANT_TTL_MS = WARRANT_DAYS * 86_400_000
export { WARRANT_DAYS }
export function warrantDueAt(date: string | null): number | null {
  if (!date) return null
  const at = Date.parse(date)
  return Number.isFinite(at) ? at + WARRANT_TTL_MS : null
}
export function warrantIsStale(date: string | null, now = Date.now()): boolean {
  const due = warrantDueAt(date)
  return due !== null && now > due
}
