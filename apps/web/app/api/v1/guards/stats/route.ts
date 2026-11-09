import { NextResponse } from 'next/server'
import { guardStats } from '../../../../../lib/guards'
import { chartersV2Stats } from '../../../../../lib/charters-v2'
import { gate, unavailable, NO_STORE } from '../../../../../lib/guards-api'

export const dynamic = 'force-dynamic'

/** GET /api/v1/guards/stats : armed, created, actions and amounts repaid, per chain, with the read time. */
export async function GET(request: Request) {
  const blocked = gate(request, 'stats', 60)
  if (blocked) return blocked
  try {
    const [v1, v2] = await Promise.all([guardStats(), chartersV2Stats()])
    return NextResponse.json({ ...v1, v2: v2.chains }, { headers: NO_STORE })
  } catch { return unavailable() }
}
