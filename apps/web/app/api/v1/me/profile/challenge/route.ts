import { NextResponse } from 'next/server'
import { z } from 'zod'
import { issueChallenge } from '../../../../../../lib/wallet-profile'
import { checkClaimBurst, clientKey } from '../../../../../../lib/limits'

export const dynamic = 'force-dynamic'

/** Step 1 of signing in to edit a profile: the exact message to sign, and a token binding it to the address. */
const body = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) })

export async function POST(request: Request) {
  const burst = checkClaimBurst(clientKey(request.headers))
  if (!burst.ok) return NextResponse.json({ error: 'rate_limited', detail: burst.detail }, { status: 429 })
  const input = body.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: 'bad_request', detail: 'Name the wallet address.' }, { status: 400 })
  return NextResponse.json(issueChallenge(input.data.address), { headers: { 'Cache-Control': 'no-store' } })
}
