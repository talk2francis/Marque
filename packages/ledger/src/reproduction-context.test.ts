import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ row: {} as Record<string, unknown>, writes: [] as Array<{ table: unknown; value: Record<string, unknown> }> }))
vi.mock('@marque/db', async importOriginal => {
  const actual = await importOriginal<typeof import('@marque/db')>()
  return { ...actual, db: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [state.row] }) }) }),
    insert: (table: unknown) => ({ values: async (value: Record<string, unknown>) => { state.writes.push({ table, value }) } }),
  }) }
})
vi.mock('@marque/chain', () => ({
  publicClient: () => ({ getBlockNumber: async () => 200n, getBlock: async () => ({ hash: `0x${'1'.repeat(64)}` }) }),
  archiveClient: () => null,
}))
import { benchmarkRun } from '@marque/db'
import { BENCHMARKS } from './benchmarks.js'
import { runAgentArm } from './runner.js'
import { hashContent } from './manifest.js'
import { buildRubric, rubricHash } from './rubric.js'
const spec = BENCHMARKS[0]!
beforeEach(() => {
  state.writes = []
  state.row = { id: spec.id, task: spec.task({ block: '123' }), taskHash: hashContent(spec.task({ block: '123' })),
    inputHash: hashContent(spec.input), rubricVersion: '1.0', rubricHash: rubricHash(buildRubric(spec.category)) }
})
afterEach(() => vi.unstubAllGlobals())

it('records a reproduction at its own block without replacing the registered comparison', async () => {
  const before = JSON.stringify(state.row)
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ result: { artifacts: [{ parts: [{ text: JSON.stringify({ blockNumber: '200' }) }] }] } }), { headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetcher)
  expect((await runAgentArm(spec, 1, { baseUrl: 'https://example.invalid', batch: 'repro-200' })).ok).toBe(true)
  expect(JSON.stringify(state.row)).toBe(before)
  expect(state.writes).toHaveLength(1)
  expect(state.writes[0]!.table).toBe(benchmarkRun)
  expect(state.writes[0]!.value.blockNumber).toBe('200')
  expect((state.writes[0]!.value.manifest as Record<string, unknown>).task_hash).toBe(hashContent(spec.task({ block: '200' })))
})

it.each(['inputHash', 'rubricHash'])('rejects a changed %s without writing or calling an agent', async field => {
  state.row[field] = hashContent('changed')
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
  await expect(runAgentArm(spec, 1, { baseUrl: 'https://example.invalid', batch: 'repro-200' })).rejects.toThrow('reproduction inputs or rubric differ')
  expect(state.writes).toEqual([])
  expect(fetcher).not.toHaveBeenCalled()
})
