import { NextResponse } from 'next/server'
import { guardStats } from '../../../../../lib/guards'
import { gate, unavailable, NO_STORE } from '../../../../../lib/guards-api'

export const dynamic = 'force-dynamic'

/** GET /api/v1/guards/stats : armed, created, actions and amounts repaid, per chain, with the read time. */
export async function GET(request: Request) {
  const blocked = gate(request, 'stats', 60)
  if (blocked) return blocked
  try { return NextResponse.json(await guardStats(), { headers: NO_STORE }) } catch { return unavailable() }
}
