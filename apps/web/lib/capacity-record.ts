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
  note: z.string().optional(), evidenceUrl: z.string().url().refine(url => url.startsWith('https://')).optional(),
})
export const capacityRecordSchema = z.object({ runs: z.array(run).min(1).max(32) })
export type CapacityStage = z.infer<typeof stage>

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
