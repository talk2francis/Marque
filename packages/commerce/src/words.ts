/** Pure display words, importable by always-on UI without the network config (no imports). */

/** "just now", "4 min ago", "3 h ago": the age of an observation at `now`. */
export function ageWords(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 90) return 'just now'
  if (s < 5400) return `${Math.round(s / 60)} min ago`
  if (s < 172_800) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86_400)} days ago`
}

/** Format a raw token amount for people: truncates to `maxDp`, trims trailing zeros, and says "<0.000001" rather than show a nonzero amount as 0. */
/** Money reads with at least two decimals ("0.10 U", never "0.1 U"), at most `maxDp`. */
export function formatAmount(raw: bigint | string, decimals: number, maxDp = 6, minDp = 2): string {
  const v = typeof raw === 'bigint' ? raw : BigInt(raw)
  const neg = v < 0n
  const abs = neg ? -v : v
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const frac = (abs % base).toString().padStart(decimals, '0').slice(0, maxDp).replace(/0+$/, '')
  if (!frac && whole === 0n && abs !== 0n) return `${neg ? '-' : ''}<0.${'0'.repeat(maxDp - 1)}1`
  const shown = frac.padEnd(Math.min(minDp, maxDp), '0')
  return `${neg ? '-' : ''}${whole.toString()}${shown ? `.${shown}` : ''}`
}
