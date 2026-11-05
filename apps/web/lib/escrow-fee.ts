import { chainClient, network, type ChainId } from '@marque/commerce'

const feeAbi = [{ type: 'function', name: 'platformFeeBP', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }] as const
const feeCache = new Map<ChainId, { at: number; bp: number }>()

/**
 * AgenticCommerce.platformFeeBP(): the escrow's own fee in basis points, read live from the
 * contract and cached for an hour. The hire sheet and the home page's questions read it here,
 * so no page ever states a fee from memory (AGENTS.md invariant 4).
 */
export async function platformFeeBp(chainId: ChainId): Promise<number> {
  const hit = feeCache.get(chainId)
  if (hit && Date.now() - hit.at < 3600_000) return hit.bp
  const bp = Number(await chainClient(chainId).readContract({ address: network(chainId).commerce, abi: feeAbi, functionName: 'platformFeeBP' }))
  feeCache.set(chainId, { at: Date.now(), bp })
  return bp
}
