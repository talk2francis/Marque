import { NextResponse } from 'next/server'
import { activeCharters } from '../../../../../lib/charters'

export const dynamic = 'force-dynamic'

/**
 * What the header strip reads.
 *
 * One indexed query, no chain call: this runs on every page, and a header that
 * costs an RPC round trip per navigation is a header somebody eventually
 * deletes. The Charters page does the chain read.
 */
export async function GET() {
  try {
    const charters = await activeCharters()
    return NextResponse.json({ charters, readAt: new Date().toISOString() })
  } catch {
    return NextResponse.json({ charters: [], readAt: new Date().toISOString(), degraded: true })
  }
}
