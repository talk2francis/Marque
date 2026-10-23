import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { currentTerms, refreshQuoteFor } from '@marque/commerce'
import { checkWindow, clientKey } from '../../../../../lib/limits'
import { limited } from '../../../../../lib/hire-api'

export const dynamic = 'force-dynamic'

const Body = z.object({ agentId: z.string().regex(/^(56|97):0x[0-9a-fA-F]{40}:\d{1,12}$/) })
/** One refresh per agent per 45 s across all visitors: a dated price is cheap to show, an agent's endpoint is not ours to hammer. */
const lastByAgent = new Map<string, number>()
const AGENT_GAP_MS = 45_000

/**
 * POST /api/v1/terms/refresh {agentId}: ask this agent for a fresh price now, with the same
 * harmless probe task the quote worker sends, then return its current terms. Free, binds
 * nobody, creates no job.
 */
export async function POST(req: NextRequest) {
  const v = checkWindow('terms-refresh', clientKey(req.headers), 10, 60_000, 'Price refreshes are limited to 10 a minute.')
  if (!v.ok) return limited(v.detail, v.retryAfterSeconds)
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'bad_request', detail: 'Name one agent as chainId:registry:tokenId.' }, { status: 400 })
  const agentId = parsed.data.agentId.toLowerCase()
  try {
    const last = lastByAgent.get(agentId) ?? 0
    let attempted = false
    if (Date.now() - last >= AGENT_GAP_MS) {
      lastByAgent.set(agentId, Date.now())
      if (lastByAgent.size > 5000) lastByAgent.clear()
      await refreshQuoteFor(agentId)
      attempted = true
    }
    const t = await currentTerms(agentId)
    return NextResponse.json({ agentId, serviceId: t.serviceId, terms: t.terms, refreshed: attempted }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'refresh_unavailable', detail: 'The price could not be refreshed just now. Try again in a minute.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
