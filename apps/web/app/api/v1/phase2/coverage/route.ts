import { marketplaceAgentsCached } from '../../../../../lib/market-cache'
import { marketSupply } from '../../../../../lib/market-supply'
import { countSupply, SUPPLY_DEFINITIONS } from '../../../../../lib/supply-truth'
import { isHireable } from '../../../../../lib/standing'
import { served, chainParam, bad } from '../../../../../lib/phase2-api'
import type { Lane } from '@marque/commerce'

export const dynamic = 'force-dynamic'

async function laneCoverage(lane: Lane) {
  const chainId = lane === 'mainnet' ? 56 : 97
  const result = await marketplaceAgentsCached({ tab: 'ready', lane, limit: 300 })
  const supply = countSupply(result.rows, chainId, result.quoteObservedAt ?? result.generatedAt)
  // Category counts are of hireable agents (priced, not pulled), the same set as totalHireable.
  const categories = marketSupply(result.rows.filter(isHireable))
    .map((c) => ({ ...c, priced: supply.byCategory[c.category]?.priced ?? 0, checked: supply.byCategory[c.category]?.checked ?? 0, warranted: supply.byCategory[c.category]?.warranted ?? 0 }))
  return {
    lane, chainId, measuredAt: supply.measuredAt, provenance: 'MEASURED' as const,
    countingUnit: 'deduplicated_marketplace_listing',
    operatorCounting: 'Recorded owner addresses; unknown owners count per identity. Independence is not verified.',
    totalHireable: supply.hireable,
    priced: supply.priced, hireable: supply.hireable, pulled: supply.pulled, checked: supply.checked, warranted: supply.warranted, delivered: supply.delivered,
    definitions: { ...SUPPLY_DEFINITIONS, totalHireable: 'the same as hireable' },
    categories,
    unclassifiedHireableCount: Math.max(0, supply.hireable - categories.reduce((n, c) => n + c.hireable, 0)),
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
  if (asked) return served(`phase2:marketplace-coverage:v4:${chainId}`, 'coverage', () => laneCoverage(chainId === 97 ? 'practice' : 'mainnet'))
  return served('phase2:marketplace-coverage:v4:lanes', 'coverage', async () => {
    const [mainnet, practice] = await Promise.all([laneCoverage('mainnet'), laneCoverage('practice')])
    return {
      ...mainnet,
      deprecation: 'Top-level fields repeat the mainnet lane for one release. Read `mainnet` and `practice` instead; they are never summed.',
      mainnet, practice,
    }
  })
}
