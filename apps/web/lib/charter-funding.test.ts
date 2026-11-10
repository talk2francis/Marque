import { describe, expect, it, vi } from 'vitest'
import { assertGrantWallet, checkStartingFunds, gridStartingFunds } from './charter-funding'
const owner = '0x0000000000000000000000000000000000000001'
const token = '0x0000000000000000000000000000000000000002'
const need = { token, symbol: 'USDT', minimum: 100n } as const
const client = (balance: bigint, native = 0n) => ({ readContract: vi.fn().mockResolvedValue(balance), getBalance: vi.fn().mockResolvedValue(native) })
describe('charter starting funds', () => {
  it('refuses an empty wallet before any approvals', async () => {
    await expect(checkStartingFunds(client(0n), owner, [need])).rejects.toThrow('too little USDT')
  })
  it('requires usable funds, without reserving the whole lifetime cap', async () => {
    await expect(checkStartingFunds(client(100n), owner, [need])).resolves.toBeUndefined()
  })
  it('fails closed when balances cannot be read', async () => {
    const c = client(100n); c.readContract.mockRejectedValue(new Error('RPC'))
    await expect(checkStartingFunds(c, owner, [need])).rejects.toThrow('could not be read')
  })
  it('rechecks balance after the review, including an emptied wallet', async () => {
    const c = client(100n)
    await checkStartingFunds(c, owner, [need]); c.readContract.mockResolvedValue(0n)
    await expect(checkStartingFunds(c, owner, [need])).rejects.toThrow('too little')
  })
  it('counts only an explicitly included and funded native wrap', async () => {
    await expect(checkStartingFunds(client(20n, 80n), owner, [{ ...need, nativeWrap: 80n }])).resolves.toBeUndefined()
    await expect(checkStartingFunds(client(20n, 79n), owner, [{ ...need, nativeWrap: 80n }])).rejects.toThrow('too little')
    await expect(checkStartingFunds(client(20n, 1000n), owner, [need])).rejects.toThrow('too little')
  })
  it('refuses a changed account or network', () => {
    expect(() => assertGrantWallet({ address: owner, chainId: 97 }, owner, 97)).not.toThrow()
    expect(() => assertGrantWallet({ address: token, chainId: 97 }, owner, 97)).toThrow('wallet changed')
    expect(() => assertGrantWallet({ address: owner, chainId: 56 }, owner, 97)).toThrow('network changed')
  })
})


describe('grid starting inventory', () => {
  const pool = { quote: token, base: owner, quoteSymbol: 'USDT', baseSymbol: 'WBNB' } as const
  it('a buy-only grid needs quote, and does not demand base it has yet to buy', () => {
    expect(gridStartingFunds(pool,4,4,50n,2n)).toEqual([{ token, symbol:'USDT', minimum:50n }])
  })
  it('an initially full grid needs its base inventory, without demanding unused quote', () => {
    expect(gridStartingFunds(pool,4,0,50n,2n)).toEqual([{ token:owner, symbol:'WBNB', minimum:8n, nativeWrap:0n }])
  })
  it('a mixed grid funds one buy and every initially full slot', () => {
    expect(gridStartingFunds(pool,4,2,50n,2n,4n)).toEqual([{ token, symbol:'USDT', minimum:50n },{ token:owner, symbol:'WBNB', minimum:4n, nativeWrap:4n }])
  })
})
