import { describe, expect, it, vi } from 'vitest'
import { CASES, REB_FALLBACK_SUBJECTS } from './cases.js'
import { firstCapturable } from './harness.js'

describe('published rebalancing subjects', () => {
  it('has distinct on-chain identities and a fallback roster', () => {
    const primary = CASES.find((item) => item.testId === 'MCS-REB-1')!.subject
    const subjects = [primary, ...REB_FALLBACK_SUBJECTS]
    expect(subjects).toHaveLength(3)
    expect(new Set(subjects.map((item) => item.tokenId)).size).toBe(3)
    for (const item of subjects) {
      expect(item.owner).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(item.tokenId).toMatch(/^\d+$/)
      expect(item.pair).toBe('BNCB/WBNB')
    }
  })

  it('uses the first case that can actually be captured', async () => {
    const subjects = [{ tokenId: '1' }, { tokenId: '2' }, { tokenId: '3' }]
    const capture = vi.fn(async (subject: Record<string, string>) => {
      if (subject.tokenId !== '2') throw new Error('position not found')
      return { subject }
    })
    await expect(firstCapturable(subjects, capture)).resolves.toEqual({ subject: subjects[1] })
    expect(capture.mock.calls.map(([subject]) => subject.tokenId)).toEqual(['1', '2'])
  })

  it('reports failure when every real subject is unavailable', async () => {
    const capture = vi.fn(async () => { throw new Error('chain unavailable') })
    await expect(firstCapturable([{ tokenId: '1' }, { tokenId: '2' }], capture)).rejects.toThrow('chain unavailable')
    expect(capture).toHaveBeenCalledTimes(2)
  })
})
