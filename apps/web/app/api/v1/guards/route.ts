import { NextResponse } from 'next/server'
import { GuardListQuery } from '@marque/charters'
import { listGuards } from '../../../../lib/guards'
import { gate, parseQuery, unavailable, NO_STORE } from '../../../../lib/guards-api'

export const dynamic = 'force-dynamic'

/** GET /api/v1/guards?chainId=&owner=&state=armed|ended|all&cursor=&limit= : guards from the index, newest first. */
export async function GET(request: Request) {
  const blocked = gate(request, 'list', 60)
  if (blocked) return blocked
  const q = parseQuery(request, GuardListQuery)
  if (!q.ok) return q.response
  try { return NextResponse.json(await listGuards(q.value), { headers: NO_STORE }) } catch { return unavailable() }
}
