import { sql } from 'drizzle-orm'
import { db, firstPartyAgents } from '@marque/db'
import { agentRatings } from '@marque/commerce'
import { served, bad } from '../../../../../../lib/phase2-api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/phase2/ratings/:agentId (SPEC-TRACKING 8), agentId = the BSC mainnet ERC-8004
 * token id. Two averages, never mixed: verified buyers (a Marque-bound delivered job with
 * this agent) and every ERC-8004 "starred" rating. First-party agents also report testnet.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params
  if (!/^\d{1,12}$/.test(agentId)) return bad('agentId is the numeric ERC-8004 token id on BSC mainnet.')
  return served(`phase2:ratings:${agentId}`, 'ratings', async () => {
    const [a] = (await db().execute(sql`select id, name, agent_wallet from agent where chain_id = 56 and token_id = ${agentId} limit 1`)) as unknown as Array<Record<string, unknown>>
    const wallet = String(a?.['agent_wallet'] ?? '')
    const first = firstPartyAgents().find((f) => String(f.tokenId) === agentId)
    return {
      agentKey: a?.['id'] ?? null, name: a?.['name'] ?? null,
      mainnet: await agentRatings(56, agentId, wallet),
      testnet: first?.testnet ? await agentRatings(97, String(first.testnet.tokenId), first.owner) : null,
    }
  })
}
