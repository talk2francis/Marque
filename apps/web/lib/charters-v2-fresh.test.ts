import { beforeEach, describe, expect, it, vi } from 'vitest'
import { factoryFor, V2, type CharterKind } from '@marque/charters'
const mocks = vi.hoisted(() => ({ readContract: vi.fn(), getBlockNumber: vi.fn(), execute: vi.fn() }))
vi.mock('@marque/commerce', () => ({ chainClient: () => mocks }))
vi.mock('@marque/db', () => ({ chartersDb: () => mocks }))
import { charterV2Detail } from './charters-v2'
const owner = '0x0000000000000000000000000000000000000001'
const address = '0x0000000000000000000000000000000000000002'
let kind: CharterKind | null
beforeEach(() => {
  kind = 'yield'; vi.clearAllMocks()
  mocks.getBlockNumber.mockResolvedValue(1000n); mocks.execute.mockResolvedValue([])
  mocks.readContract.mockImplementation(async (r: { address: string; functionName: string }) => {
    if (r.functionName === 'isCharter') return kind !== null && r.address === factoryFor(97, kind)
    if (r.functionName === 'owner') return owner
    if (['vDebt', 'vToken'].includes(r.functionName)) return '0x0000000000000000000000000000000000000003'
    if (r.functionName === 'pool') return V2[97].pools[0]!.address
    if (['base', 'tipToken'].includes(r.functionName)) return V2[97].pools[0]!.base
    if (r.functionName === 'createdAt') return 1794290000n
    if (r.functionName === 'expiresAt') return 1894290000n
    if (['ended', 'returned', 'feesToOwner', 'isExecutor'].includes(r.functionName)) return false
    if (r.functionName === 'preview') return [0, 0n, 0n, 0n, 0n, 0n]
    return 0n
  })
})
describe('fresh charter access before indexing', () => {
  for (const k of ['loan', 'yield', 'grid', 'range'] as const) it(`opens a registered ${k} immediately without writing derived rows`, async () => {
    kind = k
    const result = await charterV2Detail(97, address)
    expect(result?.charter.kind).toBe(k)
    expect(result?.charter.owner).toBe(owner)
    expect(result?.indexing).toBe(true)
    expect(result?.events).toEqual([])
    expect(result?.charter.createdTx).toBeNull()
    expect(mocks.execute).toHaveBeenCalledTimes(1)
  })
  it('keeps a registered charter usable when the index is unavailable', async () => {
    mocks.execute.mockRejectedValue(new Error('index unavailable'))
    expect((await charterV2Detail(97, address))?.indexing).toBe(true)
  })
  it('does not accept an arbitrary contract as a charter', async () => {
    kind = null
    expect(await charterV2Detail(97, address)).toBeNull()
    expect(mocks.readContract.mock.calls.every(([r]) => r.functionName === 'isCharter')).toBe(true)
  })
  it('does not turn a chain outage into a false not-found', async () => {
    mocks.readContract.mockRejectedValue(new Error('RPC unavailable'))
    await expect(charterV2Detail(97, address)).rejects.toThrow('RPC unavailable')
  })
})
