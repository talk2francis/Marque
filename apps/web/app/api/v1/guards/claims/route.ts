import { NextResponse } from 'next/server'
import { ClaimsQuery } from '@marque/charters'
import { claimsFor } from '../../../../../lib/charters-v2'
import { withDeadline } from '../../../../../lib/deadline'
import { gate, parseQuery, unavailable, NO_STORE } from '../../../../../lib/guards-api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/guards/claims?chainId=&owner= : per token, the wallet balance beside every armed charter that may draw
 * it, with its allowance and next need. An allowance is a ceiling, not a reservation (AGENTS.md C5).
 */
export async function GET(request: Request) {
  const blocked = gate(request, 'claims', 30)
  if (blocked) return blocked
  const q = parseQuery(request, ClaimsQuery)
  if (!q.ok) return q.response
  try { return NextResponse.json(await withDeadline(claimsFor(q.value.chainId, q.value.owner as `0x${string}`), 10_000), { headers: NO_STORE }) } catch { return unavailable() }
}
