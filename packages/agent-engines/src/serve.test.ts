import { describe, expect, it } from 'vitest'
import { a2aResult, engineRunWork } from './serve.js'
import type { Engine } from './types.js'

describe('reference free-face A2A Task', () => {
  it('returns identified tasks and artifacts while preserving correlation and answer bytes', () => {
    const answer = { recommend: false, amount: 0, error: 'Missing task facts' }
    const first = a2aResult(0, answer) as { id: unknown; result: { id: string; contextId: string; artifacts: Array<{ artifactId: string; parts: Array<{ text: string }> }> } }
    const second = a2aResult('other', answer) as typeof first
    expect(first.id).toBe(0)
    for (const id of [first.result.id, first.result.contextId, first.result.artifacts[0]!.artifactId]) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/)
    expect(first.result.id).not.toBe(second.result.id)
    expect(first.result.contextId).not.toBe(second.result.contextId)
    expect(first.result.artifacts[0]!.artifactId).not.toBe(second.result.artifacts[0]!.artifactId)
    expect(first.result.artifacts[0]!.parts[0]!.text).toBe(JSON.stringify(answer))
  })
})

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
    await expect(engineRunWork(e, { backoffMs: 1 })('task')).rejects.toThrow('No result was submitted')
    expect(e.calls).toBe(1)
  })
  it('gives up after three attempts', async () => {
    const e = fake([{ error: 'fetch failed' }])
    await expect(engineRunWork(e, { backoffMs: 1 })('task')).rejects.toThrow('No result was submitted')
    expect(e.calls).toBe(3)
  })
  it('does not submit an upstream exception or expose its private URL', async () => {
    const e = fake([])
    e.run = async () => { throw Error('https://archive.invalid/private-token') }
    await expect(engineRunWork(e)('task')).rejects.toThrow('The agent could not produce a deliverable. No result was submitted.')
  })
  it('preserves a valid negative recommendation and genuine zero measurements', async () => {
    const answer = { recommend: false, realisedAprPct: 0, excluded: [{ reason: 'one venue unavailable' }] }
    expect(JSON.parse(await engineRunWork(fake([answer]))('task'))).toEqual(answer)
  })

})
