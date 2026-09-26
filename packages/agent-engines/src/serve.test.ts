import { describe, expect, it } from 'vitest'
import { engineRunWork } from './serve.js'
import type { Engine } from './types.js'

function fake(answers: Array<Record<string, unknown>>): Engine & { calls: number } {
  const e = {
    calls: 0,
    meta: { id: 'fake', name: 'Fake', category: 'yield', testId: null, description: '', priceUsd: 0, skills: [] },
    inspect: () => ({ missing: [], assumptions: [] }),
    async run() { return answers[Math.min(e.calls++, answers.length - 1)] as Record<string, unknown> },
  } as Engine & { calls: number }
  return e
}

describe('engineRunWork, the paid path', () => {
  it('retries an upstream timeout and delivers the answer', async () => {
    const e = fake([{ error: 'the Venus Comptroller did not answer within 6000ms' }, { healthFactor: 1.143 }])
    const out = await engineRunWork(e, { backoffMs: 1 })('task')
    expect(JSON.parse(out)).toEqual({ healthFactor: 1.143 })
    expect(e.calls).toBe(2)
  })
  it('never retries a refusal about the task', async () => {
    const e = fake([{ error: 'the task does not state the capital to deploy' }])
    await engineRunWork(e, { backoffMs: 1 })('task')
    expect(e.calls).toBe(1)
  })
  it('gives up after three attempts', async () => {
    const e = fake([{ error: 'fetch failed' }])
    const out = await engineRunWork(e, { backoffMs: 1 })('task')
    expect(JSON.parse(out).error).toBe('fetch failed')
    expect(e.calls).toBe(3)
  })
})
