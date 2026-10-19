import { marketplaceAgents } from '../../../../../lib/marketplace'
import { served, chainParam, bad } from '../../../../../lib/phase2-api'

export const dynamic = 'force-dynamic'

/** Counts use the same full filtered listing set as the marketplace, before paging. */
export async function GET(req: Request) {
  const chainId = chainParam(req.url)
  if (!chainId) return bad('chainId must be 56 or 97.')
  return served(`phase2:marketplace-coverage:v1:${chainId}`, 'coverage', async () => {
    const result = await marketplaceAgents({ tab: 'ready', network: chainId, limit: 1 })
    return {
      chainId, measuredAt: result.generatedAt, provenance: 'MEASURED',
      countingUnit: 'deduplicated_marketplace_listing',
      operatorCounting: 'Recorded owner addresses; unknown owners count per identity. Independence is not verified.',
      totalHireable: result.total, categories: result.supply,
      unclassifiedHireableCount: Math.max(0, result.total - result.supply.reduce((n, c) => n + c.hireable, 0)),
    }
  })
}
