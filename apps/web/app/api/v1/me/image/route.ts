import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ProfileUnavailable, readSession, storeImage } from '../../../../../lib/wallet-profile'
import { checkClaimBurst, clientKey } from '../../../../../lib/limits'

export const dynamic = 'force-dynamic'

/** POST: upload a portrait (PNG, JPEG or WebP, checked by its bytes) for the signed-in wallet or one of its agents. */
const body = z.object({ dataUrl: z.string().max(2_100_000) })

export async function POST(request: Request) {
  const session = readSession(request.headers.get('authorization'))
  if (!session) return NextResponse.json({ error: 'sign_in', detail: 'Sign in with this wallet to upload an image.' }, { status: 401 })
  const burst = checkClaimBurst(`img:${session.address}:${clientKey(request.headers)}`)
  if (!burst.ok) return NextResponse.json({ error: 'rate_limited', detail: burst.detail }, { status: 429 })
  const input = body.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: 'bad_request', detail: 'The image is too large; the limit is 1.5 MB.' }, { status: 400 })
  try {
    const r = await storeImage(session.address, input.data.dataUrl)
    if (!r.ok) return NextResponse.json({ error: 'refused', detail: r.detail }, { status: 400 })
    return NextResponse.json({ id: r.id, url: r.url, width: r.facts.width, height: r.facts.height, mime: r.facts.mime })
  } catch (err) {
    return NextResponse.json({ error: 'unavailable', detail: err instanceof ProfileUnavailable ? err.message : 'The image could not be stored just now.' }, { status: 503 })
  }
}
