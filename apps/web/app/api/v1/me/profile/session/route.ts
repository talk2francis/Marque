import { NextResponse } from 'next/server'
import { z } from 'zod'
import { signIn } from '../../../../../../lib/wallet-profile'
import { checkClaimBurst, clientKey } from '../../../../../../lib/limits'

export const dynamic = 'force-dynamic'

/** Step 2: the signed message comes back; a matching signer receives a session token valid for seven days. */
const body = z.object({ token: z.string().min(1).max(4000), message: z.string().min(1).max(2000), signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(400) })

export async function POST(request: Request) {
  const burst = checkClaimBurst(clientKey(request.headers))
  if (!burst.ok) return NextResponse.json({ error: 'rate_limited', detail: burst.detail }, { status: 429 })
  const input = body.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: 'bad_request', detail: 'Provide the token, the message and the signature.' }, { status: 400 })
  const r = await signIn(input.data)
  if (!r.ok) return NextResponse.json({ error: 'not_verified', detail: r.detail }, { status: 401 })
  return NextResponse.json({ session: r.session, address: r.address, expiresAt: r.expiresAt }, { headers: { 'Cache-Control': 'no-store' } })
}
