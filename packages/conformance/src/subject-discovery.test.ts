import { describe, expect, it } from 'vitest'
import { newestBorrowers, newestTokenIds, usablePosition } from './subject-discovery.js'

const A = '0x00000000000000000000000000000000000000aa' as const
const B = '0x00000000000000000000000000000000000000bb' as const

describe('live subject discovery (21 Nov: every listed REB position closed, the HF account repaid)', () => {
  it('orders deposits newest first and keeps each NFT once', () => {
    const logs = [
      { blockNumber: 10n, logIndex: 1, args: { tokenId: 1n } },
      { blockNumber: 12n, logIndex: 0, args: { tokenId: 2n } },
      { blockNumber: 12n, logIndex: 5, args: { tokenId: 3n } },
      { blockNumber: 11n, logIndex: 0, args: { tokenId: 2n } },
    ]
    expect(newestTokenIds(logs)).toEqual([3n, 2n, 1n])
    expect(newestTokenIds(logs, 2)).toEqual([3n, 2n])
  })
  it('uses only positions that still hold liquidity on the policy fee tier', () => {
    expect(usablePosition({ fee: 2500, liquidity: 1n }, 2500)).toBe(true)
    expect(usablePosition({ fee: 2500, liquidity: 0n }, 2500)).toBe(false)
    expect(usablePosition({ fee: 500, liquidity: 10n }, 2500)).toBe(false)
  })
  it('keeps borrowers that still owe after the event, newest first, once each', () => {
    const logs = [
      { blockNumber: 5n, logIndex: 0, args: { borrower: A, accountBorrows: 10n } },
      { blockNumber: 9n, logIndex: 0, args: { borrower: B, accountBorrows: 0n } },
      { blockNumber: 7n, logIndex: 0, args: { borrower: B, accountBorrows: 3n } },
      { blockNumber: 8n, logIndex: 0, args: { borrower: A, accountBorrows: 4n } },
    ]
    expect(newestBorrowers(logs)).toEqual([A, B])
  })
})
