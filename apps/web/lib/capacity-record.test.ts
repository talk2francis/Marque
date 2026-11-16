import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { capacityHeadline, capacityRecordSchema, capacityStagePassed, loadCapacityRecord, shownCapacityRuns } from './capacity-record'
import historical from './capacity-record.json'

it('does not equate a completed 250-visitor hold with passing its latency targets', () => {
  const record = capacityRecordSchema.parse(historical)
  expect(record.runs[0]!.stages.map(capacityStagePassed)).toEqual([true, true, true, false])
  expect(record.runs[1]!.stages.every(stage => !capacityStagePassed(stage))).toBe(true)
  expect(capacityStagePassed({ ...record.runs[0]!.stages[0]!, passed: false })).toBe(false)
})
it('validates the runtime measurement file and falls back visibly for corrupt data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'marque-capacity-record-'))
  try {
    expect((await loadCapacityRecord(root)).source).toBe('bundled')
    await mkdir(join(root, 'docs/evidence'), { recursive: true })
    const file = join(root, 'docs/evidence/capacity-record.json')
    await writeFile(file, JSON.stringify(historical))
    expect((await loadCapacityRecord(root)).source).toBe('runtime')
    const corrupt = structuredClone(historical)
    corrupt.runs[0]!.stages[0]!.pageP95Ms = -1
    await writeFile(file, JSON.stringify(corrupt))
    expect((await loadCapacityRecord(root)).source).toBe('bundled')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('shows the latest run and marked milestones, and counts the rest without hiding them from the record', async () => {
  const runtime = capacityRecordSchema.parse(JSON.parse(await (await import('node:fs/promises')).readFile(join(__dirname, '../../../docs/evidence/capacity-record.json'), 'utf8')))
  const { shown, rest, restUnpassed } = shownCapacityRuns(runtime.runs)
  expect(shown[0]!.date).toBe([...runtime.runs].map(r => r.date).sort().at(-1))
  expect(shown.slice(1).every(r => r.featured)).toBe(true)
  expect(shown.length + rest).toBe(runtime.runs.length)
  expect(restUnpassed).toBeLessThanOrEqual(rest)
})

it('headlines the highest stage the latest run passed, and says so plainly when none passed', () => {
  const stage = (visitors: number, pageP95Ms: number, completed = true) => ({ visitors, requests: 100, requestsPerSecond: visitors * 0.75, pageP95Ms, apiP95Ms: 300, error5xxRate: 0, restarts: 0, completed })
  const run = (date: string, stages: ReturnType<typeof stage>[]) => ({ date, release: 'abcdef1', method: 'm', stages, processRestarts: 0 })
  const h = capacityHeadline([run('2026-11-16T15:29:00.000Z', [stage(25, 420), stage(50, 390), stage(100, 424), stage(250, 1279)]), run('2026-11-16T10:00:00.000Z', [stage(250, 500)])])
  expect(h).toMatchObject({ passed: true, visitors: 100, stages: [25, 50, 100] })
  expect(capacityHeadline([run('2026-11-17T00:00:00.000Z', [stage(25, 900)]), run('2026-11-16T00:00:00.000Z', [stage(100, 400)])])).toMatchObject({ passed: false })
  expect(capacityHeadline([])).toBeNull()
})
