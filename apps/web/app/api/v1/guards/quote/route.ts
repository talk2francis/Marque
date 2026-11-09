import { NextResponse } from 'next/server'
import { QuoteQuery } from '@marque/charters'
import { guardQuote } from '../../../../../lib/guards'
import { quoteV2 } from '../../../../../lib/charters-v2'
import { withDeadline } from '../../../../../lib/deadline'
import { gate, parseQuery, unavailable, NO_STORE } from '../../../../../lib/guards-api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/guards/quote?chainId=&account=&kind=loan&market=&trigger=&target= : a loan read the way a guard reads it.
 * kind=yield|grid|range: the live reads that kind's builder needs (markets and membership, reviewed pools and their
 * TWAP, the owner's PancakeSwap positions on reviewed pools), each with its block and read time.
 */
export async function GET(request: Request) {
  const blocked = gate(request, 'quote', 30)
  if (blocked) return blocked
  const q = parseQuery(request, QuoteQuery)
  if (!q.ok) return q.response
  try {
    const { kind, ...rest } = q.value
    const body = kind === 'loan' ? await withDeadline(guardQuote(rest), 8000) : await withDeadline(quoteV2(kind, rest.chainId, rest.account as `0x${string}`), 10_000)
    return NextResponse.json(body, { headers: NO_STORE })
  } catch { return unavailable() }
}
