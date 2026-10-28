import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ProfileUnavailable, readSession, setAgentPortrait } from '../../../../../lib/wallet-profile'

export const dynamic = 'force-dynamic'

/** PUT: set (or clear, with image null) the portrait of an agent the signed-in wallet owns on chain right now. */
const body = z.object({ agentId: z.string().regex(/^(56|97):0x[0-9a-fA-F]{40}:\d{1,78}$/), image: z.string().regex(/^[0-9a-f]{32}$/).nullable() })

export async function PUT(request: Request) {
  const session = readSession(request.headers.get('authorization'))
  if (!session) return NextResponse.json({ error: 'sign_in', detail: 'Sign in with the owner wallet to set a portrait.' }, { status: 401 })
  const input = body.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: 'bad_request', detail: 'Name the agent and the uploaded image.' }, { status: 400 })
  try {
    const r = await setAgentPortrait(session, input.data.agentId.toLowerCase(), input.data.image)
    if (!r.ok) return NextResponse.json({ error: 'refused', detail: r.detail }, { status: r.status })
    return NextResponse.json({ set: input.data.image !== null })
  } catch (err) {
    return NextResponse.json({ error: 'unavailable', detail: err instanceof ProfileUnavailable ? err.message : 'The portrait could not be saved just now.' }, { status: 503 })
  }
}
