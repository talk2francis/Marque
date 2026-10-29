import { NextResponse } from 'next/server'
import { z } from 'zod'
import { reindexRegistration } from '../../../../../../lib/registration-edit'
import { checkClaimBurst, clientKey } from '../../../../../../lib/limits'

export const dynamic = 'force-dynamic'

/** POST { chainId, tokenId }: re-read one agent's registration from chain into Marque's index, after its owner updated it. */
const body = z.object({ chainId: z.union([z.literal(56), z.literal(97)]), tokenId: z.string().regex(/^\d{1,78}$/) })

export async function POST(request: Request) {
  const burst = checkClaimBurst(clientKey(request.headers))
  if (!burst.ok) return NextResponse.json({ error: 'rate_limited', detail: burst.detail }, { status: 429 })
  const input = body.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: 'bad_request', detail: 'Name the network and token id.' }, { status: 400 })
  try {
    const r = await reindexRegistration(input.data.chainId, input.data.tokenId)
    if (!r) return NextResponse.json({ error: 'not_found', detail: 'That registration could not be read.' }, { status: 404 })
    return NextResponse.json({ refreshed: true, name: r.name })
  } catch {
    return NextResponse.json({ error: 'unavailable', detail: 'The registry could not be read just now.' }, { status: 503 })
  }
}
