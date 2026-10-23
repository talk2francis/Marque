import { marketplaceAgents } from '../../../../../lib/marketplace'
import { served, chainParam, bad } from '../../../../../lib/phase2-api'
import type { Lane } from '@marque/commerce'

export const dynamic = 'force-dynamic'

async function laneCoverage(lane: Lane) {
  const result = await marketplaceAgents({ tab: 'ready', lane, limit: 1 })
  return {
    lane, chainId: lane === 'mainnet' ? 56 : 97, measuredAt: result.quoteObservedAt ?? result.generatedAt, provenance: 'MEASURED' as const,
    countingUnit: 'deduplicated_marketplace_listing',
    operatorCounting: 'Recorded owner addresses; unknown owners count per identity. Independence is not verified.',
    totalHireable: result.total, categories: result.supply,
    unclassifiedHireableCount: Math.max(0, result.total - result.supply.reduce((n, c) => n + c.hireable, 0)),
  }
}

/**
 * Supply per lane (invariant 32): `mainnet` (BSC 56, real money) and `practice` (BSC 97,
 * test tokens), each counted from the same full filtered listing set as the marketplace,
 * before paging. Lanes are never summed. The top-level fields repeat the mainnet lane for
 * one release, for readers of the earlier shape. `?chainId=` returns one lane in that shape.
 */
export async function GET(req: Request) {
  const asked = new URL(req.url).searchParams.has('chainId')
  const chainId = chainParam(req.url)
  if (!chainId) return bad('chainId must be 56 or 97.')
  if (asked) return served(`phase2:marketplace-coverage:v2:${chainId}`, 'coverage', () => laneCoverage(chainId === 97 ? 'practice' : 'mainnet'))
  return served('phase2:marketplace-coverage:v2:lanes', 'coverage', async () => {
    const [mainnet, practice] = await Promise.all([laneCoverage('mainnet'), laneCoverage('practice')])
    return {
      ...mainnet,
      deprecation: 'Top-level fields repeat the mainnet lane for one release. Read `mainnet` and `practice` instead; they are never summed.',
      mainnet, practice,
    }
  })
}
