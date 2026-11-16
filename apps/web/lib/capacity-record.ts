import 'server-only'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import bundled from './capacity-record.json'

const number = z.number().finite().nonnegative()
const stage = z.object({
  visitors: number.int(), requests: number.int(), requestsPerSecond: number,
  pageP95Ms: number, apiP95Ms: number, error5xxRate: number.max(1),
  restarts: number.int(), completed: z.boolean(), peakVus: number.int().optional(), passed: z.boolean().optional(),
})
const run = z.object({
  date: z.string().datetime(), release: z.string().regex(/^[a-f0-9]{7,40}$/), method: z.string(),
  stages: z.array(stage).min(1).max(16), processRestarts: number.int(), betweenStageRestarts: number.int().optional(),
  note: z.string().optional(), featured: z.boolean().optional(), evidenceUrl: z.string().url().refine(url => url.startsWith('https://')).optional(),
})
export const capacityRecordSchema = z.object({ runs: z.array(run).min(1).max(32) })
export type CapacityStage = z.infer<typeof stage>
export type CapacityRun = z.infer<typeof run>

/** Completing a hold is necessary, but does not mean its targets passed. */
export function capacityStagePassed(value: CapacityStage): boolean {
  return value.passed !== false && value.completed && value.pageP95Ms < 800 && value.apiP95Ms < 1500
    && value.error5xxRate < 0.005 && value.restarts === 0
}

/** Measurement updates need no application rebuild. Only validated aggregate data is read. */
export async function loadCapacityRecord(root = process.env['MARQUE_ROOT'] ?? process.cwd()) {
  try {
    const record = capacityRecordSchema.parse(JSON.parse(await readFile(join(root, 'docs/evidence/capacity-record.json'), 'utf8')))
    return { record, source: 'runtime' as const }
  } catch {
    return { record: capacityRecordSchema.parse(bundled), source: 'bundled' as const }
  }
}

/** The latest run and the runs marked as milestones are shown in full; the rest are counted and linked. */
export function shownCapacityRuns(runs: readonly CapacityRun[]) {
  const sorted = [...runs].sort((a, b) => b.date.localeCompare(a.date))
  const shown = sorted.filter((r, i) => i === 0 || r.featured)
  const rest = sorted.filter((r, i) => i !== 0 && !r.featured)
  return { shown, rest: rest.length, restUnpassed: rest.filter((r) => !r.stages.some(capacityStagePassed)).length }
}

/** The highest stage the latest run passed, for a headline that always matches the record (16 Nov 2026). */
export function capacityHeadline(runs: readonly CapacityRun[]) {
  const latest = [...runs].sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!latest) return null
  const passed = latest.stages.filter(capacityStagePassed)
  const top = [...passed].sort((a, b) => b.visitors - a.visitors)[0]
  if (!top) return { passed: false as const, date: latest.date, evidenceUrl: latest.evidenceUrl ?? null }
  return {
    passed: true as const, visitors: top.visitors, requestsPerSecond: top.requestsPerSecond, pageP95Ms: top.pageP95Ms, apiP95Ms: top.apiP95Ms,
    error5xxRate: top.error5xxRate, stages: passed.map((s) => s.visitors).sort((a, b) => a - b), date: latest.date, evidenceUrl: latest.evidenceUrl ?? null,
  }
}
