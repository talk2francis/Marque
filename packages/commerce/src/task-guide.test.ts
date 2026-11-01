import { describe, expect, it } from 'vitest'
import { paidTaskGuide } from './task-guide'

const work = { id: 'fee_tiers', name: 'Compare pool fee tiers', escrow: true, examples: ['Compare the fee tiers for token 0x123 with 1000 USD'], inputs: { token: 'Token contract', capitalUsd: 'Capital, optional' } }

describe('seller-declared paid task guidance', () => {
  it('selects the explicit paid work rather than earlier free utility examples', () => {
    expect(paidTaskGuide({ skills: [
      { id: 'board', name: 'Read public board', examples: ['{"skill":"board","action":"read"}'] },
      { id: 'negotiate', examples: ['Ask for a quote'] },
      work,
    ] })).toMatchObject({ skillId: 'fee_tiers', example: work.examples[0], inputs: [{ name: 'token', hint: 'Token contract' }, { name: 'capitalUsd', hint: 'Capital, optional' }] })
  })

  it('does not infer one task when multiple paid skills are declared', () => {
    expect(paidTaskGuide({ skills: [work, { ...work, id: 'position' }] })).toBeNull()
  })

  it('does not treat a claimed price or an escrow string as paid-skill selection', () => {
    expect(paidTaskGuide({ skills: [{ ...work, escrow: 'true', price: '1' }] })).toBeNull()
  })

  it('rejects malformed and oversized metadata or tasks', () => {
    for (const manifest of [null, [], { skills: Array(101).fill(work) }, { skills: [{ ...work, examples: ['x'.repeat(1201)] }] }, { skills: [{ ...work, id: null }] }]) expect(paidTaskGuide(manifest)).toBeNull()
  })

  it('keeps input hints as bounded display text and drops objects or oversized values', () => {
    expect(paidTaskGuide({ skills: [{ ...work, inputs: { unsafe: { script: 'run' }, long: 'x'.repeat(241), valid: 'Wallet to inspect' } }] })?.inputs).toEqual([{ name: 'valid', hint: 'Wallet to inspect' }])
  })
})
