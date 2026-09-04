import { NextResponse } from 'next/server'
import { funnel, categoryFunnel, failureHistogram } from '@marque/registry'

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
    const [stages, categories, failures] = await Promise.all([
      funnel(56),
      categoryFunnel(56),
      failureHistogram(),
    ])
    return NextResponse.json({
      chainId: 56,
      takenAt: new Date().toISOString(),
      provenance: 'MEASURED',
      stages,
      categories,
      failures,
      note: 'Counts are live. "responding" means the endpoint answered; "bound" means something is actually callable.',
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'funnel_unavailable', detail: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    )
  }
}
