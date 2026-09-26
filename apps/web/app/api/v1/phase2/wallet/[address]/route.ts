import { walletQuest } from '@marque/commerce'
import { served, chainParam, bad, ADDRESS } from '../../../../../../lib/phase2-api'

export const dynamic = 'force-dynamic'

/** GET /api/v1/phase2/wallet/:address[?chainId=97] (SPEC-TRACKING 6.2): every Set and Earn step this wallet completed on Marque, with tx hashes. */
export async function GET(req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  if (!ADDRESS.test(address)) return bad('Send a 0x address of 40 hex characters.')
  const chainId = chainParam(req.url)
  if (!chainId) return bad('chainId must be 56 or 97.')
  return served(`phase2:wallet:${chainId}:${address.toLowerCase()}`, 'wallet', () => walletQuest(address, chainId))
}
