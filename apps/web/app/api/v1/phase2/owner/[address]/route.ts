import { sql } from 'drizzle-orm'
import { db, isFirstParty } from '@marque/db'
import { served, bad, ADDRESS } from '../../../../../../lib/phase2-api'
import { sellerProjection } from '../../../../../../lib/seller'
import { builderIdentityPage, builderView } from '../../../../../../lib/builder'
import { ownerCursor } from '../../../../../../lib/builder-workspace'
import { registryImageUrl } from '../../../../../../lib/avatar-source'
import { agentPortraits } from '../../../../../../lib/agent-portraits'

export const dynamic = 'force-dynamic'

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>

/**
 * GET /api/v1/phase2/owner/:address (SPEC-TRACKING 6.3 and 10): the agents this address
 * owns or has proved, on BSC mainnet and testnet, each with the five quality checks
 * (packages/registry/src/quality.ts), the fix for any that fail, and `qualityListing`.
 */
export async function GET(req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  if (!ADDRESS.test(address)) return bad('Send a 0x address of 40 hex characters.')
  const offset = ownerCursor(new URL(req.url).searchParams.get('cursor'))
  if (offset === null) return bad('Send a numeric page cursor.')
  return served(`phase2:owner:v5:${address.toLowerCase()}:${offset}`, 'owner', async () => {
    const { targets, total } = await builderIdentityPage(address, offset)
    const agents = await Promise.all(targets.map(async (t) => {
      const v = await builderView(address, t.chainId, t.tokenId)
      const [jobs] = rowsOf(await db().execute(sql`
        select count(*)::int as n, count(*) filter (where j.funded_raw is not null)::int as paid,
          count(*) filter (where j.state = 'PAID')::int as released
        from commerce_job j join agent a on lower(a.agent_wallet) = j.provider and a.chain_id = j.chain_id and a.id = ${v.identity.agentKey}`).catch(() => []))
      // The owner's own art (CLAIMED), only through the registry indexer's image proxy.
      const [img] = rowsOf(await db().execute(sql`select image_url, raw_metadata #>> '{offchain_content,image}' as meta_image from agent where id = ${v.identity.agentKey} limit 1`).catch(() => []))
      // A portrait the owner set on Marque comes first (agent-portraits.ts).
      const portrait = (await agentPortraits([v.identity.agentKey])).get(v.identity.agentKey) ?? null
      return {
        imageUrl: portrait ?? registryImageUrl(img?.['image_url']) ?? registryImageUrl(img?.['meta_image']),
        portraitByOwner: portrait !== null,
        firstParty: isFirstParty(v.identity.chainId, v.identity.tokenId),
        agentKey: v.identity.agentKey, chainId: v.identity.chainId, agentId: v.identity.tokenId, name: v.identity.name, category: v.category,
        listedOnMarque: v.listed, qualityListing: v.verdict.qualityListing,
        availability: v.availability,
        seller: await sellerProjection(v),
        listingEvidence: v.listingEvidence,
        quality: {
          listing: v.verdict.qualityListing, passed: v.verdict.passed,
          checks: v.verdict.checks.map((c) => ({ id: c.id, label: c.label, pass: c.state === 'pass', state: c.state, reason: c.reason, fix: c.fix, note: c.note ?? null })),
        },
        jobsReceived: Number(jobs?.['n'] ?? 0), jobsPaid: Number(jobs?.['paid'] ?? 0),
        jobEvidence: { version: 1, available: jobs !== undefined, chainId: v.identity.chainId, observedAt: new Date().toISOString(), scope: 'All indexed jobs for this registered provider wallet; not proof of marketplace origin or independent buyers.', funded: jobs ? Number(jobs['paid']) : null, paymentReleased: jobs ? Number(jobs['released']) : null, legacyJobsPaidMeans: 'funded' },
      }
    }))
    return { owner: address.toLowerCase(), qualityListing: agents.some((a) => a.qualityListing), qualityListingScope: 'returned_page', agents,
      page: { total, offset, limit: 8, nextCursor: offset + agents.length < total ? String(offset + agents.length) : null } }
  })
}
