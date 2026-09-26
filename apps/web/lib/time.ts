/**
 * Dates for people, always in UTC and always the same shape ("26 Sep", "26 Sep 18:43 UTC").
 * Built by hand: Intl's en-GB writes "Sept", and locale output differs between Node and browsers.
 */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

function toDate(v: string | number | Date): Date | null {
  const d = v instanceof Date ? v : new Date(v)
  return Number.isFinite(d.getTime()) ? d : null
}

/** "26 Sep" */
export function utcDay(v: string | number | Date): string {
  const d = toDate(v)
  return d ? `${d.getUTCDate()} ${MON[d.getUTCMonth()]}` : String(v)
}

/** "26 Sep 18:43 UTC" */
export function utcStamp(v: string | number | Date): string {
  const d = toDate(v)
  return d ? `${utcDay(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC` : String(v)
}

/** "2m", "3h", "4d": the age of a past moment. */
export function ageShort(v: string | number | Date, now = Date.now()): string {
  const d = toDate(v)
  if (!d) return ''
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}
