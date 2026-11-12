import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { capacityRecordSchema, capacityStagePassed, loadCapacityRecord } from './capacity-record'
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
