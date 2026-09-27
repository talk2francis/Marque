import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import type { ChainId } from '@marque/commerce'
import { readClaimToken } from '../../../../../lib/claim'
import { declareCategory } from '../../../../../lib/builder'
import { checkWindow, clientKey } from '../../../../../lib/limits'

export const dynamic = 'force-dynamic'

const Body = z.object({
  claimToken: z.string().min(1).max(4000),
  category: z.enum(['yield', 'grid', 'rebalancing', 'health_factor', 'security']),
})

/**
 * POST /api/v1/builders/declare: the owner states the agent's category. Only a wallet
 * that proved ownership in the last 20 minutes may; the classifier must agree, or the
 * checklist flags the mismatch (packages/registry/src/quality.ts).
 */
export async function POST(req: NextRequest) {
  const v = checkWindow('builder-declare', clientKey(req.headers), 10, 60_000, 'Too many changes in a minute.')
  if (!v.ok) return NextResponse.json({ error: 'rate_limited', detail: v.detail }, { status: 429 })
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'bad_request', detail: 'Send the claim token and a category.' }, { status: 400 })
  const claim = readClaimToken(parsed.data.claimToken)
  if (!claim) return NextResponse.json({ error: 'claim_expired', detail: 'Sign the proof again: the 20 minute window closed.' }, { status: 401 })
  await declareCategory(claim.chainId as ChainId, claim.tokenId, parsed.data.category, claim.owner)
  return NextResponse.json({ declared: parsed.data.category }, { headers: { 'Cache-Control': 'no-store' } })
}
