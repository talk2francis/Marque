import { NextResponse } from 'next/server'
import { liveExamples } from '../../../../../lib/live-examples'
import { withDeadline } from '../../../../../lib/deadline'

export const dynamic = 'force-dynamic'

/** GET /api/v1/hire/examples: up to five live Venus loans and PancakeSwap V3 positions for the hire form, read from chain. */
export async function GET() {
  try {
    const value = await withDeadline(liveExamples(), 25_000)
    return NextResponse.json({ ...value, provenance: 'ONCHAIN' }, { headers: { 'Cache-Control': 'public, max-age=60' } })
  } catch {
    return NextResponse.json({ error: 'examples_unavailable', loans: [], positions: [] }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
