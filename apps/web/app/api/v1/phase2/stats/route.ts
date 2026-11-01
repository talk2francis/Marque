import { questStats } from '@marque/commerce'
import { served, chainParam, bad } from '../../../../../lib/phase2-api'

export const dynamic = 'force-dynamic'

/** GET /api/v1/phase2/stats (SPEC-TRACKING 6.6): eligible activity only. */
export async function GET(req: Request) {
  const chainId = chainParam(req.url)
  if (!chainId) return bad('chainId must be 56 or 97.')
  return served(`phase2:stats:v3:${chainId}`, 'stats', () => questStats(chainId).then((s) => ({ ...s, scope: 'Jobs that count under Set and Earn rules on this network: outside, Marque-bound, funded, first hire of its category per wallet. /api/v1/proof lists every job through Marque, team jobs included, so its totals are larger.' })))
}
