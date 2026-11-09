import { NextResponse } from 'next/server'
import { GuardListQuery } from '@marque/charters'
import { listGuards } from '../../../../lib/guards'
import { listChartersV2 } from '../../../../lib/charters-v2'
import { gate, parseQuery, unavailable, NO_STORE } from '../../../../lib/guards-api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/guards?chainId=&owner=&kind=&state=armed|ended|all&cursor=&limit= : charters from the index, newest
 * first. `guards` are Loan Guard v1 (listed unless a kind other than loan is asked for); `charters` are v2, all kinds.
 * The cursor pages v2; v1 is short and returned whole within the limit.
 */
export async function GET(request: Request) {
  const blocked = gate(request, 'list', 60)
  if (blocked) return blocked
  const q = parseQuery(request, GuardListQuery)
  if (!q.ok) return q.response
  try {
    const { kind, ...rest } = q.value
    const [v1, v2] = await Promise.all([
      !kind || kind === 'loan' ? listGuards(rest) : Promise.resolve({ guards: [], nextCursor: null, readAt: new Date().toISOString() }),
      listChartersV2(q.value),
    ])
    return NextResponse.json({ guards: v1.guards, guardsNextCursor: v1.nextCursor, charters: v2.charters, nextCursor: v2.nextCursor, readAt: v2.readAt }, { headers: NO_STORE })
  } catch { return unavailable() }
}
