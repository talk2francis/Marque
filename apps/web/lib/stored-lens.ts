import type { JobLens } from './lens'

/** Reuse complete saved historical checks; live comparisons use their own readers. */
export function reusableStoredLens(value: JobLens, expectedHash?: string | null): boolean {
  if (!value || value.stored !== true || value.state !== 'decided' || !Array.isArray(value.checks) || !value.checks.length) return false
  const manifest = value.manifest
  if (!manifest || manifest.matches !== true || !/^0x[0-9a-fA-F]{64}$/.test(manifest.hash ?? '') || !manifest.raw) return false
  if (expectedHash !== undefined && manifest.hash!.toLowerCase() !== expectedHash?.toLowerCase()) return false
  if (value.checks.some(c => !c || !['match', 'differs', 'holds', 'fails'].includes(c.state) || !['chain', 'arithmetic'].includes(c.how))) return false
  if (value.checks.some(c => c.how === 'chain') && !/^\d{6,12}$/.test(value.checkedAtBlock ?? '')) return false
  const agreed = value.checks.filter(c => c.state === 'match' || c.state === 'holds').length
  return value.summary?.checked === value.checks.length && value.summary.agreed === agreed
}
