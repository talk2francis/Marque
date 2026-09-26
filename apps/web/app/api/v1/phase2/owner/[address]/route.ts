import { ownerAgents } from '@marque/commerce'
import { served, bad, ADDRESS } from '../../../../../../lib/phase2-api'

export const dynamic = 'force-dynamic'

/** GET /api/v1/phase2/owner/:address (SPEC-TRACKING 6.3): agents this address owns, with each quality-listing check and its fix. */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  if (!ADDRESS.test(address)) return bad('Send a 0x address of 40 hex characters.')
  return served(`phase2:owner:${address.toLowerCase()}`, 'owner', async () => ({ owner: address.toLowerCase(), agents: await ownerAgents(address) }))
}
