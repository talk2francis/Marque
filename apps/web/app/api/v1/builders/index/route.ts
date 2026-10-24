import { NextResponse } from 'next/server'
import { z } from 'zod'
import { indexIdentity } from '../../../../../lib/forge-index'
import { checkWindow, clientKey } from '../../../../../lib/limits'

export const dynamic = 'force-dynamic'
const Body = z.object({ chainId: z.union([z.literal(56), z.literal(97)]), tokenId: z.string().regex(/^\d{1,12}$/) })

/** POST /api/v1/builders/index: read one identity from the registry into Marque's index now. Reads only the chain. */
export async function POST(req: Request) {
  const rate = checkWindow('forge-index', clientKey(req.headers), 6, 60_000, 'Limited to 6 a minute per connection.')
  if (!rate.ok) return NextResponse.json({ error: 'rate_limited', detail: rate.detail }, { status: 429 })
  const p = Body.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'bad_request', detail: 'Send { chainId, tokenId }.' }, { status: 400 })
  try {
    const r = await indexIdentity(p.data.chainId, p.data.tokenId)
    return NextResponse.json(r, { status: r.ok ? 200 : 404, headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[api/v1/builders/index]', e instanceof Error ? e.message.slice(0, 200) : e)
    return NextResponse.json({ error: 'unavailable', detail: 'Indexing could not run just now.' }, { status: 503 })
  }
}
