import { NextResponse, type NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { agentForSheet, disputeWindowSeconds, freeTarget, HireError, isSupportedChain, campaignChainId, chainClient, network, type ChainId } from '@marque/commerce'
import { hireError } from '../../../../../lib/hire-api'
import { withDeadline } from '../../../../../lib/deadline'
import { registryImageUrl } from '../../../../../lib/avatar-source'

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
  const selected = req.nextUrl.searchParams.get('serviceId')
  if (selected !== null && (!/^[1-9]\d*$/.test(selected) || !Number.isSafeInteger(Number(selected)))) return NextResponse.json({ error: 'bad_service', detail: 'Select an exact service.' }, { status: 400 })
  const serviceId = selected === null ? null : Number(selected)
  if (agentId.length < 3 || agentId.length > 200) return NextResponse.json({ error: 'bad_request', detail: 'Name an agent.' }, { status: 400 })
  try {
    const agent = await withDeadline(agentForSheet(agentId, serviceId).catch(async (err) => {
      // Try free also opens over agents that answer at their own endpoint but take no paid
      // jobs: the sheet then offers the free run only, and says why there is no Hire.
      if (!(err instanceof HireError) || serviceId !== null || req.nextUrl.searchParams.get('try') !== '1') throw err
      const free = await freeTarget(agentId)
      const res = await db().execute(sql`select token_id, owner_address from agent where id = ${agentId} limit 1`)
      const row = (((res as unknown as { rows?: unknown[] }).rows ?? (res as unknown as unknown[])) as Array<Record<string, unknown>>)[0]
      return {
        agentId, tokenId: String(row?.['token_id'] ?? ''), registryChainId: 56, name: free.name, category: free.category,
        owner: row?.['owner_address'] ? String(row['owner_address']) : null, firstParty: false, state: 'preview_only', lastQuote: null, taskExample: null,
        sellsJobs: false,
      }
    }), 10_000)
    const chain = agent.lastQuote?.chainId ?? null
    const chainId = chain !== null && isSupportedChain(chain) ? chain : campaignChainId()
    const imageRows = await withDeadline(db().execute(sql`select image_url, raw_metadata #>> '{offchain_content,image}' as meta_image from agent where id = ${agentId} limit 1`), 1000).catch(() => [])
    const imageRow = (((imageRows as unknown as { rows?: unknown[] }).rows ?? (imageRows as unknown as unknown[])) as Array<Record<string, unknown>>)[0]
    const imageUrl = registryImageUrl(imageRow?.['image_url']) ?? registryImageUrl(imageRow?.['meta_image'])
    // The review window is read from OptimisticPolicy (cached an hour), so the sheet can say
    // when an undelivered payment becomes reclaimable before the job exists.
    const [reviewWindowSeconds, platformFeeBP] = await Promise.all([
      withDeadline(disputeWindowSeconds(chainId), 2500).catch(() => null),
      withDeadline(platformFeeBp(chainId), 2500).catch(() => null),
    ])
    // The same agent on the other network (same owner, same name): the sheet offers it as a network choice, so the
    // marketplace can list one card per agent rather than one per chain.
    const twin = await withDeadline(twinOf(agentId, agent.owner, agent.name), 1500).catch(() => null)
    return NextResponse.json({ ...agent, imageUrl, reviewWindowSeconds, platformFeeBP, reviewWindowChainId: chainId, twin }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return hireError(err, 'agent')
  }
}

async function twinOf(agentId: string, owner: string | null, name: string): Promise<{ agentId: string; chainId: 56 | 97 } | null> {
  const chain = Number(agentId.split(':')[0])
  if (!owner || (chain !== 56 && chain !== 97)) return null
  const other = chain === 56 ? 97 : 56
  // Offered only when the twin has quoted on its own network in the last day: a twin whose endpoint answers for the
  // other network (or not at all) would open a sheet that cannot hire there.
  const res = await db().execute(sql`select a.id from agent a where a.chain_id = ${other} and lower(a.owner_address) = ${owner.toLowerCase()}
    and lower(btrim(a.name)) = ${name.trim().toLowerCase()}
    and exists (select 1 from commerce_quote q where q.agent_id = a.id and q.ok and q.chain_id = ${other} and q.created_at > now() - interval '24 hours')
    order by a.token_id desc limit 1`)
  const row = (((res as unknown as { rows?: unknown[] }).rows ?? (res as unknown as unknown[])) as Array<Record<string, unknown>>)[0]
  return row?.['id'] ? { agentId: String(row['id']), chainId: other } : null
}
