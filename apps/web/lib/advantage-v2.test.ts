import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { keccak256 } from 'viem'
import { ADVANTAGE_V2 } from './advantage-v2.data'

const dir = join(__dirname, '../../../docs/advantage/v2')
describe('Advantage Report v2', () => {
  it('the page data is the published results file', () => {
    expect(JSON.parse(JSON.stringify(ADVANTAGE_V2))).toEqual(JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8')))
  })
  it('the locked hash is the spec file as committed, and the lock names it', () => {
    const lock = JSON.parse(readFileSync(join(dir, 'lock.json'), 'utf8'))
    expect(keccak256(readFileSync(join(dir, 'spec.json')))).toBe(lock.keccak256)
    expect(ADVANTAGE_V2.specKeccak256).toBe(lock.keccak256)
    expect(lock.inputData).toBe(`marque-advantage-v2 spec keccak256 ${lock.keccak256}`)
  })
  it('every task has an outcome under the pre-registered rule', () => {
    for (const t of ADVANTAGE_V2.tasks) expect(['win', 'loss', 'mixed']).toContain(t.outcome)
    expect(ADVANTAGE_V2.summary.win + ADVANTAGE_V2.summary.loss + ADVANTAGE_V2.summary.mixed).toBe(ADVANTAGE_V2.tasks.length)
  })
})
