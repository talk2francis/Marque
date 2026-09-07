import { NextResponse, type NextRequest } from 'next/server'
import { getRegisterCounts } from '../../../../../lib/register-counts'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const CATEGORIES = ['rebalancing', 'grid', 'yield', 'health_factor', 'security', 'unclassified'] as const

/**
 * Real population counts for the Register's status tabs — `COUNT(*)` over the
 * same predicate each tab filters by, never a page size (P10.5A item 1).
 */
export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get('category')
  if (category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return NextResponse.json({ error: 'bad_category', allowed: CATEGORIES }, { status: 400 })
  }
  try {
    const counts = await getRegisterCounts(category)
    return NextResponse.json({ chainId: 56, category: category ?? null, provenance: 'MEASURED', ...counts })
  } catch (err) {
    return NextResponse.json(
      { error: 'counts_unavailable', detail: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    )
  }
}
