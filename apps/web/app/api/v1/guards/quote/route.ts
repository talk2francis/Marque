import { NextResponse } from 'next/server'
import { QuoteQuery } from '@marque/charters'
import { guardQuote } from '../../../../../lib/guards'
import { withDeadline } from '../../../../../lib/deadline'
import { gate, parseQuery, unavailable, NO_STORE } from '../../../../../lib/guards-api'

export const dynamic = 'force-dynamic'

/** GET /api/v1/guards/quote?chainId=&account=&market=&trigger=&target= : a loan read the way a guard reads it. */
export async function GET(request: Request) {
  const blocked = gate(request, 'quote', 30)
  if (blocked) return blocked
  const q = parseQuery(request, QuoteQuery)
  if (!q.ok) return q.response
  try { return NextResponse.json(await withDeadline(guardQuote(q.value), 8000), { headers: NO_STORE }) } catch { return unavailable() }
}
