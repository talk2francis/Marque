import { describe, expect, it } from 'vitest'
import { pinnedBlockOf, isReproduction, isComparisonReplay, REPRO_PREFIX, REPLAY_PREFIX } from './runner.js'

describe('pinnedBlockOf', () => {
  it('extracts the single block a frozen task pins', () => {
    expect(pinnedBlockOf('… on BNB Smart Chain (chain 56).\nBlock: 120077706 — answer for this block.\n…'))
      .toBe('120077706')
  })

  it('is null when the task pins no block', () => {
    expect(pinnedBlockOf('Triage this contract. State your method.')).toBeNull()
  })

  it('is null when the task names more than one distinct block (ambiguous)', () => {
    expect(pinnedBlockOf('Block: 120077706 for the pool; Block: 120077999 for the oracle')).toBeNull()
  })

  it('treats a block repeated verbatim as one pinned block', () => {
    expect(pinnedBlockOf('Block: 120123441. Answer for Block: 120123441 only.')).toBe('120123441')
  })
})

describe('batch kinds', () => {
  it('a repro batch is a reproduction and never a comparison replay', () => {
    const b = `${REPRO_PREFIX}120900000`
    expect(isReproduction(b)).toBe(true)
    expect(isComparisonReplay(b)).toBe(false)
  })

  it('a replay batch is a comparison replay and NOT a reproduction — so latestBatch can publish it', () => {
    const b = `${REPLAY_PREFIX}1788900000000`
    expect(isComparisonReplay(b)).toBe(true)
    expect(isReproduction(b)).toBe(false)
  })

  it('an original benchmark batch is neither', () => {
    expect(isReproduction('b120077706')).toBe(false)
    expect(isComparisonReplay('b120077706')).toBe(false)
  })
})
