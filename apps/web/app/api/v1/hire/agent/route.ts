import { NextResponse, type NextRequest } from 'next/server'
import { agentForSheet, disputeWindowSeconds, isSupportedChain, campaignChainId, chainClient, network, type ChainId } from '@marque/commerce'
import { hireError } from '../../../../../lib/hire-api'

export const dynamic = 'force-dynamic'

const feeAbi = [{ type: 'function', name: 'platformFeeBP', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }] as const
const feeCache = new Map<ChainId, { at: number; bp: number }>()
/** AgenticCommerce.platformFeeBP(), read live and cached for an hour. */
async function platformFeeBp(chainId: ChainId): Promise<number | null> {
  const hit = feeCache.get(chainId)
  if (hit && Date.now() - hit.at < 3600_000) return hit.bp
  const bp = Number(await chainClient(chainId).readContract({ address: network(chainId).commerce, abi: feeAbi, functionName: 'platformFeeBP' }))
  feeCache.set(chainId, { at: Date.now(), bp })
  return bp
}

/** GET /api/v1/hire/agent?agentId=: the agent the hire sheet is about, with its last live quote. */
export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('agentId') ?? ''
  if (agentId.length < 3 || agentId.length > 200) return NextResponse.json({ error: 'bad_request', detail: 'Name an agent.' }, { status: 400 })
  try {
    const agent = await agentForSheet(agentId)
    const chain = agent.lastQuote?.chainId ?? null
    const chainId = chain !== null && isSupportedChain(chain) ? chain : campaignChainId()
    // The review window is read from OptimisticPolicy (cached an hour), so the sheet can say
    // when an undelivered payment becomes reclaimable before the job exists.
    const [reviewWindowSeconds, platformFeeBP] = await Promise.all([
      disputeWindowSeconds(chainId).catch(() => null),
      platformFeeBp(chainId).catch(() => null),
    ])
    return NextResponse.json({ ...agent, reviewWindowSeconds, platformFeeBP, reviewWindowChainId: chainId }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return hireError(err, 'agent')
  }
}
