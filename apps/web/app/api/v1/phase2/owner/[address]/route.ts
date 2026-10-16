import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { served, bad, ADDRESS } from '../../../../../../lib/phase2-api'
import { sellerProjection } from '../../../../../../lib/seller'
import { builderIdentities, builderView } from '../../../../../../lib/builder'

export const dynamic = 'force-dynamic'

const rowsOf = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>

/**
 * GET /api/v1/phase2/owner/:address (SPEC-TRACKING 6.3 and 10): the agents this address
 * owns or has proved, on BSC mainnet and testnet, each with the five quality checks
 * (packages/registry/src/quality.ts), the fix for any that fail, and `qualityListing`.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  if (!ADDRESS.test(address)) return bad('Send a 0x address of 40 hex characters.')
  return served(`phase2:owner:v3:${address.toLowerCase()}`, 'owner', async () => {
    const ids = await builderIdentities(address)
    const agents = await Promise.all(ids.slice(0, 8).map(async (t) => {
      const v = await builderView(address, t.chainId, t.tokenId)
      const [jobs] = rowsOf(await db().execute(sql`
        select count(*)::int as n, count(*) filter (where j.funded_raw is not null)::int as paid,
          count(*) filter (where j.state = 'PAID')::int as released
        from commerce_job j join agent a on lower(a.agent_wallet) = j.provider and a.chain_id = j.chain_id and a.id = ${v.identity.agentKey}`).catch(() => []))
      return {
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
    return { owner: address.toLowerCase(), qualityListing: agents.some((a) => a.qualityListing), agents }
  })
}
