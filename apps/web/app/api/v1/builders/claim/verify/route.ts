import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyClaim } from '../../../../../../lib/claim'
import { checkClaimBurst, clientKey } from '../../../../../../lib/limits'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Step 2: the owner has signed. Recover the signer, re-read ownerOf from chain,
 * and only if they match hand back a short-lived claim token that /publish
 * requires. The signature travels on to the published listing so control is
 * re-checkable later.
 */

const body = z.object({
  agentId: z.string().min(1).max(200),
  nonceToken: z.string().min(1).max(4000),
  message: z.string().min(1).max(4000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(400),
})

export async function POST(request: Request) {
  const burst = checkClaimBurst(clientKey(request.headers))
  if (!burst.ok) return NextResponse.json({ error: burst.detail }, { status: 429 })

  let input: z.infer<typeof body>
  try {
    input = body.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'bad_request', detail: 'Provide agentId, nonceToken, message and signature.' }, { status: 400 })
  }

  let result
  try {
    result = await verifyClaim(input)
  } catch (err) {
    return NextResponse.json({ error: 'verify_failed', detail: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }

  if (!result.ok) return NextResponse.json({ error: 'not_verified', detail: result.detail }, { status: 401 })

  return NextResponse.json({
    verified: true,
    owner: result.owner,
    claimToken: result.claimToken,
    note: 'Control proven. This token authorises publishing a listing for this identity for the next 20 minutes.',
  })
}
