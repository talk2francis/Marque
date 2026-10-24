import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordOutcome } from '../../../../../lib/act'
import { checkWindow, clientKey } from '../../../../../lib/limits'

export const dynamic = 'force-dynamic'
const Body = z.object({ token: z.string().min(20).max(60_000), txHashes: z.array(z.string().regex(/^0x[0-9a-fA-F]{64}$/)).min(1).max(3) })

/** POST /api/v1/act/outcome (SPEC-ACT 4): verify the signed transactions against the sealed plan, measure, append. */
export async function POST(req: Request) {
  const rate = checkWindow('act-outcome', clientKey(req.headers), 10, 60_000, 'Limited to 10 a minute per connection.')
  if (!rate.ok) return NextResponse.json({ error: 'rate_limited', detail: rate.detail }, { status: 429 })
  const p = Body.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'bad_request', detail: 'Send { token, txHashes }.' }, { status: 400 })
  try {
    const r = await recordOutcome(p.data.token, p.data.txHashes)
    return NextResponse.json(r, { status: r.ok ? 200 : 409, headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[api/v1/act/outcome]', e instanceof Error ? e.message.slice(0, 200) : e)
    return NextResponse.json({ ok: false, reason: 'The outcome could not be recorded just now. Your transactions are on chain either way.' }, { status: 503 })
  }
}
