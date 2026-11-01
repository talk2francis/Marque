import { NextResponse } from 'next/server'
import { funnel, categoryFunnel, failureHistogram } from '@marque/registry'
import { supplyNow, SUPPLY_DEFINITIONS } from '../../../../lib/supply-truth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * The supply funnel, computed live.
 *
 * Nothing here is stored or hardcoded — every number is a COUNT over measured
 * data, and `takenAt` says when. This is the endpoint behind the homepage
 * section that publishes our own attrition.
 */
export async function GET() {
  try {
    const [registryStages, categories, failures, supply] = await Promise.all([
      funnel(56),
      categoryFunnel(56),
      failureHistogram(),
      supplyNow(56),
    ])
    // The last stage is the one supply count (supply-truth.ts), the same number as the home page and coverage API.
    const stages = [...registryStages, { stage: 'hireable', label: 'Hireable', count: supply.passed, method: SUPPLY_DEFINITIONS.passed }]
    return NextResponse.json({
      chainId: 56,
      takenAt: new Date().toISOString(),
      provenance: 'MEASURED',
      stages,
      supply: { measuredAt: supply.measuredAt, priced: supply.priced, passed: supply.passed, failed: supply.failed, notYetTested: supply.notYetTested, definitions: SUPPLY_DEFINITIONS },
      categories,
      failures,
      note: 'Counts are live and state-specific. Reachable, callable, compatible, Charter-ready, qualified and hireable are never treated as synonyms. Hireable means passed its test with a live price now.',
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'funnel_unavailable', detail: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    )
  }
}
