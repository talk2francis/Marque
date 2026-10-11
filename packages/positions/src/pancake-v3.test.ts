import { describe, expect, it, vi } from 'vitest'
import type { Address, PublicClient } from 'viem'
import { pancakeV3Reader } from './pancake-v3.js'

describe('named PancakeSwap V3 position', () => {
  it('checks ownership at the pinned block without enumerating the wallet', async () => {
    const owner = '0x0000000000000000000000000000000000000001' as Address
    const other = '0x0000000000000000000000000000000000000002' as Address
    const readContract = vi.fn().mockResolvedValue(other)
    const multicall = vi.fn()
    const client = { readContract, multicall } as unknown as PublicClient

    const result = await pancakeV3Reader(owner, { client, blockNumber: 123n, tokenId: 456n })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.positions).toEqual([])
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: 'ownerOf', args: [456n], blockNumber: 123n,
    }))
    expect(multicall).not.toHaveBeenCalled()
  })
})
