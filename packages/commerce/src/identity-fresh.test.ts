import { beforeEach, describe, expect, it, vi } from 'vitest'
const reads = vi.hoisted(() => ({ getBlock: vi.fn(), getChainId: vi.fn(), readContract: vi.fn() }))
vi.mock('viem', async original => ({ ...await original<object>(), createPublicClient: () => reads }))
import { sellerIdentity } from './chain'
import { network } from './config'
const n = network(56), owner = '0x1111111111111111111111111111111111111111'
const seller = { chainId: 56, tokenId: '123', agentId: `56:${n.identityRegistry.toLowerCase()}:123` }
beforeEach(() => { vi.clearAllMocks(); reads.getBlock.mockResolvedValue({number:456n,timestamp:BigInt(Math.floor(Date.now()/1000))}); reads.getChainId.mockResolvedValue(56); reads.readContract.mockImplementation(async ({functionName}: {functionName:string}) => functionName==='ownerOf'?owner:'0x0000000000000000000000000000000000000000') })
describe('fresh seller identity', () => {
  it('reads owner and registered payment wallet at the same fresh block without index fallback', async () => {
    expect(await sellerIdentity(seller)).toEqual({ agentOwner: owner, agentWallet: null, blockNumber: '456' })
    expect(reads.getBlock).toHaveBeenCalledWith({blockTag:'latest'})
    expect(reads.readContract.mock.calls.map(c=>[c[0].address,c[0].functionName,c[0].blockNumber])).toEqual([[n.identityRegistry,'ownerOf',456n],[n.identityRegistry,'getAgentWallet',456n]])
  })
  it.each([{...seller,tokenId:'0123'}, {...seller,tokenId:'-1'}, {...seller,tokenId:(2n**256n).toString()}, {...seller,agentId:'wrong-registry'}, {...seller,chainId:1}])('rejects noncanonical tuples before RPC', async value => { await expect(sellerIdentity(value)).rejects.toThrow(); expect(reads.getBlock).not.toHaveBeenCalled() })
  it('rejects wrong-chain or stale RPC heads', async () => { reads.getChainId.mockResolvedValue(97); await expect(sellerIdentity(seller)).rejects.toThrow('wrong chain'); reads.getChainId.mockResolvedValue(56); reads.getBlock.mockResolvedValue({number:456n,timestamp:1n}); await expect(sellerIdentity(seller)).rejects.toThrow('stale'); expect(reads.readContract).not.toHaveBeenCalled() })
  it('propagates an RPC failure rather than trusting indexed owners', async () => { reads.readContract.mockRejectedValue(Error('timeout')); await expect(sellerIdentity(seller)).rejects.toThrow('timeout') })
})
