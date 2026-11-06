import { z } from 'zod'

export const OUTSIDE_PATHS = ['/', '/register', '/proof', '/quest', '/api/v1/phase2/coverage', '/api/v1/proof'] as const
const Check = z.object({
  path: z.enum(OUTSIDE_PATHS), status: z.number().int().min(0).max(599),
  ttfbMs: z.number().finite().nonnegative().nullable(), totalMs: z.number().finite().nonnegative(),
  error: z.enum(['request_failed', 'body_limit']).nullable(),
})
export const OutsideObservation = z.object({
  version: z.literal(1), at: z.string().datetime(), checks: z.array(Check).length(OUTSIDE_PATHS.length),
}).refine(r => new Set(r.checks.map(c => c.path)).size === OUTSIDE_PATHS.length, 'One observation per route is required')
export type OutsideObservation = z.infer<typeof OutsideObservation>

export function summarizeOutside(texts: string[], now: number) {
  const runs = new Map<string, OutsideObservation>()
  for (const text of texts) for (const line of text.split('\n').filter(s => s.trim())) {
    const row = OutsideObservation.parse(JSON.parse(line))
    const at = Date.parse(row.at)
    if (at <= now && at >= now - 7 * 86_400_000) runs.set(row.at, row)
  }
  const sorted = [...runs.values()].sort((a, b) => a.at.localeCompare(b.at))
  const checks = sorted.flatMap(r => r.checks.map(c => ({ ...c, at: r.at })))
  const good = checks.filter(c => c.status === 200 && c.error === null).length
  const routes = OUTSIDE_PATHS.map(path => {
    const times = checks.filter(c => c.path === path).map(c => c.totalMs).sort((a, b) => a - b)
    return { path, p95Ms: times.length ? times[Math.ceil(times.length * .95) - 1]! : null }
  })
  const failures = checks.filter(c => c.status !== 200 || c.error !== null)
  return {
    runs: sorted.length, checks: checks.length, answered200: good,
    share200: checks.length ? good / checks.length : null,
    slowest: routes.filter((r): r is { path: typeof OUTSIDE_PATHS[number]; p95Ms: number } => r.p95Ms !== null).sort((a, b) => b.p95Ms - a.p95Ms)[0] ?? null,
    lastFailure: failures.at(-1) ?? null, firstAt: sorted[0]?.at ?? null, lastAt: sorted.at(-1)?.at ?? null,
  }
}
