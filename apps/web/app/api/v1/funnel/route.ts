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
    // V4.4: Listed, Answering, Priced, Hireable, Checked, Warranted. The last four are the one supply count
    // (supply-truth.ts), the same numbers as the home page and coverage API. The Charter sandbox stages (task compatible,
    // Charter-ready, qualified) measure a different thing and are returned apart, as `charter`.
    const upTo = registryStages.findIndex((s) => s.stage === 'callable')
    const listed = upTo >= 0 ? registryStages.slice(0, upTo + 1) : registryStages
    const stages = [...listed,
      { stage: 'priced', label: 'Priced', count: supply.priced, method: SUPPLY_DEFINITIONS.priced },
      { stage: 'hireable', label: 'Hireable', count: supply.hireable, method: SUPPLY_DEFINITIONS.hireable },
      { stage: 'checked', label: 'Checked against the chain', count: supply.checked, method: SUPPLY_DEFINITIONS.checked },
      { stage: 'warranted', label: 'Warranted', count: supply.warranted, method: SUPPLY_DEFINITIONS.warranted },
    ]
    const charter = upTo >= 0 ? registryStages.slice(upTo + 1).filter((s) => s.stage !== 'hireable') : []
    return NextResponse.json({
      chainId: 56,
      takenAt: new Date().toISOString(),
      provenance: 'MEASURED',
      stages,
      supply: { measuredAt: supply.measuredAt, priced: supply.priced, hireable: supply.hireable, pulled: supply.pulled, checked: supply.checked, warranted: supply.warranted, definitions: SUPPLY_DEFINITIONS },
      deliveredPaidWork: { agents: supply.delivered, method: SUPPLY_DEFINITIONS.delivered, note: 'Its own line, not a step of the funnel.' },
      charter,
      categories,
      failures,
      note: 'Counts are live and state-specific. Reachable, callable, priced, hireable, checked and warranted are never treated as synonyms. Hireable means a live signed price and not pulled for safety; the test is a badge (warranted), not a gate.',
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'funnel_unavailable', detail: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    )
  }
}
