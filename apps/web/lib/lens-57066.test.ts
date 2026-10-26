import { describe, expect, it } from 'vitest'
import { normalizeAnswer } from '@marque/commerce'
import { taskFromDescription } from './job-task'
import fx from './job-57066.fixture.json'

/**
 * V4.2 L0 regression: job 57066 showed "Not checked" in production because its hire intent (the buyer's task) existed
 * only in the staging database, Keel's answer does not name the account, and so the health factor check had no account
 * to read. The task is now read from the job's own description on chain. These are 57066's real answer and description.
 */
describe('job 57066: the health factor check finds its account', () => {
  it("Keel's answer is a health factor answer without an account", () => {
    const l = normalizeAnswer('health_factor', fx.answer) as { kind: string; account: string | null; healthFactor: number | null; target: number | null; repayUsd: number | null }
    expect(l.kind).toBe('health_factor')
    expect(l.account).toBeNull()
    expect(l.healthFactor).toBe(4)
    expect(l.target).toBe(8)
    expect(l.repayUsd).toBeCloseTo(0.2497, 3)
  })
  it('the on-chain job description gives the task, and the task names the account', () => {
    const task = taskFromDescription(fx.description)
    expect(task).toMatch(/^Health factor of Venus account/)
    expect(task.match(/0x[0-9a-fA-F]{40}/)?.[0]).toBe('0x5aC2448FC79Ef8d33710b1Bced5AEff90138b452')
  })
  it('plain-text descriptions pass through unchanged', () => {
    expect(taskFromDescription('check 0x1111111111111111111111111111111111111111')).toBe('check 0x1111111111111111111111111111111111111111')
  })
})
