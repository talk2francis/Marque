import { describe, expect, it } from 'vitest'
import {
  address, addresses, blockNumber, boolFlag, listAfter, num,
  positionTokenId, resolveBlock,
} from './parse.js'

/**
 * These tests exist because of a specific bug that has now been paid for five
 * times: an extractor that guesses on behalf of the counterparty. The guess
 * gets published as the counterparty's failure, or — worse — certifies our own.
 * Every case below that ends in `toBeNull()` is a case where refusing is the
 * whole point.
 */

describe('num', () => {
  it('reads a plain decimal', () => {
    expect(num('restore it to 1.6', 'to %N%')).toBe(1.6)
  })

  // The original bug. `[\d.]+` captured "1.6." → Number("1.6.") is NaN → the
  // engine silently defaulted to 2.5, and the case also used 2.5, so it PASSED.
  it('does not swallow a sentence-ending period', () => {
    expect(num('restore it to 1.6.', 'to %N%')).toBe(1.6)
  })

  it('does not swallow a comma or a following clause', () => {
    expect(num('restore it to 1.6, then stop', 'to %N%')).toBe(1.6)
  })

  it('reads an integer', () => {
    expect(num('use 10 levels', '%N% levels')).toBe(10)
  })

  it('returns null rather than defaulting when nothing matches', () => {
    expect(num('restore the account', 'to %N%')).toBeNull()
  })

  it('returns null when the number is not finite', () => {
    expect(num('to abc', 'to %N%')).toBeNull()
  })

  it('tries each pattern in order and takes the first that hits', () => {
    expect(num('target HF 2.0', 'restore to %N%', 'target HF %N%')).toBe(2.0)
  })

  it('is case-insensitive', () => {
    expect(num('TARGET HF 2.0', 'target hf %N%')).toBe(2)
  })
})

describe('address', () => {
  const a = '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'

  it('finds a checksummed address', () => {
    expect(address(`Subject address: ${a}`)).toBe(a)
  })

  it('returns null when there is no address', () => {
    expect(address('Is this contract safe?')).toBeNull()
  })

  it('does not match a too-short hex string', () => {
    expect(address('0xdeadbeef')).toBeNull()
  })
})

describe('addresses', () => {
  it('returns every address in order', () => {
    const one = '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'
    const two = '0x55d398326f99059fF775485246999027B3197955'
    expect(addresses(`${one} and ${two}`)).toEqual([one, two])
  })

  it('deduplicates case-insensitively, keeping the first spelling', () => {
    const a = '0x55d398326f99059fF775485246999027B3197955'
    expect(addresses(`${a} then ${a.toLowerCase()}`)).toEqual([a])
  })

  it('returns an empty array when there are none', () => {
    expect(addresses('no addresses here')).toEqual([])
  })
})

describe('blockNumber', () => {
  it('reads the "Block:" header the MCS prompts use', () => {
    expect(blockNumber('Chain: BNB (56). Block: 120076122.')).toBe(120076122n)
  })

  it('reads the "at block N" phrasing', () => {
    expect(blockNumber('report it at block 120076122')).toBe(120076122n)
  })

  it('returns null when no block is pinned', () => {
    expect(blockNumber('report the current health factor')).toBeNull()
  })
})

describe('positionTokenId', () => {
  it.each([
    ['re-centre position 7321916', '7321916'],
    ['position #7321916', '7321916'],
    ['position NFT id: 7321916', '7321916'],
    ['token id 7321916', '7321916'],
  ])('reads %j', (text, expected) => {
    expect(positionTokenId(text)).toBe(expected)
  })

  it('returns null when no id is present', () => {
    expect(positionTokenId('re-centre my position')).toBeNull()
  })

  // Three digits minimum, so a fee tier or a level count is not mistaken for
  // a token id.
  it('ignores a short number', () => {
    expect(positionTokenId('position 12')).toBeNull()
  })
})

describe('boolFlag', () => {
  it('prefers the false pattern when both could match', () => {
    expect(boolFlag('leverage NOT allowed', 'leverage allowed', 'leverage not allowed')).toBe(false)
  })

  it('reads the true pattern', () => {
    expect(boolFlag('leverage allowed', 'leverage allowed', 'leverage not allowed')).toBe(true)
  })

  it('returns null when the prompt is silent — silence is not a decline', () => {
    expect(boolFlag('plan a route', 'leverage allowed', 'leverage not allowed')).toBeNull()
  })
})

describe('listAfter', () => {
  it('reads a comma separated list', () => {
    expect(listAfter('only venus, lista', 'only')).toEqual(['venus', 'lista'])
  })

  it('reads an "and" separated list', () => {
    expect(listAfter('only venus and lista', 'only')).toEqual(['venus', 'lista'])
  })

  it('stops at a semicolon', () => {
    expect(listAfter('only venus; leverage not allowed', 'only')).toEqual(['venus'])
  })

  // The `m` flag bug: without end-of-line anchoring this swallowed every later
  // constraint, and the engine refused a fully specified request.
  it('stops at end of line, not end of prompt', () => {
    const prompt = 'only venus\nminimum improvement 50 bps\nleverage NOT allowed'
    expect(listAfter(prompt, 'only')).toEqual(['venus'])
  })

  it('returns null when the phrase is absent', () => {
    expect(listAfter('plan a route', 'only')).toBeNull()
  })
})

describe('resolveBlock', () => {
  const head = 120076122n

  it('reads head when no block was pinned', () => {
    expect(resolveBlock(null, head)).toEqual({ mode: 'latest' })
  })

  it('pins a recent block off the public nodes', () => {
    expect(resolveBlock(head - 10n, head)).toEqual({ mode: 'pinned', block: head - 10n, source: 'public' })
  })

  it('accepts the boundary at 60 blocks behind head as public', () => {
    expect(resolveBlock(head - 60n, head)).toEqual({ mode: 'pinned', block: head - 60n, source: 'public' })
  })

  // The old readableBlock returned `undefined` here AND for a null request —
  // the same value meaning two different things. An engine then read head and
  // called it a success. This is now an explicit, un-ignorable state.
  it('marks an out-of-window block UNAVAILABLE when there is no archive', () => {
    expect(resolveBlock(head - 61n, head)).toEqual({ mode: 'unavailable', requested: head - 61n })
  })

  it('pins an out-of-window block to the archive when one is configured', () => {
    expect(resolveBlock(head - 500_000n, head, { archiveAvailable: true }))
      .toEqual({ mode: 'pinned', block: head - 500_000n, source: 'archive' })
  })

  it('does not choke on a requested block ahead of head', () => {
    expect(resolveBlock(head + 5n, head)).toEqual({ mode: 'pinned', block: head + 5n, source: 'public' })
  })
})
